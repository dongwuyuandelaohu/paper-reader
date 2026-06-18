// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::fs;
use std::time::Duration;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct AppState {
    backend_process: Arc<Mutex<Option<Child>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_process = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .manage(AppState {
            backend_process: backend_process.clone(),
        })
        .setup(move |app| {
            start_backend(app, backend_process.clone())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                stop_backend(state.backend_process.clone());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Start the Python backend and wait for it to become healthy.
fn start_backend<R: tauri::Runtime>(
    app: &tauri::App<R>,
    process: Arc<Mutex<Option<Child>>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let backend_exe = resource_dir.join("backend").join("main.exe");
    log::info!("Backend exe path: {:?}", backend_exe);

    // Determine executable path and working directory
    let (exe_path, work_dir) = if backend_exe.exists() {
        // Production: PyInstaller-built exe bundled as Tauri resource
        let work_dir = backend_exe.parent().unwrap().to_path_buf();
        (backend_exe, work_dir)
    } else {
        // Development: run Python script directly
        let backend_dir = std::env::current_dir()?.join("backend");
        let main_py = backend_dir.join("main.py");
        if !main_py.exists() {
            log::warn!("Backend not found at {:?}", main_py);
            return Ok(());
        }
        (main_py, backend_dir)
    };

    log::info!("Starting backend: {:?}", exe_path);

    // Redirect stdout/stderr to a log file to prevent pipe buffer overflow.
    // If we used Stdio::piped() without draining, the pipe buffers would fill up
    // and block the backend process.
    let log_path = resolve_log_path();
    let log_file = if let Some(ref path) = log_path {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .ok()
    } else {
        None
    };

    let stdout_cfg = if let Some(ref f) = log_file {
        Stdio::from(f.try_clone()?)
    } else {
        Stdio::null()
    };
    let stderr_cfg = if let Some(ref f) = log_file {
        Stdio::from(f.try_clone()?)
    } else {
        Stdio::null()
    };

    let mut cmd = if exe_path.extension().map_or(false, |e| e == "exe") {
        log::info!("Production mode: launching exe");
        Command::new(&exe_path)
    } else {
        log::info!("Development mode: launching via python");
        let mut c = Command::new("python");
        c.arg(&exe_path);
        c
    };

    cmd.current_dir(&work_dir)
        .stdout(stdout_cfg)
        .stderr(stderr_cfg);

    match cmd.spawn() {
        Ok(child) => {
            log::info!("Backend process started (PID: {})", child.id());
            *process.lock().unwrap() = Some(child);
        }
        Err(e) => {
            log::error!("Failed to start backend: {}", e);
            return Err(Box::new(e));
        }
    }

    // Health check: poll until backend responds or timeout (30 seconds)
    wait_for_healthy();

    Ok(())
}

/// Poll the backend health endpoint until it responds 200 OK or timeout.
fn wait_for_healthy() {
    let url = "http://localhost:8765/api/v1/system/health";
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    let max_attempts = 60; // 60 * 500ms = 30 seconds
    for i in 0..max_attempts {
        match client.get(url).send() {
            Ok(resp) if resp.status().is_success() => {
                log::info!("Backend healthy after {}ms", (i + 1) * 500);
                return;
            }
            Ok(resp) => {
                if i == 0 || i % 10 == 0 {
                    log::debug!("Backend status: {}", resp.status());
                }
            }
            Err(_) => {
                if i == 0 || i % 10 == 0 {
                    log::debug!("Waiting for backend... ({}/{})", i + 1, max_attempts);
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    log::warn!("Backend health check timed out after {}s", max_attempts / 2);
}

/// Resolve a writable log file path for backend stdout/stderr capture.
fn resolve_log_path() -> Option<std::path::PathBuf> {
    if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .ok()
            .map(|p| {
                std::path::PathBuf::from(p)
                    .join("PaperLens")
                    .join("data")
                    .join("backend.log")
            })
    } else {
        dirs_next::home_dir().map(|h| h.join(".paperlens").join("data").join("backend.log"))
    }
}

/// Terminate the backend process, using platform-appropriate methods.
fn stop_backend(process: Arc<Mutex<Option<Child>>>) {
    if let Some(mut child) = process.lock().unwrap().take() {
        let pid = child.id();
        log::info!("Stopping backend (PID: {})", pid);

        // First try a clean kill
        let _ = child.kill();

        // On Windows, use taskkill to kill the entire process tree
        // (PyInstaller may spawn child processes)
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(&["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
        }

        // Wait briefly for the process to exit
        match child.wait() {
            Ok(status) => log::info!("Backend exited with status: {}", status),
            Err(e) => log::warn!("Error waiting for backend exit: {}", e),
        }
    }
}
