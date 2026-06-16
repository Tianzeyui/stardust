# 编程优化 TODO — 完整实现方案

> 基于 CC 源码对比评估（docs/evaluation/coding-gap-analysis.md）
> 当前日期：2026-06-16
> 最后更新：2026-06-16

---

## ✅ P0: 系统提示词扩展

**状态**：已完成

6 个 Section（Intro/System/Coding Rules/Actions/Tool Strategy/Communication），~1500 tokens，对齐 CC `getSimpleDoingTasksSection()` + `getActionsSection()` + `getOutputEfficiencySection()` 结构。

后续增强：加了"每句结论必须来自本轮工具调用"的硬约束 + compression 后工具纪律提醒。

---

## ✅ P1: 上下文压缩升级

**状态**：已完成

3 层压缩：MicroCompact（每轮）→ AutoCompact（超阈值）→ ReactiveCompact（413 恢复）
+ 断路器 + 真实 API token 回传 + 压缩后上下文恢复 + 工具纪律提醒

---

## ✅ P2: CLAUDE.md / 项目规则多层发现

**状态**：已完成

**新建文件**：`src/lib/projectRules.ts`

**加载顺序**（从远到近）：
```
/Users/.../brainPlusRules.md              ← 全局
/Users/.../Develop/brainPlusRules.md       ← 父目录
<项目根>/brainPlusRules.md                 ← 项目规则
<项目根>/.brainplus/rules.md               ← 项目本地
<项目根>/.brainplus/rules/*.md             ← 条件规则（paths: glob）
<项目根>/brainPlusRules.local.md           ← 个人私有（gitignored）
```

**条件规则**：`.brainplus/rules/*.md` 带 `paths:` frontmatter 时，仅在操作匹配文件时注入。

---

## ✅ P3: 渐进式披露 → 拉取模式

**状态**：已完成（超出原计划）

| 原计划 | 实际实现 |
|--------|---------|
| TF-IDF 语义搜索 | 关键词打分（先简单版，TF-IDF 后续） |
| search → execute 双层 | ✅ `search_tools` + `use_tool` |
| 白名单分类 | ✅ `CORE_TOOL_PREFIXES` 显式声明 |
| — | ✅ 扩充 codeHints（20→45 个关键词） |
| — | ✅ 删除工具目录注入（省 token） |
| — | ✅ 清理 `toolDisclosure.ts` 冗余代码 |

---

## ✅ P4: Agent 验证闭环

**状态**：已完成

**新建**：`src/lib/tools/verify.ts` — 验证 Agent 完整系统提示词（130 行，对齐 CC verificationAgent）

**改进**：
- `delegate_task` 检测"验证"/"verify"关键词 → 自动注入验证提示词
- `delegateToAgent` 支持 `overrideSystemPrompt` 参数覆盖 Agent 自带提示词
- 系统提示词 Verification 段扩展为完整 5 步契约（spawn → VERDICT → FAIL fix → PASS spot-check → PARTIAL report）
- `verify_changes` 工具注册，返回验证清单引导 Agent

---

## ⬜ P5: Hook 系统

**状态**：未开始

**差距**：CC 有 PreToolUse/PostToolUse/Stop/SessionStart/InstructionsLoaded 6 种 hook。

**预估**：5h

---

## ⬜ P6: Git 工作流增强

**状态**：未开始

**差距**：缺自动提交消息生成、PR 创建、`/commit` `/review` 命令。

**预估**：2h

---

## ✅ P7: Query Pipeline 错误恢复

**状态**：已完成

**改动文件**：`src/lib/chatService.ts`

**恢复循环**（`while(true)` 包裹 streaming）：

| 机制 | 对齐 CC |
|------|---------|
| max_output_tokens 升级 | 首次截断→32k→64k→128k（最多 3 次），注入恢复消息 |
| 模型回退 | 调用失败时切换到备选模型重试一次 |
| 响应式压缩 | prompt_too_long → reactiveCompact → 循环顶部重试 |
| 上下文恢复消息 | "Output truncated. Resume directly — no recap." |

**跳过**：Token Budget 续用（需要 UI 配合 "+500k" 交互）

---

## ⬜ P8: 斜杠命令系统

**状态**：未开始

**预估**：4h

---

## ✅ P9: 输出格式化规范

**状态**：已完成

已集成在 P0 系统提示词的 Communication 段——Markdown + 代码块语言标注 + file_path:line_number + 不赘述过程。

---

## 🆕 追加：工具层优化（原计划外）

| 项目 | 状态 |
|------|------|
| edit_file 行号编辑（start_line/end_line） | ✅ |
| edit_file diff 预览 | ✅ |
| write_file diff 预览 | ✅ |
| read_file 始终返回总行数/字符数 | ✅ |
| grep 上下文行（context_before/context_after） | ✅ |
| list_dir 文件大小 + pattern 过滤 | ✅ |
| 移除冗余 workspace_search | ✅ |
| 文件操作追踪（压缩后恢复） | ✅ |
| 工作区路径空值保护（4 个 tool setter） | ✅ |
| 工作区路径 resolvePath 一致性 | ✅ |
| 工具开关改为执行时拦截 | ✅ |

---

## 🆕 追加：防幻觉优化（原计划外）

| 项目 | 状态 |
|------|------|
| 系统提示词加硬约束（"没调工具就没发言权"） | ✅ |
| 压缩后注入工具纪律提醒 | ✅ |
| temperature=0.3 | ✅ |
| ChatPage 无限渲染循环修复 | ✅ |
| main.tsx HMR-safe root | ✅ |

---

## 进度总结

```
P0  系统提示词      ✅ 完成
P1  上下文压缩      ✅ 完成
P2  规则多层发现    ✅ 完成
P3  渐进式披露      ✅ 完成（超出预期）
P4  验证闭环        ✅ 完成
P5  Hook 系统       ⏭️ 跳过
P6  Git 工作流      ⏭️ 跳过
P7  Query Pipeline  ✅ 完成
P8  斜杠命令        ⬜ 未开始
P9  输出格式化      ✅ 完成
追加 工具层优化     ✅ 完成（11 项）
追加 防幻觉优化     ✅ 完成（5 项）
```

**已完成**：P0 P1 P2 P3 P4 P7 P9 + 16 项追加优化
**跳过**：P5 P6
**未开始**：P8
