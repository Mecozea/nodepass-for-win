# NodePass GUI 安装指南

## 🚀 快速开始

### 方法1: 自动安装脚本（推荐）

1. **安装前置依赖**
   ```batch
   install-prerequisites.bat
   ```
   这个脚本会自动安装：
   - Rust 编程语言和 Cargo 包管理器
   - Tauri CLI 工具

2. **运行应用程序**
   ```batch
   setup.bat
   ```
   这个脚本会：
   - 自动下载最新版本的 NodePass
   - 安装 npm 依赖
   - 启动开发服务器

### 方法2: 手动安装

#### 步骤1: 安装 Node.js
从 [nodejs.org](https://nodejs.org/) 下载并安装 Node.js LTS 版本。

#### 步骤2: 安装 Rust
从 [rustup.rs](https://rustup.rs/) 下载并安装 Rust。

安装完成后，安装 Tauri CLI：
```bash
cargo install tauri-cli
```

#### 步骤3: 下载 NodePass
从 [NodePass Releases](https://github.com/yosebyte/nodepass/releases/latest) 下载适合您系统的版本，并将 `nodepass.exe` 放在项目目录中或添加到 PATH 环境变量。

#### 步骤4: 安装项目依赖
```bash
npm install
```

#### 步骤5: 运行应用
```bash
npm run tauri dev
```

## 🔧 开发环境设置

### 推荐的开发工具

- **VS Code** + 扩展：
  - Tauri
  - rust-analyzer
  - ES7+ React/Redux/React-Native snippets
  - TypeScript Hero

### 项目命令

```bash
# 开发模式
npm run tauri dev

# 构建应用
npm run tauri build

# 前端开发服务器
npm run dev

# TypeScript 类型检查
npm run type-check

# 代码格式化
npm run format
```

## 📋 系统要求

### 最低要求
- **操作系统**: Windows 10 (1903+) / Windows 11
- **内存**: 4GB RAM
- **存储**: 2GB 可用空间
- **网络**: 互联网连接（用于下载依赖和 NodePass）

### 推荐配置
- **操作系统**: Windows 11
- **内存**: 8GB+ RAM
- **存储**: 4GB+ 可用空间
- **处理器**: 现代多核 CPU

## 🛠️ 故障排除

### 常见问题解决

#### 1. Rust 安装失败
**错误**: `rustup-init.exe` 执行失败
**解决方案**:
- 以管理员身份运行命令提示符
- 暂时禁用杀毒软件
- 手动从 [rustup.rs](https://rustup.rs/) 下载安装

#### 2. npm 依赖安装失败
**错误**: `npm install` 失败
**解决方案**:
```bash
# 清除 npm 缓存
npm cache clean --force

# 删除 node_modules 重新安装
rmdir /s node_modules
npm install
```

#### 3. Tauri 构建失败
**错误**: Tauri 编译错误
**解决方案**:
- 确保 Rust 版本为最新稳定版：`rustup update`
- 检查系统是否有 Visual Studio Build Tools
- 安装 Microsoft C++ Build Tools

#### 4. NodePass 未找到
**错误**: "未找到NodePass可执行文件"
**解决方案**:
- 确保 `nodepass.exe` 在项目目录中
- 或者将 NodePass 添加到系统 PATH
- 手动下载 NodePass 二进制文件

#### 5. 权限错误
**错误**: 文件操作权限被拒绝
**解决方案**:
- 以管理员身份运行
- 检查文件夹权限设置
- 暂时禁用文件保护功能

### 获取帮助

如果遇到其他问题：

1. 查看 [Tauri 文档](https://tauri.app/start/prerequisites/)
2. 检查 [NodePass 仓库](https://github.com/yosebyte/nodepass/issues)
3. 在项目中提交 Issue

## 📦 打包分发

### 构建生产版本

```bash
npm run tauri build
```

构建完成后，可执行文件位于：
- **Windows**: `src-tauri/target/release/nodepass-gui.exe`
- **安装程序**: `src-tauri/target/release/bundle/msi/NodePass GUI_0.1.0_x64_en-US.msi`

### 分发注意事项

1. **包含 NodePass**: 确保 `nodepass.exe` 与应用程序一起分发
2. **运行时依赖**: Windows 用户可能需要 Microsoft Visual C++ Redistributable
3. **防火墙设置**: 用户可能需要允许应用程序通过防火墙

## 🔄 更新

### 更新 NodePass GUI
```bash
git pull origin main
npm install
npm run tauri build
```

### 更新 NodePass 核心
1. 从 [Releases](https://github.com/yosebyte/nodepass/releases/latest) 下载最新版本
2. 替换 `nodepass.exe` 文件
3. 重启应用程序

## 📋 版本信息

- **NodePass GUI**: v0.1.0
- **基于 Tauri**: v2.x
- **NodePass**: 支持最新版本
- **兼容性**: Windows 10/11 x64 

nodepass-win/
├── README.md                     # 主项目说明
└── nodepass-gui/                 # Tauri 应用程序
    ├── src/                      # React 前端
    ├── src-tauri/               # Rust 后端
    ├── install-prerequisites.bat # 依赖安装脚本
    ├── setup.bat               # 完整安装脚本
    ├── start.bat               # 快速启动脚本
    ├── README.md               # 应用说明
    └── INSTALL.md              # 详细安装指南 