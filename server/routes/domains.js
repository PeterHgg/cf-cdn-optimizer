const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/db');
const cfService = require('../services/cloudflare');
const aliyunService = require('../services/aliyun');
const monitor = require('../services/monitor');

const axios = require('axios');
const router = express.Router();

// 获取服务器公网 IP
async function getPublicIp() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    return response.data.ip;
  } catch (error) {
    console.error('获取公网 IP 失败:', error.message);
    // 尝试备用服务
    try {
      const response = await axios.get('http://ip-api.com/json');
      return response.data.query;
    } catch (e) {
      throw new Error('无法获取服务器公网 IP');
    }
  }
}

// 获取服务器公网 IP (供前端调用)
router.get('/public-ip', async (req, res) => {
  try {
    const ip = await getPublicIp();
    res.json({ success: true, ip });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取阿里云域名列表
router.get('/aliyun-domains', async (req, res) => {
  try {
    const result = await aliyunService.listDomains();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取 Cloudflare Zone 列表
router.get('/cf-zones', async (req, res) => {
  try {
    const result = await cfService.listZones();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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

    // 获取关联的证书信息
    let certificate = null;
    if (domain.cert_mode === 'cert_id' && domain.certificate_id) {
      certificate = await dbGet('SELECT id, domain, type, expires_at, created_at FROM certificates WHERE id = ?', [domain.certificate_id]);
    }

    res.json({
      success: true,
      data: { ...domain, originRules: rules, certificate }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 创建新的域名配置
router.post('/', async (req, res) => {
  try {
    const { subdomain, rootDomain, fallbackSubdomain, fallbackRootDomain, optimizedIp, customPublicIp, overwrite, certMode, certificateId, certFilePath, keyFilePath, originPort } = req.body;

    if (!subdomain || !rootDomain || !fallbackSubdomain || !fallbackRootDomain) {
      return res.status(400).json({
        success: false,
        message: '子域名、根域名、回退源子域名和回退源根域名不能为空'
      });
    }

    const fullDomain = `${subdomain}.${rootDomain}`;
    const fallbackOrigin = `${fallbackSubdomain}.${fallbackRootDomain}`;

    // 0. Pre-flight Checks (检查记录是否已存在)

    // 检查 Aliyun 记录
    if (!overwrite) {
      const aliyunCheck = await aliyunService.listDnsRecords(rootDomain, subdomain);
      if (aliyunCheck.success && aliyunCheck.data && aliyunCheck.data.length > 0) {
        // 检查是否存在完全匹配的 RR
        const exists = aliyunCheck.data.some(r => r.RR === subdomain);
        if (exists) {
          return res.status(409).json({
            success: false,
            code: 'ALIYUN_RECORD_EXISTS',
            message: `阿里云 DNS 记录已存在: ${fullDomain}`
          });
        }
      }
    }

    // 检查 Cloudflare 记录
    const cfZoneId = await cfService.getZoneId();
    const cfCheck = await cfService.listDnsRecords(cfZoneId, fallbackOrigin, 'A');
    if (cfCheck.success && cfCheck.data && cfCheck.data.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Cloudflare DNS 记录已存在: ${fallbackOrigin}`
      });
    }

    // 0.5 获取公网 IP (优先使用前端传递的自定义 IP)
    let publicIp = customPublicIp;
    if (!publicIp) {
      try {
        publicIp = await getPublicIp();
      } catch (e) {
        console.warn('自动获取公网 IP 失败:', e.message);
        return res.status(400).json({
          success: false,
          message: '无法自动获取服务器公网 IP，请手动填写'
        });
      }
    }
    console.log(`使用回退源 IP: ${publicIp}`);

    // 1. 在 Cloudflare 创建回退源的 A 记录
    await cfService.addDnsRecord(cfZoneId, 'A', fallbackOrigin, publicIp, true); // proxied: true

    // 2. 在 Cloudflare 创建自定义主机名
    const cfResult = await cfService.createCustomHostname(fullDomain, fallbackOrigin);

    if (!cfResult.success) {
      return res.status(500).json({
        success: false,
        message: `Cloudflare 配置失败: ${cfResult.message}`
      });
    }

    // 3. 添加验证记录 (Ownership TXT + SSL TXT/CNAME)
    const addDnsRecordHelper = async (name, type, value) => {
      let rr = name;
      if (rr === rootDomain) {
        rr = '@';
      } else if (rr.endsWith(`.${rootDomain}`)) {
        rr = rr.slice(0, -(rootDomain.length + 1));
      }

      console.log(`正在添加验证记录: ${rr} ${type} ${value}`);
      await aliyunService.addDnsRecord(
        rootDomain,
        rr,
        type,
        value
      );
    };

    // 3a. 添加 Hostname Ownership Verification TXT
    if (cfResult.ownershipVerification) {
      const ov = cfResult.ownershipVerification;
      if (ov.type && ov.type.toLowerCase() === 'txt') {
        await addDnsRecordHelper(ov.name, 'TXT', ov.value);
      }
    }

    // 3b. 添加 SSL 证书验证 TXT (_acme-challenge)
    if (cfResult.verificationRecords && Array.isArray(cfResult.verificationRecords)) {
      for (const record of cfResult.verificationRecords) {
        // 尝试多种字段名格式 (txt_name/txt_value 或 name/value)
        const recordName = record.txt_name || record.name;
        const recordValue = record.txt_value || record.value;
        const recordType = record.type || 'TXT'; // Default to TXT

        if (recordName && recordValue) {
          await addDnsRecordHelper(recordName, recordType.toUpperCase(), recordValue);
        }
      }
    }

    // 4. 获取优选 IP（支持多选）
    let selectedIps = optimizedIp;

    // 如果未指定，使用默认的第一个
    if (!selectedIps || (Array.isArray(selectedIps) && selectedIps.length === 0)) {
      const defaultIp = await dbGet(
        'SELECT ip_or_domain FROM optimized_ips WHERE is_active = 1 ORDER BY latency ASC LIMIT 1'
      );
      selectedIps = defaultIp ? [defaultIp.ip_or_domain] : [fallbackOrigin];
    } else if (!Array.isArray(selectedIps)) {
      // 确保是数组
      selectedIps = [selectedIps];
    }

    // 5. 在阿里云配置分地区 DNS 解析 (传入数组)
    const aliyunResult = await aliyunService.setupGeoDns(
      rootDomain,
      subdomain,
      selectedIps,     // 中国地区使用优选 IP 列表
      fallbackOrigin   // 默认(海外)使用回退源
    );

    if (!aliyunResult.success) {
      // 如果阿里云配置失败，回滚 Cloudflare 配置
      await cfService.deleteCustomHostname(cfResult.customHostnameId);
      return res.status(500).json({
        success: false,
        message: `阿里云 DNS 配置失败: ${aliyunResult.message}`
      });
    }

    // 6. 保存到数据库 (optimized_ip 存为 JSON 字符串)
    const optimizedIpStr = JSON.stringify(selectedIps);

    const result = await dbRun(`
      INSERT INTO domain_configs
      (subdomain, root_domain, fallback_origin, cf_custom_hostname_id,
       aliyun_record_id_china, aliyun_record_id_overseas, optimized_ip, status,
       cert_mode, certificate_id, cert_file_path, key_file_path, origin_port)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      subdomain,
      rootDomain,
      fallbackOrigin,
      cfResult.customHostnameId,
      aliyunResult.chinaRecordId,
      aliyunResult.overseasRecordId,
      optimizedIpStr,
      'pending',
      certMode || 'none',
      certificateId || null,
      certFilePath || null,
      keyFilePath || null,
      originPort || null
    ]);

    // 7. 如果配置了 origin_port，同步 Cloudflare Origin Rules
    if (originPort && originPort !== 443) {
      cfService.syncOriginRules().catch(err => {
        console.error('同步 Origin Rules 失败:', err);
      });
    }

    // 8. 触发一次异步检查 (Fire and forget)
    monitor.checkDomain(result.lastID).catch(err => {
        console.error('Initial domain check failed:', err);
    });

    res.json({
      success: true,
      message: aliyunResult.warning
        ? `域名配置成功，但有警告: ${aliyunResult.warning}`
        : '域名配置创建成功，后台正在自动验证中...',
      data: {
        id: result.lastID,
        fullDomain
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

    // 删除阿里云所有相关记录 (包括中国地区、TXT验证等)
    try {
      const allRecords = await aliyunService.listDnsRecords(domain.root_domain, domain.subdomain);
      if (allRecords.success && allRecords.data) {
        for (const record of allRecords.data) {
          if (record.RR === domain.subdomain) {
            console.log(`删除阿里云记录: ${record.RR} ${record.type} ${record.value}`);
            await aliyunService.deleteDnsRecord(record.recordId);
          }
        }
      }
    } catch (e) {
      console.warn('清理阿里云残留记录失败:', e.message);
    }

    // 删除 Cloudflare 回退源 DNS 记录
    if (domain.fallback_origin) {
       try {
         const cfZoneId = await cfService.getZoneId();
         const records = await cfService.listDnsRecords(cfZoneId, domain.fallback_origin, 'A');
         if (records.success && records.data && records.data.length > 0) {
           for (const record of records.data) {
             console.log(`正在删除回退源记录: ${record.name} (ID: ${record.id})`);
             await cfService.deleteDnsRecord(cfZoneId, record.id);
           }
         }
       } catch (e) {
         console.warn('删除 Cloudflare 回退源记录失败:', e.message);
       }
    }

    // 从数据库删除
    await dbRun('DELETE FROM domain_configs WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM origin_rules WHERE domain_config_id = ?', [req.params.id]);

    // 同步 Origin Rules（删除域名后需要更新规则）
    if (domain.origin_port && domain.origin_port !== 443) {
      cfService.syncOriginRules().catch(err => {
        console.error('同步 Origin Rules 失败:', err);
      });
    }

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

// 检查域名验证状态 (手动触发)
router.get('/:id/verify', async (req, res) => {
  try {
    const result = await monitor.checkDomain(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新域名的证书绑定
router.put('/:id/certificate', async (req, res) => {
  try {
    const { certMode, certificateId, certFilePath, keyFilePath } = req.body;
    const domainId = req.params.id;

    const domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [domainId]);
    if (!domain) {
      return res.status(404).json({ success: false, message: '域名配置不存在' });
    }

    // 验证参数
    if (certMode === 'cert_id' && !certificateId) {
      return res.status(400).json({ success: false, message: '请选择一个证书' });
    }
    if (certMode === 'file_path' && (!certFilePath || !keyFilePath)) {
      return res.status(400).json({ success: false, message: '请填写证书和私钥的文件路径' });
    }

    await dbRun(`
      UPDATE domain_configs
      SET cert_mode = ?, certificate_id = ?, cert_file_path = ?, key_file_path = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      certMode || 'none',
      certMode === 'cert_id' ? certificateId : null,
      certMode === 'file_path' ? certFilePath : null,
      certMode === 'file_path' ? keyFilePath : null,
      domainId
    ]);

    res.json({ success: true, message: '证书配置已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新域名的回源端口
router.put('/:id/origin-port', async (req, res) => {
  try {
    const { originPort } = req.body;
    const domainId = req.params.id;

    const domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [domainId]);
    if (!domain) {
      return res.status(404).json({ success: false, message: '域名配置不存在' });
    }

    await dbRun(`
      UPDATE domain_configs SET origin_port = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [originPort || null, domainId]);

    // 同步 Cloudflare Origin Rules
    const syncResult = await cfService.syncOriginRules();
    if (!syncResult.success) {
      res.json({ success: true, message: '端口已保存，但同步 Cloudflare 规则失败: ' + syncResult.message });
      return;
    }

    res.json({ success: true, message: '回源端口配置已更新并同步到 Cloudflare' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
