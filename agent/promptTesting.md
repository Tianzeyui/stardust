# 提示词测试

只测文本，不调 API。检查改完提示词后核心规则是否还在。

## 文件

`src/__tests__/prompt.test.ts`

## 运行

```bash
npx vitest run src/__tests__/prompt.test.ts
```

## 加新规则时

在测试文件里加一条 `expect(p).toContain('新规则关键文本')`

## 覆盖规则

反幻觉、工具对比引导、工具链顺序、安全框架、通信风格、代码风格、Agent行为、语言信号、对话模式——共9条断言。
