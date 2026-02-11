#!/bin/bash

echo "========================================="
echo "  CF-CDN-Optimizer 一键安装脚本"
echo "  Cloudflare CDN 优选加速管理平台"
echo "========================================="
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装 Node.js (v16+)"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 未检测到 npm"
    exit 1
fi

echo "✅ npm 版本: $(npm -v)"
echo ""

# 询问面板端口
read -p "请输入面板端口 (默认: 3000): " PANEL_PORT
PANEL_PORT=${PANEL_PORT:-3000}

# 验证端口号
if ! [[ "$PANEL_PORT" =~ ^[0-9]+$ ]] || [ "$PANEL_PORT" -lt 1 ] || [ "$PANEL_PORT" -gt 65535 ]; then
    echo "❌ 无效的端口号: $PANEL_PORT"
    exit 1
fi

echo "✅ 面板端口: $PANEL_PORT"
echo ""

# 安装依赖
echo "📦 正在安装依赖..."
echo ""

echo "1️⃣  安装后端依赖..."
npm install

echo ""
echo "2️⃣  安装前端依赖..."
cd client && npm install && cd ..

echo ""
echo "✅ 依赖安装完成！"
echo ""

# 配置环境变量
if [ ! -f .env ]; then
    echo "📝 创建配置文件..."
    cp .env.example .env
    # 设置自定义端口
    sed -i "s/^PORT=.*/PORT=$PANEL_PORT/" .env
    echo "✅ 配置文件已创建: .env"
    echo ""
else
    echo "✅ 配置文件已存在: .env"
    # 更新端口
    if grep -q "^PORT=" .env; then
        sed -i "s/^PORT=.*/PORT=$PANEL_PORT/" .env
    else
        echo "PORT=$PANEL_PORT" >> .env
    fi
    echo "✅ 端口已更新为: $PANEL_PORT"
    echo ""
fi

# 生成随机 JWT 密钥
JWT_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '=+/' | head -c 32)
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_KEY/" .env
echo "✅ 已生成随机 JWT 密钥"

# 初始化数据库
echo "🗄️  正在初始化数据库..."
npm run migrate

echo ""
echo "========================================="
echo "  🎉 安装完成！"
echo "========================================="
echo ""
echo "📌 下一步操作："
echo ""
echo "1. 启动服务："
echo "   npm start       # 生产模式"
echo ""
echo "2. 访问管理平台："
echo "   http://your-server-ip:$PANEL_PORT"
echo ""
echo "3. 默认登录账户："
echo "   用户名: admin"
echo "   密码: admin123"
echo "   ⚠️  请登录后立即修改密码！"
echo ""
echo "========================================="
