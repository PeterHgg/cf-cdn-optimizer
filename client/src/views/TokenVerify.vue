<template>
  <div class="token-container">
    <el-card class="token-card">
      <div class="token-header">
        <h2>访问验证</h2>
        <p>请输入6位数字访问令牌</p>
      </div>

      <el-form @submit.prevent="handleVerify">
        <el-form-item>
          <el-input
            v-model="tokenInput"
            placeholder="请输入6位数字令牌"
            maxlength="6"
            size="large"
            @keyup.enter="handleVerify"
            style="text-align: center; letter-spacing: 8px; font-size: 24px"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleVerify"
            style="width: 100%"
          >
            验证
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import api from '@/api'

const router = useRouter()
const authStore = useAuthStore()
const tokenInput = ref('')
const loading = ref(false)

async function handleVerify() {
  if (!tokenInput.value || tokenInput.value.length !== 6 || !/^\d{6}$/.test(tokenInput.value)) {
    ElMessage.warning('请输入6位数字令牌')
    return
  }

  loading.value = true
  try {
    const res = await api.post('/auth/verify-token', { token: tokenInput.value })
    if (res.data.success) {
      authStore.setTokenVerified(true)
      router.push('/login')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '验证失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.token-container {
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.token-card {
  width: 380px;
  padding: 20px;
}

.token-header {
  text-align: center;
  margin-bottom: 30px;
}

.token-header h2 {
  font-size: 24px;
  color: #303133;
  margin-bottom: 10px;
}

.token-header p {
  font-size: 14px;
  color: #909399;
}
</style>
