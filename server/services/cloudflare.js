const Cloudflare = require('cloudflare');

const cf = new Cloudflare({
  apiToken: process.env.CF_API_TOKEN
});

const zoneId = process.env.CF_ZONE_ID;

/**
 * 创建自定义主机名
 */
async function createCustomHostname(hostname, fallbackOrigin) {
  try {
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
    const response = await cf.customHostnames.list(zoneId);
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
 * 创建 Origin 规则
 */
async function createOriginRule(hostname, port) {
  try {
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
  createOriginRule
};
