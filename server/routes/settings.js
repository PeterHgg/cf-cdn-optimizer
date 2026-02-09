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

// 导出路由和获取设置值的函数
module.exports = router;
module.exports.getSettingValue = getSettingValue;
