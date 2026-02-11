import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const tokenVerified = ref(sessionStorage.getItem('tokenVerified') === 'true')

  const isAuthenticated = computed(() => !!token.value)

  function setTokenVerified(val) {
    tokenVerified.value = val
    if (val) {
      sessionStorage.setItem('tokenVerified', 'true')
    } else {
      sessionStorage.removeItem('tokenVerified')
    }
  }

  async function login(username, password) {
    const response = await api.post('/auth/login', { username, password })

    if (response.data.success) {
      token.value = response.data.token
      user.value = response.data.user

      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))

      return true
    }
    return false
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return {
    token,
    user,
    isAuthenticated,
    tokenVerified,
    setTokenVerified,
    login,
    logout
  }
})
