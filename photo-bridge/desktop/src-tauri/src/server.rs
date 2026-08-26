use crate::engine::TransferEngine;
use crate::logging::Logger;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

pub struct PhotoServer {
    pub handle: JoinHandle<()>,
}

impl PhotoServer {
    pub fn spawn(engine: TransferEngine, logger: Logger) -> Self {
        let handle = tokio::spawn(async move {
            let listener = match TcpListener::bind(("0.0.0.0", crate::discovery::SERVICE_PORT)).await {
                Ok(l) => l,
                Err(e) => {
                    logger.error("server", format!("failed to bind port {}: {e}", crate::discovery::SERVICE_PORT));
                    return;
                }
            };
            logger.info("server", format!("listening on {}", crate::discovery::SERVICE_PORT));
            loop {
                match listener.accept().await {
                    Ok((stream, _addr)) => {
                        let engine = engine.clone();
                        tokio::spawn(async move {
                            engine.run_session(stream, "".to_string()).await;
                        });
                    }
                    Err(e) => {
                        logger.warn("server", format!("accept error: {e}"));
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
        });
        Self { handle }
    }
}