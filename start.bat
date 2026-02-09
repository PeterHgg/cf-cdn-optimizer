@echo off
chcp 65001 >nul
echo 正在启动 CF-CDN-Optimizer...
echo.

REM 检查配置文件
if not exist .env (
    echo ❌ 配置文件不存在，请先运行 install.bat
    pause
    exit /b 1
)

REM 构建前端
echo 📦 构建前端...
cd client
call npm run build
cd ..

echo.
echo 🚀 启动服务...
call npm start
