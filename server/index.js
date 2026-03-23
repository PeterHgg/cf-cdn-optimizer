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
const HOST = process.env.HOST || '::';
const PROXY_TARGET_HOST = process.env.PROXY_TARGET_HOST || '127.0.0.1';

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
let currentHttpServer = null; // 用于 80 端口重定向或 HTTP 模式

function extractHostname(hostHeader = '') {
  if (!hostHeader) return '';
  if (hostHeader.startsWith('[')) {
    const end = hostHeader.indexOf(']');
    if (end !== -1) return hostHeader.slice(1, end);
  }
  return hostHeader.split(':')[0];
}

function toUrlHost(host = '') {
  if (!host) return host;
  if (host.includes(':') && !host.startsWith('[')) {
    return `[${host}]`;
  }
  return host;
}

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
    console.log('🔄 正在重启 HTTPS 服务...');
    await new Promise((resolve) => {
      currentServer.close(() => resolve());
    });
    currentServer = null;
  }
  if (currentHttpServer) {
    console.log('🔄 正在重启 HTTP 服务...');
    await new Promise((resolve) => {
      currentHttpServer.close(() => resolve());
    });
    currentHttpServer = null;
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
          // 移除端口号，获取纯域名（兼容 IPv6 host header）
          const hostname = extractHostname(host);

          // 1. 尝试直接按完整域名查找
          let domainConfig = await dbGet(
            'SELECT subdomain, root_domain, origin_port FROM domain_configs WHERE (subdomain || "." || root_domain) = ? AND origin_port IS NOT NULL',
            [hostname]
          );

          // 如果匹配到了配置，且目的端口不是当前面板端口，则执行反代
          // 在 443 模式下，通常所有匹配到的域名都需要反代
          if (domainConfig && domainConfig.origin_port) {
            // 如果目的端口就是当前端口，说明配置有误（死循环），跳过代理走面板逻辑
            if (parseInt(domainConfig.origin_port) === parseInt(PORT)) {
              return app(req, res);
            }

            console.log(`[Proxy] [${new Date().toISOString()}] ${hostname} -> ${PROXY_TARGET_HOST}:${domainConfig.origin_port} (${req.method} ${req.url})`);
            return proxy.web(req, res, { target: `http://${toUrlHost(PROXY_TARGET_HOST)}:${domainConfig.origin_port}` });
          }
        } catch (e) {
          console.error('[Proxy Lookup Error]:', e.message);
        }
      }

      // 如果没有匹配到反代规则，则走正常的面板逻辑
      app(req, res);
    });

    currentServer.listen(PORT, HOST, () => {
      console.log(`🚀 CF-CDN-Optimizer 服务已启动 (HTTPS)`);
      console.log(`📡 服务地址: https://${toUrlHost(HOST)}:${PORT}`);
      console.log(`🔒 证书: ${httpsConfig.certPath}`);
    });

    // 如果 HTTPS 运行在 443，则自动开启 80 端口重定向
    if (parseInt(PORT) === 443) {
      currentHttpServer = http.createServer((req, res) => {
        const host = req.headers.host ? req.headers.host.split(':')[0] : '';
        console.log(`[Redirect] HTTP -> HTTPS: ${host}${req.url}`);
        res.writeHead(301, { "Location": "https://" + req.headers.host + req.url });
        res.end();
      });
      currentHttpServer.listen(80, HOST, () => {
        console.log(`📡 已启动 HTTP (80) -> HTTPS (443) 自动重定向`);
      });
    }
  } else {
    // HTTP 模式
    currentServer = http.createServer(app);
    currentServer.listen(PORT, HOST, () => {
      console.log(`🚀 CF-CDN-Optimizer 服务已启动 (HTTP)`);
      console.log(`📡 服务地址: http://${toUrlHost(HOST)}:${PORT}`);
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
