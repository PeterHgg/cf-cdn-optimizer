<template>
  <div class="optimized-ips">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>优选 IP 池管理</span>
          <el-button type="primary" @click="showAddDialog = true">
            <el-icon><Plus /></el-icon>
            添加优选 IP
          </el-button>
        </div>
      </template>

      <el-table :data="ips" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="ip_or_domain" label="IP/域名" min-width="180" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === 'ip' ? 'primary' : 'success'">
              {{ row.type === 'ip' ? 'IP 地址' : '域名' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="region" label="区域" width="120" />
        <el-table-column label="延迟" width="120">
          <template #default="{ row }">
            <span v-if="row.latency">{{ row.latency.toFixed(0) }} ms</span>
            <span v-else style="color: #909399">未测试</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'">
              {{ row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_check" label="最后检测" width="180" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="toggleStatus(row)">
              {{ row.is_active ? '禁用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" @click="deleteIp(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加优选 IP 对话框 -->
    <el-dialog v-model="showAddDialog" title="添加优选 IP" width="500px">
      <el-form :model="ipForm" label-width="100px">
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

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

async function toggleStatus(ip) {
  try {
    const res = await api.put(`/optimized-ips/${ip.id}/toggle`)
    if (res.data.success) {
      ElMessage.success('状态已更新')
      loadIps()
    }
  } catch (error) {
    console.error('切换状态失败:', error)
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
</style>
