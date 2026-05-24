use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

pub struct ServerProcess {
    child: Option<Child>,
    port: u16,
}

impl ServerProcess {
    pub fn new(port: u16) -> Self {
        ServerProcess { child: None, port }
    }

    pub fn start(&mut self, script_path: &Path) -> Result<(), String> {
        if self.child.is_some() {
            return Ok(());
        }

        if !script_path.exists() {
            return Err(format!(
                "server script not found at {} — run `npm run build:server` first",
                script_path.display()
            ));
        }

        let mut cmd = Command::new("node");
        cmd.arg(script_path)
            .env("PORT", self.port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x00000200);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn server (is `node` installed?): {}", e))?;

        self.child = Some(child);
        Ok(())
    }

    pub fn wait_ready(&mut self, timeout: Duration) -> bool {
        let deadline = std::time::Instant::now() + timeout;
        while std::time::Instant::now() < deadline {
            if !self.is_alive() {
                return false;
            }
            if std::net::TcpStream::connect(format!("127.0.0.1:{}", self.port)).is_ok() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        false
    }

    pub fn stop(&mut self) {
        if let Some(ref mut child) = self.child {
            #[cfg(unix)]
            unsafe {
                // send SIGTERM for graceful shutdown
                libc::kill(child.id() as i32, libc::SIGTERM);
                for _ in 0..50 {
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        self.child = None;
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            #[cfg(windows)]
            {
                // Windows: try graceful close first via taskkill
                let _ = Command::new("taskkill")
                    .args(["/PID", &child.id().to_string()])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn();
                for _ in 0..50 {
                    if matches!(child.try_wait(), Ok(Some(_))) {
                        self.child = None;
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            // force kill on timeout
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
    }

    pub fn is_alive(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

pub struct ServerState {
    pub process: Mutex<ServerProcess>,
    pub project_root: String,
}
