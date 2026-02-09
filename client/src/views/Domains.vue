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
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="完整域名" min-width="200">
          <template #default="{ row }">
            {{ row.subdomain }}.{{ row.root_domain }}
          </template>
        </el-table-column>
        <el-table-column prop="fallback_origin" label="回退源" min-width="180" />
        <el-table-column prop="optimized_ip" label="优选 IP" min-width="150" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewDetails(row)">详情</el-button>
            <el-button size="small" @click="checkVerification(row)">验证</el-button>
            <el-button size="small" type="danger" @click="deleteDomain(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加域名对话框 -->
    <el-dialog v-model="showAddDialog" title="添加域名配置" width="600px">
      <el-form :model="domainForm" label-width="120px">
        <el-form-item label="阿里云域名" required>
          <el-row :gutter="10" style="width: 100%">
            <el-col :span="10">
              <el-input v-model="domainForm.subdomain" placeholder="子域名 (如: cdn)" />
            </el-col>
            <el-col :span="2" style="text-align: center; line-height: 32px">
              .
            </el-col>
            <el-col :span="12">
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
          <el-row :gutter="10" style="width: 100%">
            <el-col :span="10">
              <el-input v-model="domainForm.fallbackSubdomain" placeholder="回退子域名 (如: back)" />
            </el-col>
            <el-col :span="2" style="text-align: center; line-height: 32px">
              .
            </el-col>
            <el-col :span="12">
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

        <el-form-item label="优选 IP">
          <el-select v-model="domainForm.optimizedIp" placeholder="选择优选 IP（可选）" clearable style="width: 100%">
            <el-option
              v-for="ip in optimizedIps"
              :key="ip.id"
              :label="`${ip.ip_or_domain} (${ip.region || 'Unknown'})`"
              :value="ip.ip_or_domain"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addDomain" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 域名详情对话框 -->
    <el-dialog v-model="showDetailDialog" title="域名详情" width="700px">
      <el-descriptions v-if="currentDomain" :column="2" border>
        <el-descriptions-item label="完整域名" :span="2">
          {{ currentDomain.subdomain }}.{{ currentDomain.root_domain }}
        </el-descriptions-item>
        <el-descriptions-item label="回退源">
          {{ currentDomain.fallback_origin }}
        </el-descriptions-item>
        <el-descriptions-item label="优选 IP">
          {{ currentDomain.optimized_ip }}
        </el-descriptions-item>
        <el-descriptions-item label="CF 主机名 ID" :span="2">
          {{ currentDomain.cf_custom_hostname_id }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间" :span="2">
          {{ currentDomain.created_at }}
        </el-descriptions-item>
      </el-descriptions>

      <div style="margin-top: 20px">
        <el-button type="primary" @click="showOriginRuleDialog = true">
          <el-icon><Plus /></el-icon>
          添加 Origin 规则
        </el-button>
      </div>

      <el-table :data="currentDomain?.originRules || []" style="margin-top: 10px">
        <el-table-column prop="match_pattern" label="匹配模式" />
        <el-table-column prop="origin_host" label="源主机" />
        <el-table-column prop="origin_port" label="端口" width="80" />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="deleteOriginRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- Origin 规则对话框 -->
    <el-dialog v-model="showOriginRuleDialog" title="添加 Origin 规则" width="500px">
      <el-form :model="originRuleForm" label-width="100px">
        <el-form-item label="匹配模式">
          <el-input v-model="originRuleForm.matchPattern" placeholder="例如: https://panel.*" />
        </el-form-item>
        <el-form-item label="源主机">
          <el-input v-model="originRuleForm.originHost" placeholder="例如: 192.168.1.1" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input-number v-model="originRuleForm.originPort" :min="1" :max="65535" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showOriginRuleDialog = false">取消</el-button>
        <el-button type="primary" @click="addOriginRule">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

const domains = ref([])
const aliyunDomains = ref([])
const cfZones = ref([])
const optimizedIps = ref([])
const loading = ref(false)
const submitting = ref(false)
const showAddDialog = ref(false)
const showDetailDialog = ref(false)
const showOriginRuleDialog = ref(false)
const currentDomain = ref(null)

const domainForm = ref({
  subdomain: '',
  rootDomain: '',
  fallbackSubdomain: '',
  fallbackRootDomain: '',
  optimizedIp: ''
})

const originRuleForm = ref({
  matchPattern: '',
  originHost: '',
  originPort: 443
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

async function addDomain() {
  if (!domainForm.value.subdomain || !domainForm.value.rootDomain ||
      !domainForm.value.fallbackSubdomain || !domainForm.value.fallbackRootDomain) {
    ElMessage.warning('请填写完整信息')
    return
  }

  submitting.value = true
  try {
    const res = await api.post('/domains', domainForm.value)
    if (res.data.success) {
      ElMessage.success('域名配置创建成功')
      showAddDialog.value = false
      domainForm.value = {
        subdomain: '',
        rootDomain: '',
        fallbackSubdomain: '',
        fallbackRootDomain: '',
        optimizedIp: ''
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
      showDetailDialog.value = true
    }
  } catch (error) {
    console.error('加载域名详情失败:', error)
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

    const res = await api.delete(`/domains/${domain.id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      loadDomains()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除域名失败:', error)
    }
  }
}

async function addOriginRule() {
  if (!originRuleForm.value.matchPattern || !originRuleForm.value.originHost) {
    ElMessage.warning('请填写完整信息')
    return
  }

  try {
    const res = await api.post(`/domains/${currentDomain.value.id}/origin-rules`, originRuleForm.value)
    if (res.data.success) {
      ElMessage.success('Origin 规则添加成功')
      showOriginRuleDialog.value = false
      originRuleForm.value = { matchPattern: '', originHost: '', originPort: 443 }
      viewDetails(currentDomain.value)
    }
  } catch (error) {
    console.error('添加 Origin 规则失败:', error)
  }
}

async function deleteOriginRule(rule) {
  try {
    await ElMessageBox.confirm('确定要删除此规则吗？', '提示', { type: 'warning' })

    const res = await api.delete(`/domains/${currentDomain.value.id}/origin-rules/${rule.id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      viewDetails(currentDomain.value)
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除规则失败:', error)
    }
  }
}

onMounted(() => {
  loadDomains()
  loadOptimizedIps()
  loadAliyunDomains()
  loadCfZones()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
