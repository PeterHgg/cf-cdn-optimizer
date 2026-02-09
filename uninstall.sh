#!/bin/bash

# CF-CDN-Optimizer 一键卸载脚本

set -e

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${RED}"
echo "========================================="
echo "  CF-CDN-Optimizer 卸载脚本"
echo "========================================="
echo -e "${NC}"

echo -e "${YELLOW}⚠️  此操作将删除以下内容：${NC}"
echo "  - systemd 服务（如果存在）"
echo "  - 数据库文件（可选）"
echo ""

read -p "确定要卸载 CF-CDN-Optimizer 吗? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "已取消卸载"
  exit 0
fi

# 1. 停止并删除 systemd 服务
if [ -f "/etc/systemd/system/cf-cdn-optimizer.service" ]; then
  echo -e "\n${YELLOW}停止并删除 systemd 服务...${NC}"

  if systemctl is-active --quiet cf-cdn-optimizer; then
    sudo systemctl stop cf-cdn-optimizer
    echo -e "${GREEN}✅ 服务已停止${NC}"
  fi

  if systemctl is-enabled --quiet cf-cdn-optimizer; then
    sudo systemctl disable cf-cdn-optimizer
    echo -e "${GREEN}✅ 已禁用开机自启${NC}"
  fi

  sudo rm /etc/systemd/system/cf-cdn-optimizer.service
  sudo systemctl daemon-reload
  echo -e "${GREEN}✅ systemd 服务已删除${NC}"
fi

# 2. 询问是否删除数据库
if [ -d "data" ]; then
  echo ""
  read -p "是否删除数据库文件? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf data
    echo -e "${GREEN}✅ 数据库已删除${NC}"
  else
    echo -e "${YELLOW}⚠️  数据库文件已保留${NC}"
  fi
fi

# 3. 询问是否删除配置文件
if [ -f ".env" ]; then
  echo ""
  read -p "是否删除配置文件 (.env)? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm .env
    echo -e "${GREEN}✅ 配置文件已删除${NC}"
  else
    echo -e "${YELLOW}⚠️  配置文件已保留${NC}"
  fi
fi

# 4. 停止后台进程
echo ""
echo -e "${YELLOW}检查后台进程...${NC}"
PIDS=$(pgrep -f "cf-cdn-optimizer-linux-x64" || true)
if [ -n "$PIDS" ]; then
  echo "发现运行中的进程: $PIDS"
  read -p "是否终止这些进程? (Y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    kill $PIDS 2>/dev/null || true
    sleep 1
    # 强制终止
    kill -9 $PIDS 2>/dev/null || true
    echo -e "${GREEN}✅ 进程已终止${NC}"
  fi
fi

echo ""
echo -e "${GREEN}========================================="
echo "  卸载完成！"
echo "=========================================${NC}"
echo ""
echo "以下文件可手动删除："
echo "  - 可执行文件: cf-cdn-optimizer-linux-x64"
echo "  - 安装脚本: deploy.sh, install.sh"
echo "  - 文档: README.md"
echo ""
