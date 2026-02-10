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
      cfClient = new Cloudflare({ email, key: apiKey });
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
  }

  if (!cachedZoneId) {
    throw new Error('未配置 Cloudflare Zone ID，请在设置页面配置');
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
 * 创建 Origin 规则
 */
async function createOriginRule(hostname, port) {
  try {
    const cf = await getClient();
    const zoneId = await getZoneId();

    // 使用 Page Rules 或者 Workers 来实现端口转发
    // 这里使用 DNS 记录 + Page Rule 的方式
    const response = await cf.pagerules.create({
      zone_id: zoneId,
      targets: [{
        target: 'url',
        constraint: {
          operator: 'matches',
          value: `*${hostname}/*`
        }
      }],
      actions: [{
        id: 'forwarding_url',
        value: {
          url: `https://${hostname}:${port}/$1`,
          status_code: 301
        }
      }],
      status: 'active'
    });

    return {
      success: true,
      data: response
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 列出所有区域 (域名)
 */
async function listZones() {
  try {
    const cf = await getClient();
    const response = await cf.zones.list();
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
      throw new Error(resp.data.errors?.[0]?.message || 'Cloudflare API error');
    }

    return { success: true, data: resp.data.result };

  } catch (error) {
    console.error('生成证书失败:', error);
    // 回退策略：如果是 "method not found" 类错误，可以尝试直接 fetch
    // 这里简化处理，直接返回错误
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
  createOriginRule,
  refreshClient,
  listZones,
  addDnsRecord,
  deleteDnsRecord,
  listDnsRecords,
  getZoneId,
  createOriginCertificate
};
