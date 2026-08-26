use sha2::{Digest, Sha256};

/// Streaming SHA-256 helper for verifying files without loading them into memory.
pub fn sha256_file(path: &std::path::Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = std::io::Read::read(&mut f, &mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn crc32(data: &[u8]) -> u32 {
    crc32fast::hash(data)
}

/// Compare two hex strings in constant time (best effort).
pub fn hex_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    let mut acc: u8 = 0;
    for i in 0..ab.len() {
        acc |= ab[i] ^ bb[i];
    }
    acc == 0
}