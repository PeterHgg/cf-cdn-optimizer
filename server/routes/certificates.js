const express = require('express');
const { dbRun, dbAll, dbGet } = require('../database/db');
const cfService = require('../services/cloudflare');

const router = express.Router();

// 获取所有证书
router.get('/', async (req, res) => {
  try {
    const certs = await dbAll('SELECT * FROM certificates ORDER BY created_at DESC');
    res.json({ success: true, data: certs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 生成 Cloudflare Origin CA 证书
router.post('/generate', async (req, res) => {
  try {
    const { domains } = req.body;
    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ success: false, message: '请提供域名列表' });
    }

    // 调用 Cloudflare API 生成证书
    const result = await cfService.createOriginCertificate(domains);

    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message });
    }

    const certData = result.data;
    // Cloudflare 返回的结构通常包含 certificate 和 private_key (csr response)
    // 具体字段取决于 API 版本，通常是 certificate 和 private_key
    // 假设返回结构: { certificate: "...", private_key: "...", ... } 或 { result: { ... } }

    // 适配不同的返回结构
    const certBody = certData.certificate || (certData.result && certData.result.certificate);
    const privateKey = certData.private_key || (certData.result && certData.result.private_key);
    const expiresOn = certData.expires_on || (certData.result && certData.result.expires_on);

    if (!certBody || !privateKey) {
      return res.status(500).json({ success: false, message: '无法从 Cloudflare 获取证书内容' });
    }

    // 保存到数据库
    await dbRun(`
      INSERT INTO certificates (domain, cert_body, private_key, type, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `, [domains.join(', '), certBody, privateKey, 'origin', expiresOn]);

    res.json({ success: true, message: '证书生成成功' });
  } catch (error) {
    console.error('证书生成错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 手动上传/导入证书
router.post('/upload', async (req, res) => {
  try {
    const { domain, cert, key } = req.body;

    if (!domain || !cert || !key) {
      return res.status(400).json({ success: false, message: '请填写完整信息' });
    }

    await dbRun(`
      INSERT INTO certificates (domain, cert_body, private_key, type)
      VALUES (?, ?, ?, 'custom')
    `, [domain, cert, key]);

    res.json({ success: true, message: '证书导入成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除证书
router.delete('/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM certificates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '证书已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;