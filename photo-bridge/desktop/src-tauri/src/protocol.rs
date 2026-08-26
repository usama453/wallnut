use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::time::{timeout, Duration};

pub const MAGIC: [u8; 2] = [0x50, 0x42]; // "PB"
pub const MAX_PAYLOAD: usize = 2 * 1024 * 1024;
pub const CHUNK_SIZE: usize = 1024 * 1024; // 1 MiB
pub const WINDOW: usize = 4; // un-ACKed chunks in flight (sender side)
pub const HEARTBEAT_IDLE: Duration = Duration::from_secs(15);
pub const READ_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum MsgType {
    Hello = 0,
    HelloAck = 1,
    PinChallenge = 2,
    PinVerify = 3,
    PinOk = 4,
    PinFail = 5,
    SessionManifest = 6,
    FileState = 7,
    Chunk = 8,
    Ack = 9,
    Nak = 10,
    FileDone = 11,
    FileVerified = 12,
    FileFailed = 13,
    SessionEnd = 14,
    SessionAbort = 15,
    Ping = 16,
    Pong = 17,
}

impl MsgType {
    pub fn from_u8(v: u8) -> Option<Self> {
        Some(match v {
            0 => Self::Hello,
            1 => Self::HelloAck,
            2 => Self::PinChallenge,
            3 => Self::PinVerify,
            4 => Self::PinOk,
            5 => Self::PinFail,
            6 => Self::SessionManifest,
            7 => Self::FileState,
            8 => Self::Chunk,
            9 => Self::Ack,
            10 => Self::Nak,
            11 => Self::FileDone,
            12 => Self::FileVerified,
            13 => Self::FileFailed,
            14 => Self::SessionEnd,
            15 => Self::SessionAbort,
            16 => Self::Ping,
            17 => Self::Pong,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone)]
pub struct Frame {
    pub typ: MsgType,
    pub payload: Vec<u8>,
}

#[derive(Debug, thiserror::Error)]
pub enum CodecError {
    #[error("bad magic")]
    BadMagic,
    #[error("oversize frame: {0}")]
    Oversize(usize),
    #[error("truncated frame")]
    Truncated,
    #[error("unknown message type {0}")]
    UnknownType(u8),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("timed out")]
    Timeout,
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("db error: {0}")]
    Db(String),
    #[error("zero-length chunk header")]
    EmptyChunkHeader,
    #[error("protocol violation: {0}")]
    Violation(String),
}

pub fn encode_frame(typ: MsgType, payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(7 + payload.len());
    out.extend_from_slice(&MAGIC);
    out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    out.push(typ as u8);
    out.extend_from_slice(payload);
    out
}

pub fn encode_json<T: Serialize>(typ: MsgType, val: &T) -> Result<Vec<u8>, CodecError> {
    let payload = serde_json::to_vec(val)?;
    Ok(encode_frame(typ, &payload))
}

/// Payload for a CHUNK frame: u32 BE header_len + JSON header + raw bytes.
pub fn encode_chunk(file_id: &str, offset: u64, crc32: u32, data: &[u8]) -> Result<Vec<u8>, CodecError> {
    let hdr = ChunkHeader { file_id: file_id.to_string(), offset, crc32 };
    let hdr_json = serde_json::to_vec(&hdr)?;
    let payload_len = 4 + hdr_json.len() + data.len();
    let mut payload = Vec::with_capacity(payload_len);
    payload.extend_from_slice(&(hdr_json.len() as u32).to_be_bytes());
    payload.extend_from_slice(&hdr_json);
    payload.extend_from_slice(data);
    Ok(encode_frame(MsgType::Chunk, &payload))
}

/// Read one complete frame from the stream (with timeout).
pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> Result<Frame, CodecError> {
    let mut header = [0u8; 7];
    timeout(READ_TIMEOUT, r.read_exact(&mut header))
        .await
        .map_err(|_| CodecError::Timeout)?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::UnexpectedEof {
                CodecError::Truncated
            } else {
                CodecError::Io(e)
            }
        })?;
    if header[0] != MAGIC[0] || header[1] != MAGIC[1] {
        return Err(CodecError::BadMagic);
    }
    let len = u32::from_be_bytes([header[2], header[3], header[4], header[5]]) as usize;
    if len > MAX_PAYLOAD {
        return Err(CodecError::Oversize(len));
    }
    let typ = MsgType::from_u8(header[6]).ok_or(CodecError::UnknownType(header[6]))?;
    let mut payload = vec![0u8; len];
    timeout(READ_TIMEOUT, r.read_exact(&mut payload))
        .await
        .map_err(|_| CodecError::Timeout)?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::UnexpectedEof {
                CodecError::Truncated
            } else {
                CodecError::Io(e)
            }
        })?;
    Ok(Frame { typ, payload })
}

pub async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, typ: MsgType, payload: &[u8]) -> Result<(), CodecError> {
    let frame = encode_frame(typ, payload);
    w.write_all(&frame).await?;
    Ok(())
}

pub async fn write_json<W: AsyncWrite + Unpin, T: Serialize>(w: &mut W, typ: MsgType, val: &T) -> Result<(), CodecError> {
    write_frame(w, typ, &serde_json::to_vec(val)?).await
}

/// Split a CHUNK payload into (header, data).
pub fn split_chunk_payload(payload: &[u8]) -> Result<(ChunkHeader, &[u8]), CodecError> {
    if payload.len() < 4 {
        return Err(CodecError::EmptyChunkHeader);
    }
    let hlen = u32::from_be_bytes([payload[0], payload[1], payload[2], payload[3]]) as usize;
    if hlen == 0 || 4 + hlen > payload.len() {
        return Err(CodecError::EmptyChunkHeader);
    }
    let hdr: ChunkHeader = serde_json::from_slice(&payload[4..4 + hlen])?;
    Ok((hdr, &payload[4 + hlen..]))
}

// ---------------------------------------------------------------------------
// Payload types (JSON)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkHeader {
    pub file_id: String,
    pub offset: u64,
    pub crc32: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hello {
    pub proto_ver: u32,
    pub device_id: String,
    pub device_name: String,
    pub os: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloAck {
    pub session_id: String,
    pub paired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinChallenge {
    pub challenge_id: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinVerify {
    pub challenge_id: String,
    pub pin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinFail {
    pub strikes_left: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub file_id: String,
    pub asset_id: String,
    pub kind: String,
    pub size: u64,
    pub sha256: String,
    pub created_at: i64,
    pub modified_at: i64,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionManifest {
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    New,
    Partial,
    Verified,
    Dedup,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStateItem {
    pub file_id: String,
    pub status: FileStatus,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileState {
    pub files: Vec<FileStateItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ack {
    pub file_id: String,
    pub offset: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Nak {
    pub file_id: String,
    pub offset: u64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDone {
    pub file_id: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileVerified {
    pub file_id: String,
    pub sha256: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dedup_of: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileFailed {
    pub file_id: String,
    pub reason: String,
    pub attempt: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEnd {
    pub files_total: u64,
    pub bytes_total: u64,
    pub files_done: u64,
    pub bytes_done: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionAbort {
    pub reason: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_roundtrip() {
        let msg = Hello { proto_ver: 1, device_id: "d1".into(), device_name: "iPhone".into(), os: "ios".into() };
        let bytes = encode_json(MsgType::Hello, &msg).unwrap();
        let mut cursor = std::io::Cursor::new(bytes);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let frame = rt.block_on(async { read_frame(&mut cursor).await }).unwrap();
        assert_eq!(frame.typ, MsgType::Hello);
        let parsed: Hello = serde_json::from_slice(&frame.payload).unwrap();
        assert_eq!(parsed.device_id, "d1");
    }

    #[test]
    fn chunk_roundtrip() {
        let data = vec![0xABu8; 1024];
        let bytes = encode_chunk("file-1", 0, 123456, &data).unwrap();
        let mut cursor = std::io::Cursor::new(bytes);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let frame = rt.block_on(async { read_frame(&mut cursor).await }).unwrap();
        assert_eq!(frame.typ, MsgType::Chunk);
        let (hdr, body) = split_chunk_payload(&frame.payload).unwrap();
        assert_eq!(hdr.file_id, "file-1");
        assert_eq!(hdr.offset, 0);
        assert_eq!(hdr.crc32, 123456);
        assert_eq!(body, data.as_slice());
    }

    #[test]
    fn bad_magic_rejected() {
        let mut bytes = encode_frame(MsgType::Ping, b"{}").to_vec();
        bytes[0] = 0x00;
        let mut cursor = std::io::Cursor::new(bytes);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let err = rt.block_on(async { read_frame(&mut cursor).await }).unwrap_err();
        assert!(matches!(err, CodecError::BadMagic));
    }

    #[test]
    fn oversize_rejected() {
        let mut bytes = encode_frame(MsgType::Ping, b"{}").to_vec();
        bytes[2..6].copy_from_slice(&(MAX_PAYLOAD as u32 + 1).to_be_bytes());
        let mut cursor = std::io::Cursor::new(bytes);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let err = rt.block_on(async { read_frame(&mut cursor).await }).unwrap_err();
        assert!(matches!(err, CodecError::Oversize(_)));
    }
}