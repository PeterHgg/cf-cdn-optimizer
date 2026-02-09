const AlidnsClient = require('@alicloud/alidns20150109').default;
const OpenApi = require('@alicloud/openapi-client');

// 创建阿里云 DNS 客户端
const config = new OpenApi.Config({
  accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
  accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET,
  endpoint: 'alidns.cn-hangzhou.aliyuncs.com'
});

const client = new AlidnsClient(config);

/**
 * 添加 DNS 记录（分地区解析）
 */
async function addDnsRecord(domainName, subdomain, recordType, value, line = 'default') {
  try {
    const request = new AlidnsClient.AddDomainRecordRequest({
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
    const request = new AlidnsClient.UpdateDomainRecordRequest({
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
    const request = new AlidnsClient.DeleteDomainRecordRequest({
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
    const request = new AlidnsClient.DescribeDomainRecordsRequest({
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
 * 配置分地区解析
 * @param {string} domainName - 根域名
 * @param {string} subdomain - 子域名
 * @param {string} chinaValue - 中国大陆解析值（优选 IP）
 * @param {string} overseasValue - 海外解析值（回退源）
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

    // 添加中国大陆解析
    const chinaRecord = await addDnsRecord(
      domainName,
      subdomain,
      'CNAME',
      chinaValue,
      'default' // 中国大陆线路
    );

    // 添加海外解析
    const overseasRecord = await addDnsRecord(
      domainName,
      subdomain,
      'CNAME',
      overseasValue,
      'overseas' // 海外线路
    );

    return {
      success: true,
      chinaRecordId: chinaRecord.recordId,
      overseasRecordId: overseasRecord.recordId
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
  setupGeoDns
};
