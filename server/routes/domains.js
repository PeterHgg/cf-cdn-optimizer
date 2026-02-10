const express = require('express');
const { dbRun, dbGet, dbAll } = require('../database/db');
const cfService = require('../services/cloudflare');
const aliyunService = require('../services/aliyun');

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

// 后台自动轮询验证状态
async function startVerificationPolling(domainId) {
  const MAX_ATTEMPTS = 30; // 最多检查 30 次
  const INTERVAL = 30000; // 每 30 秒检查一次

  let attempts = 0;

  const poll = async () => {
    attempts++;
    try {
      const domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [domainId]);
      if (!domain || !domain.cf_custom_hostname_id) {
        console.log(`[自动验证] 域名 ID ${domainId} 已不存在，停止轮询`);
        return;
      }

      // 已经验证通过，停止
      if (domain.status === 'active') {
        console.log(`[自动验证] 域名 ${domain.subdomain}.${domain.root_domain} 已激活，停止轮询`);
        return;
      }

      const status = await cfService.getCustomHostnameStatus(domain.cf_custom_hostname_id);

      if (status.success) {
        const sslStatus = status.sslStatus;
        const hostStatus = status.status;
        console.log(`[自动验证] 域名 ${domain.subdomain}.${domain.root_domain} - SSL: ${sslStatus}, Host: ${hostStatus} (${attempts}/${MAX_ATTEMPTS})`);

        await dbRun(
          'UPDATE domain_configs SET status = ? WHERE id = ?',
          [sslStatus, domainId]
        );

        // 如果 ownership 还在 pending，补充 ownership TXT 记录
        if (hostStatus === 'pending' && status.data && status.data.ownership_verification) {
          const ov = status.data.ownership_verification;
          if (ov.type && ov.type.toLowerCase() === 'txt' && ov.name && ov.value) {
            let rr = ov.name;
            const rootDomain = domain.root_domain;
            if (rr === rootDomain) {
              rr = '@';
            } else if (rr.endsWith(`.${rootDomain}`)) {
              rr = rr.slice(0, -(rootDomain.length + 1));
            }

            // 检查是否已存在
            const existing = await aliyunService.listDnsRecords(rootDomain, rr);
            const exists = existing.success && existing.data && existing.data.some(
              r => r.type === 'TXT' && r.RR === rr
            );

            if (!exists) {
              console.log(`[自动验证] 补充 ownership 记录: ${rr} TXT ${ov.value}`);
              await aliyunService.addDnsRecord(rootDomain, rr, 'TXT', ov.value);
            }
          }
        }

        // SSL 和 hostname 都已激活，停止
        if (sslStatus === 'active' || hostStatus === 'active') {
          console.log(`[自动验证] 域名 ${domain.subdomain}.${domain.root_domain} 验证完成!`);
          return;
        }
      }

      // 继续轮询
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, INTERVAL);
      } else {
        console.log(`[自动验证] 域名 ID ${domainId} 已达最大检查次数 ${MAX_ATTEMPTS}，停止轮询`);
      }
    } catch (error) {
      console.error(`[自动验证] 检查域名 ID ${domainId} 失败:`, error.message);
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(poll, INTERVAL);
      }
    }
  };

  // 延迟 10 秒后开始第一次检查
  setTimeout(poll, 10000);
}

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
    const { subdomain, rootDomain, fallbackSubdomain, fallbackRootDomain, optimizedIp } = req.body;

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
    const aliyunCheck = await aliyunService.listDnsRecords(rootDomain, subdomain);
    if (aliyunCheck.success && aliyunCheck.data && aliyunCheck.data.length > 0) {
      // 检查是否存在完全匹配的 RR
      const exists = aliyunCheck.data.some(r => r.RR === subdomain);
      if (exists) {
        return res.status(409).json({
          success: false,
          message: `阿里云 DNS 记录已存在: ${fullDomain}`
        });
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

    // 0.5 获取公网 IP
    const publicIp = await getPublicIp();
    console.log(`服务器公网 IP: ${publicIp}`);

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

    // 3. 添加 Hostname Ownership Verification 记录 (只需要这一个 TXT)
    // SSL 证书验证在 CNAME 到回退源后会自动通过，不需要单独添加 _acme-challenge TXT
    const addTxtRecord = async (name, value) => {
      let rr = name;
      if (rr === rootDomain) {
        rr = '@';
      } else if (rr.endsWith(`.${rootDomain}`)) {
        rr = rr.slice(0, -(rootDomain.length + 1));
      }

      console.log(`正在添加验证记录: ${rr} TXT ${value}`);
      await aliyunService.addDnsRecord(
        rootDomain,
        rr,
        'TXT',
        value
      );
    };

    if (cfResult.ownershipVerification) {
      const ov = cfResult.ownershipVerification;
      if (ov.type && ov.type.toLowerCase() === 'txt') {
        await addTxtRecord(ov.name, ov.value);
      }
    }

    // 4. 获取优选 IP（如果未指定，使用默认的第一个）
    let selectedIp = optimizedIp;
    if (!selectedIp) {
      const defaultIp = await dbGet(
        'SELECT ip_or_domain FROM optimized_ips WHERE is_active = 1 ORDER BY latency ASC LIMIT 1'
      );
      selectedIp = defaultIp ? defaultIp.ip_or_domain : fallbackOrigin;
    }

    // 5. 在阿里云配置分地区 DNS 解析
    const aliyunResult = await aliyunService.setupGeoDns(
      rootDomain,
      subdomain,
      selectedIp,      // 中国地区使用优选 IP
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

    // 6. 保存到数据库
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
      'pending'
    ]);

    // 7. 启动后台自动轮询验证
    startVerificationPolling(result.lastID);

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
