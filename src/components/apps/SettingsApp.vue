<template>
  <div class="settings-app">
    <div class="menu">
      <div 
        v-for="item in menuItems" 
        :key="item.id"
        class="menu-item"
        :class="{ active: activeMenu === item.id }"
        @click="activeMenu = item.id"
      >
        <span class="icon">{{ item.icon }}</span>
        <span class="label">{{ item.label }}</span>
      </div>
    </div>
    <div class="content">
      <h2>{{ currentMenuItem?.label }}</h2>
      <div class="settings-list">
        <div 
          v-for="setting in currentSettings" 
          :key="setting.label"
          class="setting-item"
        >
          <div class="setting-label">{{ setting.label }}</div>
          <div class="setting-desc">{{ setting.description }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const activeMenu = ref('system')

const menuItems = [
  { id: 'system', label: '系统', icon: '💻' },
  { id: 'display', label: '显示', icon: '🖥️' },
  { id: 'network', label: '网络', icon: '🌐' },
  { id: 'personalization', label: '个性化', icon: '🎨' }
]

const settings = {
  system: [
    { label: '关于', description: '查看设备规格' },
    { label: '剪贴板', description: '查看剪贴板历史' },
    { label: '存储', description: '管理存储空间' }
  ],
  display: [
    { label: '亮度', description: '调整屏幕亮度' },
    { label: '夜间模式', description: '减少蓝光' },
    { label: '分辨率', description: '调整显示分辨率' }
  ],
  network: [
    { label: 'Wi-Fi', description: '连接到无线网络' },
    { label: '以太网', description: '有线网络状态' },
    { label: 'VPN', description: '虚拟专用网络' }
  ],
  personalization: [
    { label: '背景', description: '更改桌面背景' },
    { label: '主题', description: '选择浅色或深色主题' },
    { label: '字体', description: '调整字体大小' }
  ]
}

const currentMenuItem = computed(() => {
  return menuItems.find(item => item.id === activeMenu.value)
})

const currentSettings = computed(() => {
  return settings[activeMenu.value] || []
})
</script>

<style scoped>
.settings-app {
  height: 100%;
  display: flex;
  background: white;
}

.menu {
  width: 200px;
  background: #f8f9fa;
  border-right: 1px solid #e0e0e0;
  padding: 20px 0;
}

.menu-item {
  padding: 12px 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.2s;
}

.menu-item:hover {
  background: #f0f0f0;
}

.menu-item.active {
  background: #e3f2fd;
}

.menu-item .icon {
  font-size: 20px;
}

.menu-item .label {
  font-size: 14px;
  color: #333;
}

.content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}

.content h2 {
  margin-top: 0;
  margin-bottom: 24px;
  font-size: 24px;
  color: #333;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  transition: all 0.2s;
}

.setting-item:hover {
  background: #f0f0f0;
  transform: translateX(4px);
}

.setting-label {
  font-weight: bold;
  margin-bottom: 4px;
  color: #333;
}

.setting-desc {
  color: #666;
  font-size: 14px;
}
</style>
