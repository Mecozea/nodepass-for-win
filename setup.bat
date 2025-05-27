@echo off
chcp 65001 >nul
echo ================================
echo  NodePass GUI 安装和设置脚本
echo ================================
echo.

REM 检查是否已存在 nodepass.exe
if exist "nodepass.exe" (
    echo ✓ 发现 nodepass.exe 文件
    goto :run_gui
)

echo 正在检查 NodePass...
where nodepass.exe >nul 2>&1
if %errorlevel% == 0 (
    echo ✓ NodePass 已在 PATH 中找到
    goto :run_gui
)

echo.
echo NodePass 未找到，正在下载...
echo.

REM 获取系统架构
if "%PROCESSOR_ARCHITECTURE%" == "AMD64" (
    set ARCH=windows_amd64
) else if "%PROCESSOR_ARCHITECTURE%" == "x86" (
    set ARCH=windows_386
) else (
    set ARCH=windows_amd64
)

echo 系统架构: %ARCH%
echo.

REM 创建临时目录
if not exist "temp" mkdir temp

REM 下载 NodePass
echo 正在下载 NodePass...
powershell -Command "& {try { $response = Invoke-RestMethod -Uri 'https://api.github.com/repos/yosebyte/nodepass/releases/latest'; $asset = $response.assets | Where-Object { $_.name -like '*%ARCH%*' } | Select-Object -First 1; if ($asset) { Invoke-WebRequest -Uri $asset.browser_download_url -OutFile 'temp\nodepass.zip'; Write-Host '✓ 下载完成'; } else { Write-Host '✗ 未找到适合的版本'; exit 1; } } catch { Write-Host '✗ 下载失败:' $_.Exception.Message; exit 1; } }"

if %errorlevel% neq 0 (
    echo.
    echo ✗ 下载失败，请手动下载 NodePass 并放置在当前目录
    echo 下载地址: https://github.com/yosebyte/nodepass/releases/latest
    echo.
    pause
    exit /b 1
)

REM 解压文件
echo 正在解压...
powershell -Command "Expand-Archive -Path 'temp\nodepass.zip' -DestinationPath 'temp' -Force"

REM 查找并复制 nodepass.exe
for /r "temp" %%f in (nodepass.exe) do (
    copy "%%f" "nodepass.exe" >nul
    echo ✓ NodePass 安装完成
    goto :cleanup
)

echo ✗ 解压后未找到 nodepass.exe
goto :cleanup

:cleanup
REM 清理临时文件
if exist "temp" rmdir /s /q "temp"

:run_gui
echo.
echo ================================
echo  启动 NodePass GUI
echo ================================
echo.

REM 检查是否安装了 Node.js
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 检查是否安装了 pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ 未找到 pnpm，请先安装 pnpm
    echo 安装命令: npm install -g pnpm
    echo.
    pause
    exit /b 1
)

REM 检查是否安装了 Rust
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo ✗ 未找到 Rust，请先安装 Rust
    echo 下载地址: https://rustup.rs/
    echo.
    pause
    exit /b 1
)

REM 安装依赖并运行
echo 正在安装依赖...
call pnpm install

if %errorlevel% neq 0 (
    echo ✗ 依赖安装失败
    pause
    exit /b 1
)

echo.
echo ✓ 准备就绪，启动 NodePass GUI...
echo.

REM 启动应用
call pnpm run tauri dev

echo.
echo 应用已关闭
pause 
 