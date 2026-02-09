const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/db');

const router = express.Router();

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

// 更新设置
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

module.exports = router;
