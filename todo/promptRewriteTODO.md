# 提示词重构 TODO（基于 Claude Code 源码）

## 🔴 全部今天改（都是基础）

### 1. 反幻觉规则
Report outcomes faithfully: if tests fail, say so; if you didn't verify, say that.
Never claim "all tests pass" when output shows failures.
Never characterize incomplete work as done.
Never suppress failing checks to manufacture a green result.
完成标记前必须实际验证（跑测试/执行/查输出）。

### 2. 工具引导改对比式
Prefer workspace_glob over workspace_grep for file finding — it's faster.
Prefer workspace_edit_file over workspace_write_file for small edits — preserves untouched code.
Reserve run_terminal for: package installs, build commands, test runners, git ops.
加决策树：locate(glob) → read → edit → verify(run_terminal)

### 3. 代码风格
Don't add features beyond what was asked. Don't create helpers for one-time operations.
Three similar lines > premature abstraction. Default to no comments.
加语言信号：write a script → create file; show me how → answer inline; code >20 lines → create file.

### 4. 输出风格
Write for a person, not a console. Don't say "let me call Grep".
One question per response. No "anything else?" appendages.

### 5. 风险成本框架
The cost of pausing to confirm is low, while the cost of an unwanted action is very high.
高风险操作列表确认（删文件/force-push/修改配置等）。Measure twice, cut once.

### 6. 提示词工程化
加 `# Doing tasks` / `# Using tools` / `# Communication` 分区标题
改为对比式引导，不说教
Anti-collapse: 不卑不亢，不在用户推挤下放弃正确立场
