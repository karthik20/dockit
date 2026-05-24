use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Manager, State};

mod server;
use crate::server::{ServerProcess, ServerState};

#[derive(Serialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub ready: bool,
}

#[derive(Serialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
    pub arch: String,
}

#[tauri::command]
fn get_server_status(state: State<ServerState>) -> ServerStatus {
    let mut server = state.process.lock().unwrap_or_else(|e| e.into_inner());
    ServerStatus {
        running: server.is_alive(),
        ready: std::net::TcpStream::connect(format!("127.0.0.1:{}", server.port())).is_ok(),
        port: server.port(),
    }
}

#[tauri::command]
fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Dockit".into(),
        version: "0.1.5".into(),
        platform: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
    }
}

fn resolve_repo_root() -> PathBuf {
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_root = crate_dir
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent());

    let dev_script = dev_root
        .as_ref()
        .map(|r| r.join("apps/server/dist/index.js"));

    if let Some(ref script) = dev_script {
        if script.exists() {
            return dev_root.unwrap().to_path_buf();
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let script = exe_dir.join("apps/server/dist/index.js");
            if script.exists() {
                return exe_dir.to_path_buf();
            }
        }
    }

    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn resolve_server_script(repo_root: &std::path::Path) -> PathBuf {
    if let Ok(p) = std::env::var("DOCKIT_SERVER_PATH") {
        let path = PathBuf::from(&p);
        if path.exists() {
            return path;
        }
    }
    repo_root.join("apps/server/dist/index.js")
}

fn main() {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    let repo_root = resolve_repo_root();
    let server_script = resolve_server_script(&repo_root);
    let project_root = repo_root.to_string_lossy().to_string();

    let mut server = ServerProcess::new(port);
    match server.start(&server_script) {
        Ok(()) => {
            println!("[dockit] server starting on port {} ({})", port, server_script.display());
            if server.wait_ready(Duration::from_secs(10)) {
                println!("[dockit] server ready");
            } else {
                eprintln!("[dockit] warning: server did not become ready within timeout");
            }
        }
        Err(e) => {
            eprintln!("[dockit] warning: server failed to start: {}", e);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(ServerState {
            process: std::sync::Mutex::new(server),
            project_root,
        })
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            get_app_info,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<ServerState>() {
                    let mut server = state.process.lock().unwrap_or_else(|e| e.into_inner());
                    server.stop();
                    println!("[dockit] server stopped");
                }
                window.destroy().ok();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
