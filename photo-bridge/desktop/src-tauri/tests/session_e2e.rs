//! End-to-end receiver tests: a simulated iPhone sender drives the full
//! protocol against the real TransferEngine over loopback TCP.

use desktop_lib::engine::TransferEngine;
use desktop_lib::logging::Logger;
use desktop_lib::manifest::ManifestDb;
use desktop_lib::pairing::PinChallenges;
use desktop_lib::protocol::*;
use desktop_lib::verify::sha256_file;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Write as _;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

struct TestCtx {
    _dir: PathBuf,
    engine: TransferEngine,
}

fn setup() -> TestCtx {
    let dir = std::env::temp_dir().join(format!("photobridge-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let logger = Logger::new(dir.join("logs"));
    let db = ManifestDb::open(&dir.join("manifest.db")).unwrap();
    let storage = dir.join("incoming");
    let (events_tx, _) = tokio::sync::broadcast::channel(1024);
    let engine = TransferEngine {
        db: db.clone(),
        logger: logger.clone(),
        events: events_tx,
        storage_dir: Arc::new(Mutex::new(storage)),
        challenges: Arc::new(PinChallenges::new()),
    };
    TestCtx { _dir: dir, engine }
}

fn random_bytes(n: usize, seed: u64) -> Vec<u8> {
    let mut v = Vec::with_capacity(n);
    let mut x = seed;
    for _ in 0..n {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        v.push((x >> 33) as u8);
    }
    v
}

fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

async fn accept_session(engine: TransferEngine) -> TcpStream {
    // spawn engine on a fresh listener, return the client connection
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let client = TcpStream::connect(addr).await.unwrap();
    let (server, _) = listener.accept().await.unwrap();
    tokio::spawn(async move { engine.run_session(server, "test".into()).await });
    client
}

async fn handshake(client: &mut TcpStream, paired: bool) -> (String, String) {
    // returns (device_id, session_id); performs PIN pairing when needed
    write_json(client, MsgType::Hello, &Hello {
        proto_ver: 1,
        device_id: "test-device-1".into(),
        device_name: "Test iPhone".into(),
        os: "ios".into(),
    }).await.unwrap();
    let frame = read_frame(client).await.unwrap();
    if frame.typ == MsgType::PinChallenge {
        assert!(!paired, "paired device must not get a challenge");
        let ch: PinChallenge = serde_json::from_slice(&frame.payload).unwrap();
        // grab the pin from the engine's events channel is not possible here;
        // instead we re-issue... simpler: use the known pair flow with the pin
        // captured via the event channel is wired in the calling test.
        // For this helper, just send a wrong-then-right pin provided by caller.
        unreachable!("handshake helper requires pin capture; use dedicated helpers")
    }
    assert_eq!(frame.typ, MsgType::HelloAck);
    let ack: HelloAck = serde_json::from_slice(&frame.payload).unwrap();
    (ack.session_id, String::new())
}

fn file_entry(file_id: &str, size: u64, sha: &str, filename: &str) -> FileEntry {
    FileEntry {
        file_id: file_id.into(),
        asset_id: "ASSET-1".into(),
        kind: "video".into(),
        size,
        sha256: sha.into(),
        created_at: 1_700_000_000_000,
        modified_at: 1_700_000_000_000,
        filename: filename.into(),
    }
}

/// Full happy path: pair, transfer one 2.6 MiB file, verify on disk.
#[tokio::test]
async fn full_transfer_with_pairing() {
    let ctx = setup();
    let mut pin_rx = ctx.engine.events.subscribe();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let client = TcpStream::connect(addr).await.unwrap();
    let (server, _) = listener.accept().await.unwrap();
    let engine = ctx.engine.clone();
    tokio::spawn(async move { engine.run_session(server, "test".into()).await });
    let mut c = client;

    // HELLO
    write_json(&mut c, MsgType::Hello, &Hello {
        proto_ver: 1, device_id: "dev-a".into(), device_name: "iPhone".into(), os: "ios".into(),
    }).await.unwrap();
    // expect PIN_CHALLENGE
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::PinChallenge);
    let ch: PinChallenge = serde_json::from_slice(&frame.payload).unwrap();
    // capture the pin from the engine event
    let pin = loop {
        match pin_rx.recv().await.unwrap() {
            desktop_lib::engine::EngineEvent::Pin { pin } => break pin,
            _ => continue,
        }
    };
    // wrong pin on a valid challenge -> PIN_FAIL
    write_json(&mut c, MsgType::PinVerify, &PinVerify { challenge_id: ch.challenge_id.clone(), pin: "000000".into() }).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::PinFail);
    drop(c); // challenge consumed; fresh session for the right pin

    let client2 = TcpStream::connect(addr).await.unwrap();
    let (server2, _) = listener.accept().await.unwrap();
    let engine2 = ctx.engine.clone();
    tokio::spawn(async move { engine2.run_session(server2, "test".into()).await });
    let mut c2 = client2;
    write_json(&mut c2, MsgType::Hello, &Hello {
        proto_ver: 1, device_id: "dev-a".into(), device_name: "iPhone".into(), os: "ios".into(),
    }).await.unwrap();
    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::PinChallenge);
    let ch2: PinChallenge = serde_json::from_slice(&frame.payload).unwrap();
    let pin2 = loop {
        match pin_rx.recv().await.unwrap() {
            desktop_lib::engine::EngineEvent::Pin { pin } => break pin,
            _ => continue,
        }
    };
    write_json(&mut c2, MsgType::PinVerify, &PinVerify { challenge_id: ch2.challenge_id.clone(), pin: pin2.clone() }).await.unwrap();
    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::PinOk);
    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::HelloAck);
    let ack: HelloAck = serde_json::from_slice(&frame.payload).unwrap();
    let session_id = ack.session_id.clone();

    // SESSION_MANIFEST: one file, 2.6 MiB
    let data = random_bytes(2_600_000, 42);
    let sha = sha256_hex(&data);
    let manifest = SessionManifest { files: vec![file_entry("f1", data.len() as u64, &sha, "IMG_0001.MOV")] };
    write_json(&mut c2, MsgType::SessionManifest, &manifest).await.unwrap();

    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::FileState);
    let st: FileState = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(st.files.len(), 1);
    assert_eq!(st.files[0].status, FileStatus::New);
    assert_eq!(st.files[0].offset, 0);

    // send chunks
    let mut offset = 0u64;
    while offset < data.len() as u64 {
        let end = std::cmp::min(offset + CHUNK_SIZE as u64, data.len() as u64);
        let chunk = &data[offset as usize..end as usize];
        let crc = crc32fast::hash(chunk);
        let payload = encode_chunk("f1", offset, crc, chunk).unwrap();
        c2.write_all(&payload).await.unwrap();
        let frame = read_frame(&mut c2).await.unwrap();
        assert_eq!(frame.typ, MsgType::Ack, "expected ACK for chunk at {offset}");
        let ackm: Ack = serde_json::from_slice(&frame.payload).unwrap();
        assert_eq!(ackm.offset, end as u64);
        offset = end as u64;
    }

    write_json(&mut c2, MsgType::FileDone, &FileDone { file_id: "f1".into(), sha256: sha.clone() }).await.unwrap();
    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::FileVerified);
    let v: FileVerified = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(v.sha256, sha);
    assert_eq!(v.size, data.len() as u64);

    write_json(&mut c2, MsgType::SessionEnd, &SessionEnd {
        files_total: 1, bytes_total: data.len() as u64, files_done: 1, bytes_done: data.len() as u64,
    }).await.unwrap();

    // receiver closes with SESSION_ABORT
    let frame = read_frame(&mut c2).await;
    assert!(frame.is_ok());
    assert_eq!(frame.unwrap().typ, MsgType::SessionAbort);

    // verify final file on disk: storage/<device>/<filename> with matching hash
    let storage = ctx.engine.storage_dir.lock().unwrap().clone();
    let final_path = storage.join("dev-a").join("IMG_0001.MOV");
    assert!(final_path.exists(), "final file must exist");
    let disk_hash = sha256_file(&final_path).unwrap();
    assert_eq!(disk_hash, sha, "verified file hash must match");

    // checkpoint recorded
    let cp = ctx.engine.db.get_checkpoint("dev-a").unwrap();
    assert!(cp.is_some(), "backup checkpoint must be set after completed session");
    let sess = ctx.engine.db.get_session(&session_id).unwrap().unwrap();
    assert_eq!(sess.status, "completed");
}

/// Second run of the same manifest must be deduplicated with zero chunk transfer.
#[tokio::test]
async fn dedup_second_run() {
    let ctx = setup();
    let mut pin_rx = ctx.engine.events.subscribe();
    // pre-seed a verified file so dedup can match by hash
    let storage = ctx.engine.storage_dir.lock().unwrap().clone();
    let dev_dir = storage.join("dev-b");
    std::fs::create_dir_all(&dev_dir).unwrap();
    let data = random_bytes(500_000, 7);
    let sha = sha256_hex(&data);
    let path = dev_dir.join("IMG_0001.MOV");
    let mut f = std::fs::File::create(&path).unwrap();
    f.write_all(&data).unwrap();
    f.sync_all().unwrap();

    // run a session with this file's manifest
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let client = TcpStream::connect(addr).await.unwrap();
    let (server, _) = listener.accept().await.unwrap();
    let engine = ctx.engine.clone();
    tokio::spawn(async move { engine.run_session(server, "test".into()).await });
    let mut c = client;

    write_json(&mut c, MsgType::Hello, &Hello {
        proto_ver: 1, device_id: "dev-b".into(), device_name: "iPhone".into(), os: "ios".into(),
    }).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::PinChallenge);
    let ch: PinChallenge = serde_json::from_slice(&frame.payload).unwrap();
    let pin = loop {
        match pin_rx.recv().await.unwrap() {
            desktop_lib::engine::EngineEvent::Pin { pin } => break pin,
            _ => continue,
        }
    };
    write_json(&mut c, MsgType::PinVerify, &PinVerify { challenge_id: ch.challenge_id.clone(), pin }).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap(); // PIN_OK
    let _ = read_frame(&mut c).await.unwrap(); // HELLO_ACK

    // The pre-seeded file exists on disk but has no DB record. Register it as
    // verified so the dedup index can match it.
    ctx.engine.db.upsert_file(&desktop_lib::manifest::FileRecord {
        file_id: "seed".into(),
        device_id: "dev-b".into(),
        session_id: "seed-session".into(),
        kind: "photo".into(),
        original_size: data.len() as u64,
        sha256: Some(sha.clone()),
        status: desktop_lib::manifest::FileStatus::Verified,
        progress: data.len() as u64,
        received_path: Some(path.to_string_lossy().to_string()),
        created_at: 1_700_000_000_000,
        modified_at: 1_700_000_000_000,
        filename: "IMG_0001.MOV".into(),
        attempts: 0,
        last_error: None,
        verified_at: Some(1_700_000_000_000),
        dedup_of: None,
    }).unwrap();
    ctx.engine.db.record_verified("seed", &sha, &path.to_string_lossy(), None).unwrap();

    let manifest = SessionManifest { files: vec![file_entry("f-copy", data.len() as u64, &sha, "IMG_0001.MOV")] };
    write_json(&mut c, MsgType::SessionManifest, &manifest).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::FileState);
    let st: FileState = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(st.files[0].status, FileStatus::Dedup, "must be deduped without transfer");
    assert_eq!(st.files[0].offset, data.len() as u64);

    write_json(&mut c, MsgType::SessionEnd, &SessionEnd {
        files_total: 1, bytes_total: data.len() as u64, files_done: 1, bytes_done: data.len() as u64,
    }).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap();

    let rec = ctx.engine.db.get_file("f-copy").unwrap().unwrap();
    assert_eq!(rec.status, desktop_lib::manifest::FileStatus::Dedup);
    assert_eq!(rec.dedup_of.as_deref(), Some("seed"));
}

/// Interrupt mid-file, reconnect: receiver must resume from the acked byte.
#[tokio::test]
async fn resume_after_interrupt() {
    let ctx = setup();
    let mut pin_rx = ctx.engine.events.subscribe();
    let storage = ctx.engine.storage_dir.lock().unwrap().clone();

    // first session: send 1 chunk of a 3 MiB file, then drop
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let client = TcpStream::connect(addr).await.unwrap();
    let (server, _) = listener.accept().await.unwrap();
    let engine = ctx.engine.clone();
    tokio::spawn(async move { engine.run_session(server, "test".into()).await });
    let mut c = client;

    let data = random_bytes(3_000_000, 99);
    let sha = sha256_hex(&data);

    // pair
    write_json(&mut c, MsgType::Hello, &Hello {
        proto_ver: 1, device_id: "dev-c".into(), device_name: "iPhone".into(), os: "ios".into(),
    }).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::PinChallenge);
    let ch: PinChallenge = serde_json::from_slice(&frame.payload).unwrap();
    let pin = loop {
        match pin_rx.recv().await.unwrap() {
            desktop_lib::engine::EngineEvent::Pin { pin } => break pin,
            _ => continue,
        }
    };
    write_json(&mut c, MsgType::PinVerify, &PinVerify { challenge_id: ch.challenge_id.clone(), pin }).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap(); // PIN_OK
    let _ = read_frame(&mut c).await.unwrap(); // HELLO_ACK

    let manifest = SessionManifest { files: vec![file_entry("f-resume", data.len() as u64, &sha, "IMG_0042.MOV")] };
    write_json(&mut c, MsgType::SessionManifest, &manifest).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap(); // FILE_STATE new

    // send exactly 1 chunk (1 MiB)
    let chunk = &data[..CHUNK_SIZE];
    let payload = encode_chunk("f-resume", 0, crc32fast::hash(chunk), chunk).unwrap();
    c.write_all(&payload).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::Ack);
    drop(c); // interrupt

    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    // second session: resume
    let client2 = TcpStream::connect(addr).await.unwrap();
    let (server2, _) = listener.accept().await.unwrap();
    let engine2 = ctx.engine.clone();
    tokio::spawn(async move { engine2.run_session(server2, "test".into()).await });
    let mut c2 = client2;

    write_json(&mut c2, MsgType::Hello, &Hello {
        proto_ver: 1, device_id: "dev-c".into(), device_name: "iPhone".into(), os: "ios".into(),
    }).await.unwrap();
    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::HelloAck, "already paired: no PIN");

    let manifest = SessionManifest { files: vec![file_entry("f-resume", data.len() as u64, &sha, "IMG_0042.MOV")] };
    write_json(&mut c2, MsgType::SessionManifest, &manifest).await.unwrap();
    let frame = read_frame(&mut c2).await.unwrap();
    let st: FileState = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(st.files[0].status, FileStatus::Partial, "must resume partial file");
    assert_eq!(st.files[0].offset, CHUNK_SIZE as u64, "resume from acked byte");

    // send the rest starting at the resume offset
    let mut offset = CHUNK_SIZE as u64;
    while offset < data.len() as u64 {
        let end = std::cmp::min(offset + CHUNK_SIZE as u64, data.len() as u64);
        let chunk = &data[offset as usize..end as usize];
        let payload = encode_chunk("f-resume", offset, crc32fast::hash(chunk), chunk).unwrap();
        c2.write_all(&payload).await.unwrap();
        let frame = read_frame(&mut c2).await.unwrap();
        assert_eq!(frame.typ, MsgType::Ack);
        offset = end as u64;
    }
    write_json(&mut c2, MsgType::FileDone, &FileDone { file_id: "f-resume".into(), sha256: sha.clone() }).await.unwrap();
    let frame = read_frame(&mut c2).await.unwrap();
    assert_eq!(frame.typ, MsgType::FileVerified);

    let final_path = storage.join("dev-c").join("IMG_0042.MOV");
    assert_eq!(sha256_file(&final_path).unwrap(), sha, "resumed file must verify byte-exact");
}

/// Corrupted chunk must be NAKed and the file must still verify.
#[tokio::test]
async fn corrupt_chunk_triggers_nak() {
    let ctx = setup();
    let mut pin_rx = ctx.engine.events.subscribe();
    let storage = ctx.engine.storage_dir.lock().unwrap().clone();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let client = TcpStream::connect(addr).await.unwrap();
    let (server, _) = listener.accept().await.unwrap();
    let engine = ctx.engine.clone();
    tokio::spawn(async move { engine.run_session(server, "test".into()).await });
    let mut c = client;

    let data = random_bytes(2_000_000, 3);
    let sha = sha256_hex(&data);

    write_json(&mut c, MsgType::Hello, &Hello {
        proto_ver: 1, device_id: "dev-d".into(), device_name: "iPhone".into(), os: "ios".into(),
    }).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    let ch: PinChallenge = serde_json::from_slice(&frame.payload).unwrap();
    let pin = loop {
        match pin_rx.recv().await.unwrap() {
            desktop_lib::engine::EngineEvent::Pin { pin } => break pin,
            _ => continue,
        }
    };
    write_json(&mut c, MsgType::PinVerify, &PinVerify { challenge_id: ch.challenge_id.clone(), pin }).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap();

    let manifest = SessionManifest { files: vec![file_entry("f-crc", data.len() as u64, &sha, "IMG_0099.MOV")] };
    write_json(&mut c, MsgType::SessionManifest, &manifest).await.unwrap();
    let _ = read_frame(&mut c).await.unwrap();

    // chunk 0 with a WRONG crc
    let chunk = &data[..CHUNK_SIZE];
    let payload = encode_chunk("f-crc", 0, 12345, chunk).unwrap();
    c.write_all(&payload).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::Nak, "wrong crc must NAK");

    // correct crc now
    let payload = encode_chunk("f-crc", 0, crc32fast::hash(chunk), chunk).unwrap();
    c.write_all(&payload).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::Ack);

    // remaining chunks
    let mut offset = CHUNK_SIZE as u64;
    while offset < data.len() as u64 {
        let end = std::cmp::min(offset + CHUNK_SIZE as u64, data.len() as u64);
        let chunk = &data[offset as usize..end as usize];
        let payload = encode_chunk("f-crc", offset, crc32fast::hash(chunk), chunk).unwrap();
        c.write_all(&payload).await.unwrap();
        let _ = read_frame(&mut c).await.unwrap();
        offset = end as u64;
    }
    write_json(&mut c, MsgType::FileDone, &FileDone { file_id: "f-crc".into(), sha256: sha.clone() }).await.unwrap();
    let frame = read_frame(&mut c).await.unwrap();
    assert_eq!(frame.typ, MsgType::FileVerified);

    let final_path = storage.join("dev-d").join("IMG_0099.MOV");
    assert_eq!(sha256_file(&final_path).unwrap(), sha);
}

/// Frame-level conformance: JSON control frames decode identically on both ends.
#[test]
fn conformance_json_roundtrip() {
    let hello = Hello { proto_ver: 1, device_id: "conformance-dev".into(), device_name: "Conform".into(), os: "ios".into() };
    let bytes = encode_json(MsgType::Hello, &hello).unwrap();
    assert_eq!(&bytes[0..2], &MAGIC);
    let len = u32::from_be_bytes([bytes[2], bytes[3], bytes[4], bytes[5]]) as usize;
    assert_eq!(len, bytes.len() - 7);
    assert_eq!(bytes[6], MsgType::Hello as u8);
    let rt = tokio::runtime::Runtime::new().unwrap();
    let frame = rt.block_on(async {
        read_frame(&mut std::io::Cursor::new(bytes)).await.unwrap()
    });
    assert_eq!(frame.typ, MsgType::Hello);
    let parsed: Hello = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(parsed.device_id, "conformance-dev");
    assert_eq!(parsed.proto_ver, 1);
}

#[test]
fn conformance_unknown_type_rejected() {
    let mut bytes = encode_json(MsgType::Ping, &serde_json::json!({})).unwrap();
    bytes[6] = 99;
    let rt = tokio::runtime::Runtime::new().unwrap();
    let err = rt.block_on(async {
        read_frame(&mut std::io::Cursor::new(bytes)).await.unwrap_err()
    });
    assert!(matches!(err, CodecError::UnknownType(99)));
}

/// Golden vectors from conformance/VECTORS.md, produced by the Swift sender.
/// Both implementations must accept these byte-for-byte.
#[test]
fn conformance_swift_golden_vectors() {
    // PING frame: 50 42 00 00 00 02 10 7b 7d
    let ping = [
        0x50, 0x42, 0x00, 0x00, 0x00, 0x02, 0x10, 0x7b, 0x7d,
    ];
    let rt = tokio::runtime::Runtime::new().unwrap();
    let frame = rt.block_on(async {
        read_frame(&mut std::io::Cursor::new(ping.to_vec())).await.unwrap()
    });
    assert_eq!(frame.typ, MsgType::Ping);

    // HELLO frame from the Swift golden vector (length 85, type 0x00).
    let hello_hex = "504200000055007b2270726f746f5f766572223a312c226465766963655f6e616d65223a22416c696365206950686f6e65222c226465766963655f6964223a226970686f6e652d616263222c226f73223a22696f732d31382e30227d";
    let hello_bytes = (0..hello_hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hello_hex[i..i + 2], 16).unwrap())
        .collect::<Vec<_>>();
    let frame = rt.block_on(async {
        read_frame(&mut std::io::Cursor::new(hello_bytes)).await.unwrap()
    });
    assert_eq!(frame.typ, MsgType::Hello);
    let parsed: Hello = serde_json::from_slice(&frame.payload).unwrap();
    assert_eq!(parsed.proto_ver, 1);
    assert_eq!(parsed.device_id, "iphone-abc");
    assert_eq!(parsed.device_name, "Alice iPhone");
    assert_eq!(parsed.os, "ios-18.0");

    // CHUNK payload from the Swift golden vector: header_len 68, file_id asset-1,
    // offset 1048576, crc32 693680462, size 1024, then 1024 x 0xAB.
    let hjson = br#"{"file_id":"asset-1","offset":1048576,"crc32":693680462,"size":1024}"#;
    assert_eq!(hjson.len(), 68);
    let mut chunk = vec![0u8; 4 + 68 + 1024];
    chunk[..4].copy_from_slice(&68u32.to_be_bytes());
    chunk[4..4 + 68].copy_from_slice(hjson);
    chunk[4 + 68..].fill(0xAB);
    let header: ChunkHeader = serde_json::from_slice(&chunk[4..4 + 68]).unwrap();
    assert_eq!(header.file_id, "asset-1");
    assert_eq!(header.offset, 1048576);
    assert_eq!(header.crc32, 693680462);
    assert_eq!(header.crc32, crc32fast::hash(&chunk[4 + 68..]));
}

/// Sanity: HashMap-based TXT construction is compatible with mdns-sd's TxtProperties.
#[test]
fn txt_map_builds() {
    let mut txt: HashMap<String, String> = HashMap::new();
    txt.insert("ver".into(), "1".into());
    txt.insert("name".into(), "Test".into());
    txt.insert("cap".into(), "wifi".into());
    let si = mdns_sd::ServiceInfo::new(
        "_photobridge._tcp", "Test (PhotoBridge)", "test.local.", "0.0.0.0", 8471, txt,
    );
    assert!(si.is_ok());
}