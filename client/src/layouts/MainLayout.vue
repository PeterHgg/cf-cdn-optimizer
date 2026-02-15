<template>
  <el-container class="main-layout">
    <el-aside v-if="!isMobile" width="200px">
      <div class="logo">
        <h2>CF-CDN 优选</h2>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <span>使用说明</span>
        </el-menu-item>
        <el-menu-item index="/domains">
          <el-icon><Link /></el-icon>
          <span>域名管理</span>
        </el-menu-item>
        <el-menu-item index="/optimized-ips">
          <el-icon><Connection /></el-icon>
          <span>优选域名/IP池</span>
        </el-menu-item>
        <el-menu-item index="/certificates">
          <el-icon><Lock /></el-icon>
          <span>SSL 证书管理</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-drawer
      v-if="isMobile"
      v-model="drawerVisible"
      direction="ltr"
      size="200px"
      :with-header="false"
      class="mobile-drawer"
    >
      <div class="logo">
        <h2>CF-CDN 优选</h2>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        @select="drawerVisible = false"
      >
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <span>使用说明</span>
        </el-menu-item>
        <el-menu-item index="/domains">
          <el-icon><Link /></el-icon>
          <span>域名管理</span>
        </el-menu-item>
        <el-menu-item index="/optimized-ips">
          <el-icon><Connection /></el-icon>
          <span>优选域名/IP池</span>
        </el-menu-item>
        <el-menu-item index="/certificates">
          <el-icon><Lock /></el-icon>
          <span>SSL 证书管理</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
    </el-drawer>

    <el-container>
      <el-header>
        <div class="header-content">
          <div class="left-section">
            <el-icon v-if="isMobile" class="menu-trigger" @click="drawerVisible = true">
              <Expand />
            </el-icon>
            <span class="page-title">{{ pageTitle }}</span>
          </div>
          <div class="user-info">
            <el-dropdown>
              <span class="user-name">
                <el-icon><User /></el-icon>
                {{ authStore.user?.username }}
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleLogout">
                    <el-icon><SwitchButton /></el-icon>
                    退出登录
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </el-header>

      <el-main>
        <router-view v-slot="{ Component }">
          <keep-alive>
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  HomeFilled,
  Link,
  Connection,
  Lock,
  Setting,
  User,
  SwitchButton,
  Expand
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isMobile = ref(false)
const drawerVisible = ref(false)

const updateIsMobile = () => {
  isMobile.value = window.innerWidth <= 768
}

onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateIsMobile)
})

provide('isMobile', isMobile)

const activeMenu = computed(() => route.path)

const pageTitle = computed(() => {
  const titles = {
    '/': '使用说明',
    '/domains': '域名管理',
    '/optimized-ips': '优选域名/IP池',
    '/certificates': 'SSL 证书管理',
    '/settings': '系统设置'
  }
  return titles[route.path] || ''
})

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.main-layout {
  height: 100vh;
}

.el-aside {
  background-color: #304156;
  color: #fff;
}

.logo {
  padding: 20px;
  text-align: center;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo h2 {
  font-size: 18px;
  font-weight: 600;
}

.el-header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  padding: 0 20px;
  display: flex;
  align-items: center;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.left-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-trigger {
  font-size: 20px;
  cursor: pointer;
  color: #303133;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.user-name {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}

.el-main {
  padding: 20px;
  background: #f5f7fa;
}

@media (max-width: 768px) {
  .el-main {
    padding: 10px;
  }
  .page-title {
    font-size: 16px;
  }
}

:deep(.mobile-drawer) .el-drawer__body {
  padding: 0;
  background-color: #304156;
}

:deep(.mobile-drawer) .el-menu {
  border-right: none;
}
</style>
