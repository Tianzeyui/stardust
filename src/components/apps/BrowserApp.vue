<template>
  <div class="browser-app">
    <div class="toolbar">
      <input 
        v-model="url" 
        @keyup.enter="navigate"
        placeholder="输入网址"
        class="url-input"
      />
    </div>
    <div class="content">
      <div class="home">
        <div class="home-icon">🌐</div>
        <h2>Brain Plus 浏览器</h2>
        <p>输入网址开始浏览</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const url = ref('')

const navigate = () => {
  if (url.value && !url.value.startsWith('http')) {
    url.value = 'https://' + url.value
  }
  console.log('Navigating to:', url.value)
}
</script>

<style scoped>
.browser-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;
}

.toolbar {
  padding: 10px 15px;
  background: #f1f3f4;
  border-bottom: 1px solid #dadce0;
}

.url-input {
  width: 100%;
  padding: 8px 15px;
  border: 1px solid #dadce0;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
  transition: border-color 0.2s;
}

.url-input:focus {
  border-color: #1a73e8;
}

.content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f8f9fa;
}

.home {
  text-align: center;
}

.home-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

h2 {
  color: #5f6368;
  margin-bottom: 8px;
}

p {
  color: #80868b;
}
</style>
