# 🚀 快速开始

## 添加新应用到 WebOS

### 3 步完成！

#### Step 1: 创建应用组件
```bash
touch src/components/apps/MyApp.vue
```

编辑 `src/components/apps/MyApp.vue`:
```vue
<template>
  <div class="my-app">
    <h1>我的应用</h1>
  </div>
</template>

<script setup>
</script>

<style scoped>
.my-app {
  height: 100%;
  padding: 20px;
}
</style>
```

#### Step 2: 注册应用
编辑 `src/components/apps/apps.config.js`:

```javascript
// 1. 导入组件
import MyApp from './MyApp.vue'

// 2. 在 apps 数组中添加配置
{
  packageId: 'com.brainplus.myapp',
  name: '我的应用',
  icon: 'https://cdn-icons-png.flaticon.com/512/xxx/xxx.png',
  view: MyApp,
  defaultWidth: 800,
  defaultHeight: 600
}
```

#### Step 3: 完成！
重新启动开发服务器，新应用就会出现在桌面上！

## 应用配置选项

| 选项 | 必填 | 说明 | 示例 |
|------|------|------|------|
| packageId | ✅ | 唯一标识 | `com.brainplus.calculator` |
| name | ✅ | 显示名称 | `计算器` |
| icon | ✅ | 图标URL | `https://.../icon.png` |
| view | ✅ | Vue组件 | `CalculatorApp` |
| defaultWidth | ❌ | 窗口宽度 | `800` |
| defaultHeight | ❌ | 窗口高度 | `600` |
| defaultMax | ❌ | 默认最大化 | `true` |
| hiddenInDesktop | ❌ | 隐藏于桌面 | `false` |

## 常用命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## 目录结构

```
src/
├── components/apps/     # 所有应用
│   ├── apps.config.js   # 应用配置
│   └── *.vue           # 应用组件
├── App.vue              # 主入口
└── main.js              # 启动文件
```

## 图标资源

使用 Flaticon 免费图标：
- 搜索图标：https://www.flaticon.com/
- 格式：`https://cdn-icons-png.flaticon.com/512/{id}/{id}.png`

## 提示

- ✅ 应用组件必须设置 `height: 100%`
- ✅ 使用 `<style scoped>` 避免样式冲突
- ✅ packageId 必须唯一
- ✅ 查看 `ARCHITECTURE.md` 了解详细架构
- ✅ 查看 `APP_TEMPLATE.md` 获取开发模板

## 常见问题

**Q: 应用不显示？**
A: 检查 `apps.config.js` 是否正确导入和注册

**Q: 样式错乱？**
A: 确保使用 `<style scoped>` 并设置 `height: 100%`

**Q: 需要重新启动服务器吗？**
A: 不需要，Vite 支持热更新

---

快速参考完成！
