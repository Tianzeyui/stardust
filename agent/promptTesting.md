# 提示词测试方法论

## 核心原则

**测试提示词文本，不测试 AI 行为。**

AI 行为测试（调 API 验证输出）成本高、不稳定、不可重复。CC 也不做。
CC 的做法：写文本断言检查 prompt 内容是否包含关键规则。

## 为什么这样做

1. **零成本** — 纯文本匹配，不调 API，不烧 token
2. **毫秒级** — 9 个断言 200ms 跑完
3. **确定性** — 每次结果一样，不受模型随机性影响
4. **CI 集成** — 可以加入 pre-commit hook

## 测试文件位置

```
src/__tests__/prompt.test.ts
```

## 测试结构

```ts
describe('DEFAULT_PROMPT_CODE 核心规则', () => {
  const p = DEFAULT_PROMPT_CODE  // 直接读源码，不走 API

  test('反幻觉：必须验证再报告', () => {
    expect(p).toContain('Verify before reporting done')
    expect(p).toContain('never say "all tests pass" when output shows failures')
  })

  test('工具选择：对比式引导', () => {
    expect(p).toContain('Prefer workspace_glob')
    expect(p).toContain('Prefer workspace_edit_file')
  })
})
```

## 覆盖规则清单

每次修改 `DEFAULT_PROMPT_CODE` 后，必须保证以下规则仍然存在：

| # | 规则 | 断言关键词 |
|---|------|-----------|
| 1 | 反幻觉 | `Verify before reporting done`, `Report truthfully`, `never say "all tests pass"` |
| 2 | 工具对比式引导 | `Prefer workspace_glob`, `Prefer workspace_edit_file`, `run_terminal is for` |
| 3 | 工具链顺序 | `workspace_glob to find`, `workspace_read_file to read`, `edit_file to change`, `run_terminal to verify` |
| 4 | 安全框架 | `cost of pausing to confirm is low`, `confirm with user first` |
| 5 | 通信风格 | `Report the outcome, not the process`, `One question per response`, `file_path:line_number` |
| 6 | 代码风格 | `Do not add features beyond what was asked`, `editing existing files`, `Default to no comments` |
| 7 | Agent 行为 | `delegate_task`, `Verification`, `fork` |
| 8 | 语言信号 | `write/create/save`, `show me/explain/what is`, `Code >20 lines` |
| 9 | 对话模式 | `friendly`, `Use tools` |

## 添加新规则

当系统提示词新增一条关键规则时，同时在本测试文件添加对应的断言：

```ts
test('新规则描述', () => {
  expect(p).toContain('新规则关键文本')
})
```

## 运行

```bash
npx vitest run src/__tests__/prompt.test.ts
```

## 不做什么

- ❌ 不调真实 API 验证 AI 行为（成本高、不稳定）
- ❌ 不测试工具执行结果（那是集成测试的范畴）
- ❌ 不测试 UI 渲染（那是组件测试的范畴）

只检查一件事：**改完提示词后，核心规则还在不在。**
