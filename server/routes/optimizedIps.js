const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/db');

const router = express.Router();

// 获取所有优选 IP
router.get('/', async (req, res) => {
  try {
    const ips = await dbAll('SELECT * FROM optimized_ips ORDER BY latency ASC');
    res.json({ success: true, data: ips });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 添加优选 IP
router.post('/', async (req, res) => {
  try {
    const { ipOrDomain, type, region } = req.body;

    if (!ipOrDomain || !type) {
      return res.status(400).json({
        success: false,
        message: 'IP/域名和类型不能为空'
      });
    }

    const result = await dbRun(`
      INSERT INTO optimized_ips (ip_or_domain, type, region, is_active)
      VALUES (?, ?, ?, 1)
    `, [ipOrDomain, type, region || 'Unknown']);

    res.json({
      success: true,
      message: '优选 IP 已添加',
      data: { id: result.lastID }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除优选 IP
router.delete('/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM optimized_ips WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '优选 IP 已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 切换优选 IP 状态
router.put('/:id/toggle', async (req, res) => {
  try {
    const ip = await dbGet('SELECT * FROM optimized_ips WHERE id = ?', [req.params.id]);

    if (!ip) {
      return res.status(404).json({ success: false, message: '优选 IP 不存在' });
    }

    await dbRun(
      'UPDATE optimized_ips SET is_active = ? WHERE id = ?',
      [ip.is_active ? 0 : 1, req.params.id]
    );

    res.json({ success: true, message: '状态已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
