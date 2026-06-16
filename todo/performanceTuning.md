# 性能/精确度调优 TODO

> 基于 Claude Code 请求结构分析，同用 DeepSeek API 但 Claude Code 更精准的核心原因

## 🔴 高优先级

### 1. interleaved-thinking beta header
- [ ] chatService 请求头加 `anthropic-beta: interleaved-thinking-2025-05-14`
- [ ] 效果：模型在每次工具调用结果返回后，先思考再决定下一步
- [ ] 当前：BrainPlus 没传此 header，DeepSeek 在工具调用间无思考步骤

### 2. 两阶段调用（先判后做）
- [ ] 第一次请求：fast 模型 + 不传工具 → 判断任务类型和复杂度
- [ ] 第二次请求：pro 模型 + 完整工具列表 → 执行任务
- [ ] 当前：一次性传所有工具，token 浪费 + 干扰判断
- [ ] 参考：Claude Code 第一次请求 `tools: []`

### 3. 工具定义精简
- [ ] 过滤不常用的工具，减少 token 消耗
- [ ] 参考 Claude Code：第一次 0 工具，第二次 26 工具
- [ ] 当前：每次都传全部 20+ 工具

## 🟡 中优先级

### 4. 系统提示词对比优化
- [ ] 对照 Claude Code 的 3 个 system block 结构
- [ ] 我们的提示词是否过长/过短？
- [ ] 工具调用引导是否明确？

### 5. context_management beta
- [ ] 加 `anthropic-beta: context-management-2025-06-27`
- [ ] 让 API 层处理上下文压缩，不依赖应用层

### 6. effort 参数
- [ ] 加 `effort-2025-11-24` beta
- [ ] 控制模型投入程度

## 🟢 低优先级

### 7. 响应后处理优化
- [ ] 工具结果是否被截断/格式化影响模型判断
- [ ] MarkdownPreview 渲染前的 stripHtml 是否过度

### 8. 工具执行顺序
- [ ] 是否支持 parallel tool execution 的 UI 展示
- [ ] 并行工具的返回是否按正确顺序
