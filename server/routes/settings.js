const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/db');
const cfService = require('../services/cloudflare');
const aliyunService = require('../services/aliyun');

const router = express.Router();

// 获取原始设置值（内部使用）
async function getSettingValue(key) {
  const row = await dbGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

// 敏感字段列表 - 只返回是否已配置的标记，不返回实际值
const SENSITIVE_KEYS = ['cf_api_key', 'cf_api_token', 'aliyun_access_key_secret', 'panel_token'];

// 获取所有设置
router.get('/', async (req, res) => {
  try {
    const settings = await dbAll('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      if (SENSITIVE_KEYS.includes(s.key)) {
        // 敏感字段只返回是否已配置
        settingsObj[s.key] = s.value ? '******' : '';
      } else {
        settingsObj[s.key] = s.value;
      }
    });
    res.json({ success: true, data: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新单个设置
router.put('/', async (req, res) => {
  try {
    const { key, value } = req.body;

    await dbRun(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `, [key, value]);

    res.json({ success: true, message: '设置已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量更新设置
router.put('/batch', async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: '无效的设置数据' });
    }

    for (const [key, value] of Object.entries(settings)) {
      // 如果值为空，跳过更新
      if (!value) {
        continue;
      }

      await dbRun(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [key, value]);
    }

    // 刷新服务缓存，使新配置生效
    cfService.refreshClient();
    aliyunService.refreshClient();
    console.log('配置已保存，缓存已刷新');

    res.json({ success: true, message: '设置已保存' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存面板 HTTPS 配置并重启服务
router.put('/panel-https', async (req, res) => {
  try {
    const { mode, certificateId, certPath, keyPath } = req.body;
    const fs = require('fs');
    const path = require('path');

    if (mode === 'clear') {
      // 清除 HTTPS 配置，回退到 HTTP
      await dbRun("DELETE FROM settings WHERE key IN ('panel_cert_path', 'panel_key_path', 'panel_cert_id')");
    } else if (mode === 'cert_id') {
      // 从证书库选择模式
      if (!certificateId) {
        return res.status(400).json({ success: false, message: '请选择一个证书' });
      }

      const cert = await dbGet('SELECT cert_body, private_key FROM certificates WHERE id = ?', [certificateId]);
      if (!cert) {
        return res.status(404).json({ success: false, message: '证书不存在' });
      }
      if (!cert.cert_body || !cert.private_key) {
        return res.status(400).json({ success: false, message: '证书数据不完整，缺少证书内容或私钥' });
      }

      // 将证书写入 data 目录
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const certFilePath = path.join(dataDir, 'panel_cert.pem');
      const keyFilePath = path.join(dataDir, 'panel_key.pem');
      fs.writeFileSync(certFilePath, cert.cert_body);
      fs.writeFileSync(keyFilePath, cert.private_key);

      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_cert_path', ?, CURRENT_TIMESTAMP)", [certFilePath]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_key_path', ?, CURRENT_TIMESTAMP)", [keyFilePath]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_cert_id', ?, CURRENT_TIMESTAMP)", [String(certificateId)]);
    } else {
      // 文件路径模式
      if (!certPath || !keyPath) {
        return res.status(400).json({ success: false, message: '请填写证书和私钥路径' });
      }

      if (!fs.existsSync(certPath)) {
        return res.status(400).json({ success: false, message: `证书文件不存在: ${certPath}` });
      }
      if (!fs.existsSync(keyPath)) {
        return res.status(400).json({ success: false, message: `私钥文件不存在: ${keyPath}` });
      }

      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_cert_path', ?, CURRENT_TIMESTAMP)", [certPath]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_key_path', ?, CURRENT_TIMESTAMP)", [keyPath]);
      await dbRun("DELETE FROM settings WHERE key = 'panel_cert_id'");
    }

    // 先返回响应，然后延迟重启
    res.json({ success: true, message: '面板 HTTPS 配置已保存，正在重启服务...' });

    // 延迟 500ms 后重启，确保响应已发送
    setTimeout(async () => {
      try {
        const { restartServer } = require('../index');
        await restartServer();
        console.log('✅ 面板服务已重启');
      } catch (err) {
        console.error('❌ 重启失败:', err.message);
      }
    }, 500);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 导出路由和获取设置值的函数
module.exports = router;
module.exports.getSettingValue = getSettingValue;
