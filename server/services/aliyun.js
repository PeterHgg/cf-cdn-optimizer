const alidns = require('@alicloud/alidns20150109');
const AlidnsClient = alidns.default;
const {
  AddDomainRecordRequest,
  UpdateDomainRecordRequest,
  DeleteDomainRecordRequest,
  DescribeDomainRecordsRequest,
  DescribeDomainsRequest
} = alidns;
const OpenApi = require('@alicloud/openapi-client');
const { dbGet } = require('../database/db');

// 缓存客户端实例
let aliyunClient = null;

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
 * 获取阿里云 DNS 客户端
 */
async function getClient() {
  const accessKeyId = await getSetting('aliyun_access_key_id', 'ALIYUN_ACCESS_KEY_ID');
  const accessKeySecret = await getSetting('aliyun_access_key_secret', 'ALIYUN_ACCESS_KEY_SECRET');

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('未配置阿里云 AccessKey，请在设置页面配置');
  }

  // 每次都创建新客户端，确保使用最新配置
  const config = new OpenApi.Config({
    accessKeyId,
    accessKeySecret,
    endpoint: 'alidns.cn-hangzhou.aliyuncs.com'
  });

  return new AlidnsClient(config);
}

/**
 * 刷新客户端缓存（配置更新后调用）
 */
function refreshClient() {
  aliyunClient = null;
}

/**
 * 添加 DNS 记录（分地区解析）
 */
async function addDnsRecord(domainName, subdomain, recordType, value, line = 'default') {
  try {
    const client = await getClient();
    const request = new AddDomainRecordRequest({
      domainName: domainName,
      RR: subdomain,
      type: recordType,
      value: value,
      line: line // default, telecom, unicom, mobile, overseas, etc.
    });

    const response = await client.addDomainRecord(request);

    return {
      success: true,
      recordId: response.body.recordId
    };
  } catch (error) {
    console.error('添加 DNS 记录失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 更新 DNS 记录
 */
async function updateDnsRecord(recordId, RR, recordType, value) {
  try {
    const client = await getClient();
    const request = new UpdateDomainRecordRequest({
      recordId: recordId,
      RR: RR,
      type: recordType,
      value: value
    });

    await client.updateDomainRecord(request);

    return { success: true };
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
async function deleteDnsRecord(recordId) {
  try {
    const client = await getClient();
    const request = new DeleteDomainRecordRequest({
      recordId: recordId
    });

    await client.deleteDomainRecord(request);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 获取域名记录列表
 */
async function listDnsRecords(domainName, subdomain = null) {
  try {
    const client = await getClient();
    const request = new DescribeDomainRecordsRequest({
      domainName: domainName,
      RRKeyWord: subdomain
    });

    const response = await client.describeDomainRecords(request);

    return {
      success: true,
      data: response.body.domainRecords.record
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 检测记录类型 (IP -> A, 域名 -> CNAME)
 */
function detectRecordType(value) {
  // 简单 IPv4 正则检测
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(value)) {
    return 'A';
  }
  return 'CNAME';
}

/**
 * 配置分地区解析
 * @param {string} domainName - 根域名
 * @param {string} subdomain - 子域名
 * @param {string} chinaValue - 中国大陆解析值（优选 IP 或 CNAME）
 * @param {string} overseasValue - 海外解析值（回退源 CNAME 或 IP）
 */
async function setupGeoDns(domainName, subdomain, chinaValue, overseasValue) {
  try {
    // 删除现有记录
    const existingRecords = await listDnsRecords(domainName, subdomain);
    if (existingRecords.success && existingRecords.data) {
      for (const record of existingRecords.data) {
        await deleteDnsRecord(record.recordId);
      }
    }

    // 添加默认解析 (解析到回退源，作为兜底/海外)
    // 用户反馈：需要默认地区解析到回退源
    const overseasType = detectRecordType(overseasValue);
    console.log(`添加默认解析 (回退源): ${overseasValue} (${overseasType})`);
    const defaultRecord = await addDnsRecord(
      domainName,
      subdomain,
      overseasType,
      overseasValue,
      'default'
    );

    // 添加中国三大运营商解析 (解析到优选 IP/域名)
    // 用户反馈：中国地区解析到优选域名。由于免费版不支持单一的"中国"线路，这里使用三大运营商代替
    const chinaType = detectRecordType(chinaValue);
    const chinaLines = ['telecom', 'unicom', 'mobile'];
    const chinaRecordIds = [];

    console.log(`添加中国地区解析 (优选): ${chinaValue} (${chinaType})`);

    for (const line of chinaLines) {
      try {
        const result = await addDnsRecord(
          domainName,
          subdomain,
          chinaType,
          chinaValue,
          line
        );
        if (result.success) {
          chinaRecordIds.push(result.recordId);
        } else {
          console.warn(`添加 ${line} 线路失败: ${result.message}`);
        }
      } catch (error) {
        console.warn(`添加 ${line} 线路异常: ${error.message}`);
      }
    }

    return {
      success: true,
      // 返回第一个成功的 ID 作为 chinaRecordId (数据库只存了一个字段，兼容旧结构)
      chinaRecordId: chinaRecordIds.length > 0 ? chinaRecordIds[0] : null,
      overseasRecordId: defaultRecord.recordId, // 这里的 overseasRecordId 实际上存的是默认(回退)记录的 ID
      warning: chinaRecordIds.length === 0 ? '中国地区(运营商)解析添加失败' : null
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 获取账户下的域名列表
 */
async function listDomains() {
  try {
    const client = await getClient();
    const request = new DescribeDomainsRequest({
      pageSize: 100
    });

    const response = await client.describeDomains(request);

    // Normalize response structure (handle both camelCase and PascalCase from SDK)
    const body = response.body;
    const domainsList = body.domains?.domain || body.Domains?.Domain || [];

    // Map to consistent camelCase format
    const normalizedDomains = domainsList.map(item => ({
      domainId: item.DomainId || item.domainId,
      domainName: item.DomainName || item.domainName,
      punyCode: item.PunyCode || item.punyCode,
      dnsServers: item.DnsServers?.DnsServer || item.dnsServers?.dnsServer || []
    }));

    // Debug logging
    console.log(`Found ${normalizedDomains.length} domains from Aliyun`);

    return {
      success: true,
      data: normalizedDomains
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = {
  addDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  listDnsRecords,
  setupGeoDns,
  refreshClient,
  listDomains
};
