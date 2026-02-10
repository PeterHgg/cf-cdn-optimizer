const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
  app.listen(PORT, () => {
    console.log(`🚀 CF-CDN-Optimizer 服务已启动`);
    console.log(`📡 服务地址: http://localhost:${PORT}`);
    console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`👤 默认账户: admin / admin123`);
  });

  // 启动定时任务
  require('./tasks/ipUpdater');
  require('./services/monitor').start();
}).catch(error => {
  console.error('❌ 服务启动失败:', error);
  process.exit(1);
});
