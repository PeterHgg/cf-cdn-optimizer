# CF-CDN-Optimizer

<p align="center">
  <h1 align="center">Cloudflare CDN 优选加速管理平台</h1>
</p>

<p align="center">
  自动化管理 Cloudflare 自定义主机名 + 阿里云 DNS 优选 IP，实现境内外分流加速
</p>

## ✨ 功能特性

- 🚀 **一键部署**：自动化配置 Cloudflare 自定义主机名和阿里云 DNS
- 🌍 **智能分流**：境外访问走 Cloudflare CDN，境内访问走优选 IP
- 🔧 **灵活配置**：支持自定义 Origin 端口，突破 SaaS 443 端口限制
- 📊 **可视化管理**：现代化的 Web 管理界面
- 🔄 **自动验证**：自动完成域名验证流程
- 💾 **轻量数据库**：使用 SQLite，无需额外配置
- 🎯 **优选 IP 池**：内置优选 IP，支持自动/手动配置

## 🎯 使用场景

假设您有两个域名：
- `123.xyz` - 在阿里云 DNS
- `abc.xyz` - 在 Cloudflare

**传统配置流程：**
1. Cloudflare 配置自定义主机名，回退源是 `back.abc.xyz`
2. 阿里云 DNS 配置 `cdn.123.xyz`：
   - 境外地区 → `back.abc.xyz`
   - 中国大陆 → 优选 IP

**使用本平台：**
只需在 Web 界面点击几下，自动完成所有配置！

## 📦 技术栈

- **后端**: Node.js + Express
- **前端**: Vue 3 + Element Plus
- **数据库**: SQLite
- **API 集成**:
  - Cloudflare API
  - 阿里云 DNS API

## 🚀 快速开始

### 方式一：下载预编译可执行文件（推荐）

**适合普通用户，无需安装 Node.js**

1. 前往 [Releases 页面](https://github.com/PeterHgg/cf-cdn-optimizer/releases) 下载对应系统的压缩包
2. 解压并运行安装脚本
3. 配置 `.env` 文件
4. 启动可执行文件

详细步骤请查看：[二进制文件安装指南](docs/BINARY_INSTALL.md)

### 方式二：从源码安装

**适合开发者或需要自定义的用户**

#### 环境要求

- Node.js 16+
- npm 或 yarn

#### 一键安装

**Linux/macOS:**
```bash
chmod +x install.sh
./install.sh
```

**Windows:**
```cmd
install.bat
```

### 手动安装

```bash
# 1. 安装依赖
npm install
cd client && npm install && cd ..

# 2. 配置环境变量
cp .env.example .env
nano .env  # 编辑配置文件

# 3. 初始化数据库
npm run migrate

# 4. 启动服务
npm run dev  # 开发模式
npm start    # 生产模式
```

### 配置说明

编辑 `.env` 文件，填入以下信息：

```bash
# Cloudflare 配置
CF_API_TOKEN=your-cloudflare-api-token
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_ZONE_ID=your-cloudflare-zone-id

# 阿里云 DNS 配置
ALIYUN_ACCESS_KEY_ID=your-aliyun-access-key-id
ALIYUN_ACCESS_KEY_SECRET=your-aliyun-access-key-secret
```

#### 获取 Cloudflare API Token

1. 登录 Cloudflare Dashboard
2. 进入 `My Profile` → `API Tokens`
3. 创建 Token，权限：
   - Zone - DNS - Edit
   - Zone - Zone - Read
   - Account - Custom Hostnames - Edit

#### 获取阿里云 Access Key

1. 登录阿里云控制台
2. 进入 `AccessKey 管理`
3. 创建 AccessKey（建议使用 RAM 子账户）

## 📖 使用说明

### 1. 登录系统

访问 `http://localhost:3000`

```
默认账户: admin
默认密码: admin123
```

⚠️ **请登录后立即修改密码！**

### 2. 配置 API 密钥

进入 `系统设置` → `API 配置`，测试 Cloudflare 和阿里云连接是否正常。

### 3. 添加优选 IP

进入 `优选 IP 池`，可以：
- 使用内置的默认优选 IP/域名
- 手动添加自己的优选 IP
- 自动测试延迟

### 4. 创建域名配置

进入 `域名管理` → `添加域名`：

```
子域名: cdn
根域名: 123.xyz
回退源: back.abc.xyz
优选 IP: japan.com
```

点击创建后，系统会自动：
1. ✅ 在 Cloudflare 创建自定义主机名
2. ✅ 在阿里云配置分地区 DNS 解析
3. ✅ 返回域名验证记录（如需要）

### 5. 配置 Origin 规则（可选）

如果需要自定义回源端口（例如 SaaS 应用监听在 54321 端口）：

1. 进入域名详情
2. 添加 Origin 规则：
   ```
   匹配模式: https://panel.123.xyz*
   源主机: your-server-ip
   端口: 54321
   ```

这样访问 `https://panel.123.xyz` 时会回源到服务器的 54321 端口。

## 📁 项目结构

```
cf-cdn-optimizer/
├── server/                 # 后端代码
│   ├── database/          # 数据库相关
│   │   ├── db.js         # 数据库连接
│   │   └── migrate.js    # 数据库迁移
│   ├── routes/           # API 路由
│   │   ├── auth.js       # 认证路由
│   │   ├── domains.js    # 域名管理
│   │   ├── cloudflare.js # Cloudflare API
│   │   ├── aliyun.js     # 阿里云 API
│   │   └── optimizedIps.js # 优选 IP 管理
│   ├── services/         # 服务层
│   │   ├── cloudflare.js # Cloudflare 服务
│   │   └── aliyun.js     # 阿里云服务
│   ├── tasks/            # 定时任务
│   │   └── ipUpdater.js  # IP 延迟更新
│   └── index.js          # 入口文件
├── client/               # 前端代码
│   ├── src/
│   │   ├── views/        # 页面组件
│   │   ├── layouts/      # 布局组件
│   │   ├── router/       # 路由配置
│   │   ├── stores/       # 状态管理
│   │   └── api/          # API 封装
│   └── package.json
├── data/                 # 数据目录（SQLite 数据库）
├── .env.example          # 配置文件示例
├── install.sh           # Linux/macOS 安装脚本
├── install.bat          # Windows 安装脚本
├── start.sh             # Linux/macOS 启动脚本
├── start.bat            # Windows 启动脚本
└── package.json
```

## 🔧 高级配置

### 自定义端口

修改 `.env` 文件：

```bash
PORT=8080
```

### 定时更新优选 IP 延迟

修改 `.env` 文件（单位：小时）：

```bash
IP_UPDATE_INTERVAL=24
```

## 🛠️ 开发指南

```bash
# 开发模式（前后端同时启动，支持热重载）
npm run dev

# 仅启动后端
npm run server:dev

# 仅启动前端
npm run client:dev

# 构建前端
npm run build
```

## 📝 API 文档

### 域名管理

```http
GET    /api/domains              # 获取所有域名
POST   /api/domains              # 创建域名配置
GET    /api/domains/:id          # 获取域名详情
DELETE /api/domains/:id          # 删除域名配置
GET    /api/domains/:id/verify   # 检查域名验证状态
```

### Origin 规则

```http
POST   /api/domains/:id/origin-rules        # 添加 Origin 规则
DELETE /api/domains/:id/origin-rules/:ruleId # 删除 Origin 规则
```

### 优选 IP

```http
GET    /api/optimized-ips           # 获取所有优选 IP
POST   /api/optimized-ips           # 添加优选 IP
DELETE /api/optimized-ips/:id       # 删除优选 IP
PUT    /api/optimized-ips/:id/toggle # 切换启用状态
```

## 🔒 安全建议

1. ✅ 修改默认管理员密码
2. ✅ 使用 HTTPS（建议使用 Nginx 反向代理）
3. ✅ 限制管理后台访问 IP
4. ✅ 定期备份数据库
5. ✅ 使用 RAM 子账户而非主账户 AccessKey

## 🐛 常见问题

### Q: Cloudflare API 连接失败？
A: 检查 API Token 权限是否正确，Zone ID 是否填写正确。

### Q: 阿里云 DNS 配置失败？
A: 确认 AccessKey 有 DNS 管理权限，域名已添加到阿里云 DNS。

### Q: 域名验证一直是 pending 状态？
A: 点击"验证"按钮获取验证记录，手动添加 TXT 记录到 DNS。

### Q: 如何备份数据？
A: 复制 `data/database.sqlite` 文件即可。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 开源协议

MIT License

## 🙏 致谢

- [Cloudflare](https://www.cloudflare.com/)
- [阿里云](https://www.aliyun.com/)
- [Element Plus](https://element-plus.org/)
- [Vue.js](https://vuejs.org/)

---

<p align="center">
  Made with ❤️ by CF-CDN-Optimizer Team
</p>
