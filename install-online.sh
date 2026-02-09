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

VERSION="v0.1.4"
REPO="PeterHgg/cf-cdn-optimizer"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/cf-cdn-optimizer-linux-x64.tar.gz"
INSTALL_DIR="$HOME/cf-cdn-optimizer"

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
echo -e "${GREEN}Cloudflare CDN 优选加速管理平台 - 一键安装脚本${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# 检查系统
echo -e "${BLUE}[1/6] 检查系统环境...${NC}"

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

# 检查必需工具
echo -e "\n${BLUE}[2/6] 检查必需工具...${NC}"

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

# 准备安装目录
echo -e "\n${BLUE}[3/6] 准备安装目录...${NC}"

UPDATE_MODE=false
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}⚠️  检测到已有安装，使用更新模式（保留数据和配置）${NC}"
  UPDATE_MODE=true

  # 停止现有服务
  if systemctl is-active --quiet cf-cdn-optimizer 2>/dev/null; then
    sudo systemctl stop cf-cdn-optimizer 2>/dev/null || true
  fi
  pkill -f "cf-cdn-optimizer-linux-x64" 2>/dev/null || true
  sleep 2

  # 备份当前可执行文件
  if [ -f "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" ]; then
    mv "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" "$INSTALL_DIR/cf-cdn-optimizer-linux-x64.bak"
    echo -e "${GREEN}✅ 已备份旧版本可执行文件${NC}"
  fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo -e "${GREEN}✅ 安装目录: $INSTALL_DIR${NC}"

# 下载 Release
echo -e "\n${BLUE}[4/6] 下载最新版本 ${VERSION}...${NC}"

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

# 解压
echo -e "\n${BLUE}[5/6] 解压文件...${NC}"
tar -xzf "$TEMP_FILE" -C "$INSTALL_DIR"
rm -f "$TEMP_FILE"

chmod +x "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" 2>/dev/null || true
chmod +x "$INSTALL_DIR/deploy.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/uninstall.sh" 2>/dev/null || true

echo -e "${GREEN}✅ 解压完成${NC}"

# 初始化配置
echo -e "\n${BLUE}[6/6] 配置并启动服务...${NC}"

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

echo -e "${GREEN}感谢使用 CF-CDN-Optimizer！${NC}"
INSTALL_DIR="$HOME/cf-cdn-optimizer"

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
echo -e "${GREEN}Cloudflare CDN 优选加速管理平台 - 一键安装脚本${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# 检查系统
echo -e "${BLUE}[1/6] 检查系统环境...${NC}"

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

# 检查必需工具
echo -e "\n${BLUE}[2/6] 检查必需工具...${NC}"

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

# 创建安装目录
echo -e "\n${BLUE}[3/6] 准备安装目录...${NC}"

UPDATE_MODE=false
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}⚠️  检测到已有安装: $INSTALL_DIR${NC}"
  echo ""
  echo "请选择操作："
  echo "  1) 更新 (保留数据和配置)"
  echo "  2) 全新安装 (删除所有数据)"
  echo "  3) 取消"
  echo ""
  read -p "请输入选项 [1-3]: " -n 1 -r
  echo

  case $REPLY in
    1)
      echo -e "${GREEN}选择: 更新模式${NC}"
      UPDATE_MODE=true

      # 停止现有服务
      echo "停止现有服务..."
      if systemctl is-active --quiet cf-cdn-optimizer 2>/dev/null; then
        sudo systemctl stop cf-cdn-optimizer 2>/dev/null || true
      fi
      pkill -f "cf-cdn-optimizer-linux-x64" 2>/dev/null || true
      sleep 2

      # 备份当前可执行文件
      if [ -f "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" ]; then
        mv "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" "$INSTALL_DIR/cf-cdn-optimizer-linux-x64.bak"
        echo -e "${GREEN}✅ 已备份旧版本可执行文件${NC}"
      fi
      ;;
    2)
      echo -e "${YELLOW}选择: 全新安装${NC}"

      # 停止可能运行的服务
      if systemctl is-active --quiet cf-cdn-optimizer 2>/dev/null; then
        echo "停止现有服务..."
        sudo systemctl stop cf-cdn-optimizer 2>/dev/null || true
      fi
      pkill -f "cf-cdn-optimizer-linux-x64" 2>/dev/null || true

      # 备份数据库
      if [ -f "$INSTALL_DIR/data/database.sqlite" ]; then
        BACKUP_FILE="$HOME/cf-cdn-optimizer-backup-$(date +%Y%m%d-%H%M%S).sqlite"
        cp "$INSTALL_DIR/data/database.sqlite" "$BACKUP_FILE"
        echo -e "${GREEN}✅ 数据库已备份到: $BACKUP_FILE${NC}"
      fi

      rm -rf "$INSTALL_DIR"
      ;;
    *)
      echo "安装已取消"
      exit 0
      ;;
  esac
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo -e "${GREEN}✅ 安装目录: $INSTALL_DIR${NC}"

# 下载 Release
echo -e "\n${BLUE}[4/6] 下载最新版本 ${VERSION}...${NC}"

TEMP_FILE=$(mktemp)
if command -v curl &> /dev/null; then
  echo "使用 curl 下载..."
  curl -L --progress-bar -o "$TEMP_FILE" "$DOWNLOAD_URL" || {
    echo -e "${RED}❌ 下载失败${NC}"
    rm -f "$TEMP_FILE"
    exit 1
  }
elif command -v wget &> /dev/null; then
  echo "使用 wget 下载..."
  wget --show-progress -O "$TEMP_FILE" "$DOWNLOAD_URL" || {
    echo -e "${RED}❌ 下载失败${NC}"
    rm -f "$TEMP_FILE"
    exit 1
  }
fi

echo -e "${GREEN}✅ 下载完成${NC}"

# 解压
echo -e "\n${BLUE}[5/6] 解压文件...${NC}"
tar -xzf "$TEMP_FILE" -C "$INSTALL_DIR"
rm -f "$TEMP_FILE"

chmod +x "$INSTALL_DIR/cf-cdn-optimizer-linux-x64" 2>/dev/null || true
chmod +x "$INSTALL_DIR/deploy.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/install.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/uninstall.sh" 2>/dev/null || true

echo -e "${GREEN}✅ 解压完成${NC}"

# 配置
echo -e "\n${BLUE}[6/6] 初始化配置...${NC}"

if [ ! -f "$INSTALL_DIR/.env" ]; then
  if [ -f "$INSTALL_DIR/.env.example" ]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    echo -e "${GREEN}✅ 配置文件已创建${NC}"
  fi
fi

mkdir -p "$INSTALL_DIR/data"

# 完成
echo ""
echo -e "${GREEN}========================================="
echo "  🎉 安装完成！"
echo "=========================================${NC}"
echo ""
echo -e "${BLUE}📍 安装位置:${NC} $INSTALL_DIR"
echo ""
echo -e "${YELLOW}⚠️  下一步操作：${NC}"
echo ""
echo "1️⃣  进入安装目录："
echo -e "   ${GREEN}cd $INSTALL_DIR${NC}"
echo ""
echo "2️⃣  编辑配置文件（必需）："
echo -e "   ${GREEN}nano .env${NC}"
echo ""
echo "   需要填写以下配置："
echo "   - CF_API_TOKEN (Cloudflare API Token)"
echo "   - CF_ACCOUNT_ID (Cloudflare Account ID)"
echo "   - CF_ZONE_ID (Cloudflare Zone ID)"
echo "   - ALIYUN_ACCESS_KEY_ID (阿里云 Access Key)"
echo "   - ALIYUN_ACCESS_KEY_SECRET (阿里云 Secret)"
echo ""
echo "3️⃣  启动服务："
echo ""
echo -e "   ${BLUE}方式 A - 直接运行:${NC}"
echo -e "   ${GREEN}./cf-cdn-optimizer-linux-x64${NC}"
echo ""
echo -e "   ${BLUE}方式 B - 使用一键部署脚本（推荐）:${NC}"
echo -e "   ${GREEN}./deploy.sh${NC}"
echo "   (包含 systemd 服务、开机自启等功能)"
echo ""
echo "4️⃣  访问管理界面："
echo -e "   ${GREEN}http://localhost:3000${NC}"
echo ""
echo "   默认账户: admin"
echo "   默认密码: admin123"
echo -e "   ${RED}⚠️  请登录后立即修改密码！${NC}"
echo ""
echo -e "${BLUE}=========================================${NC}"
echo ""
echo "📚 完整文档: https://github.com/${REPO}"
echo "🐛 问题反馈: https://github.com/${REPO}/issues"
echo ""

# 自动启动服务
echo ""
read -p "是否立即启动服务? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  if [ -f "$INSTALL_DIR/deploy.sh" ]; then
    echo -e "${BLUE}运行部署脚本（推荐，包含 systemd 服务）...${NC}"
    bash "$INSTALL_DIR/deploy.sh"
  else
    echo -e "${BLUE}启动服务...${NC}"
    cd "$INSTALL_DIR"
    nohup ./cf-cdn-optimizer-linux-x64 > cf-cdn-optimizer.log 2>&1 &
    sleep 3

    if pgrep -f "cf-cdn-optimizer-linux-x64" > /dev/null; then
      echo -e "${GREEN}✅ 服务已在后台启动${NC}"
      echo ""
      echo -e "${GREEN}=========================================${NC}"
      echo -e "${GREEN}  🎉 安装完成！请访问 Web 管理界面${NC}"
      echo -e "${GREEN}=========================================${NC}"
      echo ""
      echo -e "📡 访问地址: ${GREEN}http://localhost:3000${NC}"
      echo ""
      echo -e "${YELLOW}👤 默认登录信息：${NC}"
      echo "   用户名: admin"
      echo "   密码: admin123"
      echo ""
      echo -e "${RED}⚠️  首次登录后，请在【设置】页面配置 API 密钥：${NC}"
      echo "   - Cloudflare API Token"
      echo "   - Cloudflare Account ID"
      echo "   - Cloudflare Zone ID"
      echo "   - 阿里云 Access Key ID"
      echo "   - 阿里云 Access Key Secret"
      echo ""
      echo -e "📋 查看日志: ${GREEN}tail -f $INSTALL_DIR/cf-cdn-optimizer.log${NC}"
      echo -e "🛑 停止服务: ${YELLOW}pkill -f cf-cdn-optimizer-linux-x64${NC}"
      echo -e "🔄 重启服务: ${YELLOW}$INSTALL_DIR/cf-cdn-optimizer-linux-x64 &${NC}"
    else
      echo -e "${RED}❌ 服务启动失败，请查看日志${NC}"
      echo -e "日志文件: $INSTALL_DIR/cf-cdn-optimizer.log"
    fi
  fi
fi

echo ""
echo -e "${GREEN}感谢使用 CF-CDN-Optimizer！${NC}"
