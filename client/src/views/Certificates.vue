<template>
  <div class="certificates">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>SSL 证书管理</span>
          <div class="actions">
            <el-button type="primary" size="small" @click="showGenerate = true">生成 Origin 证书</el-button>
            <el-button type="success" size="small" @click="showImport = true">导入证书</el-button>
          </div>
        </div>
      </template>

      <el-table :data="certs" border style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="50" v-if="!isMobile" />
        <el-table-column prop="domain" label="域名" min-width="130" show-overflow-tooltip />
        <el-table-column label="类型" width="85">
          <template #default="scope">
            <el-tag :type="scope.row.type === 'origin' ? 'primary' : 'success'" size="small">
              {{ scope.row.type === 'origin' ? 'Origin' : 'Custom' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="过期时间" min-width="140">
          <template #default="scope">
            {{ formatDate(scope.row.expires_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="isMobile ? 120 : 200" :fixed="isMobile ? false : 'right'">
          <template #default="scope">
            <el-button size="small" @click="viewCert(scope.row)" :icon="isMobile ? '' : ''">
              {{ isMobile ? '' : '查看' }}
              <el-icon v-if="isMobile"><View /></el-icon>
            </el-button>
            <el-popconfirm title="确定要删除该证书吗？" @confirm="deleteCert(scope.row.id)">
              <template #reference>
                <el-button size="small" type="danger" :icon="isMobile ? '' : ''">
                  {{ isMobile ? '' : '删除' }}
                  <el-icon v-if="isMobile"><Delete /></el-icon>
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 生成证书弹窗 -->
    <el-dialog v-model="showGenerate" title="生成 Cloudflare Origin CA 证书" :width="isMobile ? '95%' : '500px'">
      <el-form :model="genForm" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="选择域名" required>
          <el-select
            v-model="genForm.selectedZone"
            placeholder="请选择 Cloudflare 域名"
            filterable
            style="width: 100%"
            :loading="loadingZones"
            @change="handleZoneChange"
          >
            <el-option
              v-for="zone in zoneOptions"
              :key="zone.id"
              :label="zone.name"
              :value="zone.id"
            />
          </el-select>
        </el-option>
        <el-form-item label="包含域名" required>
          <el-input
            v-model="genForm.domainsDisplay"
            type="textarea"
            :rows="3"
            readonly
            placeholder="选择域名后自动生成"
          />
        </el-form-item>
        <el-alert type="info" :closable="false" style="margin-bottom: 20px">
          系统将自动生成 <strong>15 年</strong> 有效期的证书，包含所选域名的 <strong>主域名</strong> 和 <strong>泛域名 (*.domain)</strong>。
        </el-alert>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showGenerate = false">取消</el-button>
          <el-button type="primary" @click="generateCert" :loading="generating" :disabled="!genForm.selectedZone">确认生成</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入证书弹窗 -->
    <el-dialog v-model="showImport" title="导入证书" :width="isMobile ? '95%' : '600px'">
      <el-form :model="importForm" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="标识域名" required>
          <el-input v-model="importForm.domain" placeholder="仅用于标记，如 example.com" />
        </el-form-item>
        <el-form-item label="证书内容" required>
          <el-input
            v-model="importForm.cert"
            type="textarea"
            :rows="6"
            placeholder="-----BEGIN CERTIFICATE-----&#10;..."
          />
        </el-form-item>
        <el-form-item label="私钥内容" required>
          <el-input
            v-model="importForm.key"
            type="textarea"
            :rows="6"
            placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showImport = false">取消</el-button>
          <el-button type="primary" @click="importCert" :loading="importing">导入</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看证书详情 -->
    <el-dialog v-model="showDetail" title="证书详情" :width="isMobile ? '95%' : '700px'">
      <div v-if="currentCert">
        <h3>Certificate (Public Key)</h3>
        <el-input
          v-model="currentCert.cert_body"
          type="textarea"
          :rows="10"
          readonly
        />
        <el-button size="small" style="margin-top: 5px" @click="copyText(currentCert.cert_body)">复制证书</el-button>

        <h3 style="margin-top: 20px">Private Key</h3>
        <el-input
          v-model="currentCert.private_key"
          type="textarea"
          :rows="10"
          readonly
        />
        <el-button size="small" style="margin-top: 5px" @click="copyText(currentCert.private_key)">复制私钥</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import { View, Delete } from '@element-plus/icons-vue'
import api from '@/api'

const isMobile = inject('isMobile')

const certs = ref([])
const loading = ref(false)
const showGenerate = ref(false)
const showImport = ref(false)
const showDetail = ref(false)
const generating = ref(false)
const importing = ref(false)
const currentCert = ref(null)

const zoneOptions = ref([])
const loadingZones = ref(false)

const genForm = ref({
  selectedZone: '',
  domainsDisplay: ''
})

const importForm = ref({
  domain: '',
  cert: '',
  key: ''
})

function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function loadCerts() {
  loading.value = true
  try {
    const res = await api.get('/certificates')
    if (res.data.success) {
      certs.value = res.data.data
    }
  } catch (error) {
    ElMessage.error('加载证书失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

async function loadZones() {
  loadingZones.value = true
  try {
    const res = await api.get('/cloudflare/zones')
    if (res.data.success) {
      zoneOptions.value = res.data.data.map(z => ({
        id: z.id,
        name: z.name
      }))
    }
  } catch (error) {
    console.error('加载域名列表失败:', error)
  } finally {
    loadingZones.value = false
  }
}

function handleZoneChange(zoneId) {
  const zone = zoneOptions.value.find(z => z.id === zoneId)
  if (zone) {
    genForm.value.domainsDisplay = `${zone.name}\n*.${zone.name}`
  }
}

async function generateCert() {
  const domains = genForm.value.domainsDisplay.split('\n').map(d => d.trim()).filter(d => d)
  if (domains.length === 0) {
    ElMessage.warning('请选择一个域名')
    return
  }

  generating.value = true
  try {
    const res = await api.post('/certificates/generate', { domains })
    if (res.data.success) {
      ElMessage.success('证书生成成功')
      showGenerate.value = false
      genForm.value.selectedZone = ''
      genForm.value.domainsDisplay = ''
      loadCerts()
    }
  } catch (error) {
    ElMessage.error('生成失败: ' + (error.response?.data?.message || error.message))
  } finally {
    generating.value = false
  }
}

async function importCert() {
  if (!importForm.value.domain || !importForm.value.cert || !importForm.value.key) {
    ElMessage.warning('请填写完整信息')
    return
  }

  importing.value = true
  try {
    const res = await api.post('/certificates/upload', importForm.value)
    if (res.data.success) {
      ElMessage.success('证书导入成功')
      showImport.value = false
      importForm.value = { domain: '', cert: '', key: '' }
      loadCerts()
    }
  } catch (error) {
    ElMessage.error('导入失败: ' + (error.response?.data?.message || error.message))
  } finally {
    importing.value = false
  }
}

async function deleteCert(id) {
  try {
    const res = await api.delete(`/certificates/${id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      loadCerts()
    }
  } catch (error) {
    ElMessage.error('删除失败: ' + error.message)
  }
}

function viewCert(cert) {
  currentCert.value = cert
  showDetail.value = true
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

onMounted(() => {
  loadCerts()
  loadZones()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 768px) {
  .actions {
    flex-direction: column;
    gap: 5px;
  }

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