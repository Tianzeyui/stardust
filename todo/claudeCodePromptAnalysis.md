# Claude Code 提示词工程深度分析

> 基于 `claude-code-main/src/constants/prompts.ts` 源码

## 一、提示词结构（6 大模块）

### 1. 身份 + 安全边界
```
You are Claude Code, Anthropic's official CLI for Claude.
```
+ `CYBER_RISK_INSTRUCTION`（渗透测试/CTF 边界）

### 2. Doing tasks（任务执行——最关键的部分）

> **"Default to helping"** — 默认帮助，只在有具体严重风险时才拒绝
> **"Read before you change"** — 读文件再改，不理解之前不操作
> **"Don't create unless necessary"** — 不创建文件除非必要；编辑已有文件优先
> **Linguistic signals**: "write a script"/"create a config" → 创建文件；"show me how"/"explain" → 内联回答；>20行代码 → 创建文件
> **Code style**: 不加无用注释、不添加过度抽象、不过度工程化、不推测未来需求
> **验证真实性**: 标记完成前必须实际验证（跑测试、执行脚本、查输出）
> 失败时诊断原因、不盲目重试、不轻易放弃

> ⚠️ **False-claims（反幻觉核心）**:
> "Report outcomes faithfully: if tests fail, say so with output; if you did not run a verification step, say that rather than implying success. Never claim 'all tests pass' when output shows failures. Never characterize incomplete work as done."

> **Anti-collapse**: "Take accountability without collapsing into over-apology. Don't abandon a correct position just because the user is frustrated."

### 3. Actions（执行谨慎性）

> "The cost of pausing to confirm is low, while the cost of an unwanted action can be very high"
> 高风操作需要确认：删文件/分支、force-push、修改CI/CD、发送消息
> "Measure twice, cut once"

### 4. Using tools（工具选择决策树）

```
Core tools can be called directly.
Prefer dedicated tools over Bash:
  Read over cat, Edit over sed, Glob over find, Grep over grep
Reserve Bash for: package installs, test runners, build commands, git operations

Search before saying unknown:
  When user references a file/function you haven't seen → Grep/Glob first
```

**关键：隐含决策树，不说教**
- 不说"Use Glob to find files"
- 说"Prefer Glob over bash find — it's faster and respects .gitignore"
- 工具选择以对比形式呈现（A over B），不是独立的指令列表

### 5. Communication（输出风格）

```
Write for a person, not a console.
Don't narrate internal machinery ("let me call Grep")
One question per response
No "anything else?" appendages
No emojis unless user requests
Use file_path:line_number format
No colon before tool calls
```

### 6. Session-specific（会话级动态注入）

- CLAUDE.md 内容（包在 `<project-instructions>` 里）
- 环境信息（CWD、git status、平台、Shell）
- 日期/时间
- MCP 指令
- 语言偏好
- 操作模式（非交互/子Agent 等）

---

## 二、关键工程技巧

### 技术 1：对比式工具引导
❌ 我们的："Use workspace_glob to find files, then workspace_read_file to read"
✅ CC："Prefer Glob over bash find for file search — it's faster and respects .gitignore"

### 技术 2：False-claims 具体化
❌ 我们的："Don't lie about completing tasks"
✅ CC：上述 5 行长反幻觉段落，覆盖：测试失败说失败、不压制lint错误、不把半成品标为完成、不为了"通过"而简化检查

### 技术 3：语言信号检测
"write a script" → 创建文件
"show me how" → 内联回答
代码 >20 行 → 创建文件
这比我们的"编码模式/对话模式"二分法更细分

### 技术 4：风险成本框架
"The cost of pausing to confirm is low, while the cost of an unwanted action can be very high"
不是禁止，是提供决策依据

### 技术 5：反过度工程化
"Don't add features beyond what was asked"
"Don't create helpers for one-time operations"
"Three similar lines > a premature abstraction"
这些都是针对 AI 常见毛病的规则

### 技术 6：分层提示词 + 动态边界
静态部分（身份/规则）→ `cacheScope: 'global'`
动态部分（环境/MCP/语言）→ 在 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 之后
每个 section 独立 memoized，只在 /clear 或 /compact 时重建

---

## 三、我们的差距 vs 改进方向

| 差距 | CC 做法 | 我们当前 | 改进 |
|---|---|---|---|
| 反幻觉 | 5行具体规则 | "Don't lie" 一行 | 照抄 CC |
| 工具引导 | 对比式（A over B） | 命令式列表 | 改为对比式 |
| 代码风格 | 7条详细规则 | 无 | 加简洁版 |
| 验证真实性 | 必须实际验证 | "改完跑检查" | 照抄 CC |
| 语言信号 | 具体触发条件 | 模式检测 | 加信号检测 |
| 输出风格 | 6条规则 | 无 | 加关键几条 |
| 提示词分层 | 静态/动态+缓存 | 全动态 | 简化版 |
