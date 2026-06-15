# Code Agent TODO

## ✅ 已完成

- [x] `workspace_grep` 代码搜索（正则 + 文件类型过滤）
- [x] `workspace_write_file` 写入/创建文件
- [x] `workspace_append_file` 追加内容
- [x] `workspace_delete_file` 删除文件
- [x] `workspace_create_dir` 创建目录
- [x] 工作区外操作确认机制
- [x] 系统提示词引导 AI 改完代码跑 CLI 检查（tsc/pyright/go vet）

## 🔴 Git 工具 —— 下一个重点

- [ ] `git_status`：查看工作区 git 状态
- [ ] `git_diff`：查看未暂存的差异
- [ ] `git_diff_staged`：查看已暂存的差异
- [ ] `git_log`：查看提交历史（--oneline, -n）
- [ ] `git_add`：暂存文件
- [ ] `git_reset`：取消暂存
- [ ] `git_commit`：提交更改（需用户确认消息）
- [ ] `git_branch`：查看/创建/切换分支
- [ ] `git_checkout`：切换分支或恢复文件

## 🟢 diff 可视化

- [ ] AI 修改代码后，聊天中展示 diff
- [ ] 支持 accept/reject 逐块修改
