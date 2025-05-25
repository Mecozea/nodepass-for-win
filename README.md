# NodePass GUI

NodePass GUI 是一个基于 Tauri 框架的现代化桌面应用程序，为 [NodePass](https://github.com/yosebyte/nodepass) 提供了图形化的用户界面。NodePass 是一个安全、高效的 TCP/UDP 隧道解决方案，通过预建立的 TLS/TCP 连接提供快速、可靠的跨网络限制访问。

## ✨ 功能特点

- 🎨 **现代化界面** - 基于 React + TypeScript 构建的美观易用界面
- ⚙️ **配置管理** - 可视化配置 NodePass 参数，支持保存和加载配置
- 📊 **实时监控** - 实时显示连接状态和日志信息
- 🔧 **多模式支持** - 支持 Server、Client 和 Master 三种运行模式
- 🛡️ **安全选项** - 支持多级 TLS 加密设置
- 💾 **配置持久化** - 自动保存配置到本地，方便复用
- 🚀 **一键启停** - 简单的按钮操作启动和停止隧道连接

## 📋 系统要求

- Windows 10/11 (64-bit)
- NodePass 可执行文件 (`nodepass.exe`)

## 🚀 快速开始

### 1. 安装 NodePass

首先确保您已经安装了 NodePass：

```bash
# 方法1: 使用 Go 安装
go install github.com/yosebyte/nodepass/cmd/nodepass@latest

# 方法2: 下载预编译二进制文件
# 从 https://github.com/yosebyte/nodepass/releases 下载

# 方法3: 使用部署脚本
bash <(curl -sSL https://run.nodepass.eu/np.sh)
```

### 2. 运行 GUI 应用

#### 开发模式

```bash
cd nodepass-gui
npm install
npm run tauri dev
```

#### 构建生产版本

```bash
npm run tauri build
```

构建完成后，可执行文件将在 `src-tauri/target/release/` 目录中。

## 🎯 使用指南

### 基本配置

1. **选择操作模式**：
   - **Server** - 服务器模式，监听入站隧道连接
   - **Client** - 客户端模式，建立到隧道服务器的出站连接
   - **Master** - 主控模式，提供 RESTful API 进行动态实例管理

2. **配置地址**：
   - **隧道地址** - 控制通道通信的端点地址
   - **目标地址** - 转发流量的目标地址

3. **安全设置**：
   - **TLS 模式 0** - 无加密（最快速度，适用于受信任网络）
   - **TLS 模式 1** - 自签名证书（快速安全设置）
   - **TLS 模式 2** - 自定义证书（企业级安全）

### 使用示例

#### 客户端模式示例
```
模式: client
隧道地址: server.example.com:10101
目标地址: 127.0.0.1:8080
```

#### 服务器模式示例
```
模式: server
隧道地址: :10101
目标地址: 127.0.0.1:8080
TLS模式: 1
```

### 配置管理

- 点击 **💾 保存配置** 按钮保存当前配置
- 在右侧 **保存的配置** 区域查看已保存的配置
- 点击 **加载** 按钮快速加载已保存的配置

### 连接管理

- 点击 **▶️ 启动连接** 开始建立隧道
- 连接状态会在右侧显示为 🟢 运行中 或 🔴 已停止
- 点击 **⏹️ 停止连接** 停止当前连接
- 查看底部日志面板获取详细的运行信息

## 📂 配置文件

配置文件保存在以下位置：
- Windows: `%APPDATA%\nodepass-gui\configs.json`
- macOS: `~/Library/Application Support/nodepass-gui/configs.json`
- Linux: `~/.config/nodepass-gui/configs.json`

## 🛠️ 开发说明

### 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Rust + Tauri
- **样式**: CSS3 with CSS Variables
- **进程管理**: Tokio

### 项目结构

```
nodepass-gui/
├── src/                    # React 前端源码
│   ├── App.tsx            # 主应用组件
│   ├── App.css            # 样式文件
│   └── main.tsx           # 入口文件
├── src-tauri/             # Tauri 后端源码
│   ├── src/
│   │   ├── lib.rs         # 主要业务逻辑
│   │   └── main.rs        # 入口文件
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 配置文件
└── package.json           # Node.js 依赖配置
```

### API 接口

Rust 后端提供以下 Tauri 命令：

- `start_nodepass(config)` - 启动 NodePass 进程
- `stop_nodepass()` - 停止 NodePass 进程
- `save_config(config)` - 保存配置
- `get_saved_configs()` - 获取已保存的配置

## 🐛 故障排除

### 常见问题

1. **"未找到NodePass可执行文件"**
   - 确保 `nodepass.exe` 在 PATH 环境变量中
   - 或将 `nodepass.exe` 放在应用程序同一目录下

2. **启动失败**
   - 检查端口是否被占用
   - 确认防火墙设置
   - 查看日志面板获取详细错误信息

3. **连接问题**
   - 验证网络连通性
   - 检查服务器地址和端口配置
   - 确认 TLS 证书设置正确

## 📄 许可证

本项目基于 BSD 3-Clause 许可证开源。

## 🤝 贡献

欢迎提交 Issues 和 Pull Requests！

## 🔗 相关链接

- [NodePass 官方仓库](https://github.com/yosebyte/nodepass)
- [NodePass 文档](https://nodepass.eu)
- [Tauri 官方文档](https://tauri.app)
