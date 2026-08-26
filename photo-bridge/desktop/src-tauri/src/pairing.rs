use rand::Rng;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

/// In-memory pending PIN challenges (single-use, expiring).
pub struct PinChallenges {
    map: Mutex<HashMap<String, (String, i64)>>, // challenge_id -> (pin, expires_ms)
}

impl PinChallenges {
    pub fn new() -> Self {
        Self { map: Mutex::new(HashMap::new()) }
    }

    pub fn issue(&self) -> (String, String, i64) {
        let mut rng = rand::thread_rng();
        let pin: String = (0..6).map(|_| rng.gen_range(b'0'..=b'9') as char).collect();
        let id = uuid::Uuid::new_v4().to_string();
        let expires = now_ms() + 10 * 60 * 1000; // 10 minutes
        self.map.lock().unwrap().insert(id.clone(), (pin.clone(), expires));
        (id, pin, expires)
    }

    /// Consume a challenge. Returns Ok(true) if pin matches, Ok(false) wrong pin, Err if expired/unknown.
    pub fn verify(&self, challenge_id: &str, pin: &str) -> Result<bool, ()> {
        let mut map = self.map.lock().unwrap();
        match map.remove(challenge_id) {
            None => Err(()),
            Some((expected, expires)) => {
                if now_ms() > expires {
                    Err(())
                } else {
                    Ok(expected == pin)
                }
            }
        }
    }
}

pub fn hash_pin(pin: &str, salt: &str) -> String {
    let mut h = Sha256::new();
    h.update(salt.as_bytes());
    h.update(pin.as_bytes());
    hex::encode(h.finalize())
}

pub fn new_salt() -> String {
    let rng = rand::thread_rng();
    rng.sample_iter(&rand::distributions::Alphanumeric).take(16).map(char::from).collect()
}

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}