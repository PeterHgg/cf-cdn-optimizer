#!/bin/bash

echo "正在启动 CF-CDN-Optimizer..."
echo ""

# 检查配置文件
if [ ! -f .env ]; then
    echo "❌ 配置文件不存在，请先运行 install.sh"
    exit 1
fi

# 构建前端
echo "📦 构建前端..."
cd client && npm run build && cd ..

echo ""
echo "🚀 启动服务..."
npm start
