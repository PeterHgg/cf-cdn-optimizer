# 发布说明

## 自动化发布流程

本项目使用 GitHub Actions 自动构建和发布可执行文件。

### 创建新版本

1. **更新版本号**

编辑 `package.json`：
```json
{
  "version": "1.0.1"
}
```

2. **创建 Git Tag**

```bash
# 提交更改
git add .
git commit -m "Release v1.0.1"

# 创建标签
git tag v1.0.1

# 推送到 GitHub（包含标签）
git push origin master --tags
```

3. **自动构建**

推送标签后，GitHub Actions 会自动：
- ✅ 在 Windows、Linux、macOS 上构建可执行文件
- ✅ 打包前端资源
- ✅ 创建压缩包
- ✅ 创建 GitHub Release
- ✅ 上传所有构建产物

### 构建产物

每个版本会生成以下文件：

- `cf-cdn-optimizer-win-x64.zip` - Windows 64位
- `cf-cdn-optimizer-linux-x64.tar.gz` - Linux 64位
- `cf-cdn-optimizer-macos-x64.tar.gz` - macOS 64位

### 用户安装步骤

**Windows:**
```cmd
# 1. 下载并解压
unzip cf-cdn-optimizer-win-x64.zip
cd cf-cdn-optimizer-win-x64

# 2. 运行安装脚本
install.bat

# 3. 编辑配置文件
notepad .env

# 4. 启动服务
cf-cdn-optimizer-win-x64.exe
```

**Linux/macOS:**
```bash
# 1. 下载并解压
tar -xzf cf-cdn-optimizer-linux-x64.tar.gz
cd cf-cdn-optimizer-linux-x64

# 2. 运行安装脚本
chmod +x install.sh
./install.sh

# 3. 编辑配置文件
nano .env

# 4. 启动服务
./cf-cdn-optimizer-linux-x64
```

### 手动构建（开发者）

如果需要本地构建：

```bash
# 1. 安装依赖
npm run install:all

# 2. 构建前端 + 打包可执行文件
npm run build:all

# 3. 可执行文件位于 dist/ 目录
```

### 版本发布检查清单

- [ ] 更新 `package.json` 版本号
- [ ] 更新 `CHANGELOG.md` 记录变更
- [ ] 提交所有更改
- [ ] 创建并推送 Git Tag
- [ ] 等待 GitHub Actions 完成构建
- [ ] 检查 Release 页面确认所有文件已上传
- [ ] 测试下载的可执行文件

### 注意事项

1. **数据库初始化**：首次运行会自动创建数据库和默认用户
2. **配置文件**：必须先配置 `.env` 文件才能正常使用
3. **端口占用**：确保 3000 端口未被占用
4. **权限问题**：Linux/macOS 需要给可执行文件添加执行权限

### 回滚版本

如果新版本有问题，可以：

1. 从 Release 页面下载旧版本
2. 或者使用 Git 回退：
```bash
git checkout v1.0.0
npm run build:all
```

### 技术细节

- **打包工具**: pkg (Node.js 应用打包器)
- **Node.js 版本**: 18
- **压缩算法**: GZip
- **包含资源**: 前端 dist、SQLite 模块
- **CI/CD**: GitHub Actions
