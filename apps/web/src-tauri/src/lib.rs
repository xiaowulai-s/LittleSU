use tauri::Manager;

#[cfg(desktop)]
mod desktop {
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use tauri::Manager;
    use tauri_plugin_shell::process::CommandChild;
    use tauri_plugin_shell::ShellExt;

    /// 内置 Node 服务（Next standalone）由 sidecar 承载，应用退出时随之结束
    pub struct ServerChild(pub Mutex<Option<CommandChild>>);

    pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
        let port: u16 = std::env::var("LITTLESU_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(18080);
        let server_dir = app
            .handle()
            .path()
            .resolve("resources/server", tauri::path::BaseDirectory::Resource)?;

        let (mut rx, child) = app
            .shell()
            .sidecar("node-server")?
            .args(["server.js"])
            .env("PORT", port.to_string())
            .env("HOSTNAME", "127.0.0.1")
            .current_dir(&server_dir)
            .spawn()?;
        app.manage(ServerChild(Mutex::new(Some(child))));

        let handle = app.handle().clone();
        std::thread::spawn(move || {
            // 轮询端口等待内置服务监听（30s 死线）；期间不消费事件流
            let deadline = Instant::now() + Duration::from_secs(30);
            let mut ready = false;
            while Instant::now() < deadline {
                if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
                    ready = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            if !ready {
                eprintln!("[LittleSU] 等待内置服务启动超时");
            }
            let url: tauri::Url = format!("http://127.0.0.1:{port}").parse().expect("bad url");
            let win_handle = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                let win = tauri::WebviewWindowBuilder::new(
                    &win_handle,
                    "main",
                    tauri::WebviewUrl::External(url),
                )
                .title("LittleSU TV")
                .inner_size(1280.0, 860.0)
                .min_inner_size(960.0, 640.0);
                if let Err(e) = win.build() {
                    eprintln!("[LittleSU] 创建窗口失败: {e}");
                }
            });
            // 持续消费事件流直至 sidecar 退出（保持接收端存活）
            while let Some(_event) = rx.blocking_recv() {}
        });
        Ok(())
    }

    pub fn kill_server(app: &tauri::AppHandle) {
        if let Some(state) = app.try_state::<ServerChild>() {
            if let Ok(mut guard) = state.0.lock() {
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(desktop)]
            desktop::setup(app)?;
            #[cfg(target_os = "android")]
            android_setup(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(desktop)]
            if let tauri::RunEvent::Exit = event {
                desktop::kill_server(app);
            }
        });
}

/// 安卓端不内置服务（Node 无法跑在移动端），直接加载远程站点。
/// 站点地址在构建期通过 LITTLESU_REMOTE_URL 注入（CI 仓库变量 ANDROID_REMOTE_URL）。
#[cfg(target_os = "android")]
fn android_setup(app: &tauri::App) -> tauri::Result<()> {
    let url_str = match option_env!("LITTLESU_REMOTE_URL") {
        Some(u) if !u.is_empty() => u.to_string(),
        _ => "http://127.0.0.1:8080".to_string(),
    };
    let url: tauri::Url = url_str.parse().expect("LITTLESU_REMOTE_URL 格式错误");
    tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
        .title("LittleSU TV")
        .build()?;
    Ok(())
}
