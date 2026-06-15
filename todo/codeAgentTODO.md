# Code Agent TODO

## ✅ 已完成

- [x] 文件读写：write / append / delete / create_dir
- [x] 代码搜索：workspace_grep + 文件搜索
- [x] 工作区外操作确认机制
- [x] Git 全家桶：status / diff / log / add / reset / commit / branch / checkout / push
- [x] Diff 可视化：行号 + 黑白风格
- [x] 系统提示词引导改完代码跑 CLI 检查
- [x] 终端命令（同步/异步）
- [x] 外部工作区链接 + 迁移

## 🔴 精确编辑（对标 Claude Code Edit）

- [ ] `workspace_edit_file(path, old_string, new_string)`
  - 精确替换文件中一段字符串
  - old_string 必须唯一匹配，否则报错
  - 对大文件改几行时不需传全文件，安全高效
  - 支持 replace_all 选项（替换所有匹配）

## 🟡 文件匹配改进（对标 Claude Code Glob）

- [x] `workspace_glob(pattern)` 用 glob 模式匹配文件 ✅
  - 支持 ** (任意深度)、*、?、{a,b}
  - 自动排除 node_modules/.git 等

## 🟡 WebFetch

- [x] `web_fetch(url)` 抓取网页并转为纯文本 ✅
  - 自动剥离 HTML/script/style 标签
  - 限 15000 字符，超长截断

## 🟢 长期

- [ ] diff accept/reject 逐块修改
- [ ] LLM 模型切换
