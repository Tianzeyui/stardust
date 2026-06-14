<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README_zh.md">中文</a>
</p>

# BrainPlus

<div align="center">

**Open-source AI Agent Platform — Build, Extend, Automate.**

[![Version](https://img.shields.io/badge/version-0.21.0-blue)](package.json)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()

</div>

BrainPlus is a desktop AI agent platform that combines a powerful chat interface with an extensible plugin system. It integrates with 60+ AI models, supports MCP (Model Context Protocol) tools, sandboxed code execution, and multi-project management — all wrapped in a clean, modern UI.

## Features

### 🧠 AI Chat
- Multi-model support — OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen, Llama, and 50+ more
- Streaming responses with token usage tracking
- Skills system for reusable prompt workflows
- Agent system with tool-augmented autonomous execution
- Conversation management with Supabase sync

### 🔌 Plugin System
- **React/TSX plugins** — full access to shadcn/ui components and React ecosystem
- **60+ host APIs** — AI chat, file system, sandbox execution, Supabase, Cloudinary, HTTP, and more
- **AI tool injection** — plugins can register custom Function Calling tools for the AI to use
- **Permission model** — declarative permissions in `manifest.json`, sandboxed file system access
- **Crash isolation** — each plugin wrapped in ErrorBoundary, single plugin failure won't crash the app
- **Community Plugins** — browse and install community plugins at [brainPlus-community-plugins](https://github.com/Tianzeyui/brainPlus-community-plugins)

### 🛠 Built-in Tools
- **MCP Gateway** — connect to any MCP-compatible server (SSE, stdio, Streamable HTTP)
- **Sandbox** — execute JavaScript (with npm packages) and Python (with pip packages) in isolation
- **File System** — read, write, list, and manage files with workspace integration
- **Document Conversion** — convert PDF, DOCX, PPTX, XLSX to Markdown
- **Web Search** — integrated search capabilities
- **Agent Orchestration** — delegate complex tasks to autonomous agents

### 🗂 Multi-Project
- Project-based workspace with independent contexts
- Per-project file trees and outputs
- Memory system (local + Supabase) for persistent knowledge

### 🎨 Modern UI
- Dark/light theme with Tailwind CSS
- shadcn/ui component library
- Responsive sidebar navigation
- Customizable layout per plugin

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Electron |
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS + shadcn/ui |
| AI SDK | Vercel AI SDK (`ai` package) |
| Database | Supabase (optional) |
| Image Upload | Cloudinary (optional) |
| Plugin Compiler | esbuild |

## Quick Start

### Prerequisites
- Node.js 20+
- npm

### Install & Run

```bash
# Clone the repository
git clone https://github.com/Tianzeyui/brainPlus.git
cd brainPlus

# Install dependencies
npm install

# Start development
npm run dev
```

### Build & Package

```bash
# Build for current platform
npm run build:electron

# Or target specific platforms
npm run build:mac
npm run build:win
npm run build:linux
```

Build outputs are placed in the `release/` directory.

## Plugin Development

Plugins use React/TSX. Start by copying the template from [brainPlus-community-plugins](https://github.com/Tianzeyui/brainPlus-community-plugins):

```bash
git clone https://github.com/Tianzeyui/brainPlus-community-plugins.git
cp -r brainPlus-community-plugins/_template plugins/my-feature
```

### Directory Structure

```
my-feature/
  manifest.json     ← Plugin declaration (id, name, permissions, AI tools)
  index.tsx         ← Entry point — export register(ctx) function
  package.json      ← Dependencies (required, can be empty)
  supabase/         ← Database migrations (optional)
```

### Minimal Plugin

```tsx
import React from 'react'

export function register(ctx: any) {
  const MyPage = () => <div className="p-4">Hello from my plugin!</div>

  ctx.registerNav({ id: 'my-feature', label: 'My Feature', icon: 'Package', order: 90 })
  ctx.registerRoute('my-feature', () => Promise.resolve({ default: MyPage }))
}
```

### Host APIs Available

| API | Methods | Permission |
|-----|---------|------------|
| `ctx.api.ai` | `chat()`, `getModelName()`, `openModel()` | `ai` |
| `ctx.api.fs` | `readFile()`, `writeFile()`, `listDir()`, `exists()`, `stat()`, `mkdir()`, `unlink()` | `files` |
| `ctx.api.dialog` | `openFile()` | `files` |
| `ctx.api.file` | `convert()` (docx/pdf/pptx/xlsx → Markdown) | `files` |
| `ctx.api.sandbox` | `executeJS()`, `executePython()` | `sandbox` |
| `ctx.api.supabase` | `getClient()`, `isConfigured()` | `supabase` |
| `ctx.api.cloudinary` | `upload()`, `isConfigured()` | `cloudinary` |
| `ctx.api.workspace` | `getPaths()`, `openFile()`, `listOutputs()` | `workspace` |
| `ctx.api.storage` | `get()`, `set()` | always |
| `ctx.api.http` | `fetch()` (CORS-free via main process) | always |
| `ctx.api.ui` | `toast()` | always |

### Registering AI Tools

Plugins can inject Function Calling tools so AI can interact with plugin features:

```tsx
ctx.onToolRegister((tools) => {
  tools['my_search'] = {
    description: 'Search my plugin data',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async (args) => {
      // Your business logic here
      return `Results for: ${args.query}`
    },
  }
})
```

Or declaratively in `manifest.json`:

```json
{
  "tools": [{
    "name": "my_tool",
    "description": "What this tool does",
    "inputSchema": { "type": "object", "properties": { "param": { "type": "string" } } },
    "outputTemplate": "Result: ${param}"
  }]
}
```

## Architecture

```
┌──────────────────────────────────────────┐
│              Electron Shell               │
│  ┌─────────────┐  ┌───────────────────┐  │
│  │  Main Process│  │  Renderer Process │  │
│  │              │  │                   │  │
│  │  • File I/O  │  │  • React UI       │  │
│  │  • Sandbox   │◄─┤  • Plugin System  │  │
│  │  • esbuild   │  │  • AI SDK         │  │
│  │  • MCP Svr   │  │  • Tools Registry │  │
│  └─────────────┘  └───────────────────┘  │
└──────────────────────────────────────────┘
```

- **Main Process** — handles file system, sandbox execution, esbuild plugin compilation, MCP server connections, and HTTP proxying
- **Renderer Process** — React UI with plugin system, AI chat, tools registry, and Supabase integration
- **IPC Bridge** — `contextBridge` exposes secure, permission-filtered APIs to plugins

## Contributing

Contributions are welcome! Here's how you can help:

1. **Create plugins** — build plugins using the [community plugins template](https://github.com/Tianzeyui/brainPlus-community-plugins)
2. **Add APIs** — extend `src/lib/pluginTypes.ts` and `src/lib/pluginSystem.ts` to add new host capabilities
3. **Improve the core** — fix bugs, improve performance, enhance the UI

See the plugin documentation in the [community plugins repo](https://github.com/Tianzeyui/brainPlus-community-plugins) under `_template/docs/` for detailed development guides.

## Release Notes

- [v0.22.0](docs/releases/v0.22.0.md) — Community plugins, repo management, Skill toggles
- [v0.21.0](docs/releases/v0.21.0.md) — Project system, toolbox upgrade, UI redesign

## License

Apache 2.0 © 沉浸位工作室

---

<div align="center">
  <sub>Built with ❤️ by the BrainPlus community</sub>
</div>
