# Code Agent TODO

## 🟡 代码搜索 (grep/ripgrep)

- [x] `workspace_grep` 工具：按内容搜索代码，支持正则 ✅
- [x] 按文件类型过滤 + 自动排除 node_modules/.git 等 ✅

## 🔴 文件写入

- [x] `workspace_write_file` 工具：写入/覆盖文件 ✅
- [x] `workspace_append_file` 工具：追加内容到文件 ✅
- [x] `workspace_delete_file` 工具：删除文件 ✅
- [x] `workspace_create_dir` 工具：创建目录 ✅
- [x] 工作区内直接操作，工作区外需用户确认（终端风格确认气泡）✅

## 🔴 Git 工具

- [ ] `git_status`：查看工作区 git 状态
- [ ] `git_diff`：查看未暂存/已暂存的差异
- [ ] `git_diff_staged`：查看已暂存的差异
- [ ] `git_log`：查看提交历史（支持 --oneline, -n 限制）
- [ ] `git_commit`：提交所有更改（需用户确认消息）
- [ ] `git_branch`：查看/创建/切换分支
- [ ] `git_checkout`：切换分支或恢复文件
- [ ] `git_add`：暂存文件
- [ ] `git_reset`：取消暂存

## 🟡 LSP 诊断

- [ ] 读取当前工作区的诊断信息（lint 错误、类型错误）
- [ ] 作为工具提供给 AI，改完代码可以自检

## 🟢 diff 可视化

- [ ] AI 修改代码后，聊天中展示 diff
- [ ] 支持 accept/reject 逐块修改

## 🟢 其他

- [ ] `workspace_create_dir` 工具：创建目录
- [ ] 项目模板/scaffold：快速初始化常见项目结构
