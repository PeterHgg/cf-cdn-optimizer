<template>
  <div class="optimized-ips">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>优选域名/IP池管理</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            添加优选域名/IP
          </el-button>
        </div>
      </template>

      <el-table :data="ips" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="50" v-if="!isMobile" />
        <el-table-column prop="ip_or_domain" label="IP/域名" min-width="140" show-overflow-tooltip />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.type === 'ip' ? 'primary' : 'success'" size="small">
              {{ row.type === 'ip' ? 'IP' : '域名' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" :width="isMobile ? 110 : 180" :fixed="isMobile ? false : 'right'">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="deleteIp(row)" :icon="isMobile ? '' : ''">
              {{ isMobile ? '' : '删除' }}
              <el-icon v-if="isMobile"><Delete /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加优选 IP 对话框 -->
    <el-dialog v-model="showAddDialog" title="添加优选域名/IP" :width="isMobile ? '95%' : '500px'">
      <el-form :model="ipForm" :label-width="isMobile ? 'auto' : '100px'" :label-position="isMobile ? 'top' : 'right'">
        <el-form-item label="类型">
          <el-radio-group v-model="ipForm.type">
            <el-radio label="ip">IP 地址</el-radio>
            <el-radio label="domain">域名</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="ipForm.type === 'ip' ? 'IP 地址' : '域名'">
          <el-input
            v-model="ipForm.ipOrDomain"
            :placeholder="ipForm.type === 'ip' ? '例如: 104.16.0.0' : '例如: japan.com'"
          />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="ipForm.region" placeholder="例如: JP, US, Global" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addIp">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import api from '@/api'

const isMobile = inject('isMobile')

const ips = ref([])
const loading = ref(false)
const showAddDialog = ref(false)

const ipForm = ref({
  type: 'ip',
  ipOrDomain: '',
  region: ''
})

async function loadIps() {
  loading.value = true
  try {
    const res = await api.get('/optimized-ips')
    if (res.data.success) {
      ips.value = res.data.data
    }
  } catch (error) {
    console.error('加载优选 IP 失败:', error)
  } finally {
    loading.value = false
  }
}

async function addIp() {
  if (!ipForm.value.ipOrDomain) {
    ElMessage.warning('请输入 IP 或域名')
    return
  }

  try {
    const res = await api.post('/optimized-ips', ipForm.value)
    if (res.data.success) {
      ElMessage.success('添加成功')
      showAddDialog.value = false
      ipForm.value = { type: 'ip', ipOrDomain: '', region: '' }
      loadIps()
    }
  } catch (error) {
    console.error('添加优选 IP 失败:', error)
  }
}

async function deleteIp(ip) {
  try {
    await ElMessageBox.confirm('确定要删除此优选 IP 吗？', '提示', {
      type: 'warning'
    })

    const res = await api.delete(`/optimized-ips/${ip.id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      loadIps()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除优选 IP 失败:', error)
    }
  }
}

onMounted(() => {
  loadIps()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 768px) {
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
