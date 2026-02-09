const { db, dbRun } = require('./db');

async function migrate() {
  try {
    console.log('🔄 开始数据库迁移...');

    // 用户表
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 域名配置表
    await dbRun(`
      CREATE TABLE IF NOT EXISTS domain_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subdomain TEXT NOT NULL,
        root_domain TEXT NOT NULL,
        fallback_origin TEXT NOT NULL,
        cf_custom_hostname_id TEXT,
        aliyun_record_id_china TEXT,
        aliyun_record_id_overseas TEXT,
        optimized_ip TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subdomain, root_domain)
      )
    `);

    // Origin 规则表
    await dbRun(`
      CREATE TABLE IF NOT EXISTS origin_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain_config_id INTEGER NOT NULL,
        match_pattern TEXT NOT NULL,
        origin_host TEXT NOT NULL,
        origin_port INTEGER NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (domain_config_id) REFERENCES domain_configs(id) ON DELETE CASCADE
      )
    `);

    // 优选 IP 池表
    await dbRun(`
      CREATE TABLE IF NOT EXISTS optimized_ips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_or_domain TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        region TEXT,
        latency REAL,
        is_active INTEGER DEFAULT 1,
        last_check DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 系统设置表
    await dbRun(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 插入默认优选 IP/域名
    const defaultIPs = [
      { ip: 'japan.com', type: 'domain', region: 'JP' },
      { ip: 'singapore.com', type: 'domain', region: 'SG' },
      { ip: 'usa.com', type: 'domain', region: 'US' },
      { ip: '104.16.0.0', type: 'ip', region: 'Global' },
      { ip: '172.64.0.0', type: 'ip', region: 'Global' }
    ];

    for (const item of defaultIPs) {
      await dbRun(`
        INSERT OR IGNORE INTO optimized_ips (ip_or_domain, type, region, is_active)
        VALUES (?, ?, ?, 1)
      `, [item.ip, item.type, item.region]);
    }

    // 创建默认管理员账户（用户名: admin, 密码: admin123）
    const bcrypt = require('bcryptjs');
    const defaultPassword = await bcrypt.hash('admin123', 10);
    await dbRun(`
      INSERT OR IGNORE INTO users (username, password)
      VALUES ('admin', ?)
    `, [defaultPassword]);

    console.log('✅ 数据库迁移完成！');
    console.log('📝 默认管理员账户: admin / admin123');
    console.log('⚠️  请登录后立即修改密码！');
  } catch (err) {
    console.error('❌ 数据库迁移失败:', err.message);
    throw err;
  }
}

// 只在直接运行时执行迁移并退出
if (require.main === module) {
  migrate().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('❌ 迁移失败:', err.message);
    process.exit(1);
  });
} else {
  // 被 require 时只执行迁移，不退出进程
  migrate();
}
