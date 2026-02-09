# 二进制文件安装指南

本指南适用于下载预编译可执行文件的用户。

## 📥 下载

前往 [Releases 页面](https://github.com/PeterHgg/cf-cdn-optimizer/releases) 下载最新版本：

- **Windows 用户**: `cf-cdn-optimizer-win-x64.zip`
- **Linux 用户**: `cf-cdn-optimizer-linux-x64.tar.gz`
- **macOS 用户**: `cf-cdn-optimizer-macos-x64.tar.gz`

## 🪟 Windows 安装

### 1. 解压文件

右键解压 `cf-cdn-optimizer-win-x64.zip` 到任意目录。

### 2. 运行安装脚本

双击 `install.bat` 或在命令行运行：

```cmd
install.bat
```

这会创建配置文件 `.env` 和数据目录 `data/`。

### 3. 配置 API 密钥

用记事本编辑 `.env` 文件：

```cmd
notepad .env
```

填入您的 Cloudflare 和阿里云 API 密钥：

```env
CF_API_TOKEN=your-cloudflare-api-token
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_ZONE_ID=your-cloudflare-zone-id

ALIYUN_ACCESS_KEY_ID=your-aliyun-access-key-id
ALIYUN_ACCESS_KEY_SECRET=your-aliyun-access-key-secret
```

### 4. 启动服务

双击 `cf-cdn-optimizer-win-x64.exe` 或命令行运行：

```cmd
cf-cdn-optimizer-win-x64.exe
```

### 5. 访问管理界面

打开浏览器访问：`http://localhost:3000`

```
默认账户: admin
默认密码: admin123
```

## 🐧 Linux 安装

### 1. 解压文件

```bash
tar -xzf cf-cdn-optimizer-linux-x64.tar.gz
cd cf-cdn-optimizer-linux-x64
```

### 2. 运行安装脚本

```bash
chmod +x install.sh
./install.sh
```

### 3. 配置 API 密钥

```bash
nano .env
```

填入您的 API 密钥（同 Windows）。

### 4. 启动服务

```bash
./cf-cdn-optimizer-linux-x64
```

### 5. 后台运行（可选）

使用 `systemd` 创建服务：

```bash
sudo nano /etc/systemd/system/cf-cdn-optimizer.service
```

内容：

```ini
[Unit]
Description=CF-CDN-Optimizer Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/cf-cdn-optimizer-linux-x64
ExecStart=/path/to/cf-cdn-optimizer-linux-x64/cf-cdn-optimizer-linux-x64
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable cf-cdn-optimizer
sudo systemctl start cf-cdn-optimizer
sudo systemctl status cf-cdn-optimizer
```

## 🍎 macOS 安装

### 1. 解压文件

```bash
tar -xzf cf-cdn-optimizer-macos-x64.tar.gz
cd cf-cdn-optimizer-macos-x64
```

### 2. 运行安装脚本

```bash
chmod +x install.sh
./install.sh
```

### 3. 配置和启动

同 Linux 步骤。

### 4. 使用 launchd（后台运行，可选）

创建 plist 文件：

```bash
nano ~/Library/LaunchAgents/com.cf-cdn-optimizer.plist
```

内容：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cf-cdn-optimizer</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/cf-cdn-optimizer-macos-x64</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/cf-cdn-optimizer-macos-x64</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

加载服务：

```bash
launchctl load ~/Library/LaunchAgents/com.cf-cdn-optimizer.plist
```

## 🔧 常见问题

### Q: 提示端口已被占用？

修改 `.env` 文件中的端口：

```env
PORT=8080
```

### Q: Windows 提示"无法运行"？

右键可执行文件 → 属性 → 解除锁定。

### Q: Linux 提示权限不足？

```bash
chmod +x cf-cdn-optimizer-linux-x64
```

### Q: 如何更新到新版本？

1. 备份 `.env` 和 `data/` 目录
2. 下载新版本并解压
3. 将备份的文件复制回去
4. 重新启动服务

### Q: 如何卸载？

直接删除整个目录即可。如果配置了系统服务，先停止服务：

**Linux:**
```bash
sudo systemctl stop cf-cdn-optimizer
sudo systemctl disable cf-cdn-optimizer
sudo rm /etc/systemd/system/cf-cdn-optimizer.service
```

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.cf-cdn-optimizer.plist
rm ~/Library/LaunchAgents/com.cf-cdn-optimizer.plist
```

## 📊 系统要求

- **Windows**: Windows 10 或更高版本
- **Linux**: 任何现代发行版（Ubuntu 20.04+, CentOS 8+, Debian 11+ 等）
- **macOS**: macOS 10.15 或更高版本
- **内存**: 建议 512MB+
- **磁盘**: 约 100MB

## 🔐 安全建议

1. ✅ 首次登录后立即修改默认密码
2. ✅ 不要将 `.env` 文件提交到 Git
3. ✅ 建议使用反向代理（Nginx）并启用 HTTPS
4. ✅ 限制管理后台的访问 IP

## 📞 获取帮助

- 📖 查看完整文档：[README.md](../README.md)
- 🐛 报告问题：[GitHub Issues](https://github.com/PeterHgg/cf-cdn-optimizer/issues)
- 💬 讨论：[GitHub Discussions](https://github.com/PeterHgg/cf-cdn-optimizer/discussions)
