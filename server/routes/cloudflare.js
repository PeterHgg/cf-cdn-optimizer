const express = require('express');
const cfService = require('../services/cloudflare');

const router = express.Router();

// 列出所有自定义主机名
router.get('/custom-hostnames', async (req, res) => {
  try {
    const result = await cfService.listCustomHostnames();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 测试 Cloudflare 连接
router.get('/test-connection', async (req, res) => {
  try {
    const result = await cfService.listCustomHostnames();
    res.json({
      success: result.success,
      message: result.success ? 'Cloudflare 连接成功' : 'Cloudflare 连接失败'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
