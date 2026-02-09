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
    if (row && row.value) {
      return row.value;
    }
  } catch (error) {
    // 数据库可能还没初始化，忽略错误
  }
  return process.env[envKey] || null;
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

    const response = await cf.customHostnames.create(zoneId, {
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

    const response = await cf.customHostnames.get(zoneId, customHostnameId);
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

    await cf.customHostnames.delete(zoneId, customHostnameId);
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

    console.log('正在连接 Cloudflare API...');
    const response = await cf.customHostnames.list(zoneId);
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
    const response = await cf.pagerules.create(zoneId, {
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

module.exports = {
  createCustomHostname,
  getCustomHostnameStatus,
  deleteCustomHostname,
  listCustomHostnames,
  createOriginRule,
  refreshClient
};
