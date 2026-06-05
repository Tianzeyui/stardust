# BrainPlus v0.20.0

首个正式发布版本，带来完整的插件系统和三端自动构建。

## 插件系统

### 双模式开发
- **React/TSX 模式** — 使用 React + shadcn/ui + TypeScript 编写插件，系统自动编译
- **HTML 模式** — 纯静态页面，Tailwind CSS 直接写

### 60+ API 方法

| 能力 | 主要 API |
|------|---------|
| AI 模型调用 | `ai.chat()` `ai.getModelName()` |
| 文件系统（沙箱） | `fs.readFile/writeFile/listDir/stat/unlink` |
| 文档转换 | `file.convert()` (docx/pdf → Markdown) |
| 对话框 | `dialog.openFile()` |
| 沙箱执行 | `sandbox.executeJS()` `sandbox.executePython()` |
| Supabase | `supabase.getClient()` |
| Cloudinary | `cloudinary.upload()` |
| HTTP 代理 | `http.fetch()` (绕过 CORS) |
| 插件存储 | `storage.get/set()` |
| Toast 通知 | `ui.toast()` |
| 工作区 | `workspace.getPaths/openFile/listOutputs` |

### 安全
- 文件系统沙箱：第三方插件限制在自身安装目录内
- 崩溃隔离：ErrorBoundary + try-catch 全链路防护
- 权限最小化：按 `manifest.json` 声明授权

### 搜索
- Bing + DuckDuckGo 双引擎，AI 工具可调用
- `ensearch=1` 绕过 cn.bing.com 关键词过滤

### 示例插件
- **Hello World** — 完整能力演示 + API 自检面板（14 个检查点）
- **日记** / **灵感** — 拆分为独立可插拔插件，SQL 随插件走
- **_template** — 脚手架：能力介绍 / 设计参考 / 开发规范

## CI / CD
- 推送 tag 自动构建 macOS / Windows / Linux 三端安装包
- 产物自动上传到 GitHub Release

## 安装
1. 下载对应平台的安装包
2. macOS 用户首次打开如提示"已损坏"，运行：
   ```
   xattr -cr /Applications/BrainPlus.app
   ```
3. 首次使用请在设置中配置 AI 模型 → 开启能力 → 安装插件

## 参与贡献
欢迎提交插件、提 PR 扩展 API、报告问题：[GitHub Issues](https://github.com/Tianzeyui/brainPlus/issues)
