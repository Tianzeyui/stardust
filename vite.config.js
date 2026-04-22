import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    host: true,  // 监听所有网络接口，允许 IP 访问
    open: false
  },
  optimizeDeps: {
    include: ['@stread/web-os']
  }
})
