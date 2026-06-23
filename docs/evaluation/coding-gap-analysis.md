# Stardust 编程能力差距评估（对比 Claude Code）

> 评估日期：2026-06-16
> 参考源码：`claude-code-main/`（CC 逆向工程版本）

---

## 总览

CC 的编程能力建立在 **11 个关键系统** 之上。Stardust 已在 7 个系统上有不同程度的实现，但每个系统都有明确的优化空间。以下是按优先级排序的完整评估。

---

## 🔴 第一优先级：系统提示词工程（ROI 最高）

### 当前状态

Stardust 的系统提示词（`DEFAULT_PROMPT_CODE`）仅 **13 行、~150 tokens**：

```
You are a coding agent. Use tools, not words.

# Rules
- Read before changing. Verify before reporting done...
- "write/create/save" → file. "show me/explain/what is" → inline...
- Do not add features beyond what was asked...
- For 3+ file edits: spawn delegate_task verification...
- The cost of pausing to confirm is low...

# Tools
- workspace_glob → workspace_read_file → workspace_edit_file → run_terminal
- Prefer glob over grep for files...
- delegate_task for background work...
- Report the outcome, not the process...
```

### CC 的做法

CC 的 CLAUDE.md 有 **~27K 字符**，分 9 个主要部分：
1. 项目概览 + 关键规则
2. Git 提交约定
3. 完整命令参考
4. 架构（9 个子章节）
5. 测试约定 + mock 规范
6. AI Agent 操作指南
7. 设计背景 + 原则
8. 功能标志系统
9. 常见陷阱 + 反例

CC 的 **运行时系统提示词** 更庞大——包含：
- 工具描述（60+ 工具，每个带详细 prompt）
- 行为规则（并行工具执行、缓存策略、权限模型）
- 上下文管理规则
- Agent/Workflow/Task 编排规则
- Memory 使用规则
- 安全约束

### 差距分析

| 维度 | Stardust | CC | 差距 |
|------|-----------|-----|------|
| 系统提示词长度 | ~150 tokens | ~5000+ tokens | 33x |
| 工具使用指导 | 1 句 | 每个工具的详细 prompt.ts | 巨大 |
| 编码规范 | 无 | Conventional Commits + 语言特定规则 | 缺失 |
| 测试要求 | 1 句 "verify" | 完整测试约定 + mock 规范 | 巨大 |
| 安全边界 | 1 句 "confirm destructive" | 完整权限模型 + 网络隔离 | 较大 |
| 反例/陷阱 | 无 | 具体的错误示例（mock 污染等） | 缺失 |
| 输出格式 | 1 句 | Markdown + code block + line refs | 可优化 |

### 具体建议

1. **扩展编码规则段**（+200 tokens）：添加文件编辑约定、测试验证流程、Git 提交规范
2. **添加反例模式**（+100 tokens）：2-3 个具体的错误示例，教模型不要做什么
3. **工具使用策略**（+150 tokens）：不只列工具名，要描述何时用哪个、组合模式
4. **输出规范**（+80 tokens）：Markdown 格式、代码块语言标注、file_path:line_number 引用
5. **安全/确认规则**（+100 tokens）：明确哪些操作需要确认、哪些可以自动执行

---

## 🔴 第二优先级：上下文压缩系统

### 当前状态

Stardust 有一个 `ContextWindowManager.compress()`，单一策略：

- Token 估算（`estimateTokens`，基于字符数/3，非真实 API 计数）
- 超过阈值（默认 70%）时触发
- 保留最近 N 条消息（自适应 20-80%）
- 工具原子性保护（不拆 tool-call/tool-result）
- 通过 fast 模型生成摘要
- 摘要堆叠（传递上轮摘要）
- 降级方案：`truncateOnly()` 从中间丢弃消息

### CC 的做法

CC 有 **5 层压缩策略**，按优先级依次执行：

```
阶段 1: Snip Compact    → 在微压缩前移除旧 tool results
阶段 2: Micro Compact   → 合并同类型消息 + 裁剪过大结果
阶段 3: Cached MC       → 利用 API cache_edit 零成本删除旧结果
阶段 4: Auto Compact    → 超过阈值时用 fork agent 做摘要压缩
阶段 5: Reactive Compact → API 返回 413 时应急压缩
```

### 差距分析

| 维度 | Stardust | CC |
|------|-----------|-----|
| 压缩策略数 | 1 | 5 |
| Token 计数 | 本地估算（不准） | 真实 API 返回 |
| 缓存优化 | 无 | cache_edit（零成本删旧结果） |
| 压缩后恢复 | 无 | 重挂文件/计划/技能/Agent 状态 |
| 断路器 | 无 | 连续 3 次失败停止 |
| 预测性压缩 | 无 | 估算下轮增长，提前压缩 |
| 阈值自适应 | 仅 tool density | 上下文窗口比例 + tool density |
| 压缩边界消息 | 无 | SystemCompactBoundaryMessage |
| 错误恢复 | 降级为 truncateOnly | 5 种过渡状态 + PTL 恢复 |

### 具体建议

1. **使用 API 真实 token 数**：在 `streamText` 响应中捕获 `usage`，替代本地估算
2. **压缩后恢复上下文**：压缩后重新注入最近读取的文件、当前计划、活跃 Agent 状态
3. **添加断路器**：连续压缩失败 3 次后停止，避免死循环
4. **预测性压缩**：估算下轮增长，在达到硬限制前提前压缩
5. **工具结果预算**：压缩前先对超大工具结果做截断（>30K chars），再决定是否需要摘要

---

## 🟡 第三优先级：CLAUDE.md / 项目规则系统

### 当前状态

Stardust 仅读取两个文件：
- `.stardust/rules.md`
- `rules.md`

作为 `<project-instructions>` user message 注入。

### CC 的做法

CC 有一个完整的多层发现系统：

```
文件类型:
  Managed    → 系统级（管理员部署）
  User       → ~/.claude/CLAUDE.md（全局）
  Project    → CLAUDE.md, .claude/CLAUDE.md（项目检入）
  Local      → CLAUDE.local.md（个人私有）
  AutoMem    → ~/.claude/projects/<repo>/memory/
  TeamMem    → 团队共享记忆

目录遍历:
  从 CWD 向上走到 /，每层读取 CLAUDE.md + .claude/CLAUDE.md

条件规则:
  .claude/rules/*.md + frontmatter paths: glob
  只在访问匹配文件时加载

@include 指令:
  文件中可引用其他文件，最大深度 5
```

### 差距分析

| 维度 | Stardust | CC |
|------|-----------|-----|
| 发现层级 | 仅项目根 | 从 CWD 到 / 全路径 |
| 文件类型 | 2 种 | 6 种 |
| 条件规则 | 无 | .claude/rules/*.md + paths: frontmatter |
| @include | 无 | 支持（深度 5） |
| 多级优先级 | 无 | Managed→User→Project→Local |
| 缓存 | 无 | memoize + 按需清除 |
| /init 向导 | 无 | 8 阶段自动生成 CLAUDE.md |

### 具体建议

1. **多层 CLAUDE.md 发现**：从 CWD 向上遍历，合并所有 CLAUDE.md
2. **支持 .stardust/rules/ 目录**：条件规则 + glob 匹配
3. **添加 @include 支持**：允许 CLAUDE.md 引用其他文件
4. **区分 Project/User 级别**：Project 可检入，User 在本地
5. **/init 命令**：自动扫描项目并生成 CLAUDE.md（未来）

---

## 🟡 第四优先级：渐进式工具披露

### 当前状态

Stardust 的 `toolDisclosure.ts`：
- 中文 + 英文分词
- 关键词匹配打分（名称 2x 权重）
- Agent 工具 +100 分（始终保留）
- Token 预算控制（max 3000 tokens, max 12 tools）
- 仅筛选 MCP 业务工具（沙箱/工作区/Agent 始终全量）

### CC 的做法

CC 有双层披露：
- **核心工具**（38 个）：始终加载完整 schema
- **延迟工具**：所有其他工具（内置非核心 + 全部 MCP）
  - `SearchExtraTools` 搜索工具
  - TF-IDF 语义搜索（`computeWeightedTf` + `cosineSimilarity`）
  - `ExecuteExtraTool` 执行
  - `tst-auto` 模式：仅在 MCP 工具超过 10% 上下文窗口时启用
  - 增量更新：仅发送差异到 `<system-reminder>`

### 差距分析

| 维度 | Stardust | CC |
|------|-----------|-----|
| 内核工具 | 始终全量加载 | 38 个核心始终加载 |
| 延迟工具 | 仅 MCP | 所有非核心内置 + MCP |
| 搜索机制 | 关键词匹配 | TF-IDF 语义搜索 + 向量相似度 |
| 双层调用 | 无（enable_tool 手动） | SearchExtraTools → ExecuteExtraTool |
| 阈值自适应 | 固定阈值 8 | 上下文窗口比例（10%） |
| 增量更新 | 无 | delta 附件（仅发送差异） |

### 具体建议

1. **双层工具调用**：实现 `search_tools(query)` + `use_tool(name, args)` 替代当前的 `enable_tool`
2. **延迟内置非核心工具**：终端、Git、搜索等工具也可以延迟加载
3. **语义搜索替代关键词匹配**：使用 fast embedding model 或 TF-IDF
4. **自适应阈值**：基于模型上下文窗口大小动态调整

---

## 🟡 第五优先级：Agent 验证闭环

### 当前状态

Stardust 的系统提示词中有一句：
> "For 3+ file edits: spawn delegate_task verification. FAIL→fix→retry. PASS→spot-check. You own the gate."

但实际验证逻辑依赖模型自己调用 `delegate_task`。

### CC 的做法

CC 有多层验证机制：
- **Plan Mode**：EnterPlanMode → 探索 → ExitPlanMode → 用户审批 → 执行 → 验证
- **Verify Plan Execution**：`VerifyPlanExecutionTool` — 验证计划执行是否符合预期
- **Code Review**：`/review`、`/security-review` — 独立的代码审查命令
- **Autofix PR**：`/autofix-pr` — 自动检测和修复 PR 问题
- **Adversarial Verify**：Workflow 中的对抗性验证（多个独立视角确认）
- **LSP Tool**：利用 LSP 做代码智能验证（类型检查、引用分析）

### 差距分析

| 维度 | Stardust | CC |
|------|-----------|-----|
| 验证机制 | 依赖模型自觉 | 结构化验证工具 + 命令 |
| Plan-Execute-Verify | 无 | 完整三阶段 |
| 对抗性验证 | 无 | 多个独立 agent 交叉验证 |
| LSP 集成 | 无 | 有 |
| PR 审查 | 无 | /review, /autofix-pr |

### 具体建议

1. **验证工具**：注册 `verify_changes` 工具，自动检查变更是否通过测试/lint
2. **LSP 集成**：通过 MCP 接入 LSP，提供类型检查、引用查找
3. **Plan 模式**：添加 Plan/Execute/Verify 三阶段提示词

---

## 🟢 第六优先级：Hook 系统

### 当前状态

Stardust **无 hook 系统**。

### CC 的做法

CC 有完整的事件 hook 系统：
- **PreToolUse** — 工具调用前执行
- **PostToolUse** — 工具调用后执行
- **Stop** — Agent 停止时
- **SessionStart** — 会话开始
- **InstructionsLoaded** — 指令文件加载
- **Notification** — 通知
- Hook 可返回 "阻止" 决策否决工具调用
- Hook 配置在 settings.json 中

### 具体建议

1. **PreToolUse/PostToolUse hooks**：允许在工具调用前后执行自定义逻辑
2. **Hook 安全模型**：hook 可返回 allow/deny/ask
3. **配置在 settings.json**：参考 CC 的 hook 配置格式

---

## 🟢 第七优先级：Git 工作流

### 当前状态

Stardust 有 9 个 Git 工具（status/diff/log/add/reset/commit/branch/checkout/push）。

### CC 的做法

CC 有更完整的 Git 工作流：
- `/commit` — 自动生成 Conventional Commits 格式的提交消息
- `/commit-push-pr` — 一键提交+推送+创建 PR
- `/diff` — 交互式差异查看（Ink UI）
- `/branch` — 分支管理
- `/review` — PR 代码审查
- `/autofix-pr` — 自动修复 PR 问题
- `git_commit` 有详细的安全约束（不修改 git config、不跳过 hooks）

### 差距分析

| 维度 | Stardust | CC |
|------|-----------|-----|
| 自动提交消息 | 无 | 基于 diff 分析生成 |
| PR 创建 | 无 | gh CLI 集成 |
| 代码审查 | 无 | /review 命令 |
| 提交安全约束 | 仅确认 | 禁止修改配置、禁止 skip hooks |

### 具体建议

1. **自动提交消息生成**：分析 git diff → 生成 Conventional Commits 格式消息
2. **PR 工作流**：集成 gh CLI，支持一键提交+推送+创建 PR（已有 git_push，缺 PR）
3. **提交安全约束**：在 git_commit 工具中添加禁止改 git 配置的约束

---

## 🟢 第八优先级：Query Pipeline 优化

### 当前状态

Stardust 的 `chat()` 函数是单次流式调用，缺少错误恢复。

### CC 的做法

CC 的 `queryLoop` 有完善的错误恢复：
- **max_output_tokens 恢复**：逐步升级（8K→64K），最多 3 次
- **413 错误恢复**：context collapse drain → reactive compact
- **模型回退**：主模型失败时切换到备用模型
- **Token 预算续用**：达到 90% 预算时自动继续
- **收益递减检测**：3 次续用且每次 <500 tokens 时停止
- **Stop Hook 拦截**：hook 阻止继续时优雅退出

### 差距分析

| 维度 | Stardust | CC |
|------|-----------|-----|
| 错误恢复 | 无 | 5 种恢复策略 |
| Token 预算 | 无 | 自动续用 + 收益递减检测 |
| 模型回退 | 无 | 主模型→备用模型 |
| max_tokens 升级 | 无 | 逐步升级到 64K |
| 重试逻辑 | 无 | 3 次 + 断路器 |

### 具体建议

1. **max_tokens 自动升级**：检测截断 → 翻倍 max_tokens → 重试（最多 2 次）
2. **413/超长错误恢复**：自动触发压缩后重试
3. **Token 预算管理**：限制单轮输出，接近限制时自动续用

---

## 🟢 第九优先级：更多斜杠命令

### 当前状态

Stardust 的斜杠命令系统尚未建立（todo/ 中有 Skills 系统）。

### CC 的完整命令集

CC 有 70+ 命令，Stardust 值得实现的：

| 命令 | 功能 | 优先级 |
|------|------|--------|
| `/commit` | 自动生成提交消息 | 🔴 高 |
| `/review` | 审查代码差异 | 🔴 高 |
| `/diff` | 查看未提交变更 | 🟡 中 |
| `/compact` | 手动压缩上下文 | 🟡 中 |
| `/init` | 初始化 CLAUDE.md | 🟡 中 |
| `/cost` | 查看 Token 用量 | 🟡 中 |
| `/plan` | 进入计划模式 | 🟢 低 |
| `/agents` | 管理 Agent 配置 | 🟢 低 |
| `/tasks` | 管理后台任务 | 🟢 低 |

---

## 🟢 第十优先级：输出格式化

### 当前状态

Stardust 没有明确的输出格式规则。

### CC 的做法

- **Markdown 格式**：代码块、标题、列表
- **行号引用**：`file_path:line_number`（可点击）
- **文件操作摘要**：创建/修改/删除的文件列表
- **Token 用量展示**：每次响应后显示消耗
- **拒绝原因**：工具调用被拒时展示原因

### 具体建议

1. **系统提示词中明确输出格式**：Markdown + 代码块语言标注 + 行号引用
2. **响应后信息**：Token 用量、文件变更摘要
3. **工具结果可视化**：diff 高亮、文件树变更

---

## 优先级排序总结

按 **ROI（投入产出比）** 排序：

| 优先级 | 系统 | 预期效果 | 难度 | 文件数 |
|--------|------|---------|------|--------|
| 🔴 P0 | 系统提示词扩展 | 编码质量 ↑↑↑ | 低 | 1-2 |
| 🔴 P1 | 上下文压缩升级 | 长对话稳定性 ↑↑ | 中 | 2-3 |
| 🟡 P2 | CLAUDE.md 多层发现 | 项目理解 ↑↑ | 中 | 2-3 |
| 🟡 P3 | 渐进式披露升级 | 工具选择精准度 ↑ | 中 | 2-3 |
| 🟡 P4 | Agent 验证闭环 | 代码质量 ↑ | 中 | 3-4 |
| 🟢 P5 | Hook 系统 | 可扩展性 ↑ | 高 | 3-5 |
| 🟢 P6 | Git 工作流 | 开发体验 ↑ | 低 | 1-2 |
| 🟢 P7 | Query Pipeline 优化 | 鲁棒性 ↑ | 中 | 2-3 |
| 🟢 P8 | 更多命令 | 用户体验 ↑ | 中 | 3-5 |
| 🟢 P9 | 输出格式化 | 可读性 ↑ | 低 | 1 |

---

## 已经对齐或领先的方面

以下是 Stardust 已经做得很好、不需要大改的：

1. ✅ **工具集完整性** — workspace/git/terminal/sandbox/search/skill/MCP 工具覆盖全面
2. ✅ **两阶段披露** — fast 预检 + 无工具判断（Stardust 独有的创新）
3. ✅ **enable_tool 按需激活** — MCP 工具的延迟加载机制
4. ✅ **中文支持** — 工具分词 + 记忆提取提示词都是中文
5. ✅ **多模型路由** — fast/balanced/powerful 三级分层
6. ✅ **skills 三级注入** — 元数据→完整文档→补充文件
7. ✅ **工具原子性保护** — 压缩时不拆 tool-call/tool-result
8. ✅ **项目规则注入** — .stardust/rules.md 作为 user message
9. ✅ **系统提示词双模式** — 编码/对话独立提示词
10. ✅ **动静分离静态缓存** — Prompt caching 优化