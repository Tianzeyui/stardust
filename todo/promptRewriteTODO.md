# 提示词重构 TODO（基于 Claude Code 源码）

## ✅ 已完成

- [x] 1. 反幻觉规则 — Report truthfully, verify before done
- [x] 2. 工具引导改对比式 — glob over grep, edit over write
- [x] 3. 代码风格 — 不超需求、不无端抽象、默认无注释、语言信号
- [x] 4. 输出风格 — Report outcome not process, one question, file:line
- [x] 5. 风险成本框架 — Cost asymmetry, confirm destructive actions
- [x] 6. 提示词工程化 — #Rules/Tools/Safety/Style 分区

## 🟡 待优化

- [ ] rules.md 改为 user message（不进 system prompt）
- [ ] 对话模式提示词也从中文改英文风格
- [ ] 测试实际效果，根据反馈调优
