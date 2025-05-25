// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Child;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use uuid::Uuid;
use reqwest;

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

#[derive(Debug)]
struct ProcessInfo {
    process: Child,
    id: String,
}

type ProcessMap = Arc<Mutex<HashMap<String, ProcessInfo>>>;

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

#[tauri::command]
async fn start_nodepass(
    app_handle: AppHandle,
    state: tauri::State<'_, AppState>,
    config: NodePassConfig,
) -> Result<u32, String> {
    let nodepass_path = find_nodepass_executable()
        .ok_or_else(|| "未找到NodePass可执行文件，请确保nodepass.exe在PATH中或当前目录下".to_string())?;

    let command_args = build_nodepass_command(&config)?;
    
    println!("启动NodePass: {} {}", nodepass_path, command_args.join(" "));

    let mut cmd = TokioCommand::new(&nodepass_path);
    cmd.args(&command_args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("启动进程失败: {}", e))?;
    let child_id = child.id().unwrap_or(0);
    
    // 创建进程ID
    let process_id = Uuid::new_v4().to_string();
    
    // 处理stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        let _process_id_clone = process_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_handle_clone.emit("nodepass-log", format!("[INFO] {}", line));
            }
        });
    }

    // 处理stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        let _process_id_clone = process_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_handle_clone.emit("nodepass-log", format!("[ERROR] {}", line));
            }
        });
    }

    // 监控进程状态
    let app_handle_clone = app_handle.clone();
    let process_id_clone = process_id.clone();
    let processes_clone = state.processes.clone();
    tokio::spawn(async move {
        let status = child.wait().await;
        
        // 从进程映射中移除
        if let Ok(mut processes) = processes_clone.lock() {
            processes.remove(&process_id_clone);
        }
        
        match status {
            Ok(exit_status) => {
                let _ = app_handle_clone.emit("nodepass-log", 
                    format!("NodePass进程已退出，状态码: {}", exit_status.code().unwrap_or(-1)));
            }
            Err(e) => {
                let _ = app_handle_clone.emit("nodepass-log", 
                    format!("NodePass进程错误: {}", e));
            }
        }
    });

    // 创建一个占位的Child对象（实际进程由tokio管理）
    let placeholder_child = std::process::Command::new("cmd")
        .arg("/c")
        .arg("echo")
        .spawn()
        .map_err(|e| format!("创建占位进程失败: {}", e))?;

    let process_info = ProcessInfo {
        process: placeholder_child,
        id: process_id.clone(),
    };

    if let Ok(mut processes) = state.processes.lock() {
        processes.insert(process_id, process_info);
    }

    Ok(child_id)
}

#[tauri::command]
async fn stop_nodepass(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Ok(mut processes) = state.processes.lock() {
        for (_, mut process_info) in processes.drain() {
            let _ = process_info.process.kill();
        }
    }

    // 在Windows上，尝试杀死所有nodepass进程
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(&["/F", "/IM", "nodepass.exe"])
            .output();
    }

    // 在Unix系统上，使用pkill
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("pkill")
            .arg("nodepass")
            .output();
    }

    Ok(())
}

#[tauri::command]
async fn save_config(
    state: tauri::State<'_, AppState>,
    config: NodePassConfig,
) -> Result<(), String> {
    let mut configs = load_configs(&state.config_file).unwrap_or_default();
    
    // 检查是否已存在相同配置
    if !configs.iter().any(|c| 
        c.mode == config.mode 
        && c.tunnel_addr == config.tunnel_addr 
        && c.target_addr == config.target_addr
    ) {
        configs.push(config);
    }

    let config_json = serde_json::to_string_pretty(&configs)
        .map_err(|e| format!("序列化配置失败: {}", e))?;

    fs::write(&state.config_file, config_json)
        .map_err(|e| format!("保存配置文件失败: {}", e))?;

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
            // 尝试获取版本信息
            let version_result = std::process::Command::new(&path)
                .arg("-v")
                .output();
                
            match version_result {
                Ok(output) => {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout)
                            .trim()
                            .to_string();
                        Ok(NodePassStatus {
                            installed: true,
                            version: Some(version),
                            path: Some(path),
                            error: None,
                        })
                    } else {
                        let error = String::from_utf8_lossy(&output.stderr).to_string();
                        Ok(NodePassStatus {
                            installed: true,
                            version: None,
                            path: Some(path),
                            error: Some(format!("获取版本失败: {}", error)),
                        })
                    }
                }
                Err(e) => {
                    Ok(NodePassStatus {
                        installed: false,
                        version: None,
                        path: Some(path),
                        error: Some(format!("执行失败: {}", e)),
                    })
                }
            }
        }
        None => {
            Ok(NodePassStatus {
                installed: false,
                version: None,
                path: None,
                error: Some("未找到NodePass可执行文件".to_string()),
            })
        }
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
) -> Result<String, String> {
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("获取当前目录失败: {}", e))?;
    
    let target_path = current_dir.join(&filename);
    
    // 发送开始下载事件
    let _ = app_handle.emit("download-progress", serde_json::json!({
        "status": "started",
        "message": "开始下载..."
    }));

    let client = reqwest::Client::new();
    let response = client
        .get(&download_url)
        .header("User-Agent", "NodePass-GUI")
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP状态: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();
    
    let mut file = tokio::fs::File::create(&target_path)
        .await
        .map_err(|e| format!("创建文件失败: {}", e))?;

    use tokio_stream::StreamExt;
    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取数据块失败: {}", e))?;
        downloaded += chunk.len() as u64;
        
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;

        // 发送进度更新
        if total_size > 0 {
            let progress = (downloaded * 100) / total_size;
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "downloading",
                "progress": progress,
                "downloaded": downloaded,
                "total": total_size,
                "message": format!("下载中... {}%", progress)
            }));
        }
    }

    // 发送完成事件
    let _ = app_handle.emit("download-progress", serde_json::json!({
        "status": "completed",
        "message": "下载完成！",
        "path": target_path.to_string_lossy()
    }));

    Ok(target_path.to_string_lossy().to_string())
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
    // 首先检查当前目录
    let current_dir_exe = std::env::current_dir()
        .ok()?
        .join("nodepass.exe");
    
    if current_dir_exe.exists() {
        return Some(current_dir_exe.to_string_lossy().to_string());
    }

    // 检查PATH环境变量
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            let exe_path = PathBuf::from(dir).join("nodepass.exe");
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }

    // 尝试直接使用nodepass命令
    Some("nodepass".to_string())
}

fn build_nodepass_command(config: &NodePassConfig) -> Result<Vec<String>, String> {
    let mut url = format!("{}://{}/{}", config.mode, config.tunnel_addr, config.target_addr);
    
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    
    let app_state = AppState::new();
    
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            start_nodepass,
            stop_nodepass,
            save_config,
            get_saved_configs,
            check_nodepass_status,
            get_latest_release,
            download_nodepass
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
