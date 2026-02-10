<template>
  <div class="certificates">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>SSL 证书管理 (Origin CA)</span>
          <div>
            <el-button type="primary" @click="showGenerate = true">生成 Origin 证书</el-button>
            <el-button type="success" @click="showImport = true">导入证书</el-button>
          </div>
        </div>
      </template>

      <el-table :data="certs" border style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="domain" label="域名" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.type === 'origin' ? 'primary' : 'success'">
              {{ scope.row.type === 'origin' ? 'Origin CA' : 'Custom' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="expires_at" label="过期时间">
          <template #default="scope">
            {{ formatDate(scope.row.expires_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250">
          <template #default="scope">
            <el-button size="small" @click="viewCert(scope.row)">查看/复制</el-button>
            <el-popconfirm title="确定要删除该证书吗？" @confirm="deleteCert(scope.row.id)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 生成证书弹窗 -->
    <el-dialog v-model="showGenerate" title="生成 Cloudflare Origin CA 证书" width="500px">
      <el-form :model="genForm" label-width="100px">
        <el-form-item label="域名列表" required>
          <el-input
            v-model="genForm.domains"
            type="textarea"
            :rows="4"
            placeholder="请输入域名，每行一个&#10;例如:&#10;example.com&#10;*.example.com"
          />
        </el-form-item>
        <el-alert type="info" :closable="false" style="margin-bottom: 20px">
          证书有效期为 15 年。Cloudflare 将自动生成私钥。
        </el-alert>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showGenerate = false">取消</el-button>
          <el-button type="primary" @click="generateCert" :loading="generating">生成</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入证书弹窗 -->
    <el-dialog v-model="showImport" title="导入证书" width="600px">
      <el-form :model="importForm" label-width="100px">
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
    <el-dialog v-model="showDetail" title="证书详情" width="700px">
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const certs = ref([])
const loading = ref(false)
const showGenerate = ref(false)
const showImport = ref(false)
const showDetail = ref(false)
const generating = ref(false)
const importing = ref(false)
const currentCert = ref(null)

const genForm = ref({
  domains: ''
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

async function generateCert() {
  const domains = genForm.value.domains.split('\n').map(d => d.trim()).filter(d => d)
  if (domains.length === 0) {
    ElMessage.warning('请输入至少一个域名')
    return
  }

  generating.value = true
  try {
    const res = await api.post('/certificates/generate', { domains })
    if (res.data.success) {
      ElMessage.success('证书生成成功')
      showGenerate.value = false
      genForm.value.domains = ''
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
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>