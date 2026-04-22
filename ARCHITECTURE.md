# Brain Plus Web - 架构文档

## 📁 项目结构

```
brainPlusWeb/
├── src/
│   ├── components/
│   │   └── apps/                      # 🏠 应用组件目录
│   │       ├── apps.config.js         # 📋 应用配置文件（统一管理）
│   │       ├── APP_TEMPLATE.md        # 📝 新应用开发模板
│   │       ├── HomeApp.vue            # 🏠 首页
│   │       ├── FileManagerApp.vue     # 📁 文件管理器
│   │       ├── TerminalApp.vue         # 🖥️ 终端
│   │       ├── CalculatorApp.vue       # 🔢 计算器
│   │       ├── NotesApp.vue           # 📝 记事本
│   │       ├── BrowserApp.vue         # 🌐 浏览器
│   │       ├── SettingsApp.vue         # ⚙️ 设置
│   │       ├── CameraApp.vue          # 📷 相机
│   │       ├── MusicApp.vue           # 🎵 音乐
│   │       └── InspirationApp.vue      # 💡 灵感捕获
│   ├── App.vue                         # 🎯 主应用入口
│   └── main.js                         # 🚀 应用启动文件
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🎯 核心设计理念

### 1. **高度组件化**
- 每个应用都是独立的 Vue 组件
- 组件之间解耦，易于维护和测试
- 可单独开发和调试

### 2. **配置驱动**
- 所有应用元数据集中在 `apps.config.js`
- 通过配置文件而非代码来管理应用列表
- 新增应用只需添加配置，无需修改核心代码

### 3. **标准化接口**
- 所有应用遵循统一的组件规范
- 使用 Composition API (`<script setup>`)
- 统一的样式隔离（scoped CSS）

## 🔧 扩展应用流程

### 快速添加新应用

**Step 1**: 创建应用组件
```bash
touch src/components/apps/MyNewApp.vue
```

**Step 2**: 编辑应用配置
```javascript
// src/components/apps/apps.config.js
import MyNewApp from './MyNewApp.vue'

export const apps = [
  // ...existing apps
  {
    packageId: 'com.brainplus.mynewapp',
    name: '我的新应用',
    icon: 'https://cdn-icons-png.flaticon.com/512/xxx/xxx.png',
    view: MyNewApp,
    defaultWidth: 800,
    defaultHeight: 600
  }
]
```

**Step 3**: 完成！✨

应用会自动出现在桌面上。

## 🎨 应用组件规范

### 模板结构
```vue
<template>
  <div class="app-name">
    <!-- 应用内容 -->
  </div>
</template>

<script setup>
// 组合式 API
import { ref, computed, onMounted } from 'vue'

// 应用逻辑
</script>

<style scoped>
.app-name {
  /* 样式 */
}
</style>
```

### 必填特性
✅ `height: 100%` - 确保应用填满窗口
✅ `<style scoped>` - 样式隔离
✅ 响应式设计 - 适配不同窗口大小

### 可选增强
🎯 加载状态动画
🎯 空状态提示
🎯 错误处理和反馈
🎯 键盘快捷键
🎯 数据持久化

## 🚀 启动流程

1. `npm run dev` 启动开发服务器
2. 加载 `App.vue`
3. 执行 `apps.config.js` 中的应用配置
4. 遍历 `apps` 数组，调用 `AppHelper.registerApp()`
5. 渲染 `<web-os>` 组件
6. 显示桌面和应用图标

## 📊 当前应用列表

| 应用 | packageId | 功能 |
|------|-----------|------|
| 🏠 首页 | com.brainplus.home | 欢迎界面 |
| 💡 灵感捕获 | com.brainplus.inspiration | 记录灵感 |
| 📁 文件管理器 | com.brainplus.files | 文件浏览 |
| 🖥️ 终端 | com.brainplus.terminal | 命令行 |
| 🔢 计算器 | com.brainplus.calculator | 计算功能 |
| 📝 记事本 | com.brainplus.notes | 笔记管理 |
| 🌐 浏览器 | com.brainplus.browser | 网页浏览 |
| ⚙️ 设置 | com.brainplus.settings | 系统设置 |
| 📷 相机 | com.brainplus.camera | 相机功能(开发中) |
| 🎵 音乐 | com.brainplus.music | 音乐播放(开发中) |

## 🛠️ 技术栈

- **框架**: Vue 3.4+
- **构建工具**: Vite 5
- **UI 组件库**: @stread/web-os
- **样式**: Tailwind CSS (部分应用)
- **后端服务**: Supabase
- **文件存储**: Cloudinary

## 🗄️ 数据库设计规范

### 表名前缀约定

为便于管理和识别，所有自定义表统一使用前缀 `bp_` (brainplus)：

| 前缀 | 模块 | 示例表 |
|------|------|--------|
| `bp_` | 灵感捕获 | `bp_inspirations`, `bp_folders` |
| `bp_` | 记事本 | `bp_notes`, `bp_notebooks` |
| `bp_` | 文件管理 | `bp_files`, `bp_shares` |
| ... | ... | ... |

### 命名规范

```
bp_{模块名}_{实体名}
```

**示例**：
- `bp_inspirations` - 灵感主表
- `bp_folders` - 文件夹表
- `bp_notes` - 笔记表

### 必须包含的字段

每个业务表建议包含以下通用字段：

```sql
id          UUID        -- 主键
user_id     UUID        -- 关联用户 (必填)
created_at  TIMESTAMPTZ -- 创建时间
updated_at  TIMESTAMPTZ -- 更新时间
```

### RLS 策略模板

```sql
-- 启用 RLS
ALTER TABLE bp_xxx ENABLE ROW LEVEL SECURITY;

-- 创建策略
CREATE POLICY "用户只能操作自己的数据"
  ON bp_xxx
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### SQL 文件管理

```
supabase/migrations/
├── 001_create_inspiration_tables.sql  -- 灵感模块
├── 002_create_notes_tables.sql        -- 记事本模块
└── ...
```

**执行顺序**：按文件名数字顺序执行

### 索引命名规范

```sql
idx_{表名}_{字段名}

-- 示例
idx_bp_inspirations_user_id
idx_bp_inspirations_tags
idx_bp_inspirations_folder_id
```

### 触发器命名规范

```sql
update_{表名}_updated_at

-- 示例
update_bp_inspirations_updated_at
```

## 📝 开发规范

### Git 提交规范
```
feat: 新功能
fix: 修复bug
refactor: 重构
style: 样式调整
docs: 文档更新
```

### 代码审查清单
- [ ] 组件是否使用 `<script setup>`
- [ ] 样式是否使用 `scoped`
- [ ] 是否处理了加载和错误状态
- [ ] packageId 是否唯一
- [ ] 是否在 `apps.config.js` 中注册

## 🎯 未来规划

### 计划中的应用
- 📧 邮件客户端
- 💬 即时通讯
- 📊 数据可视化
- 🎮 小游戏
- 📅 日历应用
- 🔖 书签管理
- 🗄️ 数据库管理工具
- 🌈 更多主题

### 技术优化
- [ ] 添加路由系统
- [ ] 实现应用市场
- [ ] 添加权限管理
- [ ] 优化性能
- [ ] 添加单元测试
- [ ] 实现 PWA 支持

## 📚 学习资源

- [Vue 3 文档](https://vuejs.org/)
- [Vite 指南](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [@stread/web-os](https://www.npmjs.com/package/@stread/web-os)

## 🤝 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 LICENSE 文件

---

**享受构建 WebOS 应用的乐趣！ 🚀**
