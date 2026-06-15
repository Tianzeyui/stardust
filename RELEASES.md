# BrainPlus Release Notes

## v0.23.0 — Code Agent (2026-06-16)

### 🚀 新增功能

**文件操作**
- `workspace_write_file` / `workspace_append_file` / `workspace_delete_file` / `workspace_create_dir`
- `workspace_edit_file`：精确字符串替换，对标 Claude Code Edit
- 工作区内直接操作，区外弹确认框

**代码搜索**
- `workspace_grep`：正则搜索文件内容，返回 文件:行号:内容
- `workspace_glob`：glob 模式匹配文件，支持 `**` 递归 + `{a,b}` 选项
- 系统 `find` 命令收集文件，跨平台兼容

**Git 工具**
- `git_status` / `git_diff` / `git_diff_staged` / `git_log`
- `git_add` / `git_reset` / `git_commit`（需确认）/ `git_branch` / `git_checkout` / `git_push`

**终端**
- 终端命令执行，同步/异步模式
- 异步模式后台运行，实时输出推送
- 用户确认机制

**Diff 可视化**
- 黑白风格 DiffBlock，行号 + 符号列
- 多文件 diff 独立折叠

**其他**
- `web_fetch`：网页抓取转纯文本
- 外部工作区链接 + 迁移
- 智能路由：模型层级标签配置（Fast / Balanced / Powerful）
- 系统提示词可自定义
- 项目名称点击编辑
- `.brainplus/` 工作区标识

### 🔧 修复/优化
- 主对话统一时间线：thinking/text 按实际顺序穿插
- 工具结果默认收起 + 展开按钮
- 滚动优化：wheel 事件暂停跟底
- 对话项目隔离修复
- 性能优化：React.memo + rAF 节流
- SkillDetail 文件预览完整展示
- Placeholder 显示具体模型名

### 📦 安装
```bash
# macOS
npm run build:mac
# Windows
npm run build:win
# Linux
npm run build:linux
```
