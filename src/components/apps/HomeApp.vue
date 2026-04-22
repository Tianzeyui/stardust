<template>
  <div class="home-app">
    <!-- 用户信息 -->
    <div class="user-card">
      <div class="user-info">
        <div class="avatar">{{ userInitial }}</div>
        <div class="details">
          <div class="email">{{ authStore.userEmail }}</div>
          <div class="status">在线</div>
        </div>
      </div>
      <button @click="handleLogout" class="logout-btn">退出登录</button>
    </div>

    <h1>🚀 欢迎使用 Brain Plus</h1>
    <p>这是一个基于 Vue 3 和 @stread/web-os 构建的现代化桌面操作系统</p>
    <div class="features">
      <div class="feature">
        <div class="icon">💡</div>
        <div class="title">灵感捕获</div>
        <div class="desc">随时记录想法</div>
      </div>
      <div class="feature">
        <div class="icon">📁</div>
        <div class="title">文件管理</div>
        <div class="desc">整理您的文件</div>
      </div>
      <div class="feature">
        <div class="icon">🖥️</div>
        <div class="title">终端</div>
        <div class="desc">执行命令</div>
      </div>
      <div class="feature">
        <div class="icon">🔢</div>
        <div class="title">计算器</div>
        <div class="desc">快速计算</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '../../stores/auth.js'

const authStore = useAuthStore()

const userInitial = computed(() => {
  const email = authStore.userEmail
  return email ? email[0].toUpperCase() : '?'
})

const handleLogout = async () => {
  if (confirm('确定要退出登录吗？')) {
    await authStore.signOut()
    // 触发 App.vue 中的表单重置
    window.dispatchEvent(new CustomEvent('auth:logout'))
  }
}
</script>

<style scoped>
.home-app {
  padding: 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  height: 100%;
  color: white;
  overflow-y: auto;
}

.user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 16px 20px;
  margin-bottom: 30px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
}

.details .email {
  font-size: 14px;
  font-weight: 600;
}

.details .status {
  font-size: 12px;
  opacity: 0.7;
}

.logout-btn {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

h1 {
  font-size: 32px;
  margin-bottom: 20px;
}

p {
  font-size: 16px;
  line-height: 1.8;
  opacity: 0.9;
}

.features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 40px;
}

.feature {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  transition: all 0.3s ease;
  cursor: pointer;
}

.feature:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-5px);
}

.feature .icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.feature .title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 8px;
}

.feature .desc {
  font-size: 14px;
  opacity: 0.8;
}
</style>
