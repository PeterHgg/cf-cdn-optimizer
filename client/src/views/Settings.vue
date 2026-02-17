<template>
  <div class="settings">
    <el-card>
      <template #header>
        <span>系统设置</span>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="API 配置" name="api">
          <el-alert type="info" :closable="false" style="margin-bottom: 20px">
            <template #title>
              <strong>工作原理：</strong> 自动化管理 Cloudflare 自定义主机名 + 阿里云 DNS 分地区解析，实现境内优选 IP 加速。
              <br />
              <strong>配置流程：</strong> 1. 配置 Cloudflare API (需开通 SaaS 功能) -> 2. 配置阿里云 DNS -> 3. 在域名管理中添加配置。
            </template>
          </el-alert>
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

            <el-form :model="cfForm" :label-width="isMobile ? 'auto' : '180px'" :label-position="isMobile ? 'top' : 'right'">
              <!-- API Token (已废弃，保留兼容) -->
              <!-- 改为 Email + Global API Key -->

              <el-form-item label="Cloudflare Email" required>
                <el-input
                  v-model="cfForm.email"
                  placeholder="请输入登录邮箱 (Example: user@example.com)"
                />
              </el-form-item>

              <el-form-item label="Global API Key" required>
                <div :style="{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', width: '100%' }">
                  <el-input
                    v-model="cfForm.apiKey"
                    type="password"
                    :placeholder="cfConfigured.apiKey ? '已配置（只写不读，留空不修改）' : '请输入 Global API Key'"
                  />
                  <el-button type="success" @click="loadZones" :loading="loadingZones">
                    获取 Zone 列表
                  </el-button>
                </div>
                <div class="form-tip">Global API Key 拥有完整权限，请在 "My Profile -> API Tokens" 中查看。</div>
              </el-form-item>

              <el-form-item label="Account ID" required>
                <el-input
                  v-model="cfForm.accountId"
                  placeholder="请输入 Cloudflare Account ID"
                />
              </el-form-item>

              <el-form-item label="Zone ID (域名)" required>
                <el-select
                  v-model="cfForm.zoneId"
                  placeholder="请选择或手动输入 Zone ID"
                  filterable
                  allow-create
                  default-first-option
                  style="width: 100%"
                  @change="handleZoneChange"
                >
                  <el-option
                    v-for="zone in zoneOptions"
                    :key="zone.id"
                    :label="zone.name"
                    :value="zone.id"
                  >
                    <span style="float: left">{{ zone.name }}</span>
                    <span style="float: right; color: #8492a6; font-size: 13px">{{ zone.id }}</span>
                  </el-option>
                </el-select>
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

            <el-form :model="aliyunForm" :label-width="isMobile ? 'auto' : '180px'" :label-position="isMobile ? 'top' : 'right'">
              <el-form-item label="Access Key ID" required>
                <el-input
                  v-model="aliyunForm.accessKeyId"
                  type="password"
                  placeholder="请输入阿里云 Access Key ID"
                />
              </el-form-item>
              <el-form-item label="Access Key Secret" required>
                <el-input
                  v-model="aliyunForm.accessKeySecret"
                  type="password"
                  :placeholder="cfConfigured.aliyunSecret ? '已配置（只写不读，留空不修改）' : '请输入阿里云 Access Key Secret'"
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

        <el-tab-pane label="面板 HTTPS" name="https">
          <el-card shadow="never">
            <template #header>
              <div class="card-header">
                <span>面板 HTTPS 配置</span>
              </div>
            </template>

            <el-alert type="info" :closable="false" style="margin-bottom: 20px">
              <template #title>
                配置后面板将以 HTTPS 方式监听当前端口，Cloudflare 回源时可完成 SSL 握手。保存后服务会自动重启。
              </template>
            </el-alert>

            <el-form :model="httpsForm" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'" style="max-width: 600px">
              <el-form-item label="证书来源">
                <el-radio-group v-model="httpsForm.mode">
                  <el-radio-button value="cert_id">从证书库选择</el-radio-button>
                  <el-radio-button value="file_path">文件路径</el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item v-if="httpsForm.mode === 'cert_id'" label="选择证书">
                <el-select v-model="httpsForm.certificateId" placeholder="选择已有证书" style="width: 100%">
                  <el-option
                    v-for="cert in httpsCerts"
                    :key="cert.id"
                    :label="`${cert.domain} (${cert.type === 'origin' ? 'Origin CA' : '自定义'})`"
                    :value="cert.id"
                  />
                </el-select>
              </el-form-item>

              <template v-if="httpsForm.mode === 'file_path'">
                <el-form-item label="证书文件路径">
                  <el-input v-model="httpsForm.certPath" placeholder="例如: /root/cert.pem" />
                </el-form-item>
                <el-form-item label="私钥文件路径">
                  <el-input v-model="httpsForm.keyPath" placeholder="例如: /root/key.pem" />
                </el-form-item>
              </template>

              <el-form-item>
                <el-button type="primary" @click="saveHttpsConfig" :loading="savingHttps">
                  保存并重启
                </el-button>
                <el-button @click="clearHttpsConfig" :loading="savingHttps">
                  关闭 HTTPS (回退 HTTP)
                </el-button>
              </el-form-item>
            </el-form>

            <el-alert
              v-if="httpsForm.certPath || httpsForm.certificateId"
              type="success"
              :closable="false"
              style="margin-top: 10px"
            >
              <template #title>
                当前已配置 HTTPS：{{ httpsForm.mode === 'cert_id' ? '证书库 ID ' + httpsForm.certificateId : httpsForm.certPath }}
              </template>
            </el-alert>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="账户安全" name="security">
          <el-card shadow="never" style="margin-bottom: 20px">
            <template #header>
              <div class="card-header">
                <span>两步验证 (2FA)</span>
                <el-tag v-if="twoFAEnabled" type="success">已启用</el-tag>
                <el-tag v-else type="info">未启用</el-tag>
              </div>
            </template>

            <el-alert type="info" :closable="false" style="margin-bottom: 20px">
              <template #title>
                启用两步验证后，登录时需要输入 Google Authenticator / Microsoft Authenticator 等应用生成的6位验证码。
              </template>
            </el-alert>

            <template v-if="!twoFAEnabled">
              <template v-if="!setupQrCode">
                <el-button type="primary" @click="setup2FA" :loading="setting2FA">启用两步验证</el-button>
              </template>
              <template v-else>
                <div style="margin-bottom: 20px">
                  <p style="margin-bottom: 10px">1. 使用验证器应用扫描下方二维码：</p>
                  <div style="text-align: center; margin: 15px 0">
                    <img :src="setupQrCode" alt="2FA QR Code" style="width: 200px; height: 200px" />
                  </div>
                  <p style="margin-bottom: 5px">2. 或手动输入密钥：</p>
                  <el-input :model-value="setupSecret" readonly style="max-width: 400px; margin-bottom: 15px">
                    <template #append>
                      <el-button @click="copySecret">复制</el-button>
                    </template>
                  </el-input>
                  <p style="margin-bottom: 10px">3. 输入验证器应用中显示的6位验证码完成绑定：</p>
                  <el-form style="max-width: 400px" @submit.prevent="enable2FA">
                    <el-form-item>
                      <el-input v-model="verifyCode" placeholder="输入6位验证码" maxlength="6" />
                    </el-form-item>
                    <el-form-item>
                      <el-button type="primary" @click="enable2FA" :loading="setting2FA">验证并启用</el-button>
                      <el-button @click="cancelSetup">取消</el-button>
                    </el-form-item>
                  </el-form>
                </div>
              </template>
            </template>
            <template v-else>
              <el-form style="max-width: 400px" @submit.prevent="disable2FA">
                <el-form-item label="登录密码">
                  <el-input v-model="disablePassword" type="password" show-password placeholder="输入登录密码以关闭两步验证" />
                </el-form-item>
                <el-form-item>
                  <el-button type="danger" @click="disable2FA" :loading="setting2FA">关闭两步验证</el-button>
                </el-form-item>
              </el-form>
            </template>
          </el-card>

          <el-card shadow="never">
            <template #header>
              <div class="card-header">
                <span>修改密码</span>
              </div>
            </template>

            <el-form :model="passwordForm" :label-width="isMobile ? 'auto' : '120px'" :label-position="isMobile ? 'top' : 'right'" style="max-width: 500px">
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
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="关于" name="about">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="系统名称">
              CF-CDN-Optimizer
            </el-descriptions-item>
            <el-descriptions-item label="版本">
              v0.1.50
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
    <el-dialog v-model="showCfHelp" title="如何获取 Cloudflare API 配置" :width="isMobile ? '95%' : '700px'">
      <el-alert type="info" :closable="false" style="margin-bottom: 15px">
        <template #title>
          <strong>本系统需要 Cloudflare for SaaS（自定义主机名）功能，请确保您的账户已开通此功能。</strong>
        </template>
      </el-alert>

      <el-collapse>
        <el-collapse-item title="1. 获取 Global API Key" name="1">
          <ol>
            <li>登录 <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank">Cloudflare Dashboard → My Profile → API Tokens</a></li>
            <li>找到 <strong>Global API Key</strong></li>
            <li>点击 <strong>View</strong> 查看并复制 Key</li>
            <li>同时记录您的登录邮箱 (Email)</li>
          </ol>
          <el-alert type="warning" :closable="false">
            Global API Key 拥有账户的完全控制权，请妥善保管，不要泄露给他人。
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
    <el-dialog v-model="showAliyunHelp" title="如何获取阿里云 DNS API 配置" :width="isMobile ? '95%' : '700px'">
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
import { ref, onMounted, inject } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import api from '@/api'

const isMobile = inject('isMobile')

const activeTab = ref('api')
const saving = ref(false)
const testingCf = ref(false)
const testingAliyun = ref(false)
const showCfHelp = ref(false)
const showAliyunHelp = ref(false)
const savingHttps = ref(false)

// 2FA 相关
const twoFAEnabled = ref(false)
const setting2FA = ref(false)
const setupQrCode = ref('')
const setupSecret = ref('')
const verifyCode = ref('')
const disablePassword = ref('')

// 跟踪敏感字段是否已配置（后端返回 ******）
const cfConfigured = ref({
  apiKey: false,
  apiToken: false,
  aliyunSecret: false
})

const httpsForm = ref({
  mode: 'cert_id',
  certificateId: null,
  certPath: '',
  keyPath: ''
})

const httpsCerts = ref([])

const cfForm = ref({
  email: '',
  apiKey: '',
  apiToken: '', // 保留兼容，但不在界面主要展示
  accountId: '',
  zoneId: ''
})

const zoneOptions = ref([])
const loadingZones = ref(false)

const aliyunForm = ref({
  accessKeyId: '',
  accessKeySecret: ''
})

const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

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
      cfForm.value.email = data.cf_email || ''
      cfForm.value.accountId = data.cf_account_id || ''
      cfForm.value.zoneId = data.cf_zone_id || ''

      // 敏感字段：不填入遮罩值，只记录已配置状态
      cfConfigured.value.apiKey = data.cf_api_key === '******'
      cfConfigured.value.apiToken = data.cf_api_token === '******'
      cfConfigured.value.aliyunSecret = data.aliyun_access_key_secret === '******'
      cfForm.value.apiKey = ''
      cfForm.value.apiToken = ''

      // 如果有保存的 Zone ID，初始化到选项中以免显示 ID
      if (cfForm.value.zoneId) {
        zoneOptions.value = [{ id: cfForm.value.zoneId, name: cfForm.value.zoneId }]
      }

      aliyunForm.value.accessKeyId = data.aliyun_access_key_id || ''
      aliyunForm.value.accessKeySecret = ''

      httpsForm.value.certPath = data.panel_cert_path || ''
      httpsForm.value.keyPath = data.panel_key_path || ''
      httpsForm.value.certificateId = data.panel_cert_id ? parseInt(data.panel_cert_id) : null
      httpsForm.value.mode = data.panel_cert_id ? 'cert_id' : (data.panel_cert_path ? 'file_path' : 'cert_id')
    }
  } catch (error) {
    console.error('加载设置失败:', error)
  }
}

// 获取 Zone 列表
async function loadZones() {
  if (!cfForm.value.email || (!cfForm.value.apiKey && !cfConfigured.value.apiKey)) {
    ElMessage.warning('请先填写 Email 和 Global API Key')
    return
  }

  loadingZones.value = true
  try {
    // 如果用户填了新的 API Key，先保存
    if (cfForm.value.apiKey) {
      await api.put('/settings/batch', {
        settings: {
          cf_email: cfForm.value.email,
          cf_api_key: cfForm.value.apiKey
        }
      })
    } else {
      // 只更新 email（API Key 已在后端保存）
      await api.put('/settings/batch', {
        settings: {
          cf_email: cfForm.value.email
        }
      })
    }

    // 调用后端获取 Zone 列表
    const res = await api.get('/cloudflare/zones')
    if (res.data.success) {
      zoneOptions.value = res.data.data.map(z => ({
        id: z.id,
        name: z.name,
        account: z.account // 保存 account 信息
      }))

      // 自动填充 Account ID (如果还没填)
      if (zoneOptions.value.length > 0 && !cfForm.value.accountId) {
        // 优先尝试找当前选中的 zone (如果有)
        if (cfForm.value.zoneId) {
          const currentZone = zoneOptions.value.find(z => z.id === cfForm.value.zoneId)
          if (currentZone && currentZone.account) {
            cfForm.value.accountId = currentZone.account.id
          }
        }
        // 否则使用第一个 zone 的 account id
        else if (zoneOptions.value[0].account) {
          cfForm.value.accountId = zoneOptions.value[0].account.id
        }

        if (cfForm.value.accountId) {
          ElMessage.success('已自动获取并填充 Account ID')
        }
      }

      ElMessage.success('成功获取 Zone 列表')
    } else {
      ElMessage.error('获取列表失败: ' + res.data.message)
    }
  } catch (error) {
    ElMessage.error('操作失败: ' + (error.response?.data?.message || error.message))
  } finally {
    loadingZones.value = false
  }
}

function handleZoneChange(val) {
  // 找到对应的 zone 对象，自动填充 account id
  const zone = zoneOptions.value.find(z => z.id === val)
  if (zone && zone.account && zone.account.id) {
    cfForm.value.accountId = zone.account.id
  }
}

// 保存 Cloudflare 设置
async function saveCfSettings() {
  // 验证: 必须要 Email + Key(已有或新填) 或者 Token
  const hasNewKey = cfForm.value.apiKey
  const hasExistingKey = cfConfigured.value.apiKey
  const hasAuth = (cfForm.value.email && (hasNewKey || hasExistingKey)) || cfForm.value.apiToken || cfConfigured.value.apiToken

  if (!hasAuth || !cfForm.value.accountId || !cfForm.value.zoneId) {
    ElMessage.warning('请填写完整的 Cloudflare 配置')
    return
  }

  saving.value = true
  try {
    const settings = {
      cf_email: cfForm.value.email,
      cf_account_id: cfForm.value.accountId,
      cf_zone_id: cfForm.value.zoneId
    }
    // 敏感字段：只在用户填写了新值时才发送
    if (cfForm.value.apiKey) settings.cf_api_key = cfForm.value.apiKey
    if (cfForm.value.apiToken) settings.cf_api_token = cfForm.value.apiToken

    await api.put('/settings/batch', { settings })
    ElMessage.success('Cloudflare 配置已保存')
    // 保存成功后更新已配置状态
    if (cfForm.value.apiKey) {
      cfConfigured.value.apiKey = true
      cfForm.value.apiKey = ''
    }
    if (cfForm.value.apiToken) {
      cfConfigured.value.apiToken = true
      cfForm.value.apiToken = ''
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message))
  } finally {
    saving.value = false
  }
}

// 保存阿里云设置
async function saveAliyunSettings() {
  if (!aliyunForm.value.accessKeyId) {
    ElMessage.warning('请填写 Access Key ID')
    return
  }
  if (!aliyunForm.value.accessKeySecret && !cfConfigured.value.aliyunSecret) {
    ElMessage.warning('请填写 Access Key Secret')
    return
  }

  saving.value = true
  try {
    const settings = {
      aliyun_access_key_id: aliyunForm.value.accessKeyId,
      ...(aliyunForm.value.accessKeySecret ? { aliyun_access_key_secret: aliyunForm.value.accessKeySecret } : {})
    }

    await api.put('/settings/batch', { settings })
    ElMessage.success('阿里云配置已保存')
    if (aliyunForm.value.accessKeySecret) {
      cfConfigured.value.aliyunSecret = true
      aliyunForm.value.accessKeySecret = ''
    }
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

async function loadHttpsCerts() {
  try {
    const res = await api.get('/certificates')
    if (res.data.success) {
      httpsCerts.value = res.data.data
    }
  } catch (error) {
    console.error('加载证书列表失败:', error)
  }
}

async function saveHttpsConfig() {
  if (httpsForm.value.mode === 'cert_id') {
    if (!httpsForm.value.certificateId) {
      ElMessage.warning('请选择一个证书')
      return
    }
  } else {
    if (!httpsForm.value.certPath || !httpsForm.value.keyPath) {
      ElMessage.warning('请填写证书和私钥路径')
      return
    }
  }

  savingHttps.value = true
  try {
    const res = await api.put('/settings/panel-https', {
      mode: httpsForm.value.mode,
      certificateId: httpsForm.value.certificateId,
      certPath: httpsForm.value.certPath,
      keyPath: httpsForm.value.keyPath
    })
    if (res.data.success) {
      ElMessage.success(res.data.message)
    }
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.response?.data?.message || error.message))
  } finally {
    savingHttps.value = false
  }
}

async function clearHttpsConfig() {
  savingHttps.value = true
  try {
    const res = await api.put('/settings/panel-https', { mode: 'clear' })
    if (res.data.success) {
      httpsForm.value.certPath = ''
      httpsForm.value.keyPath = ''
      httpsForm.value.certificateId = null
      httpsForm.value.mode = 'cert_id'
      ElMessage.success('已关闭 HTTPS，服务正在重启为 HTTP 模式...')
    }
  } catch (error) {
    ElMessage.error('操作失败: ' + (error.response?.data?.message || error.message))
  } finally {
    savingHttps.value = false
  }
}

async function setup2FA() {
  setting2FA.value = true
  try {
    const res = await api.post('/auth/2fa-setup')
    if (res.data.success) {
      setupQrCode.value = res.data.qrCode
      setupSecret.value = res.data.secret
    }
  } catch (error) {
    ElMessage.error('生成密钥失败: ' + (error.response?.data?.message || error.message))
  } finally {
    setting2FA.value = false
  }
}

function copySecret() {
  navigator.clipboard.writeText(setupSecret.value)
  ElMessage.success('密钥已复制')
}

function cancelSetup() {
  setupQrCode.value = ''
  setupSecret.value = ''
  verifyCode.value = ''
}

async function enable2FA() {
  if (!verifyCode.value || verifyCode.value.length !== 6) {
    ElMessage.warning('请输入6位验证码')
    return
  }

  setting2FA.value = true
  try {
    const res = await api.post('/auth/2fa-enable', { code: verifyCode.value })
    if (res.data.success) {
      twoFAEnabled.value = true
      setupQrCode.value = ''
      setupSecret.value = ''
      verifyCode.value = ''
      ElMessage.success('两步验证已启用')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '验证失败')
  } finally {
    setting2FA.value = false
  }
}

async function disable2FA() {
  if (!disablePassword.value) {
    ElMessage.warning('请输入登录密码')
    return
  }

  setting2FA.value = true
  try {
    const res = await api.post('/auth/2fa-disable', { password: disablePassword.value })
    if (res.data.success) {
      twoFAEnabled.value = false
      disablePassword.value = ''
      ElMessage.success('两步验证已关闭')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  } finally {
    setting2FA.value = false
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

async function load2FAStatus() {
  try {
    const res = await api.get('/auth/2fa-status')
    if (res.data.success) {
      twoFAEnabled.value = res.data.enabled
    }
  } catch (error) {
    console.error('加载2FA状态失败:', error)
  }
}

onMounted(() => {
  loadSettings()
  loadHttpsCerts()
  load2FAStatus()
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

@media (max-width: 768px) {
  ol {
    padding-left: 15px;
  }
}

a {
  color: #409eff;
}
</style>
