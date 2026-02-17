<template>
  <div class="login-container">
    <el-card class="login-card">
      <div class="login-header">
        <h2>CF-CDN 优选加速管理平台</h2>
        <p>Cloudflare + 阿里云 DNS 自动化管理</p>
      </div>

      <el-form :model="loginForm" :rules="rules" ref="formRef">
        <template v-if="!show2FA">
          <el-form-item prop="username">
            <el-input
              v-model="loginForm.username"
              placeholder="用户名"
              prefix-icon="User"
              size="large"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="密码"
              prefix-icon="Lock"
              size="large"
              @keyup.enter="handleLogin"
            />
          </el-form-item>
        </template>

        <template v-else>
          <div style="text-align: center; margin-bottom: 20px;">
            <el-icon size="40" color="#409eff"><Lock /></el-icon>
            <p style="margin-top: 10px; color: #606266;">已开启两步验证，请输入验证码</p>
          </div>
          <el-form-item>
            <el-input
              v-model="loginForm.totpCode"
              placeholder="请输入6位验证码"
              size="large"
              maxlength="6"
              auto-focus
              @keyup.enter="handleLogin"
              style="text-align: center; letter-spacing: 4px"
            />
          </el-form-item>
        </template>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleLogin"
            style="width: 100%"
          >
            {{ show2FA ? '验证并登录' : '登录' }}
          </el-button>
        </el-form-item>

        <el-form-item v-if="show2FA">
          <el-button size="large" @click="back2Login" style="width: 100%">
            返回重新登录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref()
const loading = ref(false)
const show2FA = ref(false)

const loginForm = reactive({
  username: '',
  password: '',
  totpCode: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

function back2Login() {
  show2FA.value = false
  loginForm.totpCode = ''
}

async function handleLogin() {
  try {
    await formRef.value.validate()
    loading.value = true

    if (show2FA.value && (!loginForm.totpCode || loginForm.totpCode.length !== 6)) {
      ElMessage.warning('请输入6位验证码')
      return
    }

    const data = await authStore.login(
      loginForm.username,
      loginForm.password,
      show2FA.value ? loginForm.totpCode : undefined
    )

    if (data.success) {
      authStore.setAuth(data)
      ElMessage.success('登录成功')
      router.push('/')
    } else if (data.requires2FA) {
      show2FA.value = true
      ElMessage.info('请输入两步验证码')
    } else {
      ElMessage.error(data.message || '登录失败')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  padding: 20px;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h2 {
  font-size: 24px;
  color: #303133;
  margin-bottom: 10px;
}

.login-header p {
  font-size: 14px;
  color: #909399;
}
</style>
