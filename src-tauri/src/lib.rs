use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{Manager, Runtime};

// 全局存储后端进程
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
            // 启动 Python 后端
            start_backend(app, backend_process.clone())?;
            
            // 注册日志插件
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
            // 窗口关闭时停止后端
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AppState>();
                stop_backend(state.backend_process.clone());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_backend<R: Runtime>(app: &tauri::App<R>, process: Arc<Mutex<Option<Child>>>) -> Result<(), Box<dyn std::error::Error>> {
    // 获取应用资源目录
    let resource_dir = app.path().resource_dir()?;
    let backend_exe = resource_dir.join("backend").join("main.exe");
    
    // 如果 exe 不存在，尝试使用 Python 运行
    let child = if backend_exe.exists() {
        log::info!("启动后端: {:?}", backend_exe);
        Command::new(&backend_exe)
            .current_dir(backend_exe.parent().unwrap())
            .spawn()?
    } else {
        // 开发模式：使用 Python 运行
        let backend_dir = std::env::current_dir()?.join("backend");
        let main_py = backend_dir.join("main.py");
        
        if !main_py.exists() {
            log::warn!("后端文件不存在: {:?}", main_py);
            return Ok(());
        }
        
        log::info!("启动后端 (开发模式): python {:?}", main_py);
        Command::new("python")
            .arg(&main_py)
            .current_dir(&backend_dir)
            .spawn()?
    };
    
    // 保存进程引用
    *process.lock().unwrap() = Some(child);
    
    log::info!("后端已启动");
    Ok(())
}

fn stop_backend(process: Arc<Mutex<Option<Child>>>) {
    if let Some(mut child) = process.lock().unwrap().take() {
        log::info!("正在停止后端...");
        let _ = child.kill();
        let _ = child.wait();
        log::info!("后端已停止");
    }
}
