use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

pub const SERVICE_TYPE: &str = "_photobridge._tcp";
pub const SERVICE_PORT: u16 = 8471;

pub struct Discovery {
    _daemon: ServiceDaemon,
}

impl Discovery {
    pub fn start(hostname: &str, device_name: &str) -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let instance = format!("{device_name} (PhotoBridge)");
        let mut txt = HashMap::new();
        txt.insert("ver".to_string(), "1".to_string());
        txt.insert("name".to_string(), device_name.to_string());
        txt.insert("cap".to_string(), "wifi".to_string());
        let service = ServiceInfo::new(
            SERVICE_TYPE,
            &instance,
            &format!("{hostname}.local."),
            "0.0.0.0", // ephemeral: mdns-sd resolves the interface address
            SERVICE_PORT,
            txt,
        )
        .map_err(|e| e.to_string())?;
        daemon.register(service).map_err(|e| e.to_string())?;
        Ok(Self { _daemon: daemon })
    }
}