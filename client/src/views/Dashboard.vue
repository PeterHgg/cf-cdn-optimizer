<template>
  <div class="dashboard">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card>
          <el-statistic title="域名总数" :value="stats.totalDomains">
            <template #prefix>
              <el-icon><Link /></el-icon>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <el-statistic title="活跃域名" :value="stats.activeDomains">
            <template #prefix>
              <el-icon><CircleCheck /></el-icon>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <el-statistic title="优选 IP 数" :value="stats.optimizedIps">
            <template #prefix>
              <el-icon><Connection /></el-icon>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <el-statistic title="Origin 规则" :value="stats.originRules">
            <template #prefix>
              <el-icon><Guide /></el-icon>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>

    <el-card style="margin-top: 20px">
      <template #header>
        <span>快速开始</span>
      </template>
      <el-steps :active="0" finish-status="success">
        <el-step title="配置 API 密钥" description="设置 Cloudflare 和阿里云 API 密钥" />
        <el-step title="添加优选 IP" description="配置优选 IP 池" />
        <el-step title="创建域名配置" description="添加自定义主机名和 DNS 解析" />
        <el-step title="完成" description="开始使用加速服务" />
      </el-steps>

      <div style="margin-top: 30px">
        <el-button type="primary" @click="$router.push('/settings')">
          前往配置 API 密钥
        </el-button>
        <el-button @click="$router.push('/domains')">
          管理域名
        </el-button>
      </div>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <span>系统说明</span>
      </template>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="功能说明">
          本平台自动化管理 Cloudflare 自定义主机名和阿里云 DNS 分地区解析，实现境内优选 IP 加速
        </el-descriptions-item>
        <el-descriptions-item label="工作原理">
          境外访问通过 Cloudflare CDN，境内访问使用优选 IP 直连，提升访问速度
        </el-descriptions-item>
        <el-descriptions-item label="主要优势">
          自动化配置、域名验证、分地区解析、Origin 端口自定义
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '@/api'

const stats = ref({
  totalDomains: 0,
  activeDomains: 0,
  optimizedIps: 0,
  originRules: 0
})

async function loadStats() {
  try {
    const [domainsRes, ipsRes] = await Promise.all([
      api.get('/domains'),
      api.get('/optimized-ips')
    ])

    if (domainsRes.data.success) {
      stats.value.totalDomains = domainsRes.data.data.length
      stats.value.activeDomains = domainsRes.data.data.filter(d => d.status === 'active').length
    }

    if (ipsRes.data.success) {
      stats.value.optimizedIps = ipsRes.data.data.filter(ip => ip.is_active).length
    }
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.dashboard {
  padding: 0;
}
</style>
