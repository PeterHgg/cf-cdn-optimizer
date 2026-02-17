const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 创建代理实例
const proxy = httpProxy.createProxyServer({
  xfwd: true // 添加 X-Forwarded-For 等头部
});

// 监听代理错误，防止崩溃
proxy.on('error', (err, req, res) => {
  console.error('[Proxy Error]:', err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
  }
  res.end('Bad Gateway: Unable to connect to the backend service.');
});

// 当前运行的服务器实例（用于重启）
let currentServer = null;

// 自动初始化数据库
async function initDatabase() {
  // 使用 process.cwd() 而不是 __dirname，因为 pkg 打包后 __dirname 是只读的 snapshot
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data/database.sqlite');
  const dbDir = path.dirname(dbPath);

  // 确保数据目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('📁 数据目录已创建');
  }

  // 每次启动都执行迁移（所有建表语句使用 IF NOT EXISTS，安全幂等）
  console.log('🔄 正在检查数据库结构...');
  try {
    const { migrate } = require('./database/migrate');
    await migrate();
    console.log('✅ 数据库结构检查完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
  }
}

/**
 * 读取 HTTPS 证书配置（从数据库 settings 表）
 * 返回 { certPath, keyPath } 或 null
 */
async function getHttpsConfig() {
  try {
    const { dbGet } = require('./database/db');
    const certRow = await dbGet("SELECT value FROM settings WHERE key = 'panel_cert_path'");
    const keyRow = await dbGet("SELECT value FROM settings WHERE key = 'panel_key_path'");

    if (certRow && certRow.value && keyRow && keyRow.value) {
      const certPath = certRow.value;
      const keyPath = keyRow.value;

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return { certPath, keyPath };
      } else {
        console.warn('⚠️ 面板 HTTPS 证书文件不存在，回退到 HTTP');
        if (!fs.existsSync(certPath)) console.warn(`   证书文件不存在: ${certPath}`);
        if (!fs.existsSync(keyPath)) console.warn(`   私钥文件不存在: ${keyPath}`);
      }
    }
  } catch (e) {
    // 数据库可能还没初始化，忽略
  }
  return null;
}

/**
 * 启动或重启服务器（HTTP 或 HTTPS）
 */
async function startServer() {
  // 如果已有服务器在运行，先关闭
  if (currentServer) {
    console.log('🔄 正在重启服务...');
    await new Promise((resolve) => {
      currentServer.close(() => resolve());
    });
    currentServer = null;
  }

  const httpsConfig = await getHttpsConfig();

  if (httpsConfig) {
    // HTTPS 模式
    const sslOptions = {
      cert: fs.readFileSync(httpsConfig.certPath),
      key: fs.readFileSync(httpsConfig.keyPath)
    };

    // 创建 HTTPS 服务器
    currentServer = https.createServer(sslOptions, async (req, res) => {
      const host = req.headers.host;
      if (host) {
        try {
          const { dbGet } = require('./database/db');
          // 移除端口号，获取纯域名
          const hostname = host.split(':')[0];

          // 1. 尝试直接按完整域名查找
          let domainConfig = await dbGet(
            'SELECT subdomain, root_domain, origin_port FROM domain_configs WHERE (subdomain || "." || root_domain) = ? AND origin_port IS NOT NULL',
            [hostname]
          );

          // 2. 如果没匹配到，尝试按泛域名规则匹配（如果之后支持泛域名配置的话，目前先按精确匹配逻辑优化）
          // ... 现有逻辑已足够处理目前 domain_configs 里的数据结构

          // 如果匹配到了配置，且目的端口不是当前面板端口，则执行反代
          if (domainConfig && domainConfig.origin_port && domainConfig.origin_port !== PORT) {
            console.log(`[Proxy] [${new Date().toISOString()}] ${hostname} -> 127.0.0.1:${domainConfig.origin_port} (${req.method} ${req.url})`);
            return proxy.web(req, res, { target: `http://127.0.0.1:${domainConfig.origin_port}` });
          }
        } catch (e) {
          console.error('[Proxy Lookup Error]:', e.message);
        }
      }

      // 如果没有匹配到反代规则，则走正常的面板逻辑
      app(req, res);
    });

    currentServer.listen(PORT, () => {
      console.log(`🚀 CF-CDN-Optimizer 服务已启动 (HTTPS)`);
      console.log(`📡 服务地址: https://localhost:${PORT}`);
      console.log(`🔒 证书: ${httpsConfig.certPath}`);
    });
  } else {
    // HTTP 模式
    currentServer = http.createServer(app);
    currentServer.listen(PORT, () => {
      console.log(`🚀 CF-CDN-Optimizer 服务已启动 (HTTP)`);
      console.log(`📡 服务地址: http://localhost:${PORT}`);
    });
  }
}

// 初始化数据库后再启动服务器
initDatabase().then(() => {
  // 中间件
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // 静态文件服务 - 前端文件打包在可执行文件内，使用 __dirname
  app.use(express.static(path.join(__dirname, '../client/dist')));

  // API 路由
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/domains', require('./routes/domains'));
  app.use('/api/cloudflare', require('./routes/cloudflare'));
  app.use('/api/aliyun', require('./routes/aliyun'));
  app.use('/api/optimized-ips', require('./routes/optimizedIps'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/certificates', require('./routes/certificates'));

  // 前端路由 - 前端文件打包在可执行文件内，使用 __dirname
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });

  // 错误处理
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      success: false,
      message: err.message || '服务器内部错误'
    });
  });

  // 启动服务器
  startServer();

  console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);

  // 启动定时任务
  require('./tasks/ipUpdater');
  require('./services/monitor').start();
}).catch(error => {
  console.error('❌ 服务启动失败:', error);
  process.exit(1);
});

// 导出重启函数供 settings 路由调用
module.exports = { restartServer: startServer };
