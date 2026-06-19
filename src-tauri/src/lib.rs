// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::fs;
use std::io::Write;
use std::time::Duration;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct AppState {
    backend_process: Arc<Mutex<Option<Child>>>,
}

/// Write diagnostic message directly to file (works in release mode).
fn diag_log(msg: &str) {
    if let Some(path) = resolve_log_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "[DIAG] {}", msg);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_process = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .manage(AppState {
            backend_process: backend_process.clone(),
        })
        .setup(move |app| {
            diag_log("=== PaperLens starting ===");
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
    diag_log(&format!("Resource dir: {:?}", resource_dir));

    // Tauri v2 bundles resources preserving directory structure from src-tauri/,
    // so "resources/backend/**/*" becomes "$RESOURCE/resources/backend/".
    // Try both paths: $RESOURCE/backend/main.exe and $RESOURCE/resources/backend/main.exe
    let backend_exe_direct = resource_dir.join("backend").join("main.exe");
    let backend_exe_nested = resource_dir.join("resources").join("backend").join("main.exe");
    let backend_exe = if backend_exe_direct.exists() {
        backend_exe_direct
    } else if backend_exe_nested.exists() {
        backend_exe_nested
    } else {
        resource_dir.join("backend").join("main.exe") // fallback for logging
    };
    diag_log(&format!("Backend exe path: {:?}", backend_exe));
    diag_log(&format!("Backend exe exists: {}", backend_exe.exists()));

    // Determine executable path and working directory
    let (exe_path, work_dir) = if backend_exe.exists() {
        let work_dir = backend_exe.parent().unwrap().to_path_buf();
        // Check _internal directory (PyInstaller onedir dependency dir)
        let internal_dir = work_dir.join("_internal");
        diag_log(&format!("Work dir: {:?}", work_dir));
        diag_log(&format!("_internal exists: {}", internal_dir.exists()));
        if internal_dir.exists() {
            // Count files in _internal
            if let Ok(entries) = fs::read_dir(&internal_dir) {
                let count = entries.count();
                diag_log(&format!("_internal file count: {}", count));
            }
        }
        // List files in work_dir for diagnostics
        if let Ok(entries) = fs::read_dir(&work_dir) {
            let names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            diag_log(&format!("Work dir contents: {:?}", names));
        }
        (backend_exe, work_dir)
    } else {
        // Development: run Python script directly
        let backend_dir = std::env::current_dir()?.join("backend");
        let main_py = backend_dir.join("main.py");
        if !main_py.exists() {
            diag_log(&format!("Backend not found at {:?}", main_py));
            log::warn!("Backend not found at {:?}", main_py);
            return Ok(());
        }
        diag_log(&format!("Dev mode, main.py: {:?}", main_py));
        (main_py, backend_dir)
    };

    diag_log(&format!("Starting backend: {:?}", exe_path));
    log::info!("Starting backend: {:?}", exe_path);

    // Redirect stdout/stderr to a log file
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
        diag_log("Production mode: launching exe");
        Command::new(&exe_path)
    } else {
        diag_log("Development mode: launching via python");
        let mut c = Command::new("python");
        c.arg(&exe_path);
        c
    };

    cmd.current_dir(&work_dir)
        .stdout(stdout_cfg)
        .stderr(stderr_cfg);

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            diag_log(&format!("Backend process started (PID: {})", pid));
            log::info!("Backend process started (PID: {})", pid);
            *process.lock().unwrap() = Some(child);
        }
        Err(e) => {
            diag_log(&format!("Failed to start backend: {}", e));
            log::error!("Failed to start backend: {}", e);
            return Err(Box::new(e));
        }
    }

    // Health check in a separate thread
    let proc_clone = process.clone();
    std::thread::spawn(move || {
        wait_for_healthy(proc_clone);
    });

    Ok(())
}

/// Poll the backend health endpoint until it responds 200 OK or timeout.
fn wait_for_healthy(process: Arc<Mutex<Option<Child>>>) {
    let url = "http://localhost:8765/api/v1/system/health";
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    let max_attempts = 60; // 60 * 500ms = 30 seconds
    for i in 0..max_attempts {
        // Check if backend process has exited
        {
            let mut guard = process.lock().unwrap();
            if let Some(ref mut child) = *guard {
                if let Ok(Some(status)) = child.try_wait() {
                    diag_log(&format!("Backend process EXITED at attempt {} with status: {}", i + 1, status));
                    // Process died - no point waiting
                    return;
                }
            }
        }

        match client.get(url).send() {
            Ok(resp) if resp.status().is_success() => {
                diag_log(&format!("Backend healthy after {}ms", (i + 1) * 500));
                log::info!("Backend healthy after {}ms", (i + 1) * 500);
                return;
            }
            Ok(resp) => {
                if i == 0 || i % 10 == 0 {
                    diag_log(&format!("Backend status: {} (attempt {}/{})", resp.status(), i + 1, max_attempts));
                }
            }
            Err(e) => {
                if i == 0 || i % 10 == 0 {
                    diag_log(&format!("Waiting for backend... ({}/{}): {}", i + 1, max_attempts, e));
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    diag_log(&format!("Backend health check TIMED OUT after {}s", max_attempts / 2));
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
        diag_log(&format!("Stopping backend (PID: {})", pid));
        log::info!("Stopping backend (PID: {})", pid);

        let _ = child.kill();

        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(&["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .output();
        }

        match child.wait() {
            Ok(status) => {
                diag_log(&format!("Backend exited with status: {}", status));
                log::info!("Backend exited with status: {}", status);
            }
            Err(e) => log::warn!("Error waiting for backend exit: {}", e),
        }
    }
}
