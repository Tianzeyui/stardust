<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_zh.md">中文</a>
</p>

# BrainPlus

<div align="center">

**开源 AI Agent 平台 — 构建、扩展、自动化。**

[![Version](https://img.shields.io/badge/version-0.22.0-blue)](package.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()

</div>

BrainPlus 是一个桌面端 AI Agent 平台，融合了强大的聊天界面与可扩展的插件系统。它集成了 60+ 个 AI 模型，支持 MCP（模型上下文协议）工具、沙箱化代码执行和多项目管理——全部包裹在简洁现代的 UI 中。

## 功能特性

### 🧠 AI 聊天
- 多模型支持 — OpenAI、Anthropic Claude、Google Gemini、DeepSeek、Qwen、Llama 等 50+ 个模型
- 流式响应，支持 Token 用量追踪
- Skills 技能系统，可复用提示词工作流
- Agent 系统，支持工具增强的自主任务执行
- 对话管理，支持 Supabase 同步

### 🔌 插件系统
- **React/TSX 插件** — 完整访问 shadcn/ui 组件和 React 生态
- **60+ 宿主 API** — AI 聊天、文件系统、沙箱执行、Supabase、Cloudinary、HTTP 等
- **AI 工具注入** — 插件可为 AI 注册自定义 Function Calling 工具
- **权限模型** — 在 `manifest.json` 中声明式配置权限，文件系统访问沙箱化
- **崩溃隔离** — 每个插件包裹在 ErrorBoundary 中，单个插件崩溃不会影响整个应用
- **社区插件** — 浏览并安装社区插件：[brainPlus-community-plugins](https://github.com/Tianzeyui/brainPlus-community-plugins)

### 🛠 内置工具
- **MCP 网关** — 连接任何兼容 MCP 的服务器（SSE、stdio、Streamable HTTP）
- **沙箱** — 在隔离环境中执行 JavaScript（含 npm 包）和 Python（含 pip 包）
- **文件系统** — 读、写、列出、管理工作区文件
- **文档转换** — 将 PDF、DOCX、PPTX、XLSX 转换为 Markdown
- **网页搜索** — 集成搜索能力
- **Agent 编排** — 将复杂任务委派给自治 Agent

### 🗂 多项目
- 基于项目的工作区，独立上下文
- 每个项目独立的文件树和输出
- 记忆系统（本地 + Supabase），持久化知识存储

### 🎨 现代化 UI
- 暗色/亮色主题，基于 Tailwind CSS
- shadcn/ui 组件库
- 响应式侧边栏导航
- 每个插件可自定义布局

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面端框架 | Electron |
| UI 框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式 | Tailwind CSS + shadcn/ui |
| AI SDK | Vercel AI SDK（`ai` 包） |
| 数据库 | Supabase（可选） |
| 图片上传 | Cloudinary（可选） |
| 插件编译器 | esbuild |

## 快速开始

### 前置条件
- Node.js 20+
- npm

### 安装运行

```bash
# 克隆仓库
git clone https://github.com/Tianzeyui/brainPlus.git
cd brainPlus

# 安装依赖
npm install

# 启动开发
npm run dev
```

### 构建打包

```bash
# 为当前平台构建
npm run build:electron

# 或指定目标平台
npm run build:mac
npm run build:win
npm run build:linux
```

构建产物输出到 `release/` 目录。

## 插件开发

插件使用 React/TSX。从 [brainPlus-community-plugins](https://github.com/Tianzeyui/brainPlus-community-plugins) 获取模板开始：

```bash
git clone https://github.com/Tianzeyui/brainPlus-community-plugins.git
cp -r brainPlus-community-plugins/_template plugins/my-feature
```

### 目录结构

```
my-feature/
  manifest.json     ← 插件声明（id、name、permissions、AI tools）
  index.tsx         ← 入口文件 — 导出 register(ctx) 函数
  package.json      ← 依赖声明（必需，可为空）
  supabase/         ← 数据库迁移文件（可选）
```

### 最简插件

```tsx
import React from 'react'

export function register(ctx: any) {
  const MyPage = () => <div className="p-4">你好，这是我的插件！</div>

  ctx.registerNav({ id: 'my-feature', label: '我的功能', icon: 'Package', order: 90 })
  ctx.registerRoute('my-feature', () => Promise.resolve({ default: MyPage }))
}
```

### 可用宿主 API

| API | 方法 | 所需权限 |
|-----|------|---------|
| `ctx.api.ai` | `chat()`、`getModelName()`、`openModel()` | `ai` |
| `ctx.api.fs` | `readFile()`、`writeFile()`、`listDir()`、`exists()`、`stat()`、`mkdir()`、`unlink()` | `files` |
| `ctx.api.dialog` | `openFile()` | `files` |
| `ctx.api.file` | `convert()`（docx/pdf/pptx/xlsx → Markdown） | `files` |
| `ctx.api.sandbox` | `executeJS()`、`executePython()` | `sandbox` |
| `ctx.api.supabase` | `getClient()`、`isConfigured()` | `supabase` |
| `ctx.api.cloudinary` | `upload()`、`isConfigured()` | `cloudinary` |
| `ctx.api.workspace` | `getPaths()`、`openFile()`、`listOutputs()` | `workspace` |
| `ctx.api.storage` | `get()`、`set()` | 始终可用 |
| `ctx.api.http` | `fetch()`（通过主进程，无 CORS 限制） | 始终可用 |
| `ctx.api.ui` | `toast()` | 始终可用 |

### 注册 AI 工具

插件可以注入 Function Calling 工具，让 AI 与插件功能交互：

```tsx
ctx.onToolRegister((tools) => {
  tools['my_search'] = {
    description: '搜索我的插件数据',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async (args) => {
      // 你的业务逻辑
      return `搜索结果：${args.query}`
    },
  }
})
```

或在 `manifest.json` 中声明式定义：

```json
{
  "tools": [{
    "name": "my_tool",
    "description": "此工具的功能描述",
    "inputSchema": { "type": "object", "properties": { "param": { "type": "string" } } },
    "outputTemplate": "结果：${param}"
  }]
}
```

## 架构

```
┌──────────────────────────────────────────┐
│              Electron 壳层                │
│  ┌─────────────┐  ┌───────────────────┐  │
│  │   主进程      │  │     渲染进程       │  │
│  │              │  │                   │  │
│  │  • 文件 I/O  │  │  • React UI       │  │
│  │  • 沙箱      │◄─┤  • 插件系统        │  │
│  │  • esbuild   │  │  • AI SDK         │  │
│  │  • MCP 服务器│  │  • 工具注册         │  │
│  └─────────────┘  └───────────────────┘  │
└──────────────────────────────────────────┘
```

- **主进程** — 处理文件系统、沙箱执行、esbuild 插件编译、MCP 服务器连接和 HTTP 代理
- **渲染进程** — React UI，包含插件系统、AI 聊天、工具注册和 Supabase 集成
- **IPC 桥接** — `contextBridge` 向插件暴露安全的、经权限过滤的 API

## 参与贡献

欢迎贡献！参与方式：

1. **创建插件** — 使用[社区插件模板](https://github.com/Tianzeyui/brainPlus-community-plugins)构建插件
2. **扩展 API** — 修改 `src/lib/pluginTypes.ts` 和 `src/lib/pluginSystem.ts` 添加新的宿主能力
3. **改进核心** — 修复 Bug、提升性能、美化 UI

详细的插件开发指南请参见[社区插件仓库](https://github.com/Tianzeyui/brainPlus-community-plugins)中 `_template/docs/` 目录。

## 版本发布

- [v0.22.0](docs/releases/v0.22.0.md) — 社区插件、仓库管理、Skill 开关
- [v0.21.0](docs/releases/v0.21.0.md) — 项目系统、工具箱升级、界面重构

## 许可证

Apache 2.0 © 沉浸位工作室

---

<div align="center">
  <sub>由 BrainPlus 社区用 ❤️ 构建</sub>
</div>
