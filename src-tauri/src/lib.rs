// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use flate2::read::GzDecoder;
use lazy_static;
use reqwest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tar::Archive;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent, Window,
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_stream::StreamExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct NodePassConfig {
    mode: String,
    #[serde(rename = "tunnelAddr")]
    tunnel_addr: String,
    #[serde(rename = "targetAddr")]
    target_addr: String,
    #[serde(rename = "logLevel")]
    log_level: String,
    #[serde(rename = "tlsMode")]
    tls_mode: String,
    #[serde(rename = "certFile")]
    cert_file: Option<String>,
    #[serde(rename = "keyFile")]
    key_file: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NodePassStatus {
    installed: bool,
    version: Option<String>,
    path: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: String,
    published_at: String,
    html_url: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProxySettings {
    enabled: bool,
    host: String,
    port: String,
    username: String,
    password: String,
    #[serde(rename = "type")]
    proxy_type: String,
}

#[derive(Debug)]
struct ProcessInfo {
    process_id: u32,
    tunnel_id: String,
    logs: Arc<Mutex<Vec<String>>>,
}

type ProcessMap = Arc<Mutex<HashMap<u32, ProcessInfo>>>;

// 全局下载取消标志
static DOWNLOAD_CANCELLED: AtomicBool = AtomicBool::new(false);

// 检查是否为致命错误日志 - 只检测 "ERROR Resolve failed"
fn is_fatal_error_log(log_line: &str) -> bool {
    let line_lower = log_line.to_lowercase();
    
    // 检查是否同时包含 ERROR 和 Resolve failed
    line_lower.contains("error") && line_lower.contains("resolve failed")
}

struct AppState {
    processes: ProcessMap,
    config_file: PathBuf,
}

impl AppState {
    fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("nodepass-gui");

        if !config_dir.exists() {
            let _ = fs::create_dir_all(&config_dir);
        }

        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            config_file: config_dir.join("configs.json"),
        }
    }
}

// 添加新的结构体用于进程监控
#[derive(Clone)]
struct ProcessMonitor {
    app_handle: AppHandle,
    id: String,
    pid: u32,
}

impl ProcessMonitor {
    async fn start_monitoring(self) {
        let (tx, mut rx) = mpsc::channel(100);

        // 启动日志监控
        let log_tx = tx.clone();
        let id = self.id.clone();
        tokio::spawn(async move {
            let process = {
                let mut processes = PROCESSES.lock().unwrap();
                processes.get_mut(&id).and_then(|p| p.stdout.take())
            };

            if let Some(stdout) = process {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if log_tx
                        .send(LogMessage {
                            id: id.clone(),
                            message: line,
                        })
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
            }
        });

        // 启动进程状态监控
        let status_tx = tx.clone();
        let id = self.id.clone();
        let app_handle = self.app_handle.clone();
        tokio::spawn(async move {
            loop {
                let is_running = unsafe {
                    let pid = self.pid;
                    match windows::Win32::System::Threading::OpenProcess(
                        windows::Win32::System::Threading::PROCESS_QUERY_INFORMATION,
                        false,
                        pid,
                    ) {
                        Ok(handle) => {
                            let mut exit_code = 0;
                            let result = windows::Win32::System::Threading::GetExitCodeProcess(
                                handle,
                                &mut exit_code,
                            );
                            result.as_bool() && exit_code == 259 // STILL_ACTIVE
                        }
                        Err(_) => false,
                    }
                };

                if !is_running {
                    if status_tx
                        .send(LogMessage {
                            id: id.clone(),
                            message: "进程已意外退出".to_string(),
                        })
                        .await
                        .is_err()
                    {
                        break;
                    }

                    // 更新状态
                    let mut tunnels = TUNNELS.lock().unwrap();
                    if let Some(tunnel) = tunnels.get_mut(&id) {
                        tunnel.status = "stopped".to_string();
                        tunnel.pid = None;
                    }

                    // 发送状态更新事件
                    let _ = app_handle.emit(
                        "tunnel-status-changed",
                        serde_json::json!({
                            "id": id,
                            "status": "stopped",
                            "pid": null
                        }),
                    );
                    break;
                }

                sleep(Duration::from_secs(1)).await;
            }
        });

        // 处理日志和状态更新
        let app_handle = self.app_handle;
        while let Some(msg) = rx.recv().await {
            // 发送日志到前端
            let _ = app_handle.emit(
                "tunnel-log",
                serde_json::json!({
                    "id": msg.id,
                    "message": msg.message
                }),
            );
        }
    }
}

#[derive(Clone)]
struct LogMessage {
    id: String,
    message: String,
}

// 添加全局变量
lazy_static::lazy_static! {
    static ref PROCESSES: Arc<Mutex<HashMap<String, tokio::process::Child>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref TUNNELS: Arc<Mutex<HashMap<String, TunnelInfo>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[derive(Clone)]
struct TunnelInfo {
    status: String,
    pid: Option<u32>,
}

#[tauri::command]
async fn start_nodepass(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
    config: NodePassConfig,
    tunnel_id: String,
) -> Result<u32, String> {
    let nodepass_path = find_nodepass_executable_with_handle(&app_handle).ok_or_else(|| {
        "未找到NodePass可执行文件，请确保nodepass.exe在PATH中或当前目录下".to_string()
    })?;

    let command_args = build_nodepass_command(&config)?;

    println!("启动NodePass: {} {}", nodepass_path, command_args.join(" "));

    let mut cmd = TokioCommand::new(&nodepass_path);
    cmd.args(&command_args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // 在Windows上隐藏终端窗口
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("启动进程失败: {}", e))?;
    let child_id = child.id().unwrap_or(0);

    // 创建日志存储
    let logs = Arc::new(Mutex::new(Vec::new()));

    // 处理stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id.clone();
        let logs_clone = logs.clone();
        let child_id_for_stdout = child_id;
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let log_message = format!("[INFO] {}", line);

                // 检查是否包含致命错误
                let is_fatal_error = is_fatal_error_log(&line);

                if is_fatal_error {
                    println!("检测到致命错误日志，准备停止隧道: {}", line);
                    
                    // 发送错误日志
                    let _ = app_handle_clone.emit(
                        "app-log",
                        serde_json::json!({
                            "level": "error",
                            "message": format!("隧道 {} 检测到致命错误: {}", tunnel_id_clone, line),
                            "source": "LogMonitor"
                        }),
                    );

                    // 发送致命错误事件，让主线程处理进程停止
                    let _ = app_handle_clone.emit(
                        "fatal-error-detected",
                        serde_json::json!({
                            "tunnel_id": tunnel_id_clone,
                            "pid": child_id_for_stdout,
                            "error": line
                        }),
                    );
                    
                    break; // 退出日志监听循环
                }

                // 存储到日志
                if let Ok(mut log_vec) = logs_clone.lock() {
                    log_vec.push(log_message.clone());
                    // 限制日志数量，保留最近500条
                    if log_vec.len() > 500 {
                        log_vec.drain(0..100); // 删除前100条
                    }
                }

                // 发送日志到前端
                let _ = app_handle_clone.emit(
                    "tunnel-log",
                    serde_json::json!({
                        "tunnel_id": tunnel_id_clone,
                        "message": log_message
                    }),
                );
            }
        });
    }

    // 处理stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id.clone();
        let logs_clone = logs.clone();
        let child_id_for_stderr = child_id;
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let log_message = format!("[ERROR] {}", line);

                // 检查是否包含致命错误
                let is_fatal_error = is_fatal_error_log(&line);

                if is_fatal_error {
                    println!("检测到致命错误日志 (stderr)，准备停止隧道: {}", line);
                    
                    // 发送错误日志
                    let _ = app_handle_clone.emit(
                        "app-log",
                        serde_json::json!({
                            "level": "error",
                            "message": format!("隧道 {} 检测到致命错误: {}", tunnel_id_clone, line),
                            "source": "LogMonitor"
                        }),
                    );

                    // 发送致命错误事件，让主线程处理进程停止
                    let _ = app_handle_clone.emit(
                        "fatal-error-detected",
                        serde_json::json!({
                            "tunnel_id": tunnel_id_clone,
                            "pid": child_id_for_stderr,
                            "error": line
                        }),
                    );
                    
                    break; // 退出日志监听循环
                }

                // 存储到日志
                if let Ok(mut log_vec) = logs_clone.lock() {
                    log_vec.push(log_message.clone());
                    // 限制日志数量，保留最近500条
                    if log_vec.len() > 500 {
                        log_vec.drain(0..100); // 删除前100条
                    }
                }

                // 发送日志到前端
                let _ = app_handle_clone.emit(
                    "tunnel-log",
                    serde_json::json!({
                        "tunnel_id": tunnel_id_clone,
                        "message": log_message
                    }),
                );
            }
        });
    }

    // 监控进程状态
    let app_handle_clone = app_handle.clone();
    let tunnel_id_clone = tunnel_id.clone();
    let processes_clone = state.processes.clone();
    let child_id_clone = child_id;
    tokio::spawn(async move {
        let status = child.wait().await;

        println!("隧道进程 {} (PID: {}) 已退出", tunnel_id_clone, child_id_clone);

        // 从进程映射中移除
        if let Ok(mut processes) = processes_clone.lock() {
            processes.remove(&child_id_clone);
        }

        // 更新全局隧道状态
        {
            let mut tunnels = TUNNELS.lock().unwrap();
            tunnels.remove(&tunnel_id_clone);
        }

        match status {
            Ok(exit_status) => {
                let exit_code = exit_status.code().unwrap_or(-1);
                println!("隧道 {} 正常退出，退出码: {}", tunnel_id_clone, exit_code);
                
                // 发送应用日志
                let _ = app_handle_clone.emit(
                    "app-log",
                    serde_json::json!({
                        "level": "info",
                        "message": format!("隧道 {} 进程已退出，退出码: {}", tunnel_id_clone, exit_code),
                        "source": "ProcessMonitor"
                    }),
                );

                // 发送隧道状态变化事件
                let _ = app_handle_clone.emit(
                    "tunnel-status-changed",
                    serde_json::json!({
                        "tunnel_id": tunnel_id_clone,
                        "status": "stopped",
                        "pid": null,
                        "exit_code": exit_code
                    }),
                );
            }
            Err(e) => {
                println!("隧道 {} 异常退出: {}", tunnel_id_clone, e);
                
                // 发送应用日志
                let _ = app_handle_clone.emit(
                    "app-log",
                    serde_json::json!({
                        "level": "error",
                        "message": format!("隧道 {} 进程异常退出: {}", tunnel_id_clone, e),
                        "source": "ProcessMonitor"
                    }),
                );

                // 发送隧道状态变化事件
                let _ = app_handle_clone.emit(
                    "tunnel-status-changed",
                    serde_json::json!({
                        "tunnel_id": tunnel_id_clone,
                        "status": "error",
                        "pid": null,
                        "error": e.to_string()
                    }),
                );
            }
        }
    });

    // 存储进程信息
    let process_info = ProcessInfo {
        process_id: child_id,
        tunnel_id: tunnel_id.clone(),
        logs,
    };

    if let Ok(mut processes) = state.processes.lock() {
        processes.insert(child_id, process_info);
    }

    // 更新隧道状态
    {
        let mut tunnels = TUNNELS.lock().unwrap();
        tunnels.insert(
            tunnel_id.clone(),
            TunnelInfo {
                status: "running".to_string(),
                pid: Some(child_id),
            },
        );
    }

    // 发送状态更新事件
    let _ = app_handle.emit(
        "tunnel-status-changed",
        serde_json::json!({
            "tunnel_id": tunnel_id,
            "status": "running",
            "pid": child_id
        }),
    );

    // 更新托盘tooltip
    let _ = update_tray_tooltip(app_handle.clone(), state.clone()).await;

    Ok(child_id)
}

#[tauri::command]
async fn handle_fatal_error(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
    tunnel_id: String,
    process_id: u32,
    error_message: String,
) -> Result<(), String> {
    println!("处理致命错误: 隧道 {} (PID: {}) - {}", tunnel_id, process_id, error_message);
    
    // 停止进程
    let _ = stop_nodepass_by_pid(app_handle.clone(), state, process_id).await;
    
    // 发送隧道状态变化事件
    let _ = app_handle.emit(
        "tunnel-status-changed",
        serde_json::json!({
            "tunnel_id": tunnel_id,
            "status": "error",
            "pid": null,
            "error": format!("检测到致命错误: {}", error_message)
        }),
    );
    
    Ok(())
}

#[tauri::command]
async fn stop_nodepass_by_pid(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
    process_id: u32,
) -> Result<(), String> {
    // 在Windows上，使用taskkill按PID停止进程
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("taskkill")
            .args(&["/F", "/PID", &process_id.to_string()])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map_err(|e| format!("执行taskkill失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("停止进程失败: {}", stderr));
        }
    }

    // 在Unix系统上，使用kill命令
    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("kill")
            .args(&["-9", &process_id.to_string()])
            .output()
            .map_err(|e| format!("执行kill失败: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("停止进程失败: {}", stderr));
        }
    }

    // 从进程映射中移除
    if let Ok(mut processes) = state.processes.lock() {
        processes.remove(&process_id);
    }

    // 更新托盘tooltip
    let _ = update_tray_tooltip(app_handle, state).await;

    Ok(())
}

#[tauri::command]
async fn stop_all_nodepass(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let process_ids: Vec<u32> = {
        if let Ok(processes) = state.processes.lock() {
            processes.keys().cloned().collect()
        } else {
            Vec::new()
        }
    };

    if !process_ids.is_empty() {
        let process_count = process_ids.len();
        println!("正在停止所有 {} 个隧道进程...", process_count);
        
        // 发送日志事件到前端
        let _ = app_handle.emit(
            "app-log",
            serde_json::json!({
                "level": "info",
                "message": format!("正在停止所有 {} 个隧道进程...", process_count),
                "source": "StopAllHandler"
            }),
        );

        for process_id in process_ids {
            let _ = stop_nodepass_by_pid(app_handle.clone(), state.clone(), process_id).await;
        }

        // 发送所有隧道已停止的事件
        let _ = app_handle.emit(
            "all-tunnels-stopped",
            serde_json::json!({
                "message": "所有隧道已停止",
                "stopped_count": process_count
            }),
        );

        println!("已停止所有 {} 个隧道进程", process_count);
    } else {
        println!("没有运行中的隧道进程需要停止");
        
        // 发送日志事件到前端
        let _ = app_handle.emit(
            "app-log",
            serde_json::json!({
                "level": "info",
                "message": "没有运行中的隧道进程需要停止",
                "source": "StopAllHandler"
            }),
        );
    }

    Ok(())
}

#[tauri::command]
async fn get_tunnel_logs(
    state: tauri::State<'_, AppState>,
    process_id: u32,
) -> Result<Vec<String>, String> {
    if let Ok(processes) = state.processes.lock() {
        if let Some(process_info) = processes.get(&process_id) {
            if let Ok(logs) = process_info.logs.lock() {
                return Ok(logs.clone());
            }
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
async fn save_config(
    state: tauri::State<'_, AppState>,
    config: NodePassConfig,
) -> Result<(), String> {
    let mut configs = load_configs(&state.config_file).unwrap_or_default();

    // 检查是否已存在相同配置
    if !configs.iter().any(|c| {
        c.mode == config.mode
            && c.tunnel_addr == config.tunnel_addr
            && c.target_addr == config.target_addr
    }) {
        configs.push(config);
    }

    let config_json =
        serde_json::to_string_pretty(&configs).map_err(|e| format!("序列化配置失败: {}", e))?;

    fs::write(&state.config_file, config_json).map_err(|e| format!("保存配置文件失败: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn get_saved_configs(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<NodePassConfig>, String> {
    Ok(load_configs(&state.config_file).unwrap_or_default())
}

#[tauri::command]
async fn check_nodepass_status() -> Result<NodePassStatus, String> {
    let nodepass_path = find_nodepass_executable();

    match nodepass_path {
        Some(path) => {
            // 尝试获取版本信息 - NodePass在--help时会输出版本信息到stderr
            let mut cmd = std::process::Command::new(&path);
            cmd.arg("--help");

            // 在Windows上隐藏终端窗口
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            let version_result = cmd.output();

            match version_result {
                Ok(output) => {
                    // NodePass会输出版本信息到stderr，格式如: "Version: v1.2.4 windows/amd64"
                    let stderr_output = String::from_utf8_lossy(&output.stderr);
                    let stdout_output = String::from_utf8_lossy(&output.stdout);
                    let combined_output = format!("{}\n{}", stderr_output, stdout_output);

                    // 查找版本信息
                    let version = extract_version_from_output(&combined_output);

                    Ok(NodePassStatus {
                        installed: true,
                        version,
                        path: Some(path),
                        error: None,
                    })
                }
                Err(e) => Ok(NodePassStatus {
                    installed: false,
                    version: None,
                    path: Some(path),
                    error: Some(format!("执行失败: {}", e)),
                }),
            }
        }
        None => Ok(NodePassStatus {
            installed: false,
            version: None,
            path: None,
            error: Some("未找到NodePass可执行文件".to_string()),
        }),
    }
}

#[tauri::command]
async fn get_latest_release() -> Result<GitHubRelease, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.github.com/repos/yosebyte/nodepass/releases/latest")
        .header("User-Agent", "NodePass-GUI")
        .send()
        .await
        .map_err(|e| format!("请求GitHub API失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API返回错误: {}", response.status()));
    }

    let release: GitHubRelease = response
        .json()
        .await
        .map_err(|e| format!("解析GitHub API响应失败: {}", e))?;

    Ok(release)
}

#[tauri::command]
async fn download_nodepass(
    app_handle: AppHandle,
    download_url: String,
    filename: String,
    proxy_settings: Option<ProxySettings>,
) -> Result<String, String> {
    println!("开始下载: {} -> {}", download_url, filename);

    // 重置取消标志
    DOWNLOAD_CANCELLED.store(false, Ordering::Relaxed);

    // 获取系统临时目录
    let temp_dir = std::env::temp_dir();
    let target_path = temp_dir.join(&filename);
    println!("临时下载路径: {:?}", target_path);

    // 获取最终的安装目录（使用可执行文件所在目录）
    let install_dir = match std::env::current_exe() {
        Ok(exe_path) => {
            if let Some(exe_dir) = exe_path.parent() {
                println!("使用可执行文件目录作为安装目录: {:?}", exe_dir);
                exe_dir.to_path_buf()
            } else {
                let error_msg = "无法获取可执行文件父目录".to_string();
                println!("错误: {}", error_msg);
                let _ = app_handle.emit(
                    "download-progress",
                    serde_json::json!({
                        "status": "error",
                        "message": error_msg
                    }),
                );
                return Err(error_msg);
            }
        }
        Err(e) => {
            let error_msg = format!("获取可执行文件路径失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg
                }),
            );
            return Err(error_msg);
        }
    };
    println!("安装目录: {:?}", install_dir);

    // 发送开始下载事件
    let _ = app_handle.emit(
        "download-progress",
        serde_json::json!({
            "status": "started",
            "message": "正在初始化下载..."
        }),
    );

    // 创建HTTP客户端，支持用户配置的代理
    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60)) // 增加超时时间
        .user_agent("NodePass-GUI/1.0");

    // 处理代理设置
    let mut proxy_info = String::new();
    if let Some(proxy) = proxy_settings {
        if proxy.enabled && !proxy.host.is_empty() && !proxy.port.is_empty() {
            let proxy_url = if proxy.username.is_empty() {
                format!("{}://{}:{}", proxy.proxy_type, proxy.host, proxy.port)
            } else {
                format!(
                    "{}://{}:{}@{}:{}",
                    proxy.proxy_type, proxy.username, proxy.password, proxy.host, proxy.port
                )
            };

            println!("使用用户配置的代理: {}", proxy_url);
            proxy_info = format!(
                "使用{}代理: {}:{}",
                proxy.proxy_type.to_uppercase(),
                proxy.host,
                proxy.port
            );

            match reqwest::Proxy::all(&proxy_url) {
                Ok(proxy_config) => {
                    client_builder = client_builder.proxy(proxy_config);
                    let _ = app_handle.emit(
                        "download-progress",
                        serde_json::json!({
                            "status": "started",
                            "message": format!("已配置代理: {}:{}", proxy.host, proxy.port)
                        }),
                    );
                }
                Err(e) => {
                    let error_msg = format!("配置代理失败: {}", e);
                    println!("错误: {}", error_msg);
                    let _ = app_handle.emit(
                        "download-progress",
                        serde_json::json!({
                            "status": "error",
                            "message": error_msg
                        }),
                    );
                    return Err(error_msg);
                }
            }
        } else {
            println!("代理已禁用或配置不完整，使用直连");
            proxy_info = "直连".to_string();
        }
    } else {
        // 如果没有提供代理设置，尝试检测系统代理
        if let Some(system_proxy_url) = detect_system_proxy() {
            println!("检测到系统代理: {}", system_proxy_url);
            proxy_info = format!("系统代理: {}", system_proxy_url);

            match reqwest::Proxy::all(&system_proxy_url) {
                Ok(proxy_config) => {
                    client_builder = client_builder.proxy(proxy_config);
                    let _ = app_handle.emit(
                        "download-progress",
                        serde_json::json!({
                            "status": "started",
                            "message": format!("使用系统代理: {}", system_proxy_url)
                        }),
                    );
                }
                Err(e) => {
                    println!("配置系统代理失败: {}, 使用直连", e);
                    proxy_info = "直连".to_string();
                }
            }
        } else {
            println!("未检测到代理设置，使用直连");
            proxy_info = "直连".to_string();
        }
    }

    let client = match client_builder.build() {
        Ok(client) => {
            println!("HTTP客户端创建成功");
            client
        }
        Err(e) => {
            let error_msg = format!("创建HTTP客户端失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg
                }),
            );
            return Err(error_msg);
        }
    };

    // 发送连接测试事件
    let _ = app_handle.emit(
        "download-progress",
        serde_json::json!({
            "status": "started",
            "message": format!("正在连接服务器... ({})", proxy_info)
        }),
    );

    println!("开始发送下载请求...");
    let response = match client.get(&download_url).send().await {
        Ok(response) => {
            println!("下载请求成功，状态码: {}", response.status());
            response
        }
        Err(e) => {
            let error_msg = format!("下载请求失败: {} ({})", e, proxy_info);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg
                }),
            );
            return Err(error_msg);
        }
    };

    if !response.status().is_success() {
        let error_msg = format!("下载失败，HTTP状态: {} ({})", response.status(), proxy_info);
        println!("错误: {}", error_msg);
        let _ = app_handle.emit(
            "download-progress",
            serde_json::json!({
                "status": "error",
                "message": error_msg
            }),
        );
        return Err(error_msg);
    }

    let total_size = response.content_length().unwrap_or(0);
    println!("文件大小: {} bytes", total_size);

    // 发送开始下载事件
    let _ = app_handle.emit(
        "download-progress",
        serde_json::json!({
            "status": "downloading",
            "progress": 0,
            "downloaded": 0,
            "total": total_size,
            "message": format!("开始下载... ({})", proxy_info)
        }),
    );

    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();

    let mut file = match tokio::fs::File::create(&target_path).await {
        Ok(file) => {
            println!("文件创建成功: {:?}", target_path);
            file
        }
        Err(e) => {
            let error_msg = format!("创建文件失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg
                }),
            );
            return Err(error_msg);
        }
    };

    println!("开始下载文件内容...");
    let mut last_progress = 0u64;

    while let Some(chunk_result) = stream.next().await {
        // 检查是否被取消
        if DOWNLOAD_CANCELLED.load(Ordering::Relaxed) {
            println!("下载被用户取消");
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": "下载已取消"
                }),
            );
            // 清理临时文件
            let _ = tokio::fs::remove_file(&target_path).await;
            return Err("下载已取消".to_string());
        }

        let chunk = match chunk_result {
            Ok(chunk) => chunk,
            Err(e) => {
                let error_msg = format!("读取数据块失败: {}", e);
                println!("错误: {}", error_msg);
                let _ = app_handle.emit(
                    "download-progress",
                    serde_json::json!({
                        "status": "error",
                        "message": error_msg
                    }),
                );
                return Err(error_msg);
            }
        };

        downloaded += chunk.len() as u64;

        if let Err(e) = file.write_all(&chunk).await {
            let error_msg = format!("写入文件失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": error_msg
                }),
            );
            return Err(error_msg);
        }

        // 更频繁地发送进度更新，提供更好的用户体验
        if total_size > 0 {
            let progress = (downloaded * 100) / total_size;
            // 每1%或每512KB更新一次进度
            if progress != last_progress
                || downloaded - (last_progress * total_size / 100) >= 512 * 1024
            {
                last_progress = progress;
                println!("下载进度: {}% ({}/{})", progress, downloaded, total_size);

                let speed_info = if downloaded > 0 {
                    let mb_downloaded = downloaded as f64 / 1024.0 / 1024.0;
                    format!("{:.1} MB", mb_downloaded)
                } else {
                    "0 MB".to_string()
                };

                let _ = app_handle.emit("download-progress", serde_json::json!({
                    "status": "downloading",
                    "progress": progress,
                    "downloaded": downloaded,
                    "total": total_size,
                    "message": format!("下载中... {}% ({}) - {}", progress, speed_info, proxy_info)
                }));
            }
        } else {
            // 如果无法获取总大小，每1MB更新一次
            if downloaded % (1024 * 1024) == 0 {
                let mb_downloaded = downloaded as f64 / 1024.0 / 1024.0;
                println!("已下载: {:.1} MB", mb_downloaded);
                let _ = app_handle.emit(
                    "download-progress",
                    serde_json::json!({
                        "status": "downloading",
                        "downloaded": downloaded,
                        "message": format!("下载中... {:.1} MB - {}", mb_downloaded, proxy_info)
                    }),
                );
            }
        }
    }

    println!("文件下载完成，开始刷新文件...");
    // 下载完成后，开始解压
    if let Err(e) = file.flush().await {
        let error_msg = format!("刷新文件失败: {}", e);
        println!("错误: {}", error_msg);
        let _ = app_handle.emit(
            "download-progress",
            serde_json::json!({
                "status": "error",
                "message": error_msg
            }),
        );
        return Err(error_msg);
    }
    drop(file); // 关闭文件句柄

    println!("开始解压文件...");
    // 发送解压开始事件
    let _ = app_handle.emit(
        "download-progress",
        serde_json::json!({
            "status": "extracting",
            "message": "正在从临时目录解压安装...",
            "progress": 0
        }),
    );

    // 解压文件到安装目录
    let extract_result = extract_nodepass_archive(&target_path, &install_dir, &app_handle).await;

    match extract_result {
        Ok(extracted_exe_path) => {
            println!("解压成功: {}", extracted_exe_path);

            // 清理临时文件
            println!("清理临时文件: {:?}", target_path);
            if let Err(e) = tokio::fs::remove_file(&target_path).await {
                println!("警告: 删除临时文件失败: {}", e);
                // 不影响主流程，只记录警告
            }

            // 发送完成事件
            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "completed",
                    "message": "安装完成！临时文件已清理",
                    "path": extracted_exe_path
                }),
            );

            Ok(extracted_exe_path)
        }
        Err(e) => {
            println!("解压失败: {}", e);

            // 即使解压失败，也尝试清理临时文件
            println!("清理临时文件: {:?}", target_path);
            if let Err(cleanup_err) = tokio::fs::remove_file(&target_path).await {
                println!("警告: 删除临时文件失败: {}", cleanup_err);
            }

            let _ = app_handle.emit(
                "download-progress",
                serde_json::json!({
                    "status": "error",
                    "message": format!("解压失败: {}", e)
                }),
            );
            Err(e)
        }
    }
}

#[tauri::command]
async fn cancel_download() -> Result<(), String> {
    println!("收到取消下载请求，设置取消标志");
    DOWNLOAD_CANCELLED.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
async fn open_directory(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer")
            .arg(&path)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开目录失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn show_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("聚焦窗口失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.hide().map_err(|e| format!("隐藏窗口失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn get_running_tunnels_count(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    if let Ok(processes) = state.processes.lock() {
        Ok(processes.len())
    } else {
        Ok(0)
    }
}

#[tauri::command]
async fn show_exit_confirmation(app_handle: AppHandle) -> Result<bool, String> {
    // 获取所有运行中的隧道
    let running_tunnels = {
        if let Ok(processes) = app_handle.state::<AppState>().processes.lock() {
            processes.len()
        } else {
            0
        }
    };

    // 如果有运行中的隧道，返回 true 表示需要确认
    Ok(running_tunnels > 0)
}

#[tauri::command]
async fn exit_app(app_handle: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    // 获取所有运行中的进程
    let process_ids: Vec<u32> = {
        if let Ok(processes_guard) = state.processes.lock() {
            processes_guard.keys().cloned().collect()
        } else {
            Vec::new()
        }
    };

    if !process_ids.is_empty() {
        println!("应用退出时检测到 {} 个运行中的隧道进程，正在停止...", process_ids.len());
        
        // 发送日志事件到前端
        let _ = app_handle.emit(
            "app-log",
            serde_json::json!({
                "level": "info",
                "message": format!("应用退出时检测到 {} 个运行中的隧道进程，正在停止...", process_ids.len()),
                "source": "ExitHandler"
            }),
        );

        // 停止所有进程
        for process_id in &process_ids {
            println!("正在停止进程 PID: {}", process_id);
            
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let result = std::process::Command::new("taskkill")
                    .args(&["/F", "/PID", &process_id.to_string()])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output();
                
                match result {
                    Ok(output) => {
                        if output.status.success() {
                            println!("成功停止进程 PID: {}", process_id);
                        } else {
                            println!("停止进程 PID: {} 失败: {}", process_id, String::from_utf8_lossy(&output.stderr));
                        }
                    }
                    Err(e) => {
                        println!("执行 taskkill 失败: {}", e);
                    }
                }
            }

            #[cfg(not(target_os = "windows"))]
            {
                let result = std::process::Command::new("kill")
                    .args(&["-9", &process_id.to_string()])
                    .output();
                
                match result {
                    Ok(output) => {
                        if output.status.success() {
                            println!("成功停止进程 PID: {}", process_id);
                        } else {
                            println!("停止进程 PID: {} 失败: {}", process_id, String::from_utf8_lossy(&output.stderr));
                        }
                    }
                    Err(e) => {
                        println!("执行 kill 失败: {}", e);
                    }
                }
            }
        }

        // 发送所有隧道已停止的日志
        let _ = app_handle.emit(
            "app-log",
            serde_json::json!({
                "level": "info",
                "message": format!("已停止所有 {} 个隧道进程，应用即将退出", process_ids.len()),
                "source": "ExitHandler"
            }),
        );

        // 发送隧道状态更新事件，通知前端更新所有隧道状态为已停止
        let _ = app_handle.emit(
            "all-tunnels-stopped",
            serde_json::json!({
                "message": "所有隧道已停止",
                "stopped_count": process_ids.len()
            }),
        );

        println!("已停止所有 {} 个隧道进程，应用即将退出", process_ids.len());
    } else {
        println!("应用退出时没有运行中的隧道进程");
        
        // 发送日志事件到前端
        let _ = app_handle.emit(
            "app-log",
            serde_json::json!({
                "level": "info",
                "message": "应用退出时没有运行中的隧道进程",
                "source": "ExitHandler"
            }),
        );
    }

    // 退出应用
    app_handle.exit(0);
    Ok(())
}

#[tauri::command]
async fn update_tray_tooltip(
    _app_handle: AppHandle,
    _state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // 这个函数暂时保留为空，因为托盘tooltip的更新逻辑比较复杂
    // 可以在后续版本中实现动态更新托盘提示信息的功能
    Ok(())
}

#[tauri::command]
async fn set_window_theme(app_handle: AppHandle, _theme: String) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        #[cfg(target_os = "windows")]
        {
            // 基于Tauri v2官方文档，设置窗口主题为深色
            // 这将确保系统框颜色为深色，对应#131B2C的深色主题
            let _ = window.set_theme(Some(tauri::Theme::Dark));

            // 可选：设置窗口装饰（如果需要自定义标题栏）
            // let _ = window.set_decorations(false);

            // 可选：设置窗口阴影
            // let _ = window.set_shadow(true);
        }

        #[cfg(target_os = "macos")]
        {
            // macOS平台也设置深色主题
            let _ = window.set_theme(Some(tauri::Theme::Dark));
        }

        #[cfg(target_os = "linux")]
        {
            // Linux平台设置深色主题
            let _ = window.set_theme(Some(tauri::Theme::Dark));
        }

        Ok(())
    } else {
        Err("窗口未找到".to_string())
    }
}

// 新增：专门用于初始化窗口主题的函数
#[tauri::command]
async fn initialize_window_theme(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        // 设置为深色主题，确保系统框颜色为深色（对应#131B2C的深色标题栏）
        let _ = window.set_theme(Some(tauri::Theme::Dark));

        #[cfg(target_os = "windows")]
        {
            // Windows特定的窗口设置
            // 确保窗口使用深色标题栏
            let _ = window.set_theme(Some(tauri::Theme::Dark));
        }

        Ok(())
    } else {
        Err("窗口未找到".to_string())
    }
}

// 新增：请求关闭窗口的函数
#[tauri::command]
async fn request_close(app_handle: AppHandle) -> Result<(), String> {
    // 发送关闭确认事件到前端
    let _ = app_handle.emit("close-requested", ());
    Ok(())
}

#[tauri::command]
async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

// 新增：在默认浏览器中打开URL
#[tauri::command]
async fn open_url_in_default_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(&["/c", "start", &url])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn minimize_window(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
fn maximize_window(window: Window) {
    let _ = window.maximize();
}

#[tauri::command]
fn unmaximize_window(window: Window) {
    let _ = window.unmaximize();
}

#[tauri::command]
fn close_window(window: Window) {
    let _ = window.close();
}

#[tauri::command]
fn is_maximized(window: Window) -> bool {
    window.is_maximized().unwrap_or(false)
}

fn load_configs(config_file: &PathBuf) -> Result<Vec<NodePassConfig>, Box<dyn std::error::Error>> {
    if !config_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(config_file)?;
    let configs: Vec<NodePassConfig> = serde_json::from_str(&content)?;
    Ok(configs)
}

fn find_nodepass_executable() -> Option<String> {
    // 1. 优先检查可执行文件同目录（主要安装位置）
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let resource_exe = exe_dir.join("nodepass.exe");
            if resource_exe.exists() {
                return Some(resource_exe.to_string_lossy().to_string());
            }
        }
    }

    // 2. 检查PATH环境变量
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            let exe_path = PathBuf::from(dir).join("nodepass.exe");
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }

    // 3. 检查当前目录（开发环境）
    if let Ok(current_dir) = std::env::current_dir() {
        let current_dir_exe = current_dir.join("nodepass.exe");
        if current_dir_exe.exists() {
            return Some(current_dir_exe.to_string_lossy().to_string());
        }
    }

    // 4. 最后尝试直接使用nodepass命令（假设在PATH中）
    Some("nodepass".to_string())
}

// 使用AppHandle的版本，用于更准确的资源路径解析
fn find_nodepass_executable_with_handle(app_handle: &AppHandle) -> Option<String> {
    // 1. 优先检查可执行文件同目录（主要安装位置）
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let exe_nodepass = exe_dir.join("nodepass.exe");
            println!("检查可执行文件同目录: {:?}", exe_nodepass);
            if exe_nodepass.exists() {
                println!("在可执行文件同目录找到 nodepass.exe: {:?}", exe_nodepass);
                return Some(exe_nodepass.to_string_lossy().to_string());
            }
        }
    }

    // 2. 检查应用资源目录（生产环境）
    if let Ok(resource_path) = app_handle
        .path()
        .resolve("nodepass.exe", tauri::path::BaseDirectory::Resource)
    {
        println!("检查资源目录: {:?}", resource_path);
        if resource_path.exists() {
            println!("在资源目录找到 nodepass.exe: {:?}", resource_path);
            return Some(resource_path.to_string_lossy().to_string());
        }
    }

    // 3. 检查PATH环境变量
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            let exe_path = PathBuf::from(dir).join("nodepass.exe");
            if exe_path.exists() {
                println!("在PATH中找到 nodepass.exe: {:?}", exe_path);
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }

    // 4. 最后检查当前工作目录（开发环境）
    if let Ok(current_dir) = std::env::current_dir() {
        let current_nodepass = current_dir.join("nodepass.exe");
        println!("检查当前工作目录: {:?}", current_nodepass);
        if current_nodepass.exists() {
            println!("在当前工作目录找到 nodepass.exe: {:?}", current_nodepass);
            return Some(current_nodepass.to_string_lossy().to_string());
        }
    }

    println!("未找到 nodepass.exe");
    None
}

// 从NodePass输出中提取版本信息
fn extract_version_from_output(output: &str) -> Option<String> {
    // 查找 "Version: " 开头的行
    for line in output.lines() {
        if line.contains("Version:") {
            // 提取版本号，格式如: "Version: v1.2.4 windows/amd64"
            if let Some(version_part) = line.split("Version:").nth(1) {
                let version = version_part.trim().split_whitespace().next()?;
                return Some(version.to_string());
            }
        }
    }
    None
}

fn build_nodepass_command(config: &NodePassConfig) -> Result<Vec<String>, String> {
    let mut url = format!(
        "{}://{}/{}",
        config.mode, config.tunnel_addr, config.target_addr
    );

    let mut params = Vec::new();
    params.push(format!("log={}", config.log_level));

    if config.mode != "client" {
        params.push(format!("tls={}", config.tls_mode));

        if config.tls_mode == "2" {
            if let Some(cert) = &config.cert_file {
                if !cert.is_empty() {
                    params.push(format!("crt={}", cert));
                }
            }
            if let Some(key) = &config.key_file {
                if !key.is_empty() {
                    params.push(format!("key={}", key));
                }
            }
        }
    }

    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }

    Ok(vec![url])
}

// 解压NodePass压缩包
async fn extract_nodepass_archive(
    archive_path: &PathBuf,
    extract_to: &PathBuf,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let filename = archive_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");

    println!("解压文件: {} 到目录: {:?}", filename, extract_to);

    let result = if filename.ends_with(".tar.gz") || filename.ends_with(".tgz") {
        // 处理 .tar.gz 格式
        extract_tar_gz(archive_path, extract_to, app_handle).await
    } else if filename.ends_with(".zip") {
        // 处理 .zip 格式
        extract_zip(archive_path, extract_to, app_handle).await
    } else {
        Err(format!("不支持的压缩包格式: {}", filename))
    };

    match &result {
        Ok(exe_path) => {
            println!("解压成功: {}", exe_path);
        }
        Err(e) => {
            println!("解压失败: {}", e);
        }
    }

    result
}

// 解压 .tar.gz 格式
async fn extract_tar_gz(
    archive_path: &PathBuf,
    extract_to: &PathBuf,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    let entries = archive
        .entries()
        .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

    let mut extracted_exe_path = None;
    let mut file_count = 0;
    let mut total_files = 0;

    // 先计算总文件数
    let file_for_count =
        std::fs::File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;
    let decoder_for_count = GzDecoder::new(file_for_count);
    let mut archive_for_count = Archive::new(decoder_for_count);

    for entry in archive_for_count
        .entries()
        .map_err(|e| format!("读取压缩包失败: {}", e))?
    {
        if entry.is_ok() {
            total_files += 1;
        }
    }

    println!("压缩包中共有 {} 个文件", total_files);

    // 重新打开文件进行解压
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("重新打开压缩包失败: {}", e))?;
    let decoder = GzDecoder::new(file);
    let mut archive = Archive::new(decoder);

    for entry in archive
        .entries()
        .map_err(|e| format!("读取压缩包条目失败: {}", e))?
    {
        let mut entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;

        file_count += 1;

        // 先获取路径信息，避免借用冲突
        let path = entry
            .path()
            .map_err(|e| format!("获取文件路径失败: {}", e))?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string(); // 转换为owned string

        let is_dir = entry.header().entry_type().is_dir();
        let outpath = extract_to.join(&*path);

        println!("解压文件: {}", file_name);

        // 发送解压进度
        let progress = if total_files > 0 {
            (file_count * 100) / total_files
        } else {
            0
        };

        let _ = app_handle.emit(
            "download-progress",
            serde_json::json!({
                "status": "extracting",
                "message": format!("正在解压... {}/{} ({})", file_count, total_files, file_name),
                "progress": progress
            }),
        );

        if is_dir {
            // 创建目录
            std::fs::create_dir_all(&outpath).map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            // 创建父目录
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {}", e))?;
            }

            // 解压文件
            entry
                .unpack(&outpath)
                .map_err(|e| format!("解压文件失败: {}", e))?;

            // 检查是否是nodepass.exe
            if file_name == "nodepass.exe" {
                extracted_exe_path = Some(outpath.to_string_lossy().to_string());
                println!("找到 nodepass.exe: {}", outpath.display());
            }
        }
    }

    extracted_exe_path.ok_or_else(|| "压缩包中未找到nodepass.exe文件".to_string())
}

// 解压 .zip 格式
async fn extract_zip(
    archive_path: &PathBuf,
    extract_to: &PathBuf,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("打开压缩包失败: {}", e))?;

    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {}", e))?;

    let total_files = archive.len();
    let mut extracted_exe_path = None;

    for i in 0..total_files {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;

        let outpath = match file.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };

        // 发送解压进度
        let progress = ((i + 1) * 100) / total_files;
        let _ = app_handle.emit(
            "download-progress",
            serde_json::json!({
                "status": "extracting",
                "message": format!("正在解压... {}/{}", i + 1, total_files),
                "progress": progress
            }),
        );

        if file.name().ends_with('/') {
            // 创建目录
            std::fs::create_dir_all(&outpath).map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            // 创建父目录
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| format!("创建父目录失败: {}", e))?;
                }
            }

            // 解压文件
            let mut outfile =
                std::fs::File::create(&outpath).map_err(|e| format!("创建文件失败: {}", e))?;

            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("解压文件失败: {}", e))?;

            // 检查是否是nodepass.exe
            if file.name().ends_with("nodepass.exe") || file.name() == "nodepass.exe" {
                extracted_exe_path = Some(outpath.to_string_lossy().to_string());
            }
        }
    }

    extracted_exe_path.ok_or_else(|| "压缩包中未找到nodepass.exe文件".to_string())
}

// 检测系统代理设置
fn detect_system_proxy() -> Option<String> {
    // 检查环境变量中的代理设置
    if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
        if !http_proxy.is_empty() {
            return Some(http_proxy);
        }
    }

    if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
        if !https_proxy.is_empty() {
            return Some(https_proxy);
        }
    }

    if let Ok(all_proxy) = std::env::var("ALL_PROXY") {
        if !all_proxy.is_empty() {
            return Some(all_proxy);
        }
    }

    // 检查是否有NO_PROXY设置，如果GitHub在其中则不使用代理
    if let Ok(no_proxy) = std::env::var("NO_PROXY") {
        if no_proxy.contains("github.com") || no_proxy.contains("*") {
            println!("NO_PROXY包含github.com，跳过代理");
            return None;
        }
    }

    // Windows系统代理检测
    #[cfg(target_os = "windows")]
    {
        if let Some(proxy) = detect_windows_proxy() {
            // 检查是否有代理绕过列表
            if is_github_bypassed() {
                println!("GitHub在代理绕过列表中，不使用代理");
                return None;
            }
            return Some(proxy);
        }
    }

    None
}

// 检查GitHub是否在代理绕过列表中（Windows）
#[cfg(target_os = "windows")]
fn is_github_bypassed() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // 检查IE代理绕过列表
    let output = Command::new("reg")
        .args(&[
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyOverride",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    if let Ok(output) = output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines() {
            if line.contains("ProxyOverride") && line.contains("REG_SZ") {
                if let Some(bypass_part) = line.split("REG_SZ").nth(1) {
                    let bypass_list = bypass_part.trim();
                    println!("代理绕过列表: {}", bypass_list);
                    if bypass_list.contains("github.com")
                        || bypass_list.contains("*.github.com")
                        || bypass_list.contains("<local>")
                    {
                        return true;
                    }
                }
            }
        }
    }

    false
}

// Windows系统代理检测
#[cfg(target_os = "windows")]
fn detect_windows_proxy() -> Option<String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // 使用netsh命令检测代理设置
    let output = Command::new("netsh")
        .args(&["winhttp", "show", "proxy"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .ok()?;

    let output_str = String::from_utf8_lossy(&output.stdout);

    // 解析输出查找代理服务器
    for line in output_str.lines() {
        if line.contains("代理服务器") || line.contains("Proxy Server") {
            if let Some(proxy_part) = line.split(':').nth(1) {
                let proxy = proxy_part.trim();
                if !proxy.is_empty() && proxy != "(无)" && proxy != "(none)" {
                    // 如果代理地址不包含协议，添加http://
                    if !proxy.starts_with("http://") && !proxy.starts_with("https://") {
                        return Some(format!("http://{}", proxy));
                    }
                    return Some(proxy.to_string());
                }
            }
        }
    }

    // 尝试从注册表读取IE代理设置
    detect_ie_proxy()
}

// 检测IE代理设置（Windows）
#[cfg(target_os = "windows")]
fn detect_ie_proxy() -> Option<String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // 使用reg命令读取注册表
    let output = Command::new("reg")
        .args(&[
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyServer",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .ok()?;

    let output_str = String::from_utf8_lossy(&output.stdout);

    for line in output_str.lines() {
        if line.contains("ProxyServer") && line.contains("REG_SZ") {
            if let Some(proxy_part) = line.split("REG_SZ").nth(1) {
                let proxy = proxy_part.trim();
                if !proxy.is_empty() {
                    // 如果代理地址不包含协议，添加http://
                    if !proxy.starts_with("http://") && !proxy.starts_with("https://") {
                        return Some(format!("http://{}", proxy));
                    }
                    return Some(proxy.to_string());
                }
            }
        }
    }

    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(app_state)
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 基于Tauri v2官方文档设置窗口主题
            if let Some(window) = app.get_webview_window("main") {
                // 设置深色主题，确保系统框颜色为深色（对应#131B2C的深色标题栏）
                let _ = window.set_theme(Some(tauri::Theme::Dark));

                #[cfg(target_os = "windows")]
                {
                    // Windows平台特定设置
                    // 确保窗口标题栏使用深色主题
                    let _ = window.set_theme(Some(tauri::Theme::Dark));

                    // 使用自定义标题栏，decorations已在tauri.conf.json中设置为false
                    // 自定义标题栏颜色为#131B2C，确保视觉一致性
                }

                // 在窗口加载完成后再次确认主题设置
                let main_window = window.clone();
                tauri::async_runtime::spawn(async move {
                    // 等待前端加载完成
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                    // 再次确保深色主题设置
                    let _ = main_window.set_theme(Some(tauri::Theme::Dark));

                    // 发送主题初始化事件到前端
                    let _ = main_window.emit(
                        "window-theme-initialized",
                        serde_json::json!({
                            "theme": "dark",
                            "systemFrame": "#131B2C",
                            "decorations": false,
                            "customTitlebar": true
                        }),
                    );
                });
            }

            // 创建托盘菜单
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;

            // 创建托盘图标
            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("NodePass GUI - 无运行中的隧道")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button,
                            button_state,
                            ..
                        } => {
                            match button {
                                tauri::tray::MouseButton::Left => {
                                    if button_state == tauri::tray::MouseButtonState::Up {
                                        // 左键单击显示窗口
                                        if let Some(window) =
                                            tray.app_handle().get_webview_window("main")
                                        {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                        TrayIconEvent::DoubleClick { .. } => {
                            // 双击显示窗口
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_menu_event({
                    let app_handle = app.handle().clone();
                    move |_app, event| {
                        match event.id().as_ref() {
                            "quit" => {
                                // 退出应用
                                let app_handle_clone = app_handle.clone();
                                tauri::async_runtime::spawn(async move {
                                    let _ = exit_app(
                                        app_handle_clone.clone(),
                                        app_handle_clone.state::<AppState>(),
                                    )
                                    .await;
                                });
                            }
                            _ => {}
                        }
                    }
                })
                .build(app)?;

            // 监听窗口关闭事件
            let main_window = app.get_webview_window("main").unwrap();
            main_window.on_window_event(move |event| {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // 阻止默认关闭行为
                        api.prevent_close();

                        // 发送关闭确认事件到前端
                        let _ = app_handle.emit("close-requested", ());
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_nodepass,
            handle_fatal_error,
            stop_nodepass_by_pid,
            stop_all_nodepass,
            get_tunnel_logs,
            save_config,
            get_saved_configs,
            check_nodepass_status,
            get_latest_release,
            download_nodepass,
            cancel_download,
            open_directory,
            show_window,
            hide_window,
            get_running_tunnels_count,
            show_exit_confirmation,
            exit_app,
            update_tray_tooltip,
            set_window_theme,
            initialize_window_theme,
            request_close,
            get_app_version,
            open_url_in_default_browser,
            minimize_window,
            maximize_window,
            unmaximize_window,
            close_window,
            is_maximized
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
