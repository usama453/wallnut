# PhotoBridge — Technical Design Document

Working title: **PhotoBridge**. Reliable photo & video transfer from iPhone to macOS and Windows over local Wi-Fi, with optional USB where Apple's public APIs allow.

Status: v0.2 — decisions locked, implementation in progress (M1).
Date: 2026-08-19

**Locked decisions (2026-08-19):**
1. Desktop stack: **Tauri 2 (Rust core + web UI)**.
2. iOS minimum: **iOS 17+**.
3. Pairing: **6-digit PIN** shown on desktop, entered on phone at first connect.
4. Storage: **user-picked folder** (asked once at first run; default `~/Pictures/PhotoBridge`).

---

## 1. Overview

PhotoBridge transfers original-quality photos and videos from an iPhone (Photos library) to a desktop app running on macOS or Windows. The system is built for **reliability first**: chunked transfers, per-file checksums, automatic resume after interruption, end-to-end verification, content-based deduplication, a persistent manifest database, a clear transfer log, and a "backup since last time" mode.

**Core principles:**

1. **Do not duplicate the Photos library.** Assets are streamed directly from Apple's Photos framework on demand — never bulk-copied into an intermediate store on the phone.
2. **Never lose data silently.** Every file that the desktop reports as "transferred" has been byte-verified against a hash recorded in the manifest before it is finalized (fsync + rename).
3. **Resume is the default, not an edge case.** Every component (chunks, files, sessions) has a durable checkpoint that survives app kills, network drops, and reboots.
4. **One source of truth.** The desktop manifest database is the single authoritative record of what exists, what is verified, and what remains.
5. **Honesty about platform limits.** Wi-Fi transport is fully designed and implemented. USB is designed as a pluggable transport with a documented, honest assessment of Apple API constraints (Section 10).

---

## 2. Goals / Non-Goals

### 2.1 Goals

- Transfer originals (full-resolution) from Photos to macOS/Windows over LAN Wi-Fi.
- Survive interruption at any point (chunk, file, or session level) with a one-tap resume.
- Verify every byte (chunk CRC32 + file SHA-256) and expose verification in the transfer log.
- Skip files already transferred and verified (dedup across sessions and across runs).
- "Transfer everything since my last backup" mode driven by manifest state.
- Live dashboard: progress, files remaining, per-file status, log, resume button.
- Modular architecture (Section 6) so transports, photo sources, and engines are swappable.

### 2.2 Non-Goals (v1)

- Cloud sync, remote (internet) transfer — LAN only.
- Editing/organizing media on the desktop; this is transfer-only.
- Transferring a full byte-for-byte clone of `Photos.sqlite` or the `.photoslibrary` bundle (explicitly prohibited — we stream assets, not the library).
- Android/other mobile platforms in v1.
- USB via MFi hardware (needs Apple certification; see Section 10).

---

## 3. Platform & Stack Decisions

| Component | Technology | Rationale |
|---|---|---|
| iPhone app | SwiftUI + Swift Concurrency, iOS 17+ | Native access to Photos (`PHAssetResourceManager`) and Bonjour (`Network.framework`) |
| Desktop shared app | **Tauri 2 (Rust core + web UI)** *(recommended)* | One codebase for macOS + Windows; Rust core gives memory-safe, robust transfer server; pure-Rust `mdns-sd` crate implements DNS-SD on both platforms with **no Bonjour SDK dependency on Windows** |
| Alternative desktop | Flutter (Dart) | Single UI codebase, Bonjour via `bonsoir` package; heavier binary, weaker raw networking control than Rust |
| Local manifest DB | SQLite (`rusqlite` on desktop; Apple's `SQLite3` on iOS) | Durable, transactional, zero-ops |
| Wire serialization | Custom framed binary + MessagePack for control payloads | Compact, streaming-friendly, no heavyweight codegen |
| Logging | Structured JSONL with rolling files (desktop); `OSLog` mirrored to JSONL (iOS) | Debuggable, scriptable, visible in dashboard |

**Decision point (user confirmation):** Tauri 2 (Rust) is recommended for reliability; Flutter is the fallback. See Questions at the end of this document.

### 3.1 Bonjour on Windows

`mdns-sd` is a pure-Rust mDNS/DNS-SD implementation. It advertises and browses `_photobridge._tcp` over UDP multicast without installing Apple's Bonjour SDK — this is the key reason Rust (Tauri) is recommended over .NET, where mDNS support is poor.

---

## 4. System Architecture

```
┌─────────────────────────── iOS (SwiftUI) ───────────────────────────┐
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐   │
│  │  UI Layer    │──▶│ TransferEngine   │──▶│ Connection (Wi-Fi) │   │
│  │ (SwiftUI)    │   │ (send, schedule) │   │ (NWConnection)     │   │
│  └──────────────┘   └────────┬─────────┘   └─────────┬──────────┘   │
│                              │                       │              │
│  ┌──────────────┐   ┌────────▼─────────┐   ┌─────────▼──────────┐   │
│  │ PhotoAccess  │──▶│ VerificationEng │   │ DeviceDiscovery    │   │
│  │ (Photos API) │   │ (streaming SHA)  │   │ (NWBrowser)        │   │
│  └──────────────┘   └──────────────────┘   └────────────────────┘   │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │ RecoveryEngine       │  │ SessionState (SQLite)│                 │
│  │ (resume, retries)    │  │ (ack checkpoints)    │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                     │
│  ┌────────────────────────── Logging ───────────────────────────┐  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌────────────────────── Desktop (Tauri/Rust) ─────────────────────────┐
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐   │
│  │ Dashboard UI │◀──│ TransferEngine   │◀──│ Connection (Wi-Fi) │   │
│  │ (web front)  │   │ (receive, write) │   │ (TCP listener)     │   │
│  └──────────────┘   └────────┬─────────┘   └─────────┬──────────┘   │
│                              │                       │              │
│  ┌──────────────┐   ┌────────▼─────────┐   ┌─────────▼──────────┐   │
│  │ Manifest DB  │◀──│ VerificationEng │   │ DeviceDiscovery    │   │
│  │ (SQLite)     │   │ (CRC32+SHA-256) │   │ (mdns-sd advertiser)│   │
│  └──────────────┘   └──────────────────┘   └────────────────────┘   │
│                                                                     │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │ DuplicateDetector    │  │ RecoveryEngine       │                 │
│  │ (hash-indexed)       │  │ (resume, idempotency)│                 │
│  └──────────────────────┘  └──────────────────────┘                 │
│                                                                     │
│  ┌────────────────────────── Logging ───────────────────────────┐  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

Shared:
  ┌──────────────────────────────────────────────────────────────┐
  │  Protocol Spec (Section 5) — normative, cross-language.      │
  │  Conformance test vectors for framing/codec on both sides.   │
  └──────────────────────────────────────────────────────────────┘
```

### 4.1 Module responsibilities

| Module | iOS (sender) | Desktop (receiver) |
|---|---|---|
| **PhotoAccess** | Enumerate `PHAsset`s; stream original bytes via `PHAssetResourceManager.requestData(...)`; resolve resource kinds (photo/video/live-paired/RAW) | n/a |
| **DeviceDiscovery** | Browse `_photobridge._tcp` (`NWBrowser`); pick device | Advertise `_photobridge._tcp` (`mdns-sd`) with TXT: `ver=1`, `name`, `cap=wifi` |
| **ConnectionLayer** | TCP client (`NWConnection`); framing encode/decode; heartbeat | TCP server (`tokio`); framing encode/decode; heartbeat |
| **TransferEngine** | Schedules files; streams chunks with windowed ACK; emits progress | Receives chunks; buffers to temp file; ACKs; finalizes |
| **ManifestDB** | Session checkpoints (SQLite) | Full manifest (SQLite) — single source of truth |
| **VerificationEngine** | Incremental SHA-256 + per-chunk CRC32 while sending | Same; final full-file SHA-256 compare; fsync |
| **DuplicateDetection** | Skips assets already verified in this run (by `assetId`) | Hash-indexed dedup: file with same SHA-256 already verified → link, skip transfer |
| **RecoveryEngine** | Resume handshake, retry with backoff, reconnect | Idempotent per-chunk writes; resume offsets; retry limits |
| **UI Layer** | Session screen, progress, resume button | Dashboard: progress, files remaining, table, log, backup button |
| **Logging** | OSLog + JSONL mirror | JSONL rolling files + in-app log view |

---

## 5. Wire Protocol (normative)

Transport: **TCP**, one connection per session. Framing is length-prefixed and versioned so both implementations (Swift and Rust) must conform to shared test vectors.

### 5.1 Framing

```
┌────────┬────────┬────────┬─────────────────────────────┐
│ magic  │ length │  type  │          payload            │
│ u8=0xPB│ u32 BE │ u8     │  length bytes (<= 2 MB)     │
└────────┴────────┴────────┴─────────────────────────────┘
```

- Magic `0x50 0x42` ("PB") at frame start catches desync; on desync the connection is dropped and resumed — the protocol never attempts resync within a stream.
- Control payloads are MessagePack (compact maps). Data chunks are raw binary with a fixed binary header (below).

### 5.2 Message types

| Type | Direction | Payload | Purpose |
|---|---|---|---|
| `HELLO` | C→S | `{protoVer, deviceId, deviceName, os}` | Open session, identify sender |
| `HELLO_ACK` | S→C | `{sessionId, resumeOk}` | Accept; receiver ready |
| `SESSION_MANIFEST` | C→S | list of `{fileId, assetId, kind, size, sha256, created, modified, livePair?}` | Declare the file set to transfer |
| `FILE_STATE` | S→C | per `fileId`: `{status: new\|partial\|verified\|dedup, offset}` | Receiver's prior knowledge → resume decisions |
| `CHUNK` | C→S | `{fileId, offset, crc32} + bytes(1 MiB)` | Data. First chunk of a file carries `{fileId, size}` again as redundancy |
| `ACK` | S→C | `{fileId, offset}` | Chunk durably written (fsync batched per file, see 8.3) |
| `NAK` | S→C | `{fileId, offset, reason}` | CRC mismatch → sender resends chunk (max 3, then file retry) |
| `FILE_DONE` | C→S | `{fileId, sha256}` | Sender finished; receiver now verifies full file |
| `FILE_VERIFIED` | S→C | `{fileId, sha256, size, dedupOf?}` | Manifest updated, file finalized on disk |
| `FILE_FAILED` | S→C | `{fileId, reason, attempt}` | Verification/IO failure; retry policy applies |
| `SESSION_END` | C→S | `{stats}` | All files resolved; receiver commits checkpoint |
| `SESSION_ABORT` | either | `{reason}` | Clean abort |
| `PING`/`PONG` | either | `{}` | Heartbeat every 15 s; 3 misses ⇒ drop ⇒ resume path |
| `PIN_CHALLENGE` | S→C | `{challengeId, expiresAt}` | Server demands PIN for unpaired device |
| `PIN_VERIFY` | C→S | `{challengeId, pin}` | Phone submits PIN |
| `PIN_OK` / `PIN_FAIL` | S→C | `{}` / `{strikesLeft}` | Pairing result; `PIN_OK` also carries pairing record |

### 5.3 Chunking & large-file efficiency

- **Chunk size 1 MiB** (small enough to resume with minimal re-transfer; large enough to keep ACK overhead negligible on LAN).
- **Sliding window**: sender may have up to 4 un-ACKed chunks in flight; receiver processes serially and ACKs in order. This bounds memory (≤ 4 MiB) regardless of file size.
- **Streaming hashes**: SHA-256 computed incrementally over the full byte stream on both sides using buffered reads (4 MiB buffer on sender; 1 MiB buffer on receiver) — no file is ever fully in memory. A 10 GB video uses ~10 MB RAM total on each side.
- Receiver writes to `*.part` file, `fsync`s, then atomically renames to final name after verification.

### 5.4 Resume semantics (idempotent)

- On reconnect, the phone re-sends `SESSION_MANIFEST` (same `sessionId` if the session is resumed, new if a fresh run).
- Receiver answers `FILE_STATE` from its manifest: `verified` → skip; `partial` → resume from `offset` (byte-aligned to chunk boundaries, recorded per last ACK); `new` → start at 0.
- Every `CHUNK` write is idempotent: the receiver truncates `*.part` to the acked offset before resuming, so re-sent chunks never duplicate bytes.
- **Result:** after a network drop, app kill, or reboot on either side, the transfer continues from the exact byte where it stopped — a 10 GB video resumes in seconds.

---

## 6. Transfer Lifecycle & Manifest

### 6.1 Desktop manifest schema (SQLite)

```sql
CREATE TABLE files (
  file_id       TEXT PRIMARY KEY,        -- stable asset id from device
  device_id     TEXT NOT NULL,
  session_id    TEXT,
  kind          TEXT,                    -- photo | video | live_photo | raw | other
  original_size INTEGER NOT NULL,
  sha256        TEXT,                    -- verified hash (set on completion)
  status        TEXT NOT NULL,           -- pending|transferring|verified|dedup|failed
  progress      INTEGER NOT NULL DEFAULT 0,   -- bytes durably acked
  received_path TEXT,
  created_at    INTEGER, modified_at INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  verified_at   INTEGER
);
CREATE UNIQUE INDEX idx_files_hash ON files(sha256) WHERE sha256 IS NOT NULL; -- dedup index

CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,
  device_id    TEXT,
  mode         TEXT,                     -- incremental | full | backup
  started_at   INTEGER, finished_at INTEGER,
  status       TEXT,                     -- active|completed|aborted
  files_total  INTEGER, bytes_total INTEGER,
  files_done   INTEGER, bytes_done INTEGER
);

CREATE TABLE backup_checkpoints (
  device_id        TEXT PRIMARY KEY,
  last_backup_ts   INTEGER               -- commit time of last fully-verified run
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, level TEXT, module TEXT, file_id TEXT, message TEXT
);
```

### 6.2 File states

```
pending ──▶ transferring ──▶ verified (fsync + rename + hash match)
              │  ▲
              ▼  │
           failed ──▶ pending (retry, max 3 attempts / session)
dedup: resolved without transfer (hash already verified on disk)
```

### 6.3 iOS session state (SQLite)

iOS keeps only session-level checkpoints: `sessionId`, file list summary, per-file acked offset, status. The phone's own store is a checkpoint mirror; the desktop manifest is authoritative. If the phone loses state, the desktop's `FILE_STATE` answers rebuild it.

---

## 7. Deduplication

Two layers, both driven by the manifest:

1. **Same-run dedup (iOS).** `assetId` unique in the manifest for the run — Live Photo's photo+video pair, bursts, or duplicate imports are sent once.
2. **Cross-run dedup (desktop).** `idx_files_hash` on `sha256`: when a file completes, the hash is recorded. In a later session, any incoming `SESSION_MANIFEST` item whose SHA-256 already exists as `verified` on disk (or whose file is byte-identical by re-hashing the existing file) is answered `FILE_STATE: dedup` and skipped — zero bytes transferred. Optional hardlink to the existing file avoids duplicated storage on the desktop.
3. **Crash-consistency note.** Hash is only trusted after full verification; partial hashes are never inserted into the dedup index.

---

## 8. Photo Access (iOS) — stream, don't copy

- **Enumerate** with `PHFetchOptions`: `creationDate`, `mediaType`, `mediaSubtypes` (Live Photos), `burstIdentifier` handling, `assetSourceType` to exclude cloud-only originals when offline (option: allow iCloud download).
- **Stream** original bytes with `PHAssetResourceManager.requestData(for:options:dataHandler:)` — the framework hands us data in `Data` chunks straight from Photos storage; we feed them directly into the chunk window + incremental SHA-256. **Zero intermediate copies in app storage** (this satisfies "do not duplicate the photos library").
- **Resource selection** per asset: prefer `PHAssetResourceType.original`; for Live Photos also send the `pairedVideo` resource (kind `live_photo`); for edited assets, default to original (toggleable later); for RAW, send original (may be two resources — send both, pair by `assetId`).
- **Permissions:** `PHPhotoLibrary.requestAuthorization(.readWrite)`. Limited library access (photos chosen by user) is a supported path — the manifest simply contains only authorized assets; no special casing in the transfer engine.
- **Cancellation**: `cancelDataRequest` on user abort; the recovery engine turns an interrupted stream into a chunk-offset resume, never a full restart.

---

## 9. Backup Mode ("Transfer everything since my last backup")

- Trigger: user taps **Backup** on the dashboard (or phone). Mode field = `backup`.
- The phone enumerates assets **with `creationDate > backup_checkpoints[deviceId].last_backup_ts`**, but the desktop **still dedups by hash**: any asset that arrived earlier via a non-backup transfer is skipped (dedup catches everything the date filter misses, including re-imported media).
- `last_backup_ts` is committed **only when the session reaches `SESSION_END` with every file `verified`** — an interrupted backup never advances the checkpoint, so a failed run is always retried in full knowledge.
- Result: "Transfer everything since my last backup" is exactly the set of assets not yet verified on this desktop for this device.

---

## 10. USB — honest capability assessment

**Constraint:** Apple provides **no public API for arbitrary bulk USB transfer from iPhone** (host or device mode). The relevant public surfaces are:

| Surface | Feasible? | Notes |
|---|---|---|
| `ExternalAccessory` framework | Requires **MFi hardware + Apple certification** | Out of scope for v1 (no compatible accessory exists) |
| USB-C wired networking (iPhone↔Mac as network device) | No — not exposed by iOS for third parties | |
| Files app / USB drive export | Manual, documents only — **not streaming, not Photos originals programmatically** | Not a real transport; Photos originals can't be streamed to USB storage via public API |
| iTunes/Finder sync | Proprietary, no public API | |

**Design response:**

1. The `ConnectionLayer` is defined against a **`Transport` trait/protocol** (connect/listen/send-frame/recv-frame/close) so a future USB transport (MFI accessory, or Apple someday shipping a public wired-transfer API) slots in without touching the transfer engine, manifest, or verification layers.
2. v1 ships Wi-Fi transport only; USB remains a documented stub with the trait defined and conformance tests for the adapter contract.
3. If a wired path is required in the short term, the only legitimate public-API option is *Finder/iTunes file sharing* — which cannot stream Photos originals — so we treat USB as **not deliverable** rather than half-delivered.

---

## 11. Recovery & Resilience Summary

| Failure | Detection | Recovery |
|---|---|---|
| TCP drop / Wi-Fi blip | heartbeat miss / socket error | Auto-reconnect (≤5 attempts, 1s/2s/4s/8s/16s backoff), resume from acked offsets |
| Chunk corruption | CRC32 mismatch | `NAK` → resend (≤3), then file retry |
| File corruption | Full SHA-256 mismatch | Retry file from 0 (≤3 attempts), else `failed` with clear log |
| App kill (either side) | n/a | On relaunch: state from SQLite; desktop answers `FILE_STATE` from manifest; resume button reconnects |
| Desktop reboot mid-write | crash-safe `*.part` | Partial file discarded/truncated to acked offset; resume continues |
| Phone offline (cloud-only asset) | `requestData` error | Skipped with `last_error` recorded; listed in log; retried on next run |
| Disk full on desktop | write error | File marked `failed`, session paused, dashboard alert; resume after cleanup |

---

## 12. Dashboard & UX

Desktop dashboard (web UI in Tauri):
- **Overview**: total bytes/files, current speed (sliding window EWMA), ETA, files remaining.
- **Per-file table**: name, kind, size, progress bar, status badge, verified hash, retries, error.
- **Session bar**: overall progress + **Resume** button (reconnects to phone; disabled while active), **Pause**.
- **Backup button**: one-tap "backup since last time" (runs when phone connects or opens app).
- **Transfer log**: live, filterable, level-tagged; persists to JSONL + `logs` table; "copy log" action.

iOS app:
- Compact session screen: discovered desktop devices, selection (all/new since backup), progress, pause/resume.
- Keeps the same progress semantics; sends/receives `FILE_STATE` on reconnect so the phone UI always matches desktop truth.

---

## 13. Logging

- Structured JSONL, fields: `ts, level, module, event, fileId, offset, bytes, hash, error`.
- Desktop: rolling files (5 × 10 MB) + in-DB `logs` table for UI.
- iOS: `os.Logger` (categories per module) + JSONL mirror for export.
- Every user-visible status transition and every failure is logged with enough context to reconstruct the session (this is the debugger-first design of the reliability story).

---

## 14. Testing & Validation Strategy

1. **Conformance tests**: shared framing/codec test vectors run on both Swift and Rust sides (golden binary payloads).
2. **Unit**: CRC32/SHA-256 streaming equivalence with reference hashes; chunk window state machine; resume offset math; dedup index queries; manifest schema migrations.
3. **Integration (loopback)**: full session over `localhost` on the desktop; iPhone↔Mac on real Wi-Fi; iPhone↔Windows on real Wi-Fi.
4. **Fault injection**: kill receiver mid-chunk (resume from chunk boundary), kill sender mid-file, drop 5% packets (Mac `Network Link Conditioner` / `tc`), corrupt a chunk (verify `NAK`/retry), corrupt a `*.part` on disk (verify re-hash fails and retry), disk-full simulation.
5. **Soak/perf**: 10 GB synthetic video; verify steady-state memory ≤ 20 MB, resume-after-10-min-drop takes < 2 % re-transfer, SHA-256 throughput ≥ 200 MB/s on desktop hardware.
6. **E2E**: real Photos library with mixed photo/video/Live/RAW/HEIC/burst sets; verify `sha256sum` parity between phone-side hash and final desktop files.

---

## 15. Milestones

| M | Scope | Exit criteria |
|---|---|---|
| **M1** | Protocol spec + codec (both sides), Bonjour discovery, TCP transport, basic full-file transfer | Two real transfers succeed on macOS + Windows; conformance tests green |
| **M2** | Manifest DB, chunked ACK window, resume (chunk/file/session), CRC32+SHA-256 verification, retries | Fault-injection suite green; resume after kill verified on both platforms |
| **M3** | Dedup (both layers), backup mode, dashboard polish, log viewer, iOS session UX, pairing (optional 6-digit PIN) | "Backup since last time" E2E; dedup shows zero-byte repeat runs |
| **M4** | USB transport contract conformance tests (stub), packaging (App Store / notarized .dmg / Windows installer), soak on 10 GB+ libraries | Installers signed; soak report; documented USB statement |

---

## 16. Proposed Repo Layout

```
photo-bridge/
├── docs/
│   ├── TECHNICAL_DESIGN.md        (this document)
│   └── PROTOCOL.md                (normative wire spec + test vectors)
├── ios/                           (Xcode project, SwiftUI)
│   └── PhotoBridge/               (modules per Section 4.1)
├── desktop/                       (Tauri 2: Rust core + web UI)
│   ├── src-tauri/src/             (server, manifest, engines)
│   └── ui/                        (dashboard)
├── conformance/                   (shared test vectors, both-language runners)
└── README.md
```

---

## 17. Decisions (locked)

1. **Desktop stack**: Tauri 2 (Rust) — confirmed.
2. **iOS minimum version**: iOS 17+ — confirmed.
3. **Storage**: user-picked folder, asked once at first run (default `~/Pictures/PhotoBridge`) — confirmed.
4. **Pairing security**: 6-digit PIN — confirmed. Handshake adds `HELLO` → receiver returns `PIN_CHALLENGE` → phone replies `PIN_VERIFY(pin)`. On success a pairing record `{deviceId, pinHash(salted), pairedAt}` is persisted in the desktop manifest DB and in the phone's keychain-backed store; subsequent connects skip PIN. Failed attempts: 5 strikes ⇒ cooldown 60 s. PIN is 6 digits, single-use, expires after 10 minutes or first success.
5. **Edits policy**: always transfer originals in v1; "edited version" toggle is a later option.
