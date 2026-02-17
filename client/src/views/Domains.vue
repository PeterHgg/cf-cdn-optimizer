<template>
  <div class="domains">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>域名管理</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            添加域名
          </el-button>
        </div>
      </template>

      <el-table :data="domains" v-loading="loading" stripe>
        <el-table-column type="expand" v-if="isMobile">
          <template #default="{ row }">
            <el-descriptions :column="1" size="small" border style="margin: 10px">
              <el-descriptions-item label="回退源">{{ row.fallback_origin }}</el-descriptions-item>
              <el-descriptions-item label="优选 IP">{{ row.optimized_ip || '-' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ row.created_at }}</el-descriptions-item>
            </el-descriptions>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="ID" width="50" v-if="!isMobile" />
        <el-table-column label="完整域名" min-width="150">
          <template #default="{ row }">
            <div style="font-weight: 500">{{ row.subdomain }}.{{ row.root_domain }}</div>
          </template>
        </el-table-column>
        <el-table-column label="回退源" min-width="140" v-if="!isMobile">
          <template #default="{ row }">
            {{ row.fallback_origin }}
          </template>
        </el-table-column>
        <el-table-column label="优选 IP" min-width="120" v-if="!isMobile">
          <template #default="{ row }">
            {{ row.optimized_ip || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="端口" width="70">
          <template #default="{ row }">
            {{ row.origin_port || 443 }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="isMobile ? 120 : 200" :fixed="isMobile ? false : 'right'">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetails(row)" :icon="isMobile ? '' : ''">
              {{ isMobile ? '' : '详情' }}
              <el-icon v-if="isMobile"><View /></el-icon>
            </el-button>
            <el-button
              size="small"
              type="danger"
              @click="deleteDomain(row)"
              :loading="deletingId === row.id"
              :disabled="deletingId !== null && deletingId !== row.id"
              :icon="isMobile ? '' : ''"
            >
              {{ isMobile ? '' : '删除' }}
              <el-icon v-if="isMobile"><Delete /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加域名对话框 -->
    <el-dialog v-model="showAddDialog" title="添加域名配置" :width="isMobile ? '95%' : '600px'">
      <el-form :model="domainForm" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="阿里云域名" required>
          <el-row :gutter="isMobile ? 0 : 10" style="width: 100%">
            <el-col :span="isMobile ? 24 : 10">
              <el-input v-model="domainForm.subdomain" placeholder="子域名 (如: cdn)" />
            </el-col>
            <el-col v-if="!isMobile" :span="2" style="text-align: center; line-height: 32px">
              .
            </el-col>
            <el-col :span="isMobile ? 24 : 12" :style="{ marginTop: isMobile ? '10px' : '0' }">
              <el-select v-model="domainForm.rootDomain" placeholder="选择根域名" filterable style="width: 100%">
                <el-option
                  v-for="domain in aliyunDomains"
                  :key="domain.domainId"
                  :label="domain.domainName"
                  :value="domain.domainName"
                />
              </el-select>
            </el-col>
          </el-row>
        </el-form-item>

        <el-form-item label="CF 回退源" required>
          <el-row :gutter="isMobile ? 0 : 10" style="width: 100%">
            <el-col :span="isMobile ? 24 : 10">
              <el-input v-model="domainForm.fallbackSubdomain" placeholder="回退子域名 (如: back)" />
            </el-col>
            <el-col v-if="!isMobile" :span="2" style="text-align: center; line-height: 32px">
              .
            </el-col>
            <el-col :span="isMobile ? 24 : 12" :style="{ marginTop: isMobile ? '10px' : '0' }">
              <el-select v-model="domainForm.fallbackRootDomain" placeholder="选择 CF 根域名" filterable style="width: 100%">
                <el-option
                  v-for="zone in cfZones"
                  :key="zone.id"
                  :label="zone.name"
                  :value="zone.name"
                />
              </el-select>
            </el-col>
          </el-row>
        </el-form-item>

        <el-form-item label="回退源IP" required>
          <el-input v-model="domainForm.customPublicIp" placeholder="请输入回退源IP" />
        </el-form-item>

        <el-form-item label="优选 IP">
          <el-select
            v-model="domainForm.optimizedIp"
            placeholder="选择优选 IP（可选）"
            clearable
            multiple
            collapse-tags
            style="width: 100%"
          >
            <el-option
              v-for="ip in optimizedIps"
              :key="ip.id"
              :label="`${ip.ip_or_domain} (${ip.region || 'Unknown'})`"
              :value="ip.ip_or_domain"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="本地服务端口">
          <el-input-number v-model="domainForm.originPort" :min="1" :max="65535" placeholder="例如: 8080" />
          <div style="color: #909399; font-size: 12px; margin-top: 4px">
            流量将由面板网关转发至本地此端口，支持 1-65535 任意端口。
          </div>
        </el-form-item>

        <el-divider content-position="left">回源证书配置</el-divider>

        <el-form-item label="证书来源">
          <el-radio-group v-model="domainForm.certMode">
            <el-radio-button value="none">无需配置</el-radio-button>
            <el-radio-button value="cert_id">从证书库选择</el-radio-button>
            <el-radio-button value="file_path">文件路径</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="domainForm.certMode === 'cert_id'" label="选择证书">
          <el-select v-model="domainForm.certificateId" placeholder="选择已有证书" style="width: 100%">
            <el-option
              v-for="cert in certificates"
              :key="cert.id"
              :label="`${cert.domain} (${cert.type === 'origin' ? 'Origin CA' : '自定义'})`"
              :value="cert.id"
            />
          </el-select>
        </el-form-item>

        <template v-if="domainForm.certMode === 'file_path'">
          <el-form-item label="证书路径">
            <el-input v-model="domainForm.certFilePath" placeholder="例如: /etc/ssl/cert.pem" />
          </el-form-item>
          <el-form-item label="私钥路径">
            <el-input v-model="domainForm.keyFilePath" placeholder="例如: /etc/ssl/key.pem" />
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addDomain" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 域名详情对话框 -->
    <el-dialog v-model="showDetailDialog" title="域名详情" :width="isMobile ? '95%' : '700px'">
      <el-descriptions v-if="currentDomain" :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="完整域名" :span="isMobile ? 1 : 2">
          {{ currentDomain.subdomain }}.{{ currentDomain.root_domain }}
        </el-descriptions-item>
        <el-descriptions-item label="回退源">
          {{ currentDomain.fallback_origin }}
        </el-descriptions-item>
        <el-descriptions-item label="优选 IP">
          {{ currentDomain.optimized_ip }}
        </el-descriptions-item>
        <el-descriptions-item label="CF 主机名 ID" :span="isMobile ? 1 : 2">
          {{ currentDomain.cf_custom_hostname_id }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="isMobile ? 1 : 2">
          {{ currentDomain.created_at }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- 回源证书配置 -->
      <el-card shadow="never" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>回源证书配置</span>
            <el-button type="primary" size="small" @click="saveCertBinding" :loading="savingCert">
              保存证书配置
            </el-button>
          </div>
        </template>

        <el-form :model="certBindForm" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
          <el-form-item label="证书来源">
            <el-radio-group v-model="certBindForm.certMode">
              <el-radio-button value="none">无需配置</el-radio-button>
              <el-radio-button value="cert_id">从证书库选择</el-radio-button>
              <el-radio-button value="file_path">文件路径</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="certBindForm.certMode === 'cert_id'" label="选择证书">
            <el-select v-model="certBindForm.certificateId" placeholder="选择已有证书" style="width: 100%">
              <el-option
                v-for="cert in certificates"
                :key="cert.id"
                :label="`${cert.domain} (${cert.type === 'origin' ? 'Origin CA' : '自定义'})`"
                :value="cert.id"
              />
            </el-select>
          </el-form-item>

          <template v-if="certBindForm.certMode === 'file_path'">
            <el-form-item label="证书路径">
              <el-input v-model="certBindForm.certFilePath" placeholder="例如: /etc/ssl/cert.pem" />
            </el-form-item>
            <el-form-item label="私钥路径">
              <el-input v-model="certBindForm.keyFilePath" placeholder="例如: /etc/ssl/key.pem" />
            </el-form-item>
          </template>

          <el-alert
            v-if="currentDomain?.certificate"
            type="success"
            :closable="false"
            style="margin-top: 10px"
          >
            <template #title>
              当前绑定证书: {{ currentDomain.certificate.domain }} ({{ currentDomain.certificate.type === 'origin' ? 'Origin CA' : '自定义' }})
              <span v-if="currentDomain.certificate.expires_at"> | 过期时间: {{ formatDate(currentDomain.certificate.expires_at) }}</span>
            </template>
          </el-alert>
        </el-form>
      </el-card>

      <!-- 本地服务端口配置 -->
      <el-card shadow="never" style="margin-top: 20px">
        <template #header>
          <div class="card-header">
            <span>本地服务端口配置</span>
            <el-button type="primary" size="small" @click="saveOriginPort" :loading="savingPort">
              保存端口配置
            </el-button>
          </div>
        </template>

        <el-form :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
          <el-form-item label="服务端口">
            <el-input-number v-model="originPortForm" :min="1" :max="65535" placeholder="例如: 8080" />
            <div style="color: #909399; font-size: 12px; margin-top: 4px">
              当前端口: {{ currentDomain?.origin_port || 443 }}。流量将通过面板网关反代至此端口。
            </div>
          </el-form-item>
        </el-form>
      </el-card>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { View, Delete } from '@element-plus/icons-vue'
import api from '@/api'

const isMobile = inject('isMobile')

const domains = ref([])
const aliyunDomains = ref([])
const cfZones = ref([])
const optimizedIps = ref([])
const certificates = ref([])
const loading = ref(false)
const submitting = ref(false)
const deletingId = ref(null)
const savingCert = ref(false)
const savingPort = ref(false)
const showAddDialog = ref(false)
const showDetailDialog = ref(false)
const currentDomain = ref(null)
const originPortForm = ref(443)
let pollTimer = null

const domainForm = ref({
  subdomain: '',
  rootDomain: '',
  fallbackSubdomain: '',
  fallbackRootDomain: '',
  optimizedIp: [],
  customPublicIp: '',
  originPort: null,
  certMode: 'none',
  certificateId: null,
  certFilePath: '',
  keyFilePath: ''
})

const certBindForm = ref({
  certMode: 'none',
  certificateId: null,
  certFilePath: '',
  keyFilePath: ''
})

function getStatusType(status) {
  const types = {
    active: 'success',
    pending: 'warning',
    failed: 'danger'
  }
  return types[status] || 'info'
}

function getStatusText(status) {
  const texts = {
    active: '活跃',
    pending: '待验证',
    failed: '失败'
  }
  return texts[status] || status
}

async function loadDomains() {
  loading.value = true
  try {
    const res = await api.get('/domains')
    if (res.data.success) {
      domains.value = res.data.data
    }
  } catch (error) {
    console.error('加载域名失败:', error)
  } finally {
    loading.value = false
  }
}

async function loadOptimizedIps() {
  try {
    const res = await api.get('/optimized-ips')
    if (res.data.success) {
      optimizedIps.value = res.data.data.filter(ip => ip.is_active)
    }
  } catch (error) {
    console.error('加载优选 IP 失败:', error)
  }
}

async function loadCertificates() {
  try {
    const res = await api.get('/certificates')
    if (res.data.success) {
      certificates.value = res.data.data
    }
  } catch (error) {
    console.error('加载证书列表失败:', error)
  }
}

function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadAliyunDomains() {
  try {
    const res = await api.get('/domains/aliyun-domains')
    if (res.data.success) {
      aliyunDomains.value = res.data.data
    } else {
      // Show error if API explicitly returns false success
      ElMessage.error(res.data.message || '获取阿里云域名列表失败')
    }
  } catch (error) {
    console.error('加载阿里云域名失败:', error)
    ElMessage.error('加载阿里云域名失败，请检查网络或配置')
  }
}

async function loadCfZones() {
  try {
    const res = await api.get('/domains/cf-zones')
    if (res.data.success) {
      cfZones.value = res.data.data
    }
  } catch (error) {
    console.error('加载 CF Zones 失败:', error)
  }
}

async function fetchPublicIp() {
  try {
    const res = await api.get('/domains/public-ip')
    if (res.data.success) {
      domainForm.value.customPublicIp = res.data.ip
    }
  } catch (error) {
    console.error('获取公网IP失败:', error)
  }
}

async function addDomain(overwrite = false) {
  // 处理点击事件传入的 Event 对象
  const isOverwrite = overwrite === true

  if (!domainForm.value.subdomain || !domainForm.value.rootDomain ||
      !domainForm.value.fallbackSubdomain || !domainForm.value.fallbackRootDomain) {
    ElMessage.warning('请填写完整信息')
    return
  }

  submitting.value = true
  try {
    const payload = { ...domainForm.value }
    if (isOverwrite) {
      payload.overwrite = true
    }

    const res = await api.post('/domains', payload)
    if (res.data.success) {
      ElMessage.success('域名配置创建成功')
      showAddDialog.value = false

      // Save current public IP
      const currentIp = domainForm.value.customPublicIp

      domainForm.value = {
        subdomain: '',
        rootDomain: '',
        fallbackSubdomain: '',
        fallbackRootDomain: '',
        optimizedIp: [],
        customPublicIp: currentIp,
        originPort: null,
        certMode: 'none',
        certificateId: null,
        certFilePath: '',
        keyFilePath: ''
      }
      loadDomains()

      if (res.data.data.verificationRecords) {
        ElMessageBox.alert(
          `请添加以下 DNS 验证记录：\n\n${JSON.stringify(res.data.data.verificationRecords, null, 2)}`,
          '域名验证',
          { confirmButtonText: '确定' }
        )
      }
    }
  } catch (error) {
    console.error('添加域名失败:', error)

    // 检查记录冲突
    if (error.response && error.response.status === 409 && error.response.data.code === 'DNS_RECORD_EXISTS') {
      const details = error.response.data.details
      let msg = '<div style="text-align: left">检测到现有 DNS 记录，请确认是否覆盖：<br/><br/>'

      if (details.aliyun.exists) {
        msg += '<b>阿里云记录:</b><br/>'
        msg += details.aliyun.values.join('<br/>') + '<br/><br/>'
      }

      if (details.cloudflare.exists) {
        msg += '<b>Cloudflare 记录:</b><br/>'
        msg += details.cloudflare.values.join('<br/>') + '<br/><br/>'
      }

      msg += '<strong>注意：覆盖后原记录将被删除或修改！</strong></div>'

      try {
        await ElMessageBox.confirm(msg, 'DNS 记录冲突', {
          confirmButtonText: '强制覆盖',
          cancelButtonText: '取消',
          type: 'warning',
          dangerouslyUseHTMLString: true,
          distinguishCancelAndClose: true
        })
        // 用户确认覆盖，重新提交
        await addDomain(true)
        return
      } catch (e) {
        return
      }
    }

    // Display backend error message (e.g., DNS record already exists)
    if (error.response && error.response.data && error.response.data.message) {
      ElMessage.error(error.response.data.message)
    } else {
      ElMessage.error('添加域名失败，请重试')
    }
  } finally {
    submitting.value = false
  }
}

async function viewDetails(domain) {
  try {
    const res = await api.get(`/domains/${domain.id}`)
    if (res.data.success) {
      currentDomain.value = res.data.data
      // 填充证书绑定表单
      certBindForm.value = {
        certMode: res.data.data.cert_mode || 'none',
        certificateId: res.data.data.certificate_id || null,
        certFilePath: res.data.data.cert_file_path || '',
        keyFilePath: res.data.data.key_file_path || ''
      }
      originPortForm.value = res.data.data.origin_port || 443
      showDetailDialog.value = true
    }
  } catch (error) {
    console.error('加载域名详情失败:', error)
  }
}

async function saveCertBinding() {
  savingCert.value = true
  try {
    const res = await api.put(`/domains/${currentDomain.value.id}/certificate`, certBindForm.value)
    if (res.data.success) {
      ElMessage.success('证书配置已保存')
      // 刷新详情
      viewDetails(currentDomain.value)
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message))
  } finally {
    savingCert.value = false
  }
}

async function checkVerification(domain) {
  try {
    const res = await api.get(`/domains/${domain.id}/verify`)
    if (res.data.success) {
      ElMessage.success(`验证状态: ${res.data.sslStatus}`)
      loadDomains()
    }
  } catch (error) {
    console.error('检查验证状态失败:', error)
  }
}

async function deleteDomain(domain) {
  try {
    await ElMessageBox.confirm('确定要删除此域名配置吗？', '提示', {
      type: 'warning'
    })

    deletingId.value = domain.id
    const res = await api.delete(`/domains/${domain.id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      loadDomains()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除域名失败:', error)
      ElMessage.error('删除域名失败')
    }
  } finally {
    deletingId.value = null
  }
}

async function saveOriginPort() {
  savingPort.value = true
  try {
    const res = await api.put(`/domains/${currentDomain.value.id}/origin-port`, {
      originPort: originPortForm.value
    })
    if (res.data.success) {
      ElMessage.success(res.data.message)
      viewDetails(currentDomain.value)
      loadDomains()
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message))
  } finally {
    savingPort.value = false
  }
}

onMounted(() => {
  loadDomains()
  loadOptimizedIps()
  loadAliyunDomains()
  loadCfZones()
  fetchPublicIp()
  loadCertificates()

  // Start polling
  pollTimer = setInterval(() => {
    loadDomains()
  }, 10000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 768px) {
  /* Optimize table on mobile */
  :deep(.el-table) {
    font-size: 13px;
  }

  :deep(.el-button) {
    padding: 5px 8px;
  }

  :deep(.el-tag) {
    font-size: 11px;
  }
}
</style>
