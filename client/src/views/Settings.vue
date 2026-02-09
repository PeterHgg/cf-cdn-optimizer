<template>
  <div class="settings">
    <el-card>
      <template #header>
        <span>系统设置</span>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="API 配置" name="api">
          <!-- Cloudflare 配置 -->
          <el-card shadow="never" style="margin-bottom: 20px">
            <template #header>
              <div class="card-header">
                <span>Cloudflare 配置</span>
                <el-button type="primary" size="small" @click="showCfHelp = true">
                  <el-icon><QuestionFilled /></el-icon>
                  如何获取
                </el-button>
              </div>
            </template>

            <el-form :model="cfForm" label-width="180px">
              <el-form-item label="API Token" required>
                <el-input
                  v-model="cfForm.apiToken"
                  type="password"
                  show-password
                  placeholder="请输入 Cloudflare API Token"
                />
              </el-form-item>
              <el-form-item label="Account ID" required>
                <el-input
                  v-model="cfForm.accountId"
                  placeholder="请输入 Cloudflare Account ID"
                />
              </el-form-item>
              <el-form-item label="Zone ID" required>
                <el-input
                  v-model="cfForm.zoneId"
                  placeholder="请输入 Cloudflare Zone ID"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="saveCfSettings" :loading="saving">
                  保存 Cloudflare 配置
                </el-button>
                <el-button @click="testCloudflare" :loading="testingCf">测试连接</el-button>
              </el-form-item>
            </el-form>
          </el-card>

          <!-- 阿里云配置 -->
          <el-card shadow="never">
            <template #header>
              <div class="card-header">
                <span>阿里云 DNS 配置</span>
                <el-button type="primary" size="small" @click="showAliyunHelp = true">
                  <el-icon><QuestionFilled /></el-icon>
                  如何获取
                </el-button>
              </div>
            </template>

            <el-form :model="aliyunForm" label-width="180px">
              <el-form-item label="Access Key ID" required>
                <el-input
                  v-model="aliyunForm.accessKeyId"
                  placeholder="请输入阿里云 Access Key ID"
                />
              </el-form-item>
              <el-form-item label="Access Key Secret" required>
                <el-input
                  v-model="aliyunForm.accessKeySecret"
                  type="password"
                  show-password
                  placeholder="请输入阿里云 Access Key Secret"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="saveAliyunSettings" :loading="saving">
                  保存阿里云配置
                </el-button>
                <el-button @click="testAliyun" :loading="testingAliyun">测试连接</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="账户安全" name="security">
          <el-form :model="passwordForm" label-width="120px" style="max-width: 500px">
            <el-form-item label="原密码">
              <el-input v-model="passwordForm.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码">
              <el-input v-model="passwordForm.newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认新密码">
              <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
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
              v0.1.7
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

    <!-- Cloudflare 帮助弹窗 -->
    <el-dialog v-model="showCfHelp" title="如何获取 Cloudflare API 配置" width="700px">
      <el-alert type="info" :closable="false" style="margin-bottom: 15px">
        <template #title>
          <strong>本系统需要 Cloudflare for SaaS（自定义主机名）功能，请确保您的账户已开通此功能。</strong>
        </template>
      </el-alert>

      <el-collapse>
        <el-collapse-item title="1. 获取 API Token" name="1">
          <ol>
            <li>登录 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">Cloudflare Dashboard → API Tokens</a></li>
            <li>点击 <strong>Create Token</strong></li>
            <li>选择 <strong>Create Custom Token</strong></li>
            <li>配置权限：</li>
          </ol>
          <el-table :data="cfPermissions" border size="small" style="margin: 10px 0">
            <el-table-column prop="resource" label="资源" width="200" />
            <el-table-column prop="permission" label="权限" width="150" />
            <el-table-column prop="desc" label="说明" />
          </el-table>
          <el-alert type="warning" :closable="false">
            <strong>Zone Resources</strong> 选择：Include → Specific zone → 选择您的域名
          </el-alert>
        </el-collapse-item>

        <el-collapse-item title="2. 获取 Account ID" name="2">
          <ol>
            <li>登录 <a href="https://dash.cloudflare.com" target="_blank">Cloudflare Dashboard</a></li>
            <li>点击任意一个域名进入</li>
            <li>在右侧边栏找到 <strong>Account ID</strong>（32位字符串）</li>
            <li>点击复制</li>
          </ol>
        </el-collapse-item>

        <el-collapse-item title="3. 获取 Zone ID" name="3">
          <ol>
            <li>登录 <a href="https://dash.cloudflare.com" target="_blank">Cloudflare Dashboard</a></li>
            <li>点击您要使用的<strong>主域名</strong>进入</li>
            <li>在右侧边栏找到 <strong>Zone ID</strong>（32位字符串）</li>
            <li>点击复制</li>
          </ol>
          <el-alert type="info" :closable="false">
            Zone ID 是您的 SaaS Fallback Origin 所在域名的 Zone ID
          </el-alert>
        </el-collapse-item>
      </el-collapse>
    </el-dialog>

    <!-- 阿里云帮助弹窗 -->
    <el-dialog v-model="showAliyunHelp" title="如何获取阿里云 DNS API 配置" width="700px">
      <el-alert type="info" :closable="false" style="margin-bottom: 15px">
        <template #title>
          <strong>建议创建子账号并仅授予 DNS 管理权限，避免使用主账号 AK。</strong>
        </template>
      </el-alert>

      <el-collapse>
        <el-collapse-item title="1. 创建 RAM 子账号（推荐）" name="1">
          <ol>
            <li>登录 <a href="https://ram.console.aliyun.com/users" target="_blank">阿里云 RAM 控制台</a></li>
            <li>点击 <strong>创建用户</strong></li>
            <li>填写登录名称，勾选 <strong>OpenAPI 调用访问</strong></li>
            <li>创建后保存 AccessKey ID 和 AccessKey Secret</li>
          </ol>
          <el-alert type="error" :closable="false">
            <strong>AccessKey Secret 只显示一次，请妥善保存！</strong>
          </el-alert>
        </el-collapse-item>

        <el-collapse-item title="2. 授予 DNS 权限" name="2">
          <ol>
            <li>在用户列表中点击刚创建的用户</li>
            <li>点击 <strong>权限管理</strong> → <strong>新增授权</strong></li>
            <li>搜索并添加以下权限：</li>
          </ol>
          <el-table :data="aliyunPermissions" border size="small" style="margin: 10px 0">
            <el-table-column prop="policy" label="权限策略" width="250" />
            <el-table-column prop="desc" label="说明" />
          </el-table>
        </el-collapse-item>

        <el-collapse-item title="3. 使用主账号 AK（不推荐）" name="3">
          <ol>
            <li>登录 <a href="https://usercenter.console.aliyun.com/#/manage/ak" target="_blank">阿里云 AccessKey 管理</a></li>
            <li>点击 <strong>创建 AccessKey</strong></li>
            <li>通过安全验证后获取 AK</li>
          </ol>
          <el-alert type="error" :closable="false">
            主账号 AK 拥有完全权限，泄露风险极高，<strong>强烈建议使用 RAM 子账号！</strong>
          </el-alert>
        </el-collapse-item>
      </el-collapse>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import api from '@/api'

const activeTab = ref('api')
const saving = ref(false)
const testingCf = ref(false)
const testingAliyun = ref(false)
const showCfHelp = ref(false)
const showAliyunHelp = ref(false)

const cfForm = ref({
  apiToken: '',
  accountId: '',
  zoneId: ''
})

const aliyunForm = ref({
  accessKeyId: '',
  accessKeySecret: ''
})

const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// Cloudflare 权限表格数据
const cfPermissions = [
  { resource: 'Zone - SSL and Certificates', permission: 'Edit', desc: '管理自定义主机名 SSL 证书' },
  { resource: 'Zone - Cloudflare for SaaS', permission: 'Edit', desc: '创建和管理自定义主机名' },
  { resource: 'Zone - DNS', permission: 'Edit', desc: '管理 DNS 记录' },
  { resource: 'Zone - Zone Settings', permission: 'Read', desc: '读取 Zone 配置' },
  { resource: 'Account - Cloudflare for SaaS', permission: 'Edit', desc: '账户级别 SaaS 配置' }
]

// 阿里云权限表格数据
const aliyunPermissions = [
  { policy: 'AliyunDNSFullAccess', desc: 'DNS 云解析完全访问权限（推荐）' },
  { policy: '或 AliyunDNSReadOnlyAccess + 自定义写权限', desc: '更精细的权限控制' }
]

// 加载设置
async function loadSettings() {
  try {
    const res = await api.get('/settings')
    if (res.data.success) {
      const data = res.data.data
      cfForm.value.apiToken = data.cf_api_token || ''
      cfForm.value.accountId = data.cf_account_id || ''
      cfForm.value.zoneId = data.cf_zone_id || ''
      aliyunForm.value.accessKeyId = data.aliyun_access_key_id || ''
      aliyunForm.value.accessKeySecret = data.aliyun_access_key_secret || ''
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 保存 Cloudflare 设置
async function saveCfSettings() {
  if (!cfForm.value.apiToken || !cfForm.value.accountId || !cfForm.value.zoneId) {
    ElMessage.warning('请填写完整的 Cloudflare 配置')
    return
  }

  saving.value = true
  try {
    await api.put('/settings/batch', {
      settings: {
        cf_api_token: cfForm.value.apiToken,
        cf_account_id: cfForm.value.accountId,
        cf_zone_id: cfForm.value.zoneId
      }
    })
    ElMessage.success('Cloudflare 配置已保存')
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message))
  } finally {
    saving.value = false
  }
}

// 保存阿里云设置
async function saveAliyunSettings() {
  if (!aliyunForm.value.accessKeyId || !aliyunForm.value.accessKeySecret) {
    ElMessage.warning('请填写完整的阿里云配置')
    return
  }

  saving.value = true
  try {
    await api.put('/settings/batch', {
      settings: {
        aliyun_access_key_id: aliyunForm.value.accessKeyId,
        aliyun_access_key_secret: aliyunForm.value.accessKeySecret
      }
    })
    ElMessage.success('阿里云配置已保存')
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message))
  } finally {
    saving.value = false
  }
}

async function testCloudflare() {
  testingCf.value = true
  try {
    const res = await api.get('/cloudflare/test-connection')
    if (res.data.success) {
      ElMessage.success('Cloudflare 连接成功！' + (res.data.message || ''))
    } else {
      ElMessage.error('Cloudflare 连接失败: ' + (res.data.message || '请检查配置'))
    }
  } catch (error) {
    ElMessage.error('Cloudflare 连接失败: ' + (error.response?.data?.message || error.message))
  } finally {
    testingCf.value = false
  }
}

async function testAliyun() {
  testingAliyun.value = true
  try {
    const res = await api.get('/aliyun/test-connection')
    if (res.data.success) {
      ElMessage.success('阿里云连接成功！' + (res.data.message || ''))
    } else {
      ElMessage.error('阿里云连接失败: ' + (res.data.message || '请检查配置'))
    }
  } catch (error) {
    ElMessage.error('阿里云连接失败: ' + (error.response?.data?.message || error.message))
  } finally {
    testingAliyun.value = false
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
    ElMessage.error('修改密码失败: ' + (error.response?.data?.message || error.message))
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.el-collapse {
  border: none;
}

:deep(.el-collapse-item__header) {
  font-weight: bold;
}

ol {
  padding-left: 20px;
  line-height: 2;
}

a {
  color: #409eff;
}
</style>
