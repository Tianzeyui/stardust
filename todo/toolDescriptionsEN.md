# 工具描述英文化 TODO

## workspace.ts

- [ ] `workspace_list_dir` — "列出工作区目录下的文件和子目录。depth: 递归深度(默认1, 最大3)。" + path/depth params
- [ ] `workspace_read_file` — "读取工作区内的文件内容..." + path/offset/length/lines params
- [ ] `workspace_search` — "在工作区目录中搜索文件。支持通配符匹配文件名。" + query/path params
- [ ] `workspace_glob` — "用 glob 模式匹配工作区中的文件..." + pattern/path params
- [ ] `workspace_grep` — "在工作区中按内容搜索代码。支持正则表达式。" + pattern/file/path params
- [ ] `workspace_write_file` — "创建或覆写文件..." + path/content params
- [ ] `workspace_append_file` — "追加内容到文件末尾..." + path/content params
- [ ] `workspace_create_dir` — "创建目录（包括父目录）。" + path param
- [ ] `workspace_delete_file` — "删除文件..." + path param
- [ ] `workspace_edit_file` — "精确编辑文件..." + path/old_string/new_string/replace_all params

## git.ts

- [ ] `git_status` — "查看 git 工作区状态：已修改、已暂存、未跟踪文件。"
- [ ] `git_diff` — "查看未暂存的差异（工作区 vs HEAD）。可选传 path 只看某个文件。" + path param
- [ ] `git_diff_staged` — "查看已暂存的差异（暂存区 vs HEAD）。"
- [ ] `git_log` — "查看提交历史。n 控制条数，默认 10。oneline 默认 true。" + n/oneline params
- [ ] `git_add` — "暂存文件。path 为空则暂存全部（git add .）。" + path param
- [ ] `git_reset` — "取消暂存。path 为空则取消全部暂存。" + path param
- [ ] `git_commit` — "提交已暂存的更改。message 为提交信息。会弹出确认框由用户审批。" + message param
- [ ] `git_branch` — "查看/创建/切换分支。name 为空则列分支，传入则创建新分支。" + name param
- [ ] `git_checkout` — "切换分支或恢复文件。target 为分支名或文件路径。" + target param
- [ ] `git_push` — "推送当前分支到远程..." + remote/branch params

## terminal.ts

- [ ] `run_terminal` — "执行终端命令。mode=\"sync\"等待完成(默认)..." + command/cwd/mode/input params
- [ ] `check_terminal` — "查看异步终端命令的当前输出和状态。" + terminal_id param
- [ ] `run_terminal_input` — "向交互终端发送输入。仅在用户明确要求..." + terminal_id/input params

## webFetch.ts

- [ ] `web_fetch` — "抓取网页内容并返回纯文本..." + url param

## search.ts

- [ ] `ddg_search` / `bing_search` — search query params

## agent.ts

- [ ] `ask_user` — form params (title, questions, etc.)
- [ ] `show_progress` — message param
- [ ] `notify_complete` — message/result params
- [ ] `update_task_list` — tasks param
- [ ] `delegate_task` — task/agentName/tier params

## sandbox.ts

- [ ] `sandbox_execute_js` — code/packages params
- [ ] `sandbox_execute_python` — code/packages params

## skill.ts

- [ ] `read_skill` — name/file/section/lines params
