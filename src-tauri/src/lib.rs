// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WindowEvent, tray::{TrayIconBuilder, TrayIconEvent}, menu::{Menu, MenuItem}};
use tokio::io::{AsyncBufReadExt, BufReader, AsyncWriteExt};
use tokio::process::Command as TokioCommand;
use tokio_stream::StreamExt;
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
    process_id: u32,
    tunnel_id: String,
    logs: Arc<Mutex<Vec<String>>>,
}

type ProcessMap = Arc<Mutex<HashMap<u32, ProcessInfo>>>;

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
    tunnel_id: String,
) -> Result<u32, String> {
    let nodepass_path = find_nodepass_executable_with_handle(&app_handle)
        .ok_or_else(|| "未找到NodePass可执行文件，请确保nodepass.exe在PATH中或当前目录下".to_string())?;

    let command_args = build_nodepass_command(&config)?;
    
    println!("启动NodePass: {} {}", nodepass_path, command_args.join(" "));

    let mut cmd = TokioCommand::new(&nodepass_path);
    cmd.args(&command_args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("启动进程失败: {}", e))?;
    let child_id = child.id().unwrap_or(0);
    
    // 创建日志存储
    let logs = Arc::new(Mutex::new(Vec::new()));
    
    // 处理stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id.clone();
        let logs_clone = logs.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let log_message = format!("[INFO] {}", line);
                
                // 存储到日志
                if let Ok(mut log_vec) = logs_clone.lock() {
                    log_vec.push(log_message.clone());
                    // 限制日志数量，保留最近500条
                    if log_vec.len() > 500 {
                        log_vec.drain(0..100); // 删除前100条
                    }
                }
                
                let _ = app_handle_clone.emit("nodepass-log", serde_json::json!({
                    "tunnel_id": tunnel_id_clone,
                    "message": log_message
                }));
            }
        });
    }

    // 处理stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        let tunnel_id_clone = tunnel_id.clone();
        let logs_clone = logs.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let log_message = format!("[ERROR] {}", line);
                
                // 存储到日志
                if let Ok(mut log_vec) = logs_clone.lock() {
                    log_vec.push(log_message.clone());
                    // 限制日志数量，保留最近500条
                    if log_vec.len() > 500 {
                        log_vec.drain(0..100); // 删除前100条
                    }
                }
                
                let _ = app_handle_clone.emit("nodepass-log", serde_json::json!({
                    "tunnel_id": tunnel_id_clone,
                    "message": log_message
                }));
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
        
        // 从进程映射中移除
        if let Ok(mut processes) = processes_clone.lock() {
            processes.remove(&child_id_clone);
        }
        
        match status {
            Ok(exit_status) => {
                let _ = app_handle_clone.emit("nodepass-process-exit", serde_json::json!({
                    "tunnel_id": tunnel_id_clone,
                    "process_id": child_id_clone,
                    "exit_code": exit_status.code().unwrap_or(-1)
                }));
            }
            Err(e) => {
                let _ = app_handle_clone.emit("nodepass-process-error", serde_json::json!({
                    "tunnel_id": tunnel_id_clone,
                    "process_id": child_id_clone,
                    "error": e.to_string()
                }));
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

    // 更新托盘tooltip
    let _ = update_tray_tooltip(app_handle.clone(), state.clone()).await;

    Ok(child_id)
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
        let output = std::process::Command::new("taskkill")
            .args(&["/F", "/PID", &process_id.to_string()])
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
async fn stop_all_nodepass(app_handle: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let process_ids: Vec<u32> = {
        if let Ok(processes) = state.processes.lock() {
            processes.keys().cloned().collect()
        } else {
            Vec::new()
        }
    };

    for process_id in process_ids {
        let _ = stop_nodepass_by_pid(app_handle.clone(), state.clone(), process_id).await;
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
            // 尝试获取版本信息 - NodePass在--help时会输出版本信息到stderr
            let version_result = std::process::Command::new(&path)
                .arg("--help")
                .output();
                
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
    println!("开始下载: {} -> {}", download_url, filename);
    
    let current_dir = match std::env::current_dir() {
        Ok(dir) => dir,
        Err(e) => {
            let error_msg = format!("获取当前目录失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "error",
                "message": error_msg
            }));
            return Err(error_msg);
        }
    };
    
    let target_path = current_dir.join(&filename);
    println!("目标路径: {:?}", target_path);
    
    // 发送开始下载事件
    let _ = app_handle.emit("download-progress", serde_json::json!({
        "status": "started",
        "message": "开始下载..."
    }));

    // 创建HTTP客户端，自动检测系统代理
    let mut client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30)); // 添加超时设置
    
    // 检测系统代理设置
    if let Some(proxy_url) = detect_system_proxy() {
        println!("检测到系统代理: {}", proxy_url);
        
        // 先尝试不使用代理进行连接测试
        println!("测试直连是否可用...");
        let test_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("创建测试客户端失败: {}", e))?;
            
        match test_client.head(&download_url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    println!("直连测试成功，使用直连下载");
                    let _ = app_handle.emit("download-progress", serde_json::json!({
                        "status": "started",
                        "message": "直连测试成功，使用直连下载..."
                    }));
                } else {
                    println!("直连测试失败，状态码: {}", response.status());
                }
            }
            Err(e) => {
                println!("直连测试失败: {}，尝试使用系统代理", e);
                match reqwest::Proxy::all(&proxy_url) {
                    Ok(proxy) => {
                        client_builder = client_builder.proxy(proxy);
                        let _ = app_handle.emit("download-progress", serde_json::json!({
                            "status": "started",
                            "message": format!("使用系统代理: {}", proxy_url)
                        }));
                        println!("已配置系统代理");
                    }
                    Err(e) => {
                        println!("配置代理失败: {}, 将使用直连", e);
                        let _ = app_handle.emit("download-progress", serde_json::json!({
                            "status": "started",
                            "message": "代理配置失败，使用直连下载..."
                        }));
                    }
                }
            }
        }
    } else {
        println!("未检测到系统代理，使用直连");
        let _ = app_handle.emit("download-progress", serde_json::json!({
            "status": "started",
            "message": "使用直连下载..."
        }));
    }

    let client = match client_builder.build() {
        Ok(client) => {
            println!("HTTP客户端创建成功");
            client
        },
        Err(e) => {
            let error_msg = format!("创建HTTP客户端失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "error",
                "message": error_msg
            }));
            return Err(error_msg);
        }
    };

    println!("开始发送下载请求...");
    let response = match client
        .get(&download_url)
        .header("User-Agent", "NodePass-GUI")
        .send()
        .await
    {
        Ok(response) => {
            println!("下载请求成功，状态码: {}", response.status());
            response
        },
        Err(e) => {
            let error_msg = format!("下载请求失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "error",
                "message": error_msg
            }));
            return Err(error_msg);
        }
    };

    if !response.status().is_success() {
        let error_msg = format!("下载失败，HTTP状态: {}", response.status());
        println!("错误: {}", error_msg);
        let _ = app_handle.emit("download-progress", serde_json::json!({
            "status": "error",
            "message": error_msg
        }));
        return Err(error_msg);
    }

    let total_size = response.content_length().unwrap_or(0);
    println!("文件大小: {} bytes", total_size);
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();
    
    let mut file = match tokio::fs::File::create(&target_path).await {
        Ok(file) => {
            println!("文件创建成功: {:?}", target_path);
            file
        },
        Err(e) => {
            let error_msg = format!("创建文件失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "error",
                "message": error_msg
            }));
            return Err(error_msg);
        }
    };

    println!("开始下载文件内容...");
    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(chunk) => chunk,
            Err(e) => {
                let error_msg = format!("读取数据块失败: {}", e);
                println!("错误: {}", error_msg);
                let _ = app_handle.emit("download-progress", serde_json::json!({
                    "status": "error",
                    "message": error_msg
                }));
                return Err(error_msg);
            }
        };
        
        downloaded += chunk.len() as u64;
        
        if let Err(e) = file.write_all(&chunk).await {
            let error_msg = format!("写入文件失败: {}", e);
            println!("错误: {}", error_msg);
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "error",
                "message": error_msg
            }));
            return Err(error_msg);
        }

        // 发送进度更新
        if total_size > 0 {
            let progress = (downloaded * 100) / total_size;
            if downloaded % (total_size / 20).max(1024 * 1024) == 0 { // 每5%或每1MB更新一次
                println!("下载进度: {}% ({}/{})", progress, downloaded, total_size);
                let _ = app_handle.emit("download-progress", serde_json::json!({
                    "status": "downloading",
                    "progress": progress,
                    "downloaded": downloaded,
                    "total": total_size,
                    "message": format!("下载中... {}%", progress)
                }));
            }
        }
    }

    println!("文件下载完成，开始刷新文件...");
    // 下载完成后，开始解压
    if let Err(e) = file.flush().await {
        let error_msg = format!("刷新文件失败: {}", e);
        println!("错误: {}", error_msg);
        let _ = app_handle.emit("download-progress", serde_json::json!({
            "status": "error",
            "message": error_msg
        }));
        return Err(error_msg);
    }
    drop(file); // 关闭文件句柄

    println!("开始解压文件...");
    // 发送解压开始事件
    let _ = app_handle.emit("download-progress", serde_json::json!({
        "status": "extracting",
        "message": "正在解压安装...",
        "progress": 0
    }));

    // 解压文件
    let extract_result = extract_nodepass_archive(&target_path, &current_dir, &app_handle).await;
    
    match extract_result {
        Ok(extracted_exe_path) => {
            println!("解压成功: {}", extracted_exe_path);
            // 删除压缩包
            let _ = tokio::fs::remove_file(&target_path).await;
            
            // 发送完成事件
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "completed",
                "message": "安装完成！",
                "path": extracted_exe_path
            }));

            Ok(extracted_exe_path)
        }
        Err(e) => {
            println!("解压失败: {}", e);
            let _ = app_handle.emit("download-progress", serde_json::json!({
                "status": "error",
                "message": format!("解压失败: {}", e)
            }));
            Err(e)
        }
    }
}

#[tauri::command]
async fn open_directory(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
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
async fn test_network_connection(url: String) -> Result<String, String> {
    println!("测试网络连接: {}", url);
    
    // 测试直连
    let direct_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建直连客户端失败: {}", e))?;
    
    match direct_client.head(&url).send().await {
        Ok(response) => {
            let status = response.status();
            println!("直连测试结果: {}", status);
            if status.is_success() {
                return Ok(format!("直连成功: {}", status));
            }
        }
        Err(e) => {
            println!("直连测试失败: {}", e);
        }
    }
    
    // 如果直连失败，尝试使用系统代理
    if let Some(proxy_url) = detect_system_proxy() {
        println!("尝试使用系统代理: {}", proxy_url);
        
        let proxy_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .proxy(reqwest::Proxy::all(&proxy_url).map_err(|e| format!("配置代理失败: {}", e))?)
            .build()
            .map_err(|e| format!("创建代理客户端失败: {}", e))?;
        
        match proxy_client.head(&url).send().await {
            Ok(response) => {
                let status = response.status();
                println!("代理测试结果: {}", status);
                if status.is_success() {
                    return Ok(format!("代理连接成功: {}", status));
                } else {
                    return Err(format!("代理连接失败: {}", status));
                }
            }
            Err(e) => {
                println!("代理测试失败: {}", e);
                return Err(format!("代理连接失败: {}", e));
            }
        }
    }
    
    Err("直连和代理连接都失败".to_string())
}

#[tauri::command]
async fn show_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        window.show().map_err(|e| format!("显示窗口失败: {}", e))?;
        window.set_focus().map_err(|e| format!("聚焦窗口失败: {}", e))?;
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
async fn exit_app(app_handle: AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    // 停止所有进程
    let process_ids: Vec<u32> = {
        if let Ok(processes_guard) = state.processes.lock() {
            processes_guard.keys().cloned().collect()
        } else {
            Vec::new()
        }
    };
    
    for process_id in process_ids {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("taskkill")
                .args(&["/F", "/PID", &process_id.to_string()])
                .output();
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            let _ = std::process::Command::new("kill")
                .args(&["-9", &process_id.to_string()])
                .output();
        }
    }
    
    // 退出应用
    app_handle.exit(0);
    Ok(())
}

#[tauri::command]
async fn update_tray_tooltip(_app_handle: AppHandle, _state: tauri::State<'_, AppState>) -> Result<(), String> {
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
        // 强制设置为深色主题，确保系统框颜色为深色
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

// 新增：获取应用版本信息的函数
#[tauri::command]
async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

// 新增：在默认浏览器中打开URL
#[tauri::command]
async fn open_url_in_default_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/c", "start", &url])
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

fn load_configs(config_file: &PathBuf) -> Result<Vec<NodePassConfig>, Box<dyn std::error::Error>> {
    if !config_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(config_file)?;
    let configs: Vec<NodePassConfig> = serde_json::from_str(&content)?;
    Ok(configs)
}

fn find_nodepass_executable() -> Option<String> {
    // 1. 首先检查应用资源目录（生产环境）
    // 注意：在实际运行时，需要通过AppHandle来解析资源路径
    // 这里先检查相对于可执行文件的位置
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let resource_exe = exe_dir.join("nodepass.exe");
            if resource_exe.exists() {
                return Some(resource_exe.to_string_lossy().to_string());
            }
        }
    }
    
    // 2. 检查当前目录（开发环境）
    let current_dir_exe = std::env::current_dir()
        .ok()?
        .join("nodepass.exe");
    
    if current_dir_exe.exists() {
        return Some(current_dir_exe.to_string_lossy().to_string());
    }

    // 3. 检查PATH环境变量
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(';') {
            let exe_path = PathBuf::from(dir).join("nodepass.exe");
            if exe_path.exists() {
                return Some(exe_path.to_string_lossy().to_string());
            }
        }
    }

    // 4. 最后尝试直接使用nodepass命令（假设在PATH中）
    Some("nodepass".to_string())
}

// 使用AppHandle的版本，用于更准确的资源路径解析
fn find_nodepass_executable_with_handle(app_handle: &AppHandle) -> Option<String> {
    // 1. 首先检查应用资源目录（生产环境）
    if let Ok(resource_path) = app_handle.path().resolve("nodepass.exe", tauri::path::BaseDirectory::Resource) {
        if resource_path.exists() {
            return Some(resource_path.to_string_lossy().to_string());
        }
    }
    
    // 2. 回退到通用检测方法
    find_nodepass_executable()
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

// 解压NodePass压缩包
async fn extract_nodepass_archive(
    archive_path: &PathBuf,
    extract_to: &PathBuf,
    app_handle: &AppHandle,
) -> Result<String, String> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| format!("打开压缩包失败: {}", e))?;
    
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("读取压缩包失败: {}", e))?;
    
    let total_files = archive.len();
    let mut extracted_exe_path = None;
    
    for i in 0..total_files {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {}", e))?;
        
        let outpath = match file.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };
        
        // 发送解压进度
        let progress = ((i + 1) * 100) / total_files;
        let _ = app_handle.emit("download-progress", serde_json::json!({
            "status": "extracting",
            "message": format!("正在解压... {}/{}", i + 1, total_files),
            "progress": progress
        }));
        
        if file.name().ends_with('/') {
            // 创建目录
            std::fs::create_dir_all(&outpath)
                .map_err(|e| format!("创建目录失败: {}", e))?;
        } else {
            // 创建父目录
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p)
                        .map_err(|e| format!("创建父目录失败: {}", e))?;
                }
            }
            
            // 解压文件
            let mut outfile = std::fs::File::create(&outpath)
                .map_err(|e| format!("创建文件失败: {}", e))?;
            
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("解压文件失败: {}", e))?;
            
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
    use std::process::Command;
    
    // 检查IE代理绕过列表
    let output = Command::new("reg")
        .args(&[
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyOverride"
        ])
        .output();
        
    if let Ok(output) = output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines() {
            if line.contains("ProxyOverride") && line.contains("REG_SZ") {
                if let Some(bypass_part) = line.split("REG_SZ").nth(1) {
                    let bypass_list = bypass_part.trim();
                    println!("代理绕过列表: {}", bypass_list);
                    if bypass_list.contains("github.com") || 
                       bypass_list.contains("*.github.com") ||
                       bypass_list.contains("<local>") {
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
    use std::process::Command;
    
    // 使用netsh命令检测代理设置
    let output = Command::new("netsh")
        .args(&["winhttp", "show", "proxy"])
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
    use std::process::Command;
    
    // 使用reg命令读取注册表
    let output = Command::new("reg")
        .args(&[
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyServer"
        ])
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
        .manage(app_state)
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // 基于Tauri v2官方文档设置窗口主题
            if let Some(window) = app.get_webview_window("main") {
                // 立即设置深色主题，确保系统框颜色为深色（对应#131B2C）
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
                let window_clone = window.clone();
                tauri::async_runtime::spawn(async move {
                    // 等待前端加载完成
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    
                    // 再次确保深色主题设置
                    let _ = window_clone.set_theme(Some(tauri::Theme::Dark));
                    
                    // 发送主题初始化事件到前端
                    let _ = window_clone.emit("window-theme-initialized", serde_json::json!({
                        "theme": "dark",
                        "systemFrame": "#131B2C",
                        "decorations": false,
                        "customTitlebar": true
                    }));
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
                        TrayIconEvent::Click { button, button_state, .. } => {
                            match button {
                                tauri::tray::MouseButton::Left => {
                                    if button_state == tauri::tray::MouseButtonState::Up {
                                        // 左键单击显示窗口
                                        if let Some(window) = tray.app_handle().get_webview_window("main") {
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
                                    let _ = exit_app(app_handle_clone.clone(), app_handle_clone.state::<AppState>()).await;
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
            stop_nodepass_by_pid,
            stop_all_nodepass,
            get_tunnel_logs,
            save_config,
            get_saved_configs,
            check_nodepass_status,
            get_latest_release,
            download_nodepass,
            open_directory,
            test_network_connection,
            show_window,
            hide_window,
            get_running_tunnels_count,
            exit_app,
            update_tray_tooltip,
            set_window_theme,
            initialize_window_theme,
            request_close,
            get_app_version,
            open_url_in_default_browser
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
