# PhotoBridge

Reliable photo/video backup from iPhone to your desktop computer, over your
local Wi-Fi. No cloud, no cables — the Photos library streams directly to a
folder you choose.

- **iOS app (SwiftUI, iOS 17+)** — discovers the desktop, pairs with a 6-digit
  PIN, then streams photos/videos straight from the Photos framework.
- **Desktop receiver (Tauri 2 / Rust)** — mDNS + TCP server that verifies every
  file (CRC-32 per chunk, SHA-256 at completion), resumes interrupted transfers,
  and deduplicates across backups.

## Layout

```
desktop/            Rust receiver core (src-tauri) + Tauri UI shell
ios/                SwiftUI sender app (XcodeGen project)
docs/               TECHNICAL_DESIGN.md, PROTOCOL.md (normative wire spec)
conformance/        VECTORS.md — golden byte vectors both sides must accept
```

## Protocol in one minute

- mDNS `_photobridge._tcp`, port 8471.
- Frame: `PB` magic + u32 BE length + 1-byte type + JSON payload (control) or
  `u32 BE header_len + JSON + raw bytes` (chunk).
- 6-digit PIN: shown on the desktop, entered on the phone, then paired per
  device (pairing persists).
- Chunks of 1 MiB, CRC-32 in every chunk header, ≤4 in flight, ordered ACKs.
- Resume is byte-exact: the receiver tells the sender the acknowledged offset;
  part files are kept per device in `.parts/<device_id>/`.
- Dedup: files already backed up (by SHA-256) are acknowledged instantly.
- Sleep-safe: any side sleeping just pauses the transfer. Heartbeats
  (15 s PING / 3 missed PONGs) and the receiver's 60 s read timeout close the
  session cleanly; a wake-up reconnects and resumes from the ACKed offset
  (see PROTOCOL.md §7). The iOS app probes the connection on foreground and
  offers "Retry" if the peer was away.

## Building

### Desktop

```sh
cd desktop/src-tauri
cargo test          # 12 tests: unit + end-to-end (pairing, dedup, resume, corruption, golden vectors)
cargo tauri dev
```

### iOS

Requires Xcode (with iOS SDK) and [XcodeGen](https://github.com/yonaskolb/XcodeGen)
(`brew install xcodegen`).

```sh
cd ios
xcodegen generate          # regenerates PhotoBridge.xcodeproj from project.yml
# set DEVELOPMENT_TEAM in project.yml for device installs, then build & run in Xcode
```

Without an iOS device you can still verify the core logic on the Mac host:

```sh
cd ios/Harness
./build.sh   # 26 checks: framing, CRC/SHA vectors, SessionStore, sleep/wake connection tests
```

## Status

- Desktop receiver: complete and green (unit + e2e tests pass).
- iOS sender: implemented; codec/checksums/store and the sleep/wake connection
  paths verified at runtime on the macOS host (26/26 harness checks). On-device
  validation (pairing, dedup, resume, Live Photos) is the remaining step.
