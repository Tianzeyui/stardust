# BrainPlus v0.21.0

界面体验优化 + 工作区重构 + 拖拽上传。

## 界面优化

### 布局重构
- **空状态居中** — 未开始聊天时，欢迎语和输入框居中显示；发出消息后自动切换到底部布局
- **去分割线** — 移除对话栏底部和输入框顶部的分割线，界面更简洁流畅
- **发送按钮** — 默认图标由小飞机改为右箭头（→），loading 时仍为 X

### 侧边栏插件标识
- 第三方安装的插件导航项显示淡色"插件"文字标志
- 长名称自动截断，badge 自然右对齐
- 折叠状态显示淡色小圆点 + tooltip 提示

## 工作区

### 工作区面板
- 输入工具栏新增"工作区"按钮，输出文件收纳入弹出面板
- 支持完整目录浏览：进入子目录、返回上级、在文件管理器中打开
- 目录优先排序，文件支持点击打开

### 移除 input 目录
- `~/BrainPlus/workspace/input/` 已移除，不再创建
- 清理所有相关引用（工具描述、fallback 路径、文件管理器入口等）

## 拖拽上传
- 输入框支持拖拽文件直接上传（与按钮上传共用同一处理逻辑）
- 拖拽悬停时输入框高亮提示
- 文件按钮显示附件数量（文本计数，与 Skills/Agents 样式统一）

## 体验优化
- Agents 数量打开聊天页自动获取，无需点击弹窗才加载
- 工具栏按钮计数样式统一为文本（Skills / Agents / 工具 / 文件）

## 变更文件
- `ChatPage.tsx` — 布局重构、工作区面板、拖拽上传
- `ConversationBar.tsx` — 移除顶部分割线
- `Sidebar.tsx` — 插件徽标
- `AgentPicker.tsx` — 挂载自动加载
- `workspace.ts (electron)` — 移除 input 目录
- `workspace.ts (tools)` / `sandbox.ts` / `pluginSystem.ts` / `PluginPage.tsx` / `FileManagerPage.tsx` — 清理 input 引用
