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
    echo "✅ 配置文件已创建: .env"
    echo "⚠️  请编辑 .env 文件，填入您的 API 密钥"
    echo ""
else
    echo "✅ 配置文件已存在: .env"
    echo ""
fi

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
echo "1. 编辑配置文件："
echo "   nano .env"
echo ""
echo "2. 填入您的 API 密钥："
echo "   - Cloudflare API Token"
echo "   - Cloudflare Account ID"
echo "   - Cloudflare Zone ID"
echo "   - 阿里云 Access Key ID"
echo "   - 阿里云 Access Key Secret"
echo ""
echo "3. 启动服务："
echo "   npm run dev     # 开发模式"
echo "   npm start       # 生产模式"
echo ""
echo "4. 访问管理平台："
echo "   http://localhost:3000"
echo ""
echo "5. 默认登录账户："
echo "   用户名: admin"
echo "   密码: admin123"
echo "   ⚠️  请登录后立即修改密码！"
echo ""
echo "========================================="
