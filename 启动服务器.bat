@echo off
echo ========================================
echo 待办事项管理系统启动器
echo ========================================
echo.

cd /d "%~dp0"

echo 正在检查Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Node.js，请先安装Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js已找到
echo.

echo 正在安装依赖...
call npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo 启动服务器中...
echo ========================================
echo.
echo 本地访问: http://localhost:3000
echo 局域网访问: http://YOUR_IP:3000
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

npm start
