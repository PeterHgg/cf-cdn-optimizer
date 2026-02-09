const express = require('express');
const aliyunService = require('../services/aliyun');

const router = express.Router();

// 获取域名列表
router.get('/domains', async (req, res) => {
  try {
    const result = await aliyunService.listDomains();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 列出域名的所有 DNS 记录
router.get('/records/:domainName', async (req, res) => {
  try {
    const result = await aliyunService.listDnsRecords(req.params.domainName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 测试阿里云连接
router.get('/test-connection', async (req, res) => {
  try {
    const result = await aliyunService.listDnsRecords('example.com');
    res.json({
      success: true,
      message: '阿里云 DNS 连接成功'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
