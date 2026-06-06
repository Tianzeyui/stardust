# BrainPlus v0.21.0

项目系统 + 工作区重构 + 工具箱升级 + 界面全面优化。

## 项目系统 🆕

完整的多项目管理体系，为智能体提供独立的上下文边界。

### 项目 CRUD
- 新建/删除/编辑项目，每个项目有独立的工作区目录（`~/BrainPlus/projects/<projectName>/`）
- 项目设置包含：PROMPT.md（项目级 Markdown 提示词）、Agents 选择、Skills 选择、MCP 服务器/工具选择、插件工具选择
- 自定义删除确认弹窗，过期引用自动检测显示
- 项目数据持久化到 `~/BrainPlus/projects/projects.json`

### 聊天-项目联动
- 聊天页顶栏集成项目选择器，切换项目时对话列表/工作区/Memory 自动切换
- 对话绑定 projectId，有项目时只显示该项目下的对话
- PROMPT.md 自动注入到聊天 system prompt
- 全局工作区保留为无项目时的默认行为

### 项目设置细化
- MCP 服务器展开可查看具体工具，支持工具级（而非服务器级）的启用/停用
- 插件工具按项目独立配置
- Agents / Skills / MCP / 插件工具统一 toggle 开关样式

## 界面优化

### 侧边栏
- 菜单重新排序：助手 → 项目 → Skills → Agents → 文件 → 插件 → 工具箱
- "AI 助手" 简化为"助手"
- 第三方插件导航项显示淡色"插件"文字标志

### 聊天页
- 空状态输入框居中；发出消息后切换到底部
- 去掉对话栏底部和输入框顶部分割线
- 发送按钮由小飞机改为右箭头（→）
- 工作区按钮支持完整目录浏览，跟随项目切换
- 拖拽文件上传 + 悬停高亮提示

### 顶栏统一
- 项目、Agents、插件页面顶栏改为图标 + h2 样式，和 Skills、文件一致

## 文件管理器增强

### 右键菜单
- 文件右键：复制路径、导出到、打开于文件系统、打开于终端
- 空白区右键：新建子菜单（文件夹/.md/.json/.yml）、复制到此处、打开于文件系统/终端
- 路径输入框越界保护，仅限工作区内浏览

### 拖入支持
- 从 Finder 拖文件到文件管理器，自动复制到当前目录

## 工具箱升级 🆕

从"AI 模型收藏"升级为通用工具箱系统。

- 新增 `toolbox_categories` 和 `toolbox_items` Supabase 表，支持分类和自定义工具
- 用户可自由创建分类、添加/编辑/删除工具（名称、URL、图标、描述）
- `aiModels.json` 内置模型作为默认数据，始终显示
- 旧版 `ai_model_favorites` 数据自动迁移
- 搜索过滤 + 分类筛选

## MCP / 插件

### MCP 设置
- 服务器配置支持 Headers（JSON 编辑区，适配需要鉴权的 MCP 服务）
- 新增描述字段

### 插件系统
- 日记插件注册 4 个 AI 工具：`diary_create/search/get/update`
- 插件工具的 `inputSchema` 自动包装为 AI SDK 兼容格式
- 编译失败时弹出 Toast 提示，不再静默吞错误
- 工具弹窗新增"插件工具"栏，和 MCP 服务器平级，支持勾选

### 工具栏组件统一
- AgentPicker / SkillPicker / MCPToolPicker / MemoryPopup 全部统一为自加载数据模式
- 去掉全局开关（Agent/MCP 开关改为只读，统一由项目设置管理）
- Skills 页去掉单 Skill 启用开关，控制权归项目

## 项目设置 PROMPT.md 🆕

- 使用 Markdown 编辑器（和日记同款），支持编辑/预览/分屏
- 折叠显示，展开时显示字数
- 聊天时自动注入为 system prompt

## 记忆隔离

- 记忆按项目自动隔离：项目 A 和项目 B 的记忆独立存储
- Supabase 长期记忆通过 category 字段编码 projectId，零 DB schema 变更
- 切换项目时 shortMemoryCount 清零，避免残留

## 沙箱

- `executeJS / executePython` 支持动态 outputDir，项目模式下输出到项目工作区

## 变更统计

- 新增 6 个文件，修改 20+ 个文件
- 新增 ~1500 行，删 ~400 行
