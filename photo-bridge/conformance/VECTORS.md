# PhotoBridge Wire Conformance Vectors

Golden vectors for the PhotoBridge wire protocol (see `docs/PROTOCOL.md` for the
normative spec). Both implementations must accept these byte-for-byte:

- Rust receiver: `desktop/src-tauri/tests/session_e2e.rs` (e2e) and
  `desktop/src-tauri/src/protocol.rs` (frame codec).
- Swift sender: `ios/PhotoBridge/Core/Protocol.swift`; runtime-verified on macOS
  host by the harness in `ios/PhotoBridgeTests` (run under full Xcode) and during
  development via `swiftc` + the temp harness (byte-exact checks: magic, BE
  length, type byte, snake_case JSON keys, CRC-32, SHA-256).

## Frame

A frame is `magic(2) + u32 BE length(4) + type(1) + payload`, where `length` is
the payload byte count (max 2,097,152). Magic is `0x50 0x42` ("PB").

### HELLO (type 0x00)

Payload JSON (snake_case, key order irrelevant):

```json
{"proto_ver":1,"device_name":"Alice iPhone","device_id":"iphone-abc","os":"ios-18.0"}
```

Full frame:

```
50420000005500 7b2270726f746f5f766572223a312c226465766963655f6e616d65223a
22416c696365206950686f6e65222c226465766963655f6964223a226970686f6e652d61
6263222c226f73223a22696f732d31382e30227d
```

| Offset | Bytes            | Meaning                |
| ------ | ---------------- | ---------------------- |
| 0      | `50 42`          | magic                  |
| 2      | `00 00 00 55`    | length = 85            |
| 6      | `00`             | type = Hello (0x00)    |
| 7..    | 85-byte JSON     | payload                |

### PING (type 0x10)

Empty object payload:

```
504200000002107b7d
```

| Offset | Bytes         | Meaning          |
| ------ | ------------- | ---------------- |
| 0      | `50 42`       | magic            |
| 2      | `00 00 00 02` | length = 2       |
| 6      | `10`          | type = Ping      |
| 7..    | `7b7d`        | `{}`             |

## CHUNK (type 0x03)

Chunk payload = `u32 BE header_len + JSON header + raw bytes` (raw bytes are not
counted in `header_len`).

Header JSON:

```json
{"file_id":"asset-1","offset":1048576,"crc32":693680462,"size":1024}
```

`header_len` prefix (68 bytes) and first raw bytes of a 1024-byte chunk of `0xAB`
(header_len = 68 = `0x44`, total payload = 1096 bytes):

```
00000044 7b2266696c655f6964223a2261737365742d31222c226f6666736574223a3130
34383537362c226372633332223a3639333638303436322c2273697a65223a313032347d
abababab abababab abababab abababab abababab abababab abababab abababab ...
```

`crc32` is the CRC-32 (IEEE 802.3, same polynomial as zlib) of the raw bytes;
`crc32` of the 1024-byte `0xAB` chunk is `693680462` (`0x2958b94e`).

## Checksums

- CRC-32 of ASCII `"123456789"` = `0xcbf43926` (standard check value).
- SHA-256 of ASCII `"abc"` = `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- SHA-256 is computed over the raw file bytes, both on the sender (precompute
  cache and incremental hasher) and on the receiver at FILE_DONE.

## Notes

- Length field is always big-endian; there is no checksum over the frame header
  (the per-chunk CRC-32 and the end-of-file SHA-256 provide integrity).
- JSON keys are snake_case and match Rust `serde` field names exactly.
- Receiver MUST reject frames with `length > 2,097,152` and unknown magic.
