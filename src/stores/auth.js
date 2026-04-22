import { defineStore } from 'pinia'
import { createClient } from '@supabase/supabase-js'

const CONFIG = {
  SB_URL: 'https://aciwugdxaijfqwslsdcp.supabase.co',
  SB_KEY: 'sb_publishable_MLilG8VNuMO52404-tfM8Q_iah12MFA'
}

const supabase = createClient(CONFIG.SB_URL, CONFIG.SB_KEY)

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    loading: true
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
    userEmail: (state) => state.user?.email || ''
  },

  actions: {
    async init() {
      // 获取当前 session
      const { data: { session } } = await supabase.auth.getSession()
      this.user = session?.user ?? null
      this.loading = false

      // 监听所有认证状态变化（包括 INITIAL_SESSION）
      supabase.auth.onAuthStateChange((event, session) => {
        this.user = session?.user ?? null
      })
    },

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    },

    async signUp(email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      return data
    },

    async sendResetPassword(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      })
      if (error) throw error
    },

    async signOut() {
      await supabase.auth.signOut()
    },

    getClient() {
      return supabase
    }
  }
})
