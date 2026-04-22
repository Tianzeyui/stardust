# 应用模板

按照以下步骤创建新的 WebOS 应用：

## 1. 创建应用组件

在 `src/components/apps/` 目录下创建新的 Vue 组件：

```vue
<template>
  <div class="my-app">
    <!-- 你的应用界面 -->
    <h1>我的应用</h1>
    <p>应用内容</p>
  </div>
</template>

<script setup>
// 应用逻辑
import { ref } from 'vue'

const message = ref('Hello World')
</script>

<style scoped>
.my-app {
  height: 100%;
  padding: 20px;
  background: white;
}

h1 {
  color: #333;
}
</style>
```

## 2. 注册应用

在 `src/components/apps/apps.config.js` 中添加应用配置：

```javascript
import MyApp from './MyApp.vue'

export const apps = [
  // ... 其他应用
  
  // 新应用
  {
    packageId: 'com.brainplus.myapp',  // 唯一标识
    name: '我的应用',                     // 显示名称
    icon: '图标URL',                     // 应用图标
    view: MyApp,                         // 组件引用
    defaultWidth: 800,                   // 默认宽度
    defaultHeight: 600,                  // 默认高度
    hiddenInDesktop: false               // 是否在桌面隐藏
  }
]

export {
  // ... 其他导出
  MyApp
}
```

## 3. 应用配置说明

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| packageId | string | ✅ | 应用唯一标识，格式：com.brainplus.xxx |
| name | string | ✅ | 在界面上显示的名称 |
| icon | string | ✅ | 图标 URL |
| view | Component | ✅ | Vue 组件 |
| defaultWidth | number | ❌ | 默认窗口宽度（像素） |
| defaultHeight | number | ❌ | 默认窗口高度（像素） |
| defaultMax | boolean | ❌ | 是否默认最大化 |
| hiddenInDesktop | boolean | ❌ | 是否在桌面隐藏，仅在 Dock 显示 |

## 4. 最佳实践

### 组件设计
- 使用 `<style scoped>` 避免样式污染
- 使用 Composition API (`<script setup>`)
- 保持组件单一职责
- 合理拆分子组件

### 命名规范
- 组件文件：PascalCase (如 `MyApp.vue`)
- packageId：点分隔的小写字母 (如 `com.brainplus.myapp`)
- 应用名称：中文或简短英文

### 图标资源
推荐使用 [Flaticon](https://www.flaticon.com/) 提供的免费图标：
```
https://cdn-icons-png.flaticon.com/512/xxx/xxx.png
```

## 示例应用

参考现有的应用实现：
- 📁 `FileManagerApp.vue` - 列表展示应用
- 🖥️ `TerminalApp.vue` - 交互式应用
- 🔢 `CalculatorApp.vue` - 表单处理应用
- 💡 `InspirationApp.vue` - API集成应用

## 查看所有应用

在浏览器控制台查看已注册的应用：
```javascript
console.log(AppHelper.apps)
```
