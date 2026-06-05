# BrainPlus 插件化架构方案

## 目标

将日记、灵感记录等非核心功能从主应用抽离为独立插件，通过统一接口动态加载。新增功能不再修改主应用代码，只需按规范编写插件目录。

## 插件结构

```
plugins/
├── diary/                    # 日记插件
│   ├── manifest.json         # 插件声明
│   ├── index.ts              # 入口：register()
│   ├── components/
│   │   ├── DiaryPage.tsx     # 主页面组件
│   │   ├── DiaryContent.tsx  # 内容编辑器
│   │   └── DiaryTimeline.tsx # 时间线
│   ├── services/
│   │   └── diaryService.ts   # 业务逻辑
│   └── types.ts              # 类型定义
│
├── inspiration/              # 灵感记录插件
│   ├── manifest.json
│   ├── index.ts
│   ├── components/
│   │   └── InspirationPage.tsx
│   ├── services/
│   │   └── inspirationService.ts
│   └── types.ts
│
└── _template/                # 插件模板（新建插件参考）
    ├── manifest.json
    └── index.ts
```

## manifest.json 规范

```json
{
  "id": "diary",
  "name": "日记",
  "version": "1.0.0",
  "description": "日记写作与智能分析",
  "icon": "BookOpen",
  "navOrder": 60,
  "requires": {
    "supabase": true
  },
  "permissions": ["files", "ai"],
  "enabled": true
}
```

## 插件接口

```ts
// plugins/diary/index.ts
import type { Plugin } from '@/lib/pluginSystem'

export const diaryPlugin: Plugin = {
  manifest: { id: 'diary', name: '日记', icon: 'BookOpen', ... },
  register(ctx: PluginContext) {
    // 注册导航
    ctx.registerNav({ id: 'diary', label: '日记', icon: BookOpen, order: 60 })
    // 注册路由 -> 组件
    ctx.registerRoute('diary', () => import('./components/DiaryPage'))
    // 注册服务
    ctx.registerService('diary', diaryService)
  }
}
```

## PluginContext

```ts
interface PluginContext {
  registerNav(item: NavItemDef): void
  registerRoute(id: string, loader: () => Promise<any>): void
  registerService(name: string, service: any): void
  onToolRegister(fn: (tools: ToolMap) => void): void  // 注册 AI 工具
}
```

## PluginSystem（主应用侧）

```ts
// src/lib/pluginSystem.ts
class PluginSystem {
  private plugins: Map<string, Plugin> = new Map()
  private navItems: NavItemDef[] = []
  private routes: Map<string, () => Promise<any>> = new Map()

  async loadAll() {
    const manifests = await this.scanManifests()
    for (const m of manifests) {
      if (!m.enabled) continue
      const plugin = await import(`@/plugins/${m.id}`)
      plugin.default.register(this.createContext())
      this.plugins.set(m.id, plugin.default)
    }
  }

  getNavItems(): NavItemDef[] { return this.navItems.sort((a,b) => a.order - b.order) }
  getRoute(id: string) { return this.routes.get(id) }
}
```

## 迁移步骤

### Step 1: PluginSystem 基础设施

- [ ] `src/lib/pluginSystem.ts` — PluginSystem 类
- [ ] `src/lib/pluginTypes.ts` — Plugin/PluginContext/NavItemDef 类型
- [ ] AppLayout 改用 `pluginSystem.getNavItems()` 动态渲染导航
- [ ] AppLayout 用 `pluginSystem.getRoute(id)` 动态渲染组件

**验证**：现有功能正常（未迁移前，diary/inspiration 仍硬编码）

---

### Step 2: 迁移日记为插件

- [ ] 创建 `plugins/diary/` 目录
- [ ] 编写 `manifest.json`
- [ ] 编写 `index.ts`（register 函数）
- [ ] 迁移 `diaryService.ts` → `plugins/diary/services/`
- [ ] 迁移 `DiaryPage.tsx` 等组件 → `plugins/diary/components/`
- [ ] 从 AppLayout 删除硬编码的 diary 路由
- [ ] 从 Sidebar 删除 diary 导航项

**验证**：日记功能通过插件系统正常工作

---

### Step 3: 迁移灵感记录为插件

- [ ] 同上流程

**验证**：灵感记录功能通过插件系统正常工作

---

### Step 4: 插件启用/停用

- [ ] PluginSystem 支持运行时 enable/disable
- [ ] 设置页新增"插件"标签页，显示插件列表 + 开关

**验证**：停用后导航和路由均不可用

---

### Step 5: 插件工具注入

- [ ] PluginContext.onToolRegister → AI 工具自动注入
- [ ] 插件可注册 MCP 工具供 AI 调用

**验证**：日记插件注册 `diary_read`/`diary_write` 工具

---

## 收益

- 日记/灵感从主应用 ~400 行代码中移除
- 新增功能只需创建插件目录，不动主应用
- 用户按需启用插件
- 第三方开发插件成为可能

## 当前进度

| 步骤 | 状态 |
|------|------|
| Step 1: PluginSystem | ⬜ |
| Step 2: 迁移日记 | ⬜ |
| Step 3: 迁移灵感 | ⬜ |
| Step 4: 启用停用 | ⬜ |
| Step 5: 工具注入 | ⬜ |
