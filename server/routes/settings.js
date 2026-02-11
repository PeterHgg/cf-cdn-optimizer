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

// 获取所有设置
router.get('/', async (req, res) => {
  try {
    const settings = await dbAll('SELECT * FROM settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
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
    const { certPath, keyPath } = req.body;
    const fs = require('fs');

    if (certPath && keyPath) {
      // 验证文件是否存在
      if (!fs.existsSync(certPath)) {
        return res.status(400).json({ success: false, message: `证书文件不存在: ${certPath}` });
      }
      if (!fs.existsSync(keyPath)) {
        return res.status(400).json({ success: false, message: `私钥文件不存在: ${keyPath}` });
      }

      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_cert_path', ?, CURRENT_TIMESTAMP)", [certPath]);
      await dbRun("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('panel_key_path', ?, CURRENT_TIMESTAMP)", [keyPath]);
    } else {
      // 清除 HTTPS 配置，回退到 HTTP
      await dbRun("DELETE FROM settings WHERE key IN ('panel_cert_path', 'panel_key_path')");
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
