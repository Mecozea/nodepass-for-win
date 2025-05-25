@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ================================
echo  NodePass GUI 前置依赖安装脚本
echo ================================
echo.

echo 正在检查系统环境...
echo.

set NODEJS_MISSING=0
set RUST_MISSING=0
set TAURI_MISSING=0

REM 检查 Node.js
echo [1/3] 检查 Node.js...
where npm >nul 2>&1
if %errorlevel% == 0 (
    echo ✓ Node.js 已安装
    for /f "delims=" %%i in ('npm --version') do echo   版本: %%i
) else (
    echo ✗ Node.js 未安装
    set NODEJS_MISSING=1
)

echo.

REM 检查 Rust
echo [2/3] 检查 Rust...
where rustc >nul 2>&1
if %errorlevel% == 0 (
    echo ✓ Rust 已安装
    for /f "delims=" %%i in ('rustc --version') do echo   版本: %%i
) else (
    echo ✗ Rust 未安装
    set RUST_MISSING=1
)

echo.

REM 检查 Tauri CLI (只有在 Rust 存在时才检查)
echo [3/3] 检查 Tauri CLI...
if !RUST_MISSING! == 1 (
    echo ⚠️  Tauri CLI 需要先安装 Rust
    set TAURI_MISSING=1
) else (
    where cargo >nul 2>&1
    if %errorlevel% == 0 (
        cargo tauri --version >nul 2>&1
        if %errorlevel% == 0 (
            echo ✓ Tauri CLI 已安装
            for /f "delims=" %%i in ('cargo tauri --version 2^>nul') do echo   版本: %%i
        ) else (
            echo ✗ Tauri CLI 未安装
            set TAURI_MISSING=1
        )
    ) else (
        echo ✗ Cargo 未找到
        set TAURI_MISSING=1
    )
)

echo.
echo ================================
echo  检查结果汇总
echo ================================
echo.

REM 如果所有依赖都已安装
if !NODEJS_MISSING! == 0 if !RUST_MISSING! == 0 if !TAURI_MISSING! == 0 (
    echo ✅ 所有前置依赖已准备就绪！
    echo.
    echo 您现在可以运行 start.bat 来启动 NodePass GUI
    echo.
    pause
    exit /b 0
)

REM 显示缺失的依赖和安装说明
echo 发现以下依赖缺失，需要手动安装：
echo.

if !NODEJS_MISSING! == 1 (
    echo ❌ Node.js
    echo    下载地址: https://nodejs.org/
    echo    建议下载 LTS 版本并完成安装
    echo.
)

if !RUST_MISSING! == 1 (
    echo ❌ Rust
    echo    是否要自动安装 Rust? ^(Y/N^)
    set /p choice="请输入选择: "
    if /i "!choice!" == "Y" (
        echo.
        echo 正在下载 Rust 安装程序...
        powershell -Command "try { Invoke-WebRequest -Uri 'https://win.rustup.rs/' -OutFile 'rustup-init.exe' } catch { Write-Host 'download_failed'; exit 1 }"
        
        if exist "rustup-init.exe" (
            echo 正在安装 Rust（这可能需要几分钟）...
            rustup-init.exe -y --default-toolchain stable
            
            if %errorlevel% == 0 (
                echo ✓ Rust 安装成功
                REM 刷新环境变量
                call "%USERPROFILE%\.cargo\env.bat" 2>nul
                set RUST_MISSING=0
                set TAURI_MISSING=1
            ) else (
                echo ✗ Rust 安装失败
            )
            
            REM 清理安装文件
            if exist "rustup-init.exe" del "rustup-init.exe"
        ) else (
            echo ✗ 下载 Rust 安装程序失败
            echo    请手动访问 https://rustup.rs/ 下载安装
        )
    ) else (
        echo    手动下载地址: https://rustup.rs/
    )
    echo.
)

if !TAURI_MISSING! == 1 if !RUST_MISSING! == 0 (
    echo ❌ Tauri CLI
    echo    是否要自动安装 Tauri CLI? ^(Y/N^)
    set /p choice="请输入选择: "
    if /i "!choice!" == "Y" (
        echo.
        echo 正在安装 Tauri CLI...
        cargo install tauri-cli
        
        if %errorlevel% == 0 (
            echo ✓ Tauri CLI 安装成功
            set TAURI_MISSING=0
        ) else (
            echo ✗ Tauri CLI 安装失败
        )
    ) else (
        echo    手动安装命令: cargo install tauri-cli
    )
    echo.
)

echo ================================
echo  安装说明
echo ================================
echo.

if !NODEJS_MISSING! == 1 (
    echo 1. 请先安装 Node.js:
    echo    - 访问 https://nodejs.org/
    echo    - 下载并安装 LTS 版本
    echo    - 安装完成后重新运行此脚本
    echo.
)

if !RUST_MISSING! == 0 if !TAURI_MISSING! == 0 if !NODEJS_MISSING! == 1 (
    echo 2. Node.js 安装完成后，您就可以使用 start.bat 启动应用了
    echo.
) else (
    echo 2. 所有依赖安装完成后，重新运行此脚本进行验证
    echo.
    echo 3. 验证通过后，使用 start.bat 启动应用
    echo.
)

echo 如需帮助，请查看 INSTALL.md 文件
echo.
pause 