<template>
  <div class="file-manager">
    <div class="header">
      <h2>📁 文件管理器</h2>
    </div>
    <div class="content">
      <div class="folders">
        <div 
          v-for="folder in folders" 
          :key="folder.name" 
          class="folder-item"
          @dblclick="openFolder(folder)"
        >
          <div class="folder-icon">{{ folder.icon }}</div>
          <div class="folder-name">{{ folder.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const folders = ref([
  { name: '文档', icon: '📄' },
  { name: '图片', icon: '🖼️' },
  { name: '视频', icon: '🎥' },
  { name: '音乐', icon: '🎵' },
  { name: '下载', icon: '⬇️' },
  { name: '桌面', icon: '🖥️' },
  { name: '视频', icon: '🎬' },
  { name: '压缩包', icon: '📦' }
])

const openFolder = (folder) => {
  console.log('打开文件夹:', folder.name)
}
</script>

<style scoped>
.file-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.header {
  padding: 15px 20px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

.header h2 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 15px;
}

.folder-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.folder-item:hover {
  background: #f0f0f0;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.folder-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.folder-name {
  font-size: 12px;
  color: #333;
  text-align: center;
  word-break: break-word;
}
</style>
