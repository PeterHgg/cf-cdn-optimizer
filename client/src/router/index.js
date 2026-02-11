import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import MainLayout from '@/layouts/MainLayout.vue'
import Dashboard from '@/views/Dashboard.vue'
import Domains from '@/views/Domains.vue'
import OptimizedIps from '@/views/OptimizedIps.vue'
import Certificates from '@/views/Certificates.vue'
import Settings from '@/views/Settings.vue'
import api from '@/api'

const routes = [
  {
    path: '/verify-token',
    name: 'TokenVerify',
    component: () => import('@/views/TokenVerify.vue')
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue')
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: Dashboard
      },
      {
        path: 'domains',
        name: 'Domains',
        component: Domains
      },
      {
        path: 'optimized-ips',
        name: 'OptimizedIps',
        component: OptimizedIps
      },
      {
        path: 'certificates',
        name: 'Certificates',
        component: Certificates
      },
      {
        path: 'settings',
        name: 'Settings',
        component: Settings
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 缓存令牌启用状态，避免每次路由跳转都请求
let tokenEnabled = null

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // 查询令牌是否启用（只查一次）
  if (tokenEnabled === null) {
    try {
      const res = await api.get('/auth/token-status')
      tokenEnabled = res.data.enabled
    } catch {
      tokenEnabled = false
    }
  }

  // 如果令牌已启用且未验证，跳转到令牌验证页
  if (tokenEnabled && !authStore.tokenVerified && to.name !== 'TokenVerify') {
    next('/verify-token')
    return
  }

  // 已验证令牌但访问令牌页，跳到登录
  if (to.name === 'TokenVerify' && (!tokenEnabled || authStore.tokenVerified)) {
    next('/login')
    return
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

// 导出重置令牌状态的方法（设置页修改令牌后调用）
export function resetTokenCache() {
  tokenEnabled = null
}

export default router
