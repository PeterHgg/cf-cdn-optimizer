const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/db');
const cfService = require('../services/cloudflare');
const aliyunService = require('../services/aliyun');

const router = express.Router();

// 获取所有域名配置
router.get('/', async (req, res) => {
  try {
    const domains = await dbAll('SELECT * FROM domain_configs ORDER BY created_at DESC');
    res.json({ success: true, data: domains });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取单个域名配置
router.get('/:id', async (req, res) => {
  try {
    const domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [req.params.id]);

    if (!domain) {
      return res.status(404).json({ success: false, message: '域名配置不存在' });
    }

    // 获取关联的 origin 规则
    const rules = await dbAll('SELECT * FROM origin_rules WHERE domain_config_id = ?', [req.params.id]);

    res.json({
      success: true,
      data: { ...domain, originRules: rules }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建新的域名配置
router.post('/', async (req, res) => {
  try {
    const { subdomain, rootDomain, fallbackOrigin, optimizedIp } = req.body;

    if (!subdomain || !rootDomain || !fallbackOrigin) {
      return res.status(400).json({
        success: false,
        message: '子域名、根域名和回退源不能为空'
      });
    }

    const fullDomain = `${subdomain}.${rootDomain}`;

    // 1. 在 Cloudflare 创建自定义主机名
    const cfResult = await cfService.createCustomHostname(fullDomain, fallbackOrigin);

    if (!cfResult.success) {
      return res.status(500).json({
        success: false,
        message: `Cloudflare 配置失败: ${cfResult.message}`
      });
    }

    // 2. 获取优选 IP（如果未指定，使用默认的第一个）
    let selectedIp = optimizedIp;
    if (!selectedIp) {
      const defaultIp = await dbGet(
        'SELECT ip_or_domain FROM optimized_ips WHERE is_active = 1 ORDER BY latency ASC LIMIT 1'
      );
      selectedIp = defaultIp ? defaultIp.ip_or_domain : fallbackOrigin;
    }

    // 3. 在阿里云配置分地区 DNS 解析
    const aliyunResult = await aliyunService.setupGeoDns(
      rootDomain,
      subdomain,
      selectedIp,      // 中国大陆使用优选 IP
      fallbackOrigin   // 海外使用回退源
    );

    if (!aliyunResult.success) {
      // 如果阿里云配置失败，回滚 Cloudflare 配置
      await cfService.deleteCustomHostname(cfResult.customHostnameId);
      return res.status(500).json({
        success: false,
        message: `阿里云 DNS 配置失败: ${aliyunResult.message}`
      });
    }

    // 4. 保存到数据库
    const result = await dbRun(`
      INSERT INTO domain_configs
      (subdomain, root_domain, fallback_origin, cf_custom_hostname_id,
       aliyun_record_id_china, aliyun_record_id_overseas, optimized_ip, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      subdomain,
      rootDomain,
      fallbackOrigin,
      cfResult.customHostnameId,
      aliyunResult.chinaRecordId,
      aliyunResult.overseasRecordId,
      selectedIp,
      'active'
    ]);

    res.json({
      success: true,
      message: '域名配置创建成功',
      data: {
        id: result.lastID,
        fullDomain,
        verificationRecords: cfResult.verificationRecords
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除域名配置
router.delete('/:id', async (req, res) => {
  try {
    const domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [req.params.id]);

    if (!domain) {
      return res.status(404).json({ success: false, message: '域名配置不存在' });
    }

    // 删除 Cloudflare 自定义主机名
    if (domain.cf_custom_hostname_id) {
      await cfService.deleteCustomHostname(domain.cf_custom_hostname_id);
    }

    // 删除阿里云 DNS 记录
    if (domain.aliyun_record_id_china) {
      await aliyunService.deleteDnsRecord(domain.aliyun_record_id_china);
    }
    if (domain.aliyun_record_id_overseas) {
      await aliyunService.deleteDnsRecord(domain.aliyun_record_id_overseas);
    }

    // 从数据库删除
    await dbRun('DELETE FROM domain_configs WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM origin_rules WHERE domain_config_id = ?', [req.params.id]);

    res.json({ success: true, message: '域名配置已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 添加 Origin 规则
router.post('/:id/origin-rules', async (req, res) => {
  try {
    const { matchPattern, originHost, originPort } = req.body;
    const domainId = req.params.id;

    if (!matchPattern || !originHost || !originPort) {
      return res.status(400).json({
        success: false,
        message: '匹配模式、源主机和端口不能为空'
      });
    }

    const result = await dbRun(`
      INSERT INTO origin_rules
      (domain_config_id, match_pattern, origin_host, origin_port, enabled)
      VALUES (?, ?, ?, ?, 1)
    `, [domainId, matchPattern, originHost, originPort]);

    res.json({
      success: true,
      message: 'Origin 规则已添加',
      data: { id: result.lastID }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 删除 Origin 规则
router.delete('/:domainId/origin-rules/:ruleId', async (req, res) => {
  try {
    await dbRun('DELETE FROM origin_rules WHERE id = ? AND domain_config_id = ?',
      [req.params.ruleId, req.params.domainId]);

    res.json({ success: true, message: 'Origin 规则已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 检查域名验证状态
router.get('/:id/verify', async (req, res) => {
  try {
    const domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [req.params.id]);

    if (!domain || !domain.cf_custom_hostname_id) {
      return res.status(404).json({ success: false, message: '域名配置不存在' });
    }

    const status = await cfService.getCustomHostnameStatus(domain.cf_custom_hostname_id);

    // 更新数据库状态
    if (status.success) {
      await dbRun(
        'UPDATE domain_configs SET status = ? WHERE id = ?',
        [status.sslStatus, req.params.id]
      );
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
