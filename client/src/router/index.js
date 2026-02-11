import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import MainLayout from '@/layouts/MainLayout.vue'
import Dashboard from '@/views/Dashboard.vue'
import Domains from '@/views/Domains.vue'
import OptimizedIps from '@/views/OptimizedIps.vue'
import Certificates from '@/views/Certificates.vue'
import Settings from '@/views/Settings.vue'

const routes = [
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

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

export default router
