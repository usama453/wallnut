# PhotoBridge Wire Protocol — Normative Spec

Version 1. Cross-language contract. Both the Swift (iOS) and Rust (desktop) implementations MUST pass the conformance test vectors in `conformance/`.

## 1. Transport

- TCP, single connection per session. Sender (iPhone) connects to receiver (desktop).
- Discovery: mDNS/DNS-SD service type `_photobridge._tcp`, port 8471. TXT records: `ver=1`, `name=<deviceName>`, `cap=wifi`.
- One connection carries one session. Reconnect = new connection; resume state comes from the manifest, not the socket.

## 2. Framing

Every message is a frame:

```
Offset  Size  Field
0       2     magic: 0x50 0x42 ("PB")
2       4     length: u32 big-endian, payload length (0..2_097_152)
6       1     type: u8 (Table 1)
7       N     payload (length bytes)
```

- Max payload 2 MiB (2 × chunk size + header slack).
- Any byte mismatch on `magic` ⇒ drop connection immediately; never resync mid-stream. Resume handles the rest.
- Big-endian for all integers.
- **Control payloads are JSON (UTF-8)** — built-in `JSONSerialization` (Swift) and `serde_json` (Rust), zero third-party dependencies on either side, readable in Wireshark.
- **CHUNK payload layout**: `u32 BE header_len` + JSON header + raw chunk bytes. The receiver reads `header_len` (fixed 4 bytes), then parses the JSON header, and treats the remaining bytes as chunk data. All other frames: whole payload is JSON.

## 3. Message types

| # | Name | Direction | Payload |
|---|------|-----------|---------|
| 0 | HELLO | C→S | JSON: `{"proto_ver":1,"device_id":"…","device_name":"…","os":"…"}` |
| 1 | HELLO_ACK | S→C | JSON: `{"session_id":"…","paired":true}` |
| 2 | PIN_CHALLENGE | S→C | JSON: `{"challenge_id":"…","expires_at":…}` (unix ms) |
| 3 | PIN_VERIFY | C→S | JSON: `{"challenge_id":"…","pin":"…"}` |
| 4 | PIN_OK | S→C | JSON: `{"paired":true}` |
| 5 | PIN_FAIL | S→C | JSON: `{"strikes_left":…}` |
| 6 | SESSION_MANIFEST | C→S | JSON: list of file entries (below) |
| 7 | FILE_STATE | S→C | JSON: `{"files":[{file_id,status,offset}]}` status ∈ new\|partial\|verified\|dedup |
| 8 | CHUNK | C→S | binary: `u32 BE header_len` + JSON header + chunk bytes |
| 9 | ACK | S→C | JSON: `{"file_id":"…","offset":…,"bytes":…}` (offset = next expected) |
| 10 | NAK | S→C | JSON: `{"file_id":"…","offset":…,"reason":"…"}` |
| 11 | FILE_DONE | C→S | JSON: `{"file_id":"…","sha256":"…"}` |
| 12 | FILE_VERIFIED | S→C | JSON: `{"file_id":"…","sha256":"…","size":…,"dedup_of":…?}` |
| 13 | FILE_FAILED | S→C | JSON: `{"file_id":"…","reason":"…","attempt":…}` |
| 14 | SESSION_END | C→S | JSON: `{"files_total":…,"bytes_total":…,"files_done":…,"bytes_done":…}` |
| 15 | SESSION_ABORT | either | JSON: `{"reason":"…"}` |
| 16 | PING | either | JSON: `{}` |
| 17 | PONG | either | JSON: `{}` |

### SESSION_MANIFEST file entry

```json
{"file_id":"…", "asset_id":"…", "kind":"photo|video|live_photo|raw|other",
 "size":123, "sha256":"hex…", "created_at":…, "modified_at":…, "filename":"…"}
```

### CHUNK header (JSON, after the `u32 header_len` prefix)

```json
{"file_id":"…", "offset":0, "crc32":123456789}
```

Rules:
- First chunk of a file must have `offset == 0` and carries the file's `size` inside the header.
- Chunk size = 1 MiB except the final chunk of a file.
- Sender window: ≤ 4 un-ACKed chunks. Receiver ACKs strictly in order (no gaps): `ACK.offset` = next expected byte offset, monotonic.
- Receiver writes chunk data to `*.part` at `offset`; on `ACK`, offset is durable (fsync batched per file — flushed when a file completes and before each `FILE_VERIFIED`).

## 4. Session flow

```
C → S: HELLO
S → C: PIN_CHALLENGE            (if device not paired)
C → S: PIN_VERIFY               (5 strikes ⇒ 60s cooldown)
S → C: PIN_OK | PIN_FAIL
S → C: HELLO_ACK {session_id}   (after pairing OK)
C → S: SESSION_MANIFEST [files]
S → C: FILE_STATE [per-file status from manifest DB]
       -- transfer loop --
C → S: CHUNK ... S → C: ACK|NAK
C → S: FILE_DONE {sha256}
S → C: FILE_VERIFIED | FILE_FAILED
       -- end --
C → S: SESSION_END
S → C: (implicit) FIN  — receiver may send SESSION_ABORT{reason:"session_end"} to close
```

Interruption at ANY point is legal. On reconnect:
- Phone re-sends HELLO + SESSION_MANIFEST with the same `device_id` (same or new session_id).
- Receiver answers FILE_STATE from its DB: `verified` → skip; `dedup` → skip; `partial` → resume from offset; `new` → start at 0.
- Receiver truncates `*.part` to the ACKed offset before accepting chunks again (idempotent resume).

## 5. Hashing & verification

- Per-chunk: CRC32 (IEEE, as u32) in CHUNK header. Mismatch ⇒ NAK; sender resends that chunk (≤3 attempts) then declares file retry.
- Per-file: SHA-256, hex lowercase. Sender streams it during send; receiver streams it during receive. `FILE_DONE.sha256` must equal receiver's computed hash, else `FILE_FAILED{reason:"hash_mismatch"}` → file restarted (≤3 attempts/session).
- Receiver only transitions a file to `verified` after: hash match AND fsync AND atomic rename. Dedup index update happens in the same transaction.

## 6. Heartbeat & timeouts

- PING every 15 s while idle; PONG required within 10 s. 3 consecutive misses ⇒ close connection (resume path).
- No chunk/ACK activity for 60 s ⇒ both sides may close and surface "connection lost — Resume".
- PIN challenge expires after 10 minutes; single use.

## 7. Sleep & wake

Sleep is a first-class edge case on every side (iPhone, Mac, PC). The
protocol is designed so a sleep/wake cycle never corrupts or loses a file;
it only pauses the session.

### Sender (iPhone) sleeping

- The desktop receiver keeps `READ_TIMEOUT = 60 s` per frame read. When the
  sender sleeps mid-file, the receiver sees no frames, closes the session,
  and persists its state (per-device part file + DB offset) exactly as it
  would after any other disconnect. The UI surfaces "connection lost —
  Resume".
- A resume session starts with the receiver's authoritative per-file offset
  (`FILE_STATE{status:"partial", offset}`), so the sender continues from the
  last ACKed chunk. Because part files live per device, a transfer interrupted
  by sleep resumes into the same physical file — no duplication.

### Receiver (Mac/PC) sleeping

- The sender sends PING every 15 s of idle; the heartbeat treats a silent
  peer as dead: 3 consecutive missed PONGs close the connection locally.
- The sender's connection layer fails fast: every `next()` waiter is resumed
  with `closed` when the connection dies, so the engine never hangs in a
  waiter while the receiver sleeps. No frame is sent until a fresh session
  handshake; the receiver's file state makes the resume offset safe even if
  the sender sent unACKed chunks just before the receiver slept.

### Wake-up behavior

- On iOS foreground (`willEnterForeground`), the engine probes the connection
  with a PING; if no PONG within 10 s the connection is closed and the user
  sees "Connection lost while away — tap Retry to resume". Retrying runs the
  normal pairing/session flow and resumes from the stored offset.
- The desktop side needs no wake hook: its 60 s read timeout and persisted
  state handle the sender's wake-up automatically when a new session arrives.
- Connections are never silently reused across a sleep: a session survives
  only while both sides exchange frames or PING/PONG. Any gap beyond the
  timeouts above ⇒ a clean close and a resume-capable new session.

## 8. Conformance vectors (conformance/)

- `frames.bin` + `frames.json`: known byte sequences for HELLO, CHUNK (with 2 MiB payload), ACK, framing errors (bad magic, oversize length).
- Both implementations include a test that decodes these golden frames byte-for-byte.
