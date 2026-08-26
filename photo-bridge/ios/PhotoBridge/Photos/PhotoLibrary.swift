import Foundation
import Photos

public enum PhotoKind: String {
    case photo = "photo"
    case video = "video"
    case livePhoto = "live_photo"
    case raw = "raw"
    case other = "other"
}

/// One streamable resource (an asset may yield several: original +
/// paired video for Live Photos, or RAW + JPEG preview).
public struct PhotoResource: Identifiable {
    public let id: String          // file_id: stable per device
    public let assetID: String     // groups resources of one asset
    public let kind: PhotoKind
    public let size: UInt64
    public let createdAt: Int64
    public let modifiedAt: Int64
    public let filename: String
    public let phResource: PHAssetResource
    public let isPairedVideo: Bool
}

public struct PhotoBatch {
    public let resources: [PhotoResource]
    public let selectionLabel: String
}

public enum PhotoLibraryError: Error, LocalizedError {
    case denied

    public var errorDescription: String? {
        switch self {
        case .denied: return "Photo library access denied"
        }
    }
}

public enum PhotoLibrary {
    private static let logger = PBLog.category("photos")

    public static func requestAuthorization() async -> PHAuthorizationStatus {
        await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    }

    public static func authorizationStatus() -> PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    /// Enumerate assets (all, or since last backup checkpoint) and map them
    /// to streamable resources. Limited library access just returns the
    /// authorized subset — no special casing needed downstream.
    public static func resources(mode: SelectionMode, since: Date?) async throws -> PhotoBatch {
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        if let since {
            opts.predicate = NSPredicate(format: "creationDate >= %@", since as NSDate)
        }
        var out: [PhotoResource] = []
        let assets = PHAsset.fetchAssets(with: opts)
        assets.enumerateObjects { asset, _, _ in
            let created = Int64((asset.creationDate ?? .distantPast).timeIntervalSince1970 * 1000)
            let modified = Int64((asset.modificationDate ?? asset.creationDate ?? .distantPast).timeIntervalSince1970 * 1000)
            for resource in PHAssetResource.assetResources(for: asset) {
                let kind = kindFor(resource.type)
                let base = sanitize(asset.localIdentifier)
                let suffix = kind == .livePhoto ? "-video" : ""
                let fid = "\(base)\(suffix)"
                let size = UInt64(resource.value(forKey: "fileSize") as? Int64 ?? 0)
                out.append(PhotoResource(
                    id: fid,
                    assetID: asset.localIdentifier,
                    kind: kind,
                    size: size,
                    createdAt: created,
                    modifiedAt: modified,
                    filename: resource.originalFilename,
                    phResource: resource,
                    isPairedVideo: resource.type == .pairedVideo
                ))
            }
        }
        let label: String
        switch mode {
        case .all: label = "All photos & videos"
        case .sinceLastBackup: label = "Since last backup"
        case .selected: label = "Selection"
        }
        return PhotoBatch(resources: out, selectionLabel: label)
    }

    public static func kindFor(_ type: PHAssetResourceType) -> PhotoKind {
        switch type {
        case .photo, .fullSizePhoto, .alternatePhoto, .adjustmentData: return .photo
        case .video, .fullSizeVideo: return .video
        case .pairedVideo, .fullSizePairedVideo: return .livePhoto
        default: return .other
        }
    }
    private static func sanitize(_ id: String) -> String {
        id.replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: " ", with: "")
    }
}

public enum SelectionMode: String, CaseIterable, Identifiable {
    case all
    case sinceLastBackup
    case selected

    public var id: String { rawValue }
}

/// Hash cache: precomputed per-asset SHA-256 so the manifest can carry the
/// hash (receiver dedup) before any transfer happens. Keyed by local
/// identifier + modifiedAt; recomputed only when the asset changed.
public final class HashCache {
    private let store: SessionStore
    private let logger = PBLog.category("photos")

    public init(store: SessionStore) {
        self.store = store
    }

    /// Compute hashes for every resource in the batch (streamed, no copies).
    /// Returns [resourceID: hex sha256].
    public func precomputeHashes(for batch: PhotoBatch) async -> [String: String] {
        var result: [String: String] = [:]
        for r in batch.resources {
            if let cached = store.cachedHash(for: r.id, modifiedAt: r.modifiedAt) {
                result[r.id] = cached
                continue
            }
            guard let hash = await hashResource(r.phResource) else {
                logger.error("hash failed for \(r.filename)")
                continue
            }
            store.storeHash(r.id, modifiedAt: r.modifiedAt, hash: hash)
            result[r.id] = hash
        }
        return result
    }

    private func hashResource(_ resource: PHAssetResource) async -> String? {
        await withCheckedContinuation { cont in
            var hasher = IncrementalHasher()
            var first = true
            let opts = PHAssetResourceRequestOptions()
            opts.isNetworkAccessAllowed = true
            let manager = PHAssetResourceManager.default()
            let requestID = manager.requestData(for: resource, options: opts) { data in
                hasher.update(data)
                _ = first
                first = false
            } completionHandler: { error in
                if let error {
                    PBLog.category("photos").error("stream failed: \(error.localizedDescription)")
                    cont.resume(returning: nil)
                } else {
                    cont.resume(returning: hasher.finish().sha256Hex)
                }
            }
            // requestData is cancellable via cancelDataRequest; the closure
            // below is a safety net only (we never cancel precompute).
            _ = requestID
        }
    }
}