# 性能/精确度调优 TODO

> 基于 Claude Code 源码分析 (claude-code-main) + API 请求对比

## 🔴 立即可做（低投入高回报）

### 1. 提示词加入反幻觉 + 工具选择引导  
- [ ] 加"false-claims mitigation"："Report outcomes faithfully. Never say tests pass when they fail."
- [ ] 加"search before saying unknown"：引用文件/函数时必须先 grep/glob  
- [ ] 加"anti-over-explanation"：不要说"let me call Grep"，直接调
- [ ] 加"warm tone"："Avoid negative assumptions"，pushback 要 constructive
- [ ] 来源：`src/constants/prompts.ts` → `getUsingYourToolsSection()` + `getSimpleDoingTasksSection()`

### 2. CLAUDE.md 改 user message（不是 system prompt）
- [ ] `rules.md` 不再拼入 system prompt，改为单独一条 user message
- [ ] 包在 `<project-instructions>` 标签里
- [ ] 原因：user message 的 attention weight 远高于 system prompt

### 3. 工具调用隐式引导（非说明式）
- [ ] 不写"Use workspace_glob to find files"  
- [ ] 写成"Prefer workspace_glob over grep for file finding — it's faster and doesn't read file contents"
- [ ] 决策树模式：glob → read → edit，而非并列列表

## 🟡 中期可做

### 4. 提示词分层缓存 (dynamic boundary)
- [ ] 静态部分（身份、规则）→ 可 cache
- [ ] 动态部分（环境信息、git状态）→ 不可 cache
- [ ] 用 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 分隔

### 5. 工具分层：核心永远可见 vs 按需发现
- [ ] workspace/git/terminal → 核心工具，always loaded
- [ ] MCP 外部工具 → 不在工具列表，通过 enable_tool 按需激活
- [ ] 已在做（渐进式披露），但可以更彻底

### 6. 系统提示词分区 memoization
- [ ] identity/规则/行动 三个模块分别缓存
- [ ] 只在 `/clear` 或 `/compact` 时重建
- [ ] 每次对话不重复计算

## 🟢 长期参考

### 7. 工具 prompt() 模式
- [ ] 每个工具自带 `prompt()` 方法返回提示文本
- [ ] 工具注册时统一拼接，而非分散在 description 字段

### 8. prompt engineering regression tests
- [ ] 自动化测试系统提示词输出
- [ ] 验证关键规则都能被模型理解

### 9. Modes 系统（角色切换）
- [ ] 编码模式 / 审查模式 / 教学模式
- [ ] 不同模式注入不同系统提示词片段
