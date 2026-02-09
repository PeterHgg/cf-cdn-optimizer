<template>
  <div class="settings">
    <el-card>
      <template #header>
        <span>系统设置</span>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="API 配置" name="api">
          <el-alert
            title="请在 .env 文件中配置 API 密钥，然后重启服务"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 20px"
          />

          <el-form label-width="180px">
            <el-form-item label="Cloudflare API Token">
              <el-input type="password" placeholder="从 .env 文件配置" disabled />
            </el-form-item>
            <el-form-item label="Cloudflare Account ID">
              <el-input type="password" placeholder="从 .env 文件配置" disabled />
            </el-form-item>
            <el-form-item label="Cloudflare Zone ID">
              <el-input type="password" placeholder="从 .env 文件配置" disabled />
            </el-form-item>
            <el-divider />
            <el-form-item label="阿里云 Access Key ID">
              <el-input type="password" placeholder="从 .env 文件配置" disabled />
            </el-form-item>
            <el-form-item label="阿里云 Access Key Secret">
              <el-input type="password" placeholder="从 .env 文件配置" disabled />
            </el-form-item>
          </el-form>

          <div style="margin-top: 20px">
            <el-button type="primary" @click="testCloudflare">测试 Cloudflare 连接</el-button>
            <el-button @click="testAliyun">测试阿里云连接</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="账户安全" name="security">
          <el-form :model="passwordForm" label-width="120px" style="max-width: 500px">
            <el-form-item label="原密码">
              <el-input v-model="passwordForm.oldPassword" type="password" />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="passwordForm.confirmPassword" type="password" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="changePassword">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="关于" name="about">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="系统名称">
              CF-CDN-Optimizer
            </el-descriptions-item>
            <el-descriptions-item label="版本">
              v1.0.0
            </el-descriptions-item>
            <el-descriptions-item label="描述">
              Cloudflare CDN 优选加速管理平台 - 自动化管理 Cloudflare 自定义主机名 + 阿里云 DNS 优选 IP
            </el-descriptions-item>
            <el-descriptions-item label="技术栈">
              Node.js + Express + Vue.js + Element Plus + SQLite
            </el-descriptions-item>
            <el-descriptions-item label="开源协议">
              MIT License
            </el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const activeTab = ref('api')

const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

async function testCloudflare() {
  try {
    const res = await api.get('/cloudflare/test-connection')
    if (res.data.success) {
      ElMessage.success('Cloudflare 连接成功')
    } else {
      ElMessage.error('Cloudflare 连接失败')
    }
  } catch (error) {
    ElMessage.error('Cloudflare 连接失败')
  }
}

async function testAliyun() {
  try {
    const res = await api.get('/aliyun/test-connection')
    if (res.data.success) {
      ElMessage.success('阿里云连接成功')
    } else {
      ElMessage.error('阿里云连接失败')
    }
  } catch (error) {
    ElMessage.error('阿里云连接失败')
  }
}

async function changePassword() {
  if (!passwordForm.value.oldPassword || !passwordForm.value.newPassword) {
    ElMessage.warning('请填写完整信息')
    return
  }

  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }

  try {
    const res = await api.post('/auth/change-password', {
      oldPassword: passwordForm.value.oldPassword,
      newPassword: passwordForm.value.newPassword
    })

    if (res.data.success) {
      ElMessage.success('密码修改成功，请重新登录')
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
    }
  } catch (error) {
    console.error('修改密码失败:', error)
  }
}
</script>
