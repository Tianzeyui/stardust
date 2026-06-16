# 对齐 Claude Code 完整 TODO

> 颗粒度：每个独立可提交的改变点

## 1. 系统提示词

### 1.1 动静分离 + prompt caching
- [x] system prompt 拆为静态块和动态块 ✅
- [x] 静态块（身份、规则、工具引导）→ `cache_control: { type: 'ephemeral' }` ✅
- [x] 动态块（记忆注入）→ 不 cache ✅
- [x] chatService 构建 system 参数时改为数组 `[{type:'text', text, cache_control}, ...]` ✅

### 1.2 提示词内容结构
- [x] `# Rules` — 读再改、验证再报、真实反馈、语言信号、不超需求 ✅
- [x] `# Tools` — glob over grep、workflow 链、工具职责边界 ✅
- [x] `# Safety` — 风险成本框架、破坏性操作确认 ✅
- [x] `# Style` — 不转播过程、一问一答、file:line 格式 ✅

### 1.3 rules.md 改为 user message
- [x] `rules.md` 内容不再拼入 system prompt ✅
- [x] 单独作为一条 user message，包在 `<project-instructions>` 标签里 ✅
- [x] 原因：user message 的 attention weight > system prompt ✅

## 2. 工具系统

### 2.1 工具描述对齐
- [x] workspace_glob: "Find files by name. Much faster than grep for locating files." ✅
- [x] workspace_grep: "Search file contents. Use after glob to find specific code." ✅
- [x] workspace_edit_file: "Edit specific lines. Prefer over write_file — preserves code." ✅
- [x] workspace_write_file: "Create/overwrite entire file. Use for new files or full rewrites." ✅
- [x] run_terminal: "For package installs, builds, tests, git ops. NOT for file search." ✅

### 2.2 工具职责边界明确
- [x] 每个工具描述里写清 "Prefer X over this for Y scenario" ✅
- [x] 工具描述里写清 "Use for: / NOT for:" ✅

## 3. Agent 行为

### 3.1 反幻觉
- [x] 系统提示词已加 ✅
- [ ] 关键工具返回时追加验证提醒（如 edit_file 成功后加 "Verify with run_terminal"）

### 3.2 工具调用纪律
- [ ] 首次不调工具 → 提示词引导（已在 Rules 中）
- [ ] 对话变长后纪律松弛 → mid-conversation-system beta（已在 header）
- [ ] 完成后不自夸、不追加 "anything else?"

### 3.3 模式系统
- [ ] 编码模式 / 审查模式 / 对话模式 可切换
- [ ] 不同模式注入不同系统提示词片段
- [ ] 在模型选择菜单中切换（类似 CC 的 `/mode`）

## 4. 上下文管理

### 4.1 压缩策略
- [x] 工具原子性 ✅
- [x] 摘要堆叠 ✅
- [x] 自适应保留条数 ✅

### 4.2 压缩触发
- [ ] 触发阈值从 80% 降到 70%（更激进）
- [ ] 工具调用密集时提前压缩

## 5. 请求层

### 5.1 Beta headers
- [x] interleaved-thinking ✅
- [x] context-management ✅
- [x] prompt-caching-scope ✅
- [x] mid-conversation-system ✅

### 5.2 模型调用优化
- [ ] 两阶段调用：先 fast 模型无工具判断 → 再 pro 模型带工具执行
- [ ] 非编程问题不加工具列表（减少 token + 避免误调工具）

## 6. 测试与验证

- [ ] 自动化测试：给定输入，验证 AI 是否调用了正确的工具
- [ ] 回归测试：修改提示词后，至少 5 个典型场景行为不变
- [ ] 幻觉检测：验证 AI 不会声称完成未执行的操作

## 优先级

| 优先级 | 条目 |
|--------|------|
| 🔴 P0 | 1.1 动静分离, 1.3 rules.md→user message, 2.1 工具描述对齐 |
| 🟡 P1 | 2.2 职责边界, 3.2 工具纪律, 4.2 压缩触发, 5.2 两阶段调用 |
| 🟢 P2 | 3.3 模式系统, 6 测试验证 |
