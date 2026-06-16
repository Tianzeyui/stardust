# 提示词重构 TODO（基于 Claude Code 源码）

## 🔴 P0 — 反幻觉（今天改）

- [ ] 照抄 CC false-claims 段落到系统提示词开头
  ```
  Report outcomes faithfully: if tests fail, say so; if you didn't verify, say that.
  Never claim "all tests pass" when output shows failures.
  Never characterize incomplete work as done.
  Never suppress failing checks to manufacture a green result.
  ```

- [ ] 加验证真实性规则：标记完成前必须实际验证（跑测试/执行/查输出）
- [ ] 加"Read before change"：看不懂的文件不要改，先读

## 🔴 P0 — 工具引导改对比式（今天改）

- [ ] 替换命令式列表为对比式：
  ```
  Prefer workspace_glob over workspace_grep for file finding — it's faster.
  Prefer workspace_edit_file over workspace_write_file for small edits — it preserves untouched code.
  Reserve run_terminal for: package installs, build commands, test runners, git ops.
  ```

- [ ] 工具链改为顺序决策：
  ```
  When you need to change code:
  1. workspace_glob to locate files
  2. workspace_read_file to understand
  3. workspace_edit_file to change
  4. run_terminal to verify
  ```

## 🟡 P1 — 代码风格规则

- [ ] 加反过度工程化：
  - "Don't add features beyond what was asked"
  - "Don't create helpers for one-time operations"
  - "Three similar lines > premature abstraction"
  - "Default to no comments"

- [ ] 加语言信号检测：
  - "write a script/create a config" → workspace_write_file
  - "show me how/explain" → answer inline
  - code >20 lines → create file

## 🟡 P1 — 输出风格

- [ ] "Write for a person, not a console — don't say 'let me call Grep'"
- [ ] "One question per response"
- [ ] "No 'anything else?' appendages"

## 🟢 P2 — 风险成本框架

- [ ] "The cost of pausing to confirm is low, while the cost of an unwanted action is very high"
- [ ] 高风险操作列表确认（删文件/force-push/修改配置等）

## 🟢 P2 — 提示词工程化

- [ ] 加 `# Doing tasks` / `# Using tools` 分区标题（模仿 CC 结构）
- [ ] 静态部分+动态部分分离（便于未来缓存优化）
