@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   🚀 NodePass GUI - 快速启动
echo ========================================
echo.

REM 检查是否在正确的目录
if not exist "package.json" (
    echo ❌ 错误：请在 nodepass-gui 项目目录中运行此脚本
    echo.
    pause
    exit /b 1
)

echo 🔍 正在检查环境...

REM 检查 Node.js
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 Node.js，请先运行 install-prerequisites.bat
    echo.
    pause
    exit /b 1
)

REM 检查 Rust
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未找到 Rust，请先运行 install-prerequisites.bat
    echo.
    pause
    exit /b 1
)

REM 检查是否安装了依赖
if not exist "node_modules" (
    echo 📦 正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
)

echo ✅ 环境检查完成
echo.
echo 🎯 正在启动 NodePass GUI...
echo.
echo 💡 提示：
echo    - 首次启动可能需要几分钟编译时间
echo    - 应用窗口将自动打开
echo    - 按 Ctrl+C 停止应用
echo.

REM 启动应用
call npm run tauri dev

echo.
echo 👋 NodePass GUI 已关闭
pause 