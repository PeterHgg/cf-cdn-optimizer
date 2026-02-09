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
  const apiToken = await getSetting('cf_api_token', 'CF_API_TOKEN');

  if (!apiToken) {
    throw new Error('未配置 Cloudflare API Token，请在设置页面配置');
  }

  // 如果 token 变化，重新创建客户端
  if (!cfClient) {
    cfClient = new Cloudflare({ apiToken });
  }

  return cfClient;
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
      verificationRecords: response.ssl.validation_records
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

module.exports = {
  createCustomHostname,
  getCustomHostnameStatus,
  deleteCustomHostname,
  listCustomHostnames,
  createOriginRule,
  refreshClient,
  listZones,
  addDnsRecord,
  listDnsRecords,
  getZoneId
};
