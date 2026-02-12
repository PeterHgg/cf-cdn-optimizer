<template>
  <div class="guide">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>快速开始</span>
        </div>
      </template>
      <el-steps :active="0" finish-status="success" style="margin-bottom: 30px">
        <el-step title="配置 API" description="设置 Cloudflare 和阿里云 API 密钥" />
        <el-step title="添加优选 IP" description="配置优选 IP/域名池" />
        <el-step title="创建域名" description="添加自定义主机名和 DNS 解析" />
        <el-step title="完成" description="开始使用加速服务" />
      </el-steps>
      <el-button type="primary" @click="$router.push('/settings')">前往配置 API 密钥</el-button>
      <el-button @click="$router.push('/domains')">管理域名</el-button>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span>工作原理</span>
        </div>
      </template>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="功能">
          自动化管理 Cloudflare 自定义主机名（Custom Hostnames）+ 阿里云 DNS 分地区解析，实现境内优选 IP 加速。
        </el-descriptions-item>
        <el-descriptions-item label="境外访问">
          通过 Cloudflare CDN 回源，享受全球 CDN 加速和 DDoS 防护。
        </el-descriptions-item>
        <el-descriptions-item label="境内访问">
          阿里云 DNS 将境内线路解析到优选 IP/域名，绕过 CDN 直连回源，降低延迟。
        </el-descriptions-item>
        <el-descriptions-item label="Origin 规则">
          通过 Cloudflare Origin Rules 实现端口回源，可将不同域名路由到不同后端端口。
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span>使用说明</span>
        </div>
      </template>

      <el-collapse>
        <el-collapse-item title="1. 配置 Cloudflare" name="1">
          <ol>
            <li>进入 <strong>系统设置 → API 配置</strong>，填写 Cloudflare Email、Global API Key、Account ID</li>
            <li>点击 <strong>获取 Zone 列表</strong> 自动拉取并选择 Zone（即 SaaS Fallback Origin 所在域名）</li>
            <li>点击 <strong>测试连接</strong> 确认配置正确</li>
          </ol>
          <el-alert type="warning" :closable="false">
            需要开通 Cloudflare for SaaS（自定义主机名）功能，免费版支持 100 个自定义主机名。
          </el-alert>
        </el-collapse-item>

        <el-collapse-item title="2. 配置阿里云 DNS" name="2">
          <ol>
            <li>进入 <strong>系统设置 → API 配置</strong>，填写阿里云 Access Key ID 和 Secret</li>
            <li>建议使用 RAM 子账号，仅授予 <strong>AliyunDNSFullAccess</strong> 权限</li>
            <li>点击 <strong>测试连接</strong> 确认配置正确</li>
          </ol>
        </el-collapse-item>

        <el-collapse-item title="3. 管理优选 IP/域名池" name="3">
          <ol>
            <li>进入 <strong>优选域名/IP池</strong>，系统已预置一批 Cloudflare 优选域名</li>
            <li>可手动添加自定义的优选 IP 或域名</li>
            <li>系统会定时测速并自动选择最优 IP 用于境内解析</li>
          </ol>
        </el-collapse-item>

        <el-collapse-item title="4. 添加域名" name="4">
          <ol>
            <li>进入 <strong>域名管理</strong>，点击 <strong>添加域名</strong></li>
            <li>填写子域名、根域名、Fallback Origin（回源域名）</li>
            <li>如需端口回源，填写 <strong>回源端口</strong>（如 3000），系统自动创建 Cloudflare Origin Rule</li>
            <li>系统自动完成：创建 Cloudflare 自定义主机名 → 添加阿里云 DNS 解析（境内/境外分线路）</li>
          </ol>
        </el-collapse-item>

        <el-collapse-item title="5. SSL 证书管理" name="5">
          <ol>
            <li>进入 <strong>SSL 证书管理</strong>，可申请 Cloudflare Origin CA 证书（15年有效期）</li>
            <li>也可导入自定义证书</li>
            <li>证书可用于域名的自定义 SSL 配置，或面板 HTTPS 配置</li>
          </ol>
        </el-collapse-item>

        <el-collapse-item title="6. 面板安全" name="6">
          <ol>
            <li><strong>修改密码</strong>：系统设置 → 账户安全 → 修改密码</li>
            <li><strong>两步验证</strong>：系统设置 → 账户安全 → 启用两步验证（Google Authenticator）</li>
            <li><strong>面板 HTTPS</strong>：系统设置 → 面板 HTTPS，配置证书后面板以 HTTPS 监听，支持从证书库直接选择</li>
          </ol>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup>
</script>

<style scoped>
.card-header {
  font-weight: 600;
}

ol {
  padding-left: 20px;
  line-height: 2;
}

:deep(.el-collapse-item__header) {
  font-weight: bold;
}
</style>
