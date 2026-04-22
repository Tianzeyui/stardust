<template>
  <div class="camera-app">
    <div class="placeholder">
      <div class="icon">📷</div>
      <div class="text">相机功能开发中...</div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.camera-app {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
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
  opacity: 0.8;
}
</style>
