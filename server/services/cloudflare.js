const Cloudflare = require('cloudflare');
const { dbGet } = require('../database/db');

// 缓存客户端实例
let cfClient = null;
let cachedZoneId = null;

/**
 * 获取设置值（优先数据库，回退环境变量）
 */
async function getSetting(dbKey, envKey) {
  try {
    const row = await dbGet('SELECT value FROM settings WHERE key = ?', [dbKey]);
    console.log(`获取设置 ${dbKey}:`, row ? row.value : '(无)');
    if (row && row.value) {
      return row.value;
    }
  } catch (error) {
    console.error(`获取设置 ${dbKey} 失败:`, error.message);
  }
  const envValue = process.env[envKey] || null;
  console.log(`回退到环境变量 ${envKey}:`, envValue ? '(已设置)' : '(无)');
  return envValue;
}

/**
 * 获取 Cloudflare 客户端
 */
async function getClient() {
  const email = await getSetting('cf_email', 'CF_EMAIL');
  const apiKey = await getSetting('cf_api_key', 'CF_API_KEY');
  const apiToken = await getSetting('cf_api_token', 'CF_API_TOKEN');

  // 优先使用 Email + Global API Key
  if (email && apiKey) {
    if (!cfClient || cfClient.authType !== 'key') {
      console.log('Using Cloudflare Global API Key authentication');
      // Cloudflare v4 SDK requires apiEmail and apiKey
      cfClient = new Cloudflare({ apiEmail: email, apiKey: apiKey });
      cfClient.authType = 'key';
      cfClient.email = email;
      cfClient.apiKey = apiKey;
    }
    return cfClient;
  }

  // 降级使用 API Token
  if (apiToken) {
    if (!cfClient || cfClient.authType !== 'token') {
      console.log('Using Cloudflare API Token authentication');
      cfClient = new Cloudflare({ apiToken });
      cfClient.authType = 'token';
      cfClient.apiToken = apiToken;
    }
    return cfClient;
  }

  throw new Error('未配置 Cloudflare 认证信息 (Email + API Key 或 API Token)');
}

/**
 * 获取 Zone ID
 */
async function getZoneId() {
  if (!cachedZoneId) {
    cachedZoneId = await getSetting('cf_zone_id', 'CF_ZONE_ID');

    // 如果没有配置 Zone ID，尝试自动获取第一个
    if (!cachedZoneId) {
      console.log('未配置 Zone ID，尝试自动获取...');
      const zones = await listZones();
      if (zones.success && zones.data && zones.data.length > 0) {
        cachedZoneId = zones.data[0].id;
        console.log('自动获取到 Zone ID:', cachedZoneId, `(${zones.data[0].name})`);
      }
    }
  }

  if (!cachedZoneId) {
    throw new Error('未配置 Cloudflare Zone ID，且无法自动获取，请在设置页面配置');
  }

  return cachedZoneId;
}

/**
 * 刷新客户端缓存（配置更新后调用）
 */
function refreshClient() {
  cfClient = null;
  cachedZoneId = null;
}

/**
 * 创建自定义主机名
 */
async function createCustomHostname(hostname, fallbackOrigin) {
  try {
    const cf = await getClient();
    const zoneId = await getZoneId();

    const response = await cf.customHostnames.create({
      zone_id: zoneId,
      hostname: hostname,
      ssl: {
        method: 'txt',
        type: 'dv',
        settings: {
          min_tls_version: '1.2'
        }
      },
      custom_origin_server: fallbackOrigin
    });

    return {
      success: true,
      data: response,
      customHostnameId: response.id,
      verificationRecords: response.ssl.validation_records,
      ownershipVerification: response.ownership_verification
    };
  } catch (error) {
    console.error('创建自定义主机名失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 获取自定义主机名状态
 */
async function getCustomHostnameStatus(customHostnameId) {
  try {
    const cf = await getClient();
    const zoneId = await getZoneId();

    const response = await cf.customHostnames.get(customHostnameId, { zone_id: zoneId });
    return {
      success: true,
      data: response,
      status: response.status,
      sslStatus: response.ssl.status
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 删除自定义主机名
 */
async function deleteCustomHostname(customHostnameId) {
  try {
    const cf = await getClient();
    const zoneId = await getZoneId();

    await cf.customHostnames.delete(customHostnameId, { zone_id: zoneId });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 列出所有自定义主机名
 */
async function listCustomHostnames() {
  try {
    const cf = await getClient();
    const zoneId = await getZoneId();

    console.log('使用 Zone ID:', zoneId, '类型:', typeof zoneId);
    console.log('正在连接 Cloudflare API...');

    // 修复参数传递方式：zone_id 应该在参数对象中
    const response = await cf.customHostnames.list({ zone_id: zoneId });

    console.log('Cloudflare API 连接成功');
    return {
      success: true,
      data: response
    };
  } catch (error) {
    console.error('Cloudflare 连接失败:', error.message);
    console.error('详细错误:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 创建/更新 Origin Rules（使用 Rulesets API）
 * 逻辑：确保所有受管域名在 CF 端都回源到面板当前的运行端口
 */
async function syncOriginRules() {
  try {
    const { dbAll } = require('../database/db');
    const axios = require('axios');
    const zoneId = await getZoneId();
    const cf = await getClient();
    const panelPort = parseInt(process.env.PORT || 3000);

    const authHeaders = cf.authType === 'key'
      ? { 'X-Auth-Email': cf.email, 'X-Auth-Key': cf.apiKey }
      : { 'Authorization': `Bearer ${cf.apiToken}` };
    const headers = { 'Content-Type': 'application/json', ...authHeaders };

    // 1. 获取所有受管域名
    const domains = await dbAll(
      'SELECT subdomain, root_domain, fallback_origin FROM domain_configs'
    );

    if (domains.length === 0) {
      console.log('无受管域名，跳过 Origin Rules 同步');
      return { success: true };
    }

    // 2. 如果面板在标准 443 端口，理论上不需要 Origin Rules 重写端口
    // 这种模式下，CF 默认就会回源到 443，面板作为网关直接分发流量
    if (panelPort === 443) {
       console.log('面板运行在 443 端口，进入纯网关模式，清理旧的 Origin Rules');

       // 获取现有规则集，移除所有 [CDN优选] 规则
       let rulesetId = null;
       let existingRules = [];
       try {
         const rsResp = await axios.get(
           `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_request_origin/entrypoint`,
           { headers }
         );
         if (rsResp.data.success && rsResp.data.result) {
           rulesetId = rsResp.data.result.id;
           existingRules = rsResp.data.result.rules || [];
         }
       } catch (e) {
         if (e.response?.status !== 404) throw e;
       }

       const manualRules = existingRules.filter(r => !r.description?.startsWith('[CDN优选]'));
       if (rulesetId) {
         await axios.put(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rulesetId}`, { rules: manualRules }, { headers });
       }
       console.log('Origin Rules 已清理完成 (纯网关模式)');
       return { success: true };
    }

    // 3. 构建匹配所有受管域名的规则
    const hostnames = [];
    for (const d of domains) {
      hostnames.push(`${d.subdomain}.${d.root_domain}`);
      if (d.fallback_origin) hostnames.push(d.fallback_origin);
    }
    const uniqueHostnames = [...new Set(hostnames)];

    // 分批处理，防止表达式过长（Cloudflare 有长度限制）
    const batchSize = 10;
    const autoRules = [];

    for (let i = 0; i < uniqueHostnames.length; i += batchSize) {
      const batch = uniqueHostnames.slice(i, i + batchSize);
      const conditions = batch.map(h => `(http.request.full_uri wildcard r"https://${h}/*")`);
      const expression = conditions.join(' or ');

      autoRules.push({
        action: 'route',
        action_parameters: {
          origin: {
            port: panelPort
          }
        },
        expression: expression,
        description: `[CDN优选] 统一回源至面板端口 ${panelPort} (批次 ${Math.floor(i/batchSize) + 1})`,
        enabled: true
      });
    }

    // 4. 获取现有规则集并合并
    let rulesetId = null;
    let existingRules = [];
    try {
      const rsResp = await axios.get(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_request_origin/entrypoint`,
        { headers }
      );
      if (rsResp.data.success && rsResp.data.result) {
        rulesetId = rsResp.data.result.id;
        existingRules = rsResp.data.result.rules || [];
      }
    } catch (e) {
      if (e.response?.status !== 404) throw e;
    }

    const manualRules = existingRules.filter(r => !r.description?.startsWith('[CDN优选]'));
    const allRules = [...manualRules, ...autoRules];

    // 5. 更新
    if (rulesetId) {
      await axios.put(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rulesetId}`, { rules: allRules }, { headers });
    } else if (autoRules.length > 0) {
      await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets`, {
        name: 'default', kind: 'zone', phase: 'http_request_origin', rules: allRules
      }, { headers });
    }

    console.log(`Origin Rules 同步完成: 统一指向端口 ${panelPort}`);
    return { success: true };
  } catch (error) {
    console.error('同步 Origin Rules 失败:', error.response?.data || error.message);
    return { success: false, message: error.response?.data?.errors?.[0]?.message || error.message };
  }
}

/**
 * 列出所有区域 (域名)
 */
async function listZones() {
  try {
    // 改用 axios 直接调用，绕过 cloudflare 库可能存在的 Header 问题，并获取更完整的 account 信息
    const axios = require('axios');
    const email = await getSetting('cf_email', 'CF_EMAIL');
    const apiKey = await getSetting('cf_api_key', 'CF_API_KEY');
    const apiToken = await getSetting('cf_api_token', 'CF_API_TOKEN');

    let headers = {
      'Content-Type': 'application/json'
    };

    if (email && apiKey) {
      headers['X-Auth-Email'] = email;
      headers['X-Auth-Key'] = apiKey;
    } else if (apiToken) {
      headers['Authorization'] = `Bearer ${apiToken}`;
    } else {
      throw new Error('未配置 Cloudflare 认证信息');
    }

    const response = await axios.get('https://api.cloudflare.com/client/v4/zones?per_page=50&status=active', { headers });

    if (response.data.success) {
      return {
        success: true,
        data: response.data.result
      };
    } else {
      return {
        success: false,
        message: response.data.errors?.[0]?.message || 'Cloudflare API error'
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.errors?.[0]?.message || error.message
    };
  }
}

/**
 * 添加 DNS 记录
 */
async function addDnsRecord(zoneId, type, name, content, proxied = false) {
  try {
    const cf = await getClient();
    const response = await cf.dns.records.create({
      zone_id: zoneId,
      type: type,
      name: name,
      content: content,
      proxied: proxied
    });
    return {
      success: true,
      data: response
    };
  } catch (error) {
    // 如果记录已存在，尝试忽略错误或返回特定状态
    if (error.message && error.message.includes('Record already exists')) {
      return { success: true, message: 'Record already exists', existing: true };
    }
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 列出 DNS 记录
 */
async function listDnsRecords(zoneId, name, type) {
  try {
    const cf = await getClient();
    const params = { zone_id: zoneId };
    if (name) params.name = name;
    if (type) params.type = type;

    const response = await cf.dns.records.list(params);
    return {
      success: true,
      data: response.result
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 删除 DNS 记录
 */
async function deleteDnsRecord(zoneId, recordId) {
  try {
    const cf = await getClient();
    await cf.dns.records.delete(recordId, { zone_id: zoneId });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = {
  createCustomHostname,
  getCustomHostnameStatus,
  deleteCustomHostname,
  listCustomHostnames,
  syncOriginRules,
  refreshClient,
  listZones,
  addDnsRecord,
  deleteDnsRecord,
  listDnsRecords,
  getZoneId
};
