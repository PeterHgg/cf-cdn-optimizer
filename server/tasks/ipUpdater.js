const cron = require('node-cron');
const axios = require('axios');
const { dbRun, dbAll } = require('../database/db');

/**
 * 定时更新优选 IP 的延迟信息
 */
async function updateOptimizedIpsLatency() {
  try {
    console.log('🔄 开始更新优选 IP 延迟信息...');

    const ips = await dbAll('SELECT * FROM optimized_ips WHERE is_active = 1');

    for (const ip of ips) {
      try {
        const startTime = Date.now();
        const target = ip.type === 'domain' ? `https://${ip.ip_or_domain}` : `https://${ip.ip_or_domain}`;

        await axios.get(target, { timeout: 5000 });

        const latency = Date.now() - startTime;

        await dbRun(`
          UPDATE optimized_ips
          SET latency = ?, last_check = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [latency, ip.id]);

        console.log(`✅ ${ip.ip_or_domain}: ${latency}ms`);
      } catch (error) {
        console.log(`❌ ${ip.ip_or_domain}: 超时或无法访问`);
        await dbRun(`
          UPDATE optimized_ips
          SET latency = NULL, last_check = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [ip.id]);
      }
    }

    console.log('✅ 优选 IP 延迟更新完成');
  } catch (error) {
    console.error('❌ 更新优选 IP 失败:', error.message);
  }
}

// 每小时执行一次（可根据 .env 配置调整）
const interval = process.env.IP_UPDATE_INTERVAL || 24;
cron.schedule(`0 */${interval} * * *`, updateOptimizedIpsLatency);

console.log(`⏰ 优选 IP 更新任务已启动，每 ${interval} 小时执行一次`);

module.exports = { updateOptimizedIpsLatency };
