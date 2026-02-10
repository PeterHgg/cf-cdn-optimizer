const cron = require('node-cron');
const { dbAll, dbRun, dbGet } = require('../database/db');
const cfService = require('./cloudflare');
const aliyunService = require('./aliyun');

/**
 * 检查单个域名的状态并执行自愈逻辑
 * @param {Object|number|string} domainOrId - 域名对象或ID
 */
async function checkDomain(domainOrId) {
  let domain = domainOrId;
  // 如果输入是 ID，从数据库获取
  if (typeof domainOrId === 'string' || typeof domainOrId === 'number') {
    domain = await dbGet('SELECT * FROM domain_configs WHERE id = ?', [domainOrId]);
  }

  if (!domain || !domain.cf_custom_hostname_id) {
    return { success: false, message: '域名配置无效或不存在' };
  }

  try {
    const status = await cfService.getCustomHostnameStatus(domain.cf_custom_hostname_id);

    if (!status.success) {
      console.error(`[Monitor] 获取域名状态失败 ${domain.subdomain}.${domain.root_domain}: ${status.message}`);
      return status;
    }

    const sslStatus = status.sslStatus;
    const hostStatus = status.status;

    // 更新数据库状态
    // 注意: 这里主要更新 sslStatus 作为主状态，或者根据业务逻辑组合
    if (domain.status !== sslStatus && sslStatus) {
      await dbRun(
        'UPDATE domain_configs SET status = ? WHERE id = ?',
        [sslStatus, domain.id]
      );
      console.log(`[Monitor] 状态更新 ${domain.subdomain}.${domain.root_domain}: ${domain.status} -> ${sslStatus}`);
    }

    // 如果完全激活，直接返回 (暂不自动清理 TXT 记录，以免反复验证震荡，除非有明确需求)
    if (sslStatus === 'active' && hostStatus === 'active') {
        return status;
    }

    // 辅助函数: 确保 TXT 记录存在
    const ensureTxtRecord = async (name, value) => {
        let rr = name;
        const rootDomain = domain.root_domain;
        // 处理 RR
        if (rr === rootDomain) {
            rr = '@';
        } else if (rr.endsWith(`.${rootDomain}`)) {
            rr = rr.slice(0, -(rootDomain.length + 1));
        }

        // 检查是否已存在
        const existing = await aliyunService.listDnsRecords(rootDomain, rr);
        const exists = existing.success && existing.data && existing.data.some(
            r => r.type === 'TXT' && r.RR === rr && r.Value === value
        );

        if (!exists) {
            console.log(`[Monitor] 自动修复: 添加缺失的验证记录 ${rr} TXT ${value}`);
            await aliyunService.addDnsRecord(rootDomain, rr, 'TXT', value);
        }
    };

    // 1. 检查 Ownership 验证记录
    if (hostStatus === 'pending' && status.data && status.data.ownership_verification) {
        const ov = status.data.ownership_verification;
        if (ov.type && ov.type.toLowerCase() === 'txt' && ov.name && ov.value) {
            await ensureTxtRecord(ov.name, ov.value);
        }
    }

    // 2. 检查 SSL 验证记录
    if (sslStatus === 'pending_validation' && status.data && status.data.ssl && status.data.ssl.validation_records) {
        const vrs = status.data.ssl.validation_records;
        if (Array.isArray(vrs)) {
            for (const vr of vrs) {
                const recordName = vr.txt_name || vr.name;
                const recordValue = vr.txt_value || vr.value;
                const recordType = vr.type; // CNAME or TXT

                if (recordName && recordValue) {
                    if (recordType === 'CNAME') {
                        // 处理 CNAME 验证记录
                        let rr = recordName;
                        const rootDomain = domain.root_domain;
                        if (rr === rootDomain) {
                            rr = '@';
                        } else if (rr.endsWith(`.${rootDomain}`)) {
                            rr = rr.slice(0, -(rootDomain.length + 1));
                        }

                        // 检查是否存在
                        const existing = await aliyunService.listDnsRecords(rootDomain, rr);
                        const exists = existing.success && existing.data && existing.data.some(
                            r => r.type === 'CNAME' && r.RR === rr && r.Value === recordValue
                        );

                        if (!exists) {
                            console.log(`[Monitor] 自动修复: 添加缺失的验证记录 ${rr} CNAME ${recordValue}`);
                            await aliyunService.addDnsRecord(rootDomain, rr, 'CNAME', recordValue);
                        }
                    } else {
                        // 默认为 TXT
                        await ensureTxtRecord(recordName, recordValue);
                    }
                }
            }
        }
    }

    return status;

  } catch (error) {
    console.error(`[Monitor] 检查域名失败 ${domain.id}:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * 检查所有域名
 */
async function checkAllDomains() {
  console.log('[Monitor] 开始执行定时域名检查...');
  try {
    const domains = await dbAll('SELECT * FROM domain_configs');
    for (const domain of domains) {
      await checkDomain(domain);
    }
  } catch (error) {
    console.error('[Monitor] 全局检查失败:', error);
  }
}

/**
 * 启动监控服务
 */
function start() {
  // 每 2 分钟执行一次
  cron.schedule('*/2 * * * *', checkAllDomains);
  console.log('🕒 域名监控服务已启动 (每2分钟)');
}

module.exports = {
  start,
  checkDomain
};
