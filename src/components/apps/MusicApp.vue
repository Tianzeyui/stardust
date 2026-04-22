<template>
  <div class="music-app">
    <div class="placeholder">
      <div class="icon">🎵</div>
      <div class="text">音乐播放器开发中...</div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.music-app {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.placeholder {
  text-align: center;
}

.icon {
  font-size: 80px;
  margin-bottom: 20px;
}

.text {
  font-size: 24px;
  opacity: 0.9;
}
</style>
