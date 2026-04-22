<template>
  <!-- 加载中 -->
  <div v-if="!isReady" class="loading-screen">
    <div class="loading-spinner"></div>
    <p>加载中...</p>
  </div>

  <!-- 设置新密码（密码重置链接打开时） -->
  <div v-else-if="resetPasswordMode" class="login-screen">
    <div class="login-box">
      <div class="login-logo">🔑</div>
      <h1>设置新密码</h1>
      <p>请输入您的新密码</p>
      
      <form @submit.prevent="handleSetNewPassword">
        <input
          v-model="newPassword"
          type="password"
          placeholder="新密码（至少6位）"
          required
          minlength="6"
          class="login-input"
        />
        <input
          v-model="confirmPassword"
          type="password"
          placeholder="确认新密码"
          required
          class="login-input"
        />
        
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <div v-if="successMsg" class="login-success">{{ successMsg }}</div>
        
        <button type="submit" :disabled="isLoading" class="login-btn">
          {{ isLoading ? '处理中...' : '确认重置' }}
        </button>
      </form>
    </div>
  </div>

  <!-- 登录界面 -->
  <div v-else-if="!authStore.user" class="login-screen">
    <div class="login-box">
      <div class="login-logo">🧠</div>
      <h1>Brain Plus</h1>
      <p>智能操作系统</p>
      
      <!-- 重置密码模式 -->
      <template v-if="resetMode">
        <div class="reset-success" v-if="resetSent">
          <div class="success-icon">✅</div>
          <p>重置链接已发送</p>
          <p class="success-hint">请查收邮件，点击链接重置密码</p>
          <button @click="resetMode = false; resetSent = false" class="back-btn">
            返回登录
          </button>
        </div>
        <template v-else>
          <div class="reset-title">重置密码</div>
          <form @submit.prevent="handleResetPassword">
            <input
              v-model="email"
              type="email"
              placeholder="输入注册邮箱"
              required
              class="login-input"
            />
            <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
            <button type="submit" :disabled="isLoading" class="login-btn">
              {{ isLoading ? '发送中...' : '发送重置链接' }}
            </button>
          </form>
          <button @click="resetMode = false" class="link-btn">
            ← 返回登录
          </button>
        </template>
      </template>

      <!-- 登录/注册模式 -->
      <template v-else>
        <div class="login-tabs">
          <button :class="{ active: isLoginMode }" @click="isLoginMode = true">登录</button>
          <button :class="{ active: !isLoginMode }" @click="isLoginMode = false">注册</button>
        </div>

        <form @submit.prevent="handleAuth">
          <input
            v-model="email"
            type="email"
            placeholder="邮箱地址"
            required
            class="login-input"
          />
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            required
            minlength="6"
            class="login-input"
          />
          
          <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
          
          <button type="submit" :disabled="isLoading" class="login-btn">
            {{ isLoading ? '处理中...' : (isLoginMode ? '登录' : '注册') }}
          </button>
        </form>

        <button v-if="isLoginMode" @click="resetMode = true" class="link-btn">
          忘记密码？
        </button>

        <div v-if="!isLoginMode" class="login-hint">
          注册后将自动登录，请查收验证邮件
        </div>
      </template>
    </div>
  </div>

  <!-- 主系统 -->
  <web-os v-else></web-os>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { AppHelper } from '@stread/web-os'
import { useAuthStore } from './stores/auth.js'
import { apps } from './components/apps/apps.config.js'

const authStore = useAuthStore()

const isReady = ref(false)
const isLoginMode = ref(true)
const resetMode = ref(false)
const resetSent = ref(false)
const resetPasswordMode = ref(false)
const email = ref('')
const password = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

onMounted(async () => {
  await authStore.init()
  
  // 检测密码重置事件
  authStore.getClient().auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      resetPasswordMode.value = true
    }
  })
  
  // 监听退出登录事件，清空表单
  window.addEventListener('auth:logout', () => {
    email.value = ''
    password.value = ''
    errorMsg.value = ''
    isLoginMode.value = true
    resetMode.value = false
  })
  
  isReady.value = true
  apps.forEach(app => {
    AppHelper.registerApp(app)
  })
})

const handleAuth = async () => {
  errorMsg.value = ''
  isLoading.value = true

  try {
    if (isLoginMode.value) {
      const result = await authStore.signIn(email.value.trim(), password.value)
      // 登录成功，清空表单
      email.value = ''
      password.value = ''
    } else {
      await authStore.signUp(email.value.trim(), password.value)
      alert('注册成功！请查收验证邮件。')
      isLoginMode.value = true
      // 切换到登录模式后清空表单
      email.value = ''
      password.value = ''
    }
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    isLoading.value = false
  }
}

const handleResetPassword = async () => {
  errorMsg.value = ''
  isLoading.value = true

  try {
    await authStore.sendResetPassword(email.value)
    resetSent.value = true
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    isLoading.value = false
  }
}

const handleSetNewPassword = async () => {
  errorMsg.value = ''
  successMsg.value = ''
  
  if (newPassword.value !== confirmPassword.value) {
    errorMsg.value = '两次密码不一致'
    return
  }
  
  isLoading.value = true
  
  try {
    const { error } = await authStore.getClient().auth.updateUser({
      password: newPassword.value
    })
    
    if (error) throw error
    
    successMsg.value = '密码重置成功！'
    setTimeout(() => {
      resetPasswordMode.value = false
      newPassword.value = ''
      confirmPassword.value = ''
    }, 2000)
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    isLoading.value = false
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  height: 100vh;
  overflow: hidden;
}

/* 登录界面 */
.login-screen,
.loading-screen {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-box {
  background: white;
  border-radius: 24px;
  padding: 40px 32px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  text-align: center;
}

.login-logo {
  font-size: 64px;
  margin-bottom: 16px;
}

.login-box h1 {
  font-size: 28px;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 4px;
}

.login-box > p {
  color: #94a3b8;
  margin-bottom: 32px;
}

.login-tabs {
  display: flex;
  background: #f1f5f9;
  border-radius: 12px;
  padding: 4px;
  margin-bottom: 24px;
}

.login-tabs button {
  flex: 1;
  padding: 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-weight: 600;
  font-size: 15px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.login-tabs button.active {
  background: white;
  color: #6366f1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.login-box form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-input {
  padding: 16px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

.login-input:focus {
  border-color: #6366f1;
}

.login-error {
  color: #ef4444;
  font-size: 14px;
  text-align: left;
}

.login-success {
  color: #22c55e;
  font-size: 14px;
  text-align: left;
}

.login-btn {
  background: #6366f1;
  color: white;
  padding: 16px;
  border-radius: 12px;
  font-weight: bold;
  font-size: 16px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.login-btn:hover:not(:disabled) {
  background: #4f46e5;
  transform: translateY(-1px);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-hint {
  margin-top: 16px;
  font-size: 12px;
  color: #94a3b8;
}

.link-btn {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 14px;
  cursor: pointer;
  margin-top: 16px;
  padding: 8px;
}

.link-btn:hover {
  text-decoration: underline;
}

.reset-title {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 20px;
}

.reset-success {
  padding: 20px 0;
}

.success-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.reset-success p {
  color: #1e293b;
  font-size: 16px;
  margin-bottom: 8px;
}

.success-hint {
  color: #94a3b8 !important;
  font-size: 14px !important;
}

.back-btn {
  margin-top: 24px;
  background: #6366f1;
  color: white;
  padding: 12px 24px;
  border-radius: 10px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

/* 加载界面 */
.loading-screen {
  flex-direction: column;
  gap: 20px;
}

.loading-screen p {
  color: white;
  font-size: 18px;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 原有样式 */
.Wallpaper {
  background-color: #808080 !important;
  background: #808080 !important;
}

.Wallpaper img {
  display: none !important;
  visibility: hidden !important;
}

.Wallpaper .defaultWallpaper {
  background-color: #808080 !important;
  background: #808080 !important;
  width: 100% !important;
  height: 100% !important;
}

.wo_screen {
  background: #808080 !important;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
