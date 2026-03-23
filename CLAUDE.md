# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

### 安装依赖
```bash
npm install
cd client && npm install
```

或直接：
```bash
npm run install:all
```

### 开发运行
```bash
npm run dev         # 前后端并行开发（nodemon + vite）
npm run server:dev  # 仅后端
npm run client:dev  # 仅前端
```

### 生产运行
```bash
npm start
```

### 数据库迁移
```bash
npm run migrate
```

### 构建与打包
```bash
npm run build       # 构建前端（client/dist）
npm run package     # pkg 打包 Linux 可执行文件到 dist/
npm run build:all   # build + package
```

### 安装/启动脚本
```bash
./install.sh   # Linux/macOS 一键安装
./start.sh     # Linux/macOS 启动（会先构建前端）
install.bat    # Windows 一键安装
start.bat      # Windows 启动（会先构建前端）
```

## 测试与 Lint 现状

当前仓库 `package.json` 未定义测试脚本或 lint 脚本，也未发现 Jest/Vitest 等测试配置文件。
- 无 `npm test`
- 无单测单文件运行命令
- 无 `npm run lint`

如需验证变更，当前主要依赖：
1. `npm run build`（前端构建可通过）
2. `npm start` / `npm run dev` 后手动验证页面与 API

## 架构总览

这是一个 **Node.js + Express + SQLite 后端** 与 **Vue3 + Vite 前端** 的全栈项目，用于自动化管理：
- Cloudflare Custom Hostname / DNS / Origin Rules
- 阿里云 DNS 分地区解析
- 域名优选 IP 池与自动延迟探测

### 后端入口与网关逻辑
- 入口：`server/index.js`
- 启动流程：初始化数据库迁移 → 注册中间件与 API 路由 → 静态托管 `client/dist` → 启动 HTTP/HTTPS 服务。
- HTTPS 证书来源：数据库 `settings` 表中的 `panel_cert_path` / `panel_key_path`。
- 网关能力：按请求 `Host` 在 `domain_configs` 查找 `origin_port`，命中则反代到 `127.0.0.1:{origin_port}`。
- 443 模式：当 `PORT=443` 且有证书时，额外启动 80 端口并做 HTTP→HTTPS 301 跳转。

### 数据层
- DB 连接与 Promise 封装：`server/database/db.js`
- Schema 与兼容迁移：`server/database/migrate.js`
- 核心表：
  - `domain_configs`：域名主配置（含 fallback、证书绑定、origin_port）
  - `origin_rules`：域名级 origin 规则
  - `optimized_ips`：优选 IP/域名池与延迟
  - `settings`：系统配置（Cloudflare/阿里云/面板证书路径等）
  - `users`：登录用户与 2FA
  - `certificates`：证书库存储

### 服务层职责
- `server/services/cloudflare.js`
  - 统一读取配置（优先 DB，回退 env）
  - 管理 Custom Hostname、DNS 记录、Zone 列表
  - `syncOriginRules()`：按面板端口同步 Cloudflare Origin Rules
    - 面板端口为 443：清理 `[CDN优选]` 自动规则（纯网关模式）
    - 非 443：生成并维护“统一回源到面板端口”的自动规则
- `server/services/aliyun.js`
  - 阿里云 DNS 记录增删改查
  - `setupGeoDns()`：配置中国/默认线路，支持优选值数组并处理 A/CNAME 限制
- `server/services/monitor.js`
  - 定时检查 Custom Hostname/SSL 状态并写回 `domain_configs.status`
  - 在 pending 状态下自动补齐验证记录（TXT/CNAME）

### 路由分层
- `server/routes/domains.js`：域名生命周期主流程（创建/删除/验证/端口与证书更新）
- `server/routes/settings.js`：系统配置、敏感字段掩码返回、面板 HTTPS 配置保存后热重启
- `server/routes/auth.js`：登录、JWT、2FA（TOTP + QRCode）、修改密码
- 其他：`cloudflare.js`、`aliyun.js`、`optimizedIps.js`、`certificates.js`

### 关键业务流程（创建域名）
在 `POST /api/domains` 中串联：
1. 前置检查（阿里云/Cloudflare 记录是否已存在）
2. 创建 Cloudflare fallback A 记录
3. 创建 Custom Hostname
4. 写入阿里云验证记录（ownership + ssl validation）
5. 配置阿里云分地区解析（中国优选 + 海外回退）
6. 落库 `domain_configs`
7. 按需同步 Origin Rules
8. 触发异步监控检查

### 前端结构
- 框架：Vue3 + Vite + Pinia + Vue Router + Element Plus
- 入口：`client/src/main.js`
- 路由：`client/src/router/index.js`
  - `/login` 公共页
  - `/domains`、`/optimized-ips`、`/certificates`、`/settings` 需登录
- API 统一封装：`client/src/api/index.js`
  - 请求自动带 `Authorization: Bearer <token>`
  - 401 自动清理 token 并跳转登录

## 配置来源优先级

许多后端服务配置遵循：
1. `settings` 表（Web 面板保存）
2. `.env` 环境变量回退

这意味着：排查配置问题时，优先检查数据库 `settings`，而不只是 `.env`。

## 打包与部署注意点

- 可执行打包使用 `pkg`，目标为 `node18-linux-x64`。
- 代码中多处使用 `process.cwd()`（而非 `__dirname`）定位运行时可写目录，适配 pkg snapshot 只读特性。
- SQLite 默认路径：`data/database.sqlite`（可由 `DATABASE_PATH` 覆盖）。
- 默认管理员账号由迁移脚本创建：`admin / admin123`（首次使用后应修改）。

## GitHub Actions 触发规范

当前工作流 [`.github/workflows/release.yml`](.github/workflows/release.yml) 仅在 `push tags: v*` 或手动 `workflow_dispatch` 时运行，不会在普通 `master` push 时自动触发。

以后每次提交后如需触发自动构建，统一按以下流程执行：
1. 提交并推送代码到 `master`
2. 创建新的语义化版本标签（如 `v0.1.66`）
3. 推送标签触发构建：
```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

约定：不要复用已有 tag；每次发布必须使用新 tag。
