#!/bin/bash

# CF-CDN-Optimizer 一键安装脚本
# 用法: curl -fsSL https://raw.githubusercontent.com/PeterHgg/cf-cdn-optimizer/master/install-online.sh | bash
# 或者: wget -qO- https://raw.githubusercontent.com/PeterHgg/cf-cdn-optimizer/master/install-online.sh | bash

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION="v0.1.11"
REPO="PeterHgg/cf-cdn-optimizer"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/cf-cdn-optimizer-linux-x64.tar.gz"
INSTALL_DIR="$HOME/cf-cdn-optimizer"

# 显示 Banner
show_banner() {
  echo -e "${BLUE}"
  cat << "EOF"
  ______ _____       ____ _____  _   _        ____        _   _           _
 / _____|  ___|     / ___|  __ \| \ | |      / __ \      | | (_)         (_)
| |     | |_ ______| |   | |  | |  \| |_____| |  | |_ __ | |_ _ _ __ ___  _ _______ _ __
| |     |  _|______| |   | |  | | . ` |_____| |  | | '_ \| __| | '_ ` _ \| |_  / _ \ '__|
| |_____| |        | |___| |__| | |\  |     | |__| | |_) | |_| | | | | | | |/ /  __/ |
 \______|_|         \____|_____/|_| \_|      \____/| .__/ \__|_|_| |_| |_|_/___\___|_|
                                                    | |
                                                    |_|
EOF
  echo -e "${NC}"
  echo -e "${GREEN}Cloudflare CDN 优选加速管理平台${NC}"
  echo -e "${BLUE}=========================================${NC}"
  echo ""
}

# 检查系统环境
check_system() {
  echo -e "${BLUE}检查系统环境...${NC}"

  if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo -e "${RED}❌ 此脚本仅支持 Linux 系统${NC}"
    exit 1
  fi

  ARCH=$(uname -m)
  if [[ "$ARCH" != "x86_64" ]]; then
    echo -e "${RED}❌ 仅支持 x86_64 架构，当前架构: $ARCH${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ 系统检查通过: Linux x86_64${NC}"
}

# 检查必需工具
check_tools() {
  echo -e "${BLUE}检查必需工具...${NC}"

  MISSING_TOOLS=""

  if ! command -v curl &> /dev/null && ! command -v wget &> /dev/null; then
    MISSING_TOOLS="${MISSING_TOOLS}curl 或 wget\n"
  fi

  if ! command -v tar &> /dev/null; then
    MISSING_TOOLS="${MISSING_TOOLS}tar\n"
  fi

  if [ -n "$MISSING_TOOLS" ]; then
    echo -e "${RED}❌ 缺少必需工具:${NC}"
    echo -e "$MISSING_TOOLS"
    echo "请先安装: sudo apt install curl tar  (Debian/Ubuntu)"
    echo "或: sudo yum install curl tar  (CentOS/RHEL)"
    exit 1
  fi

  echo -e "${GREEN}✅ 工具检查通过${NC}"
}

# 停止服务
stop_service() {
  if systemctl is-active --quiet cf-cdn-optimizer 2>/dev/null; then
    echo "停止现有服务..."
    sudo systemctl stop cf-cdn-optimizer 2>/dev/null || true
  fi
  pkill -f "cf-cdn-optimizer-linux-x64" 2>/dev/null || true
  sleep 2
}

# 安装功能
do_install() {
  echo ""
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}开始安装 CF-CDN-Optimizer${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo ""

  if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  检测到已有安装: $INSTALL_DIR${NC}"
    echo -e "${YELLOW}⚠️  请选择【更新】或【卸载】后重新安装${NC}"
    exit 1
  fi

  check_system
  check_tools

  echo -e "${BLUE}准备安装目录...${NC}"
  mkdir -p "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  echo -e "${GREEN}✅ 安装目录: $INSTALL_DIR${NC}"

  echo -e "${BLUE}下载最新版本 ${VERSION}...${NC}"
  TEMP_FILE=$(mktemp)
  if command -v curl &> /dev/null; then
    curl -L --progress-bar -o "$TEMP_FILE" "$DOWNLOAD_URL" || {
      echo -e "${RED}❌ 下载失败${NC}"
      rm -f "$TEMP_FILE"
      exit 1
    }
  elif command -v wget &> /dev/null; then
    wget --show-progress -O "$TEMP_FILE" "$DOWNLOAD_URL" || {
      echo -e "${RED}❌ 下载失败${NC}"
      rm -f "$TEMP_FILE"
      exit 1
    }
  fi
  echo -e "${GREEN}✅ 下载完成${NC}"

  echo -e "${BLUE}解压文件...${NC}"
  tar -xzf "$TEMP_FILE" -C "$INSTALL_DIR"
  rm -f "$TEMP_FILE"

  chmod +x "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" 2>/dev/null || true
  chmod +x "$INSTALL_DIR/deploy.sh" 2>/dev/null || true
  chmod +x "$INSTALL_DIR/uninstall.sh" 2>/dev/null || true
  echo -e "${GREEN}✅ 解压完成${NC}"

  echo -e "${BLUE}配置并启动服务...${NC}"

  if [ ! -f "$INSTALL_DIR/.env" ]; then
    if [ -f "$INSTALL_DIR/.env.example" ]; then
      cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    fi
  fi

  mkdir -p "$INSTALL_DIR/data"

  # 创建 systemd 服务
  sudo tee /etc/systemd/system/cf-cdn-optimizer.service > /dev/null <<EOF
[Unit]
Description=CF-CDN-Optimizer Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/cf-cdn-optimizer-linux-x64
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # 重载 systemd 并启动服务
  sudo systemctl daemon-reload
  sudo systemctl enable cf-cdn-optimizer
  sudo systemctl start cf-cdn-optimizer

  # 等待服务启动
  sleep 3

  # 检查服务状态
  if systemctl is-active --quiet cf-cdn-optimizer; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  🎉 安装完成！${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "${GREEN}✅ 服务已启动并设置为开机自启${NC}"
    echo ""
    echo -e "📡 访问地址: ${GREEN}http://localhost:3000${NC}"
    echo -e "📡 外部访问: ${GREEN}http://$(curl -s ip.sb || echo "YOUR_SERVER_IP"):3000${NC}"
    echo ""
    echo -e "${YELLOW}👤 默认登录信息：${NC}"
    echo "   用户名: admin"
    echo "   密码: admin123"
    echo ""
    echo -e "${RED}⚠️  首次登录后，请在【设置】页面配置 API 密钥${NC}"
    echo ""
    echo -e "${BLUE}常用命令：${NC}"
    echo "   查看状态: sudo systemctl status cf-cdn-optimizer"
    echo "   查看日志: sudo journalctl -u cf-cdn-optimizer -f"
    echo "   重启服务: sudo systemctl restart cf-cdn-optimizer"
    echo "   停止服务: sudo systemctl stop cf-cdn-optimizer"
    echo ""
  else
    echo -e "${RED}❌ 服务启动失败，请查看日志${NC}"
    echo "sudo journalctl -u cf-cdn-optimizer -n 50"
    exit 1
  fi
}

# 更新功能
do_update() {
  echo ""
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}开始更新 CF-CDN-Optimizer${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo ""

  if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}❌ 未检测到已有安装${NC}"
    echo -e "${YELLOW}请先选择【安装】${NC}"
    exit 1
  fi

  check_system
  check_tools

  echo -e "${BLUE}准备更新目录...${NC}"
  echo -e "${YELLOW}⚠️  使用更新模式（保留数据和配置）${NC}"

  # 停止现有服务
  stop_service

  # 备份当前可执行文件
  if [ -f "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" ]; then
    mv "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" "$INSTALL_DIR/cf-cdn-optimizer-linux-x64.bak"
    echo -e "${GREEN}✅ 已备份旧版本可执行文件${NC}"
  fi

  cd "$INSTALL_DIR"
  echo -e "${GREEN}✅ 安装目录: $INSTALL_DIR${NC}"

  echo -e "${BLUE}下载最新版本 ${VERSION}...${NC}"
  TEMP_FILE=$(mktemp)
  if command -v curl &> /dev/null; then
    curl -L --progress-bar -o "$TEMP_FILE" "$DOWNLOAD_URL" || {
      echo -e "${RED}❌ 下载失败${NC}"
      rm -f "$TEMP_FILE"
      exit 1
    }
  elif command -v wget &> /dev/null; then
    wget --show-progress -O "$TEMP_FILE" "$DOWNLOAD_URL" || {
      echo -e "${RED}❌ 下载失败${NC}"
      rm -f "$TEMP_FILE"
      exit 1
    }
  fi
  echo -e "${GREEN}✅ 下载完成${NC}"

  echo -e "${BLUE}解压文件...${NC}"
  tar -xzf "$TEMP_FILE" -C "$INSTALL_DIR"
  rm -f "$TEMP_FILE"

  chmod +x "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" 2>/dev/null || true
  chmod +x "$INSTALL_DIR/deploy.sh" 2>/dev/null || true
  chmod +x "$INSTALL_DIR/uninstall.sh" 2>/dev/null || true
  echo -e "${GREEN}✅ 解压完成${NC}"

  echo -e "${BLUE}重启服务...${NC}"

  # 重载 systemd 并启动服务
  sudo systemctl daemon-reload
  sudo systemctl start cf-cdn-optimizer

  # 等待服务启动
  sleep 3

  # 检查服务状态
  if systemctl is-active --quiet cf-cdn-optimizer; then
    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  🎉 更新完成！${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "${GREEN}✅ 服务已重启${NC}"
    echo ""
    echo -e "📡 访问地址: ${GREEN}http://localhost:3000${NC}"
    echo ""
  else
    echo -e "${RED}❌ 服务启动失败，请查看日志${NC}"
    echo "sudo journalctl -u cf-cdn-optimizer -n 50"
    exit 1
  fi
}

# 卸载功能
do_uninstall() {
  echo ""
  echo -e "${YELLOW}=========================================${NC}"
  echo -e "${YELLOW}开始卸载 CF-CDN-Optimizer${NC}"
  echo -e "${YELLOW}=========================================${NC}"
  echo ""

  if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}❌ 未检测到已有安装${NC}"
    exit 1
  fi

  # 停止并禁用服务
  echo -e "${BLUE}停止服务...${NC}"
  stop_service

  if systemctl is-enabled --quiet cf-cdn-optimizer 2>/dev/null; then
    sudo systemctl disable cf-cdn-optimizer 2>/dev/null || true
  fi

  # 删除 systemd 服务文件
  if [ -f "/etc/systemd/system/cf-cdn-optimizer.service" ]; then
    sudo rm -f /etc/systemd/system/cf-cdn-optimizer.service
    sudo systemctl daemon-reload
    echo -e "${GREEN}✅ 已删除 systemd 服务${NC}"
  fi

  # 备份数据库
  if [ -f "$INSTALL_DIR/data/database.sqlite" ]; then
    BACKUP_FILE="$HOME/cf-cdn-optimizer-backup-$(date +%Y%m%d-%H%M%S).sqlite"
    cp "$INSTALL_DIR/data/database.sqlite" "$BACKUP_FILE"
    echo -e "${GREEN}✅ 数据库已备份到: $BACKUP_FILE${NC}"
  fi

  # 删除安装目录
  echo -e "${BLUE}删除安装目录...${NC}"
  rm -rf "$INSTALL_DIR"
  echo -e "${GREEN}✅ 已删除安装目录${NC}"

  echo ""
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}  🎉 卸载完成！${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo ""
  if [ -f "$BACKUP_FILE" ]; then
    echo -e "${YELLOW}数据库备份: $BACKUP_FILE${NC}"
    echo ""
  fi
}

# 显示菜单
show_menu() {
  show_banner

  # 检测安装状态
  if [ -d "$INSTALL_DIR" ]; then
    echo -e "${GREEN}✅ 检测到已安装: $INSTALL_DIR${NC}"
  else
    echo -e "${YELLOW}⚠️  未检测到已有安装${NC}"
  fi
  echo ""

  echo "请选择操作："
  echo "  1) 安装"
  echo "  2) 更新"
  echo "  3) 卸载"
  echo "  4) 退出"
  echo ""
}

# 主程序
main() {
  # 如果通过管道执行，使用 /dev/tty 读取输入
  if [ ! -t 0 ]; then
    exec < /dev/tty
  fi

  show_menu

  read -p "请输入选项 [1-4]: " -n 1 -r
  echo ""
  echo ""

  case $REPLY in
    1)
      do_install
      ;;
    2)
      do_update
      ;;
    3)
      do_uninstall
      ;;
    4)
      echo "已退出"
      exit 0
      ;;
    *)
      echo -e "${RED}❌ 无效选项${NC}"
      exit 1
      ;;
  esac

  echo ""
  echo -e "${GREEN}感谢使用 CF-CDN-Optimizer！${NC}"

  # 明确退出，避免挂起
  exit 0
}

main
