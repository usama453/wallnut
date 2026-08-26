import Foundation
import Photos

/// Streams one PHAssetResource as a sequence of raw byte chunks (the data
/// the framework hands us, straight from Photos storage — no copies in app
/// storage). The engine slices these into 1 MiB wire chunks, computes CRC32
/// and streams SHA-256 over the same bytes.
public final class PhotoStreamer {
    public let resource: PHAssetResource
    private var requestID: PHAssetResourceDataRequestID?
    private let logger = PBLog.category("streamer")

    public init(resource: PHAssetResource) {
        self.resource = resource
    }

    public func cancel() {
        if let requestID {
            PHAssetResourceManager.default().cancelDataRequest(requestID)
        }
    }

    /// Yields Data slices in delivery order; completes when the resource is
    /// fully streamed or fails with an error. Safe to cancel via cancel().
    public func stream() -> AsyncThrowingStream<Data, Error> {
        AsyncThrowingStream { continuation in
            let opts = PHAssetResourceRequestOptions()
            opts.isNetworkAccessAllowed = true
            requestID = PHAssetResourceManager.default().requestData(
                for: resource,
                options: opts,
                dataReceivedHandler: { data in
                    continuation.yield(data)
                },
                completionHandler: { error in
                    if let error {
                        continuation.finish(throwing: error)
                    } else {
                        continuation.finish()
                    }
                }
            )
            continuation.onTermination = { [weak self] _ in
                self?.cancel()
            }
        }
    }
}