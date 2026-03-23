#!/bin/bash

# CF-CDN-Optimizer 一键部署脚本
# 适用于已下载 release 可执行文件的用户

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "========================================="
echo "  CF-CDN-Optimizer 一键部署脚本"
echo "  Cloudflare CDN 优选加速管理平台"
echo "========================================="
echo -e "${NC}"

# 检查是否以 root 运行
if [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  建议不要以 root 用户运行${NC}"
  read -p "是否继续? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 1. 检查是否已下载可执行文件
echo -e "\n${BLUE}[1/7] 检查可执行文件...${NC}"
if [ -f "cf-cdn-optimizer-linux-x64" ]; then
  echo -e "${GREEN}✅ 找到可执行文件${NC}"
  chmod +x cf-cdn-optimizer-linux-x64
else
  echo -e "${RED}❌ 未找到可执行文件 cf-cdn-optimizer-linux-x64${NC}"
  echo ""
  echo "请先下载并解压 release 文件："
  echo "  wget https://github.com/PeterHgg/cf-cdn-optimizer/releases/download/v0.1.0/cf-cdn-optimizer-linux-x64.tar.gz"
  echo "  tar -xzf cf-cdn-optimizer-linux-x64.tar.gz"
  exit 1
fi

# 2. 创建配置文件
echo -e "\n${BLUE}[2/7] 配置环境变量...${NC}"
if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠️  .env 文件已存在${NC}"
  read -p "是否覆盖现有配置? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm .env
  else
    echo -e "${GREEN}✅ 保留现有配置${NC}"
  fi
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ 已创建配置文件${NC}"
  else
    echo -e "${YELLOW}⚠️  未找到 .env.example，创建默认配置...${NC}"
    cat > .env << 'EOF'
# 服务器配置
PORT=3000
NODE_ENV=production

# JWT 密钥（请修改为随机字符串）
JWT_SECRET=your-super-secret-jwt-key-change-this

# Cloudflare 配置
CF_API_TOKEN=your-cloudflare-api-token
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_ZONE_ID=your-cloudflare-zone-id

# 阿里云 DNS 配置
ALIYUN_ACCESS_KEY_ID=your-aliyun-access-key-id
ALIYUN_ACCESS_KEY_SECRET=your-aliyun-access-key-secret
ALIYUN_REGION=cn-hangzhou

# 数据库配置
DATABASE_PATH=./data/database.sqlite

# 优选 IP 自动更新（单位：小时）
IP_UPDATE_INTERVAL=24
EOF
    echo -e "${GREEN}✅ 已创建默认配置文件${NC}"
  fi

  echo ""
  echo -e "${YELLOW}⚠️  请编辑 .env 文件，填入您的 API 密钥${NC}"
  echo ""
  read -p "是否现在编辑配置文件? (Y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    ${EDITOR:-nano} .env
  fi
fi

# 3. 创建数据目录
echo -e "\n${BLUE}[3/7] 创建数据目录...${NC}"
mkdir -p data
echo -e "${GREEN}✅ 数据目录已创建${NC}"

# 4. 检查端口占用
echo -e "\n${BLUE}[4/7] 检查端口占用...${NC}"
PORT=$(grep "^PORT=" .env | cut -d'=' -f2 | tr -d ' ')
PORT=${PORT:-3000}

if command -v lsof &> /dev/null; then
  if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${RED}❌ 端口 $PORT 已被占用${NC}"
    echo "请修改 .env 中的 PORT 配置或停止占用该端口的程序"
    exit 1
  else
    echo -e "${GREEN}✅ 端口 $PORT 可用${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  无法检查端口占用（lsof 未安装）${NC}"
fi

# 5. 创建 systemd 服务（可选）
echo -e "\n${BLUE}[5/7] 配置系统服务...${NC}"
read -p "是否创建 systemd 服务（开机自启）? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  INSTALL_DIR=$(pwd)
  SERVICE_FILE="/etc/systemd/system/cf-cdn-optimizer.service"

  if [ -w /etc/systemd/system ]; then
    SUDO=""
  else
    SUDO="sudo"
  fi

  $SUDO tee $SERVICE_FILE > /dev/null << EOF
[Unit]
Description=CF-CDN-Optimizer Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
ExecStart=$INSTALL_DIR/cf-cdn-optimizer-linux-x64
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cf-cdn-optimizer

[Install]
WantedBy=multi-user.target
EOF

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable cf-cdn-optimizer

  $SUDO tee /usr/local/bin/alidns-endpoint-guard.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

HOST="alidns.cn-hangzhou.aliyuncs.com"
IPS=("47.74.138.70" "47.241.205.161" "47.111.202.72" "101.37.132.1" "47.111.202.102")
HOSTS_FILE="/etc/hosts"

is_ok() {
  local ip="$1"
  curl -4 -I --connect-timeout 4 --max-time 8 --resolve "${HOST}:443:${ip}" "https://${HOST}/" >/dev/null 2>&1
}

pick_ip=""
for ip in "${IPS[@]}"; do
  if is_ok "$ip"; then
    pick_ip="$ip"
    break
  fi
done

if [[ -z "$pick_ip" ]]; then
  echo "[alidns-guard] no healthy IP found" >&2
  exit 1
fi

current_ip="$(awk -v h="$HOST" '$2==h{print $1; exit}' "$HOSTS_FILE" || true)"
if [[ "$current_ip" == "$pick_ip" ]]; then
  echo "[alidns-guard] keep $HOST -> $pick_ip"
  exit 0
fi

tmp_file="$(mktemp)"
awk -v h="$HOST" '$2!=h{print}' "$HOSTS_FILE" > "$tmp_file"
printf "%s %s\n" "$pick_ip" "$HOST" >> "$tmp_file"
cat "$tmp_file" > "$HOSTS_FILE"
rm -f "$tmp_file"

echo "[alidns-guard] switched $HOST: ${current_ip:-none} -> $pick_ip"
EOF

  $SUDO chmod +x /usr/local/bin/alidns-endpoint-guard.sh

  $SUDO tee /etc/systemd/system/alidns-endpoint-guard.service > /dev/null <<'EOF'
[Unit]
Description=AliDNS endpoint guard
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/alidns-endpoint-guard.sh
EOF

  $SUDO tee /etc/systemd/system/alidns-endpoint-guard.timer > /dev/null <<'EOF'
[Unit]
Description=Run AliDNS endpoint guard every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min
Unit=alidns-endpoint-guard.service

[Install]
WantedBy=timers.target
EOF

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now alidns-endpoint-guard.timer
  $SUDO systemctl start alidns-endpoint-guard.service || true

  echo -e "${GREEN}✅ systemd 服务已创建${NC}"
  echo -e "${GREEN}✅ AliDNS 端点健康守护已启用${NC}"
  SERVICE_CREATED=true
else
  SERVICE_CREATED=false
fi

# 6. 测试运行
echo -e "\n${BLUE}[6/7] 检查配置...${NC}"

# 检查必需的配置项
MISSING_CONFIG=false

if grep -q "your-cloudflare-api-token" .env 2>/dev/null; then
  echo -e "${YELLOW}⚠️  Cloudflare API Token 未配置${NC}"
  MISSING_CONFIG=true
fi

if grep -q "your-aliyun-access-key-id" .env 2>/dev/null; then
  echo -e "${YELLOW}⚠️  阿里云 Access Key 未配置${NC}"
  MISSING_CONFIG=true
fi

if [ "$MISSING_CONFIG" = true ]; then
  echo ""
  echo -e "${YELLOW}配置文件中有未填写的项，服务可能无法正常运行${NC}"
  echo "请编辑 .env 文件填写完整配置"
fi

# 7. 完成部署
echo -e "\n${BLUE}[7/7] 部署完成！${NC}"
echo ""
echo -e "${GREEN}========================================="
echo "  🎉 部署成功！"
echo "=========================================${NC}"
echo ""

if [ "$SERVICE_CREATED" = true ]; then
  echo "📌 启动服务："
  echo "  sudo systemctl start cf-cdn-optimizer"
  echo ""
  echo "📊 查看状态："
  echo "  sudo systemctl status cf-cdn-optimizer"
  echo ""
  echo "📋 查看日志："
  echo "  sudo journalctl -u cf-cdn-optimizer -f"
  echo ""
  echo "🛑 停止服务："
  echo "  sudo systemctl stop cf-cdn-optimizer"
  echo ""
else
  echo "📌 启动服务："
  echo "  ./cf-cdn-optimizer-linux-x64"
  echo ""
  echo "📌 后台运行："
  echo "  nohup ./cf-cdn-optimizer-linux-x64 > cf-cdn-optimizer.log 2>&1 &"
  echo ""
  echo "📋 查看日志："
  echo "  tail -f cf-cdn-optimizer.log"
  echo ""
fi

echo "🌐 访问管理界面："
echo "  http://localhost:$PORT"
echo ""
echo "🔑 默认账户："
echo "  用户名: admin"
echo "  密码: admin123"
echo -e "  ${RED}⚠️  请登录后立即修改密码！${NC}"
echo ""
echo "========================================="
echo ""

# 询问是否立即启动
read -p "是否立即启动服务? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  if [ "$SERVICE_CREATED" = true ]; then
    sudo systemctl start cf-cdn-optimizer
    sleep 2
    sudo systemctl status cf-cdn-optimizer --no-pager
  else
    echo "正在启动服务..."
    ./cf-cdn-optimizer-linux-x64 &
    sleep 2
    echo ""
    echo -e "${GREEN}✅ 服务已在后台启动${NC}"
    echo "访问: http://localhost:$PORT"
  fi
fi

echo ""
echo -e "${GREEN}部署完成！感谢使用 CF-CDN-Optimizer${NC}"
