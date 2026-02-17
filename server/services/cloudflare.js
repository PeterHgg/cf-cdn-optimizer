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
 * 按端口分组，每个端口一条规则，匹配所有使用该端口的域名
 */
async function syncOriginRules() {
  try {
    const { dbAll } = require('../database/db');
    const axios = require('axios');
    const zoneId = await getZoneId();
    const cf = await getClient();

    const authHeaders = cf.authType === 'key'
      ? { 'X-Auth-Email': cf.email, 'X-Auth-Key': cf.apiKey }
      : { 'Authorization': `Bearer ${cf.apiToken}` };
    const headers = { 'Content-Type': 'application/json', ...authHeaders };

    // 1. 获取所有需要端口转发的域名
    const domains = await dbAll(
      'SELECT subdomain, root_domain, fallback_origin, origin_port FROM domain_configs WHERE origin_port IS NOT NULL AND origin_port != 443'
    );

    // 2. 按端口分组
    const portGroups = {};
    for (const d of domains) {
      const port = d.origin_port;
      if (!portGroups[port]) portGroups[port] = [];
      const fullDomain = `${d.subdomain}.${d.root_domain}`;
      portGroups[port].push(fullDomain);
      // 同时匹配回退源
      if (d.fallback_origin) {
        portGroups[port].push(d.fallback_origin);
      }
    }

    // 3. 获取当前 zone 的 origin rules ruleset
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
      // 404 表示还没有 origin rules ruleset，后面创建时会自动生成
      if (e.response?.status !== 404) {
        throw e;
      }
    }

    // 4. 保留非本系统管理的规则（不以 [CDN优选] 开头的）
    const manualRules = existingRules.filter(r => !r.description?.startsWith('[CDN优选]'));

    // 5. 构建本系统管理的规则
    const autoRules = [];
    for (const [port, hostnames] of Object.entries(portGroups)) {
      // 去重
      const unique = [...new Set(hostnames)];
      // 构建 expression: (http.request.full_uri wildcard r"https://host1/*") or (http.request.full_uri wildcard r"https://host2/*")
      const conditions = unique.map(h =>
        `(http.request.full_uri wildcard r"https://${h}/*")`
      );
      const expression = conditions.join(' or ');

      autoRules.push({
        action: 'route',
        action_parameters: {
          origin: {
            port: parseInt(port)
          }
        },
        expression: expression,
        description: `[CDN优选] 回源${port}`,
        enabled: true
      });
    }

    // 6. 合并规则（手动规则在前，自动规则在后）
    const allRules = [...manualRules, ...autoRules];

    // 7. 更新或创建 ruleset
    if (rulesetId) {
      // 更新现有 ruleset
      await axios.put(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rulesetId}`,
        { rules: allRules },
        { headers }
      );
    } else if (autoRules.length > 0) {
      // 创建新的 ruleset
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets`,
        {
          name: 'default',
          kind: 'zone',
          phase: 'http_request_origin',
          rules: allRules
        },
        { headers }
      );
    }

    console.log(`Origin Rules 同步完成: ${autoRules.length} 条自动规则`);
    return { success: true, rulesCount: autoRules.length };
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

/**
 * 生成 Origin CA 证书
 */
async function createOriginCertificate(hostnames, validityDays = 5475) {
  try {
    const cf = await getClient();
    // Cloudflare Node.js 库通常没有直接封装 Origin CA 的 endpoint，或者位置比较隐蔽
    // 这里我们尝试使用通用的 fetch 方法或者 request 方法，如果库支持
    // 假设 library 是 cloudflare v3/v4

    // 构造请求体
    const body = {
      hostnames: hostnames,
      request_type: 'origin-rsa',
      requested_validity: validityDays
    };

    // 如果库有直接的方法
    if (cf.originCA && cf.originCA.create) {
      const response = await cf.originCA.create(body);
      return { success: true, data: response };
    }

    // 如果没有直接方法，尝试使用 certificates endpoint (Origin CA)
    // 许多库版本将其放在 cf.certificates 下，但这通常是 Client Certificates
    // Origin CA 的 API 端点是 POST /certificates

    // 既然我们有 cf 实例，我们可以利用它来发送请求，但库的具体实现可能不同
    // 安全起见，我们直接抛出错误让上层处理，或者在这里使用 axios (如果引入了)
    // 但为了保持一致性，我们尝试寻找库的通用请求方法

    // 尝试 cf.certificates.create (有些版本映射到 Origin CA)
    if (cf.originCA && cf.originCA.create) {
       const response = await cf.originCA.create(body);
       return { success: true, data: response };
    }

    // 如果库不支持，回退到原生 HTTP 请求
    // Cloudflare API Endpoint: POST https://api.cloudflare.com/client/v4/certificates
    const axios = require('axios');
    const authHeaders = cf.authType === 'key'
      ? { 'X-Auth-Email': cf.email, 'X-Auth-Key': cf.apiKey }
      : { 'Authorization': `Bearer ${cf.apiToken}` };

    const resp = await axios.post('https://api.cloudflare.com/client/v4/certificates', body, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });

    if (!resp.data.success) {
      const errorMsg = resp.data.errors?.[0]?.message || 'Cloudflare API error';
      const errorCode = resp.data.errors?.[0]?.code;
      throw new Error(`${errorMsg}${errorCode ? ' (Code: ' + errorCode + ')' : ''}`);
    }

    return { success: true, data: resp.data.result };

  } catch (error) {
    console.error('生成证书失败:', error.response?.data || error.message);
    let message = error.message;
    if (error.response?.data?.errors?.[0]) {
      const cfErr = error.response.data.errors[0];
      message = `${cfErr.message}${cfErr.code ? ' (Code: ' + cfErr.code + ')' : ''}`;
    }
    return {
      success: false,
      message: message
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
  getZoneId,
  createOriginCertificate
};
