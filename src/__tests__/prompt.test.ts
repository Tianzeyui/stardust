/**
 * 系统提示词回归测试
 * 纯文本验证，不调 API
 * 完全对齐 CC prompts.ts 真实源码后的新提示词
 */
import { describe, test, expect } from 'vitest'
import { DEFAULT_PROMPT_CODE, DEFAULT_PROMPT_CHAT } from '../lib/config'

describe('DEFAULT_PROMPT_CODE 核心规则', () => {
  const p = DEFAULT_PROMPT_CODE

  // ====== 反幻觉 & 验证 ======

  test('反幻觉：必须验证再报告', () => {
    expect(p).toContain('verify it actually works')
    expect(p).toContain('Report outcomes faithfully')
    expect(p).toContain('Never claim')
    expect(p).toContain('when output shows failures')
  })

  test('不能伪造验证结果', () => {
    expect(p).toContain("can't verify")
    expect(p).toContain('say so explicitly')
    expect(p).toContain('manufacture a green result')
  })

  // ====== 工具选择 (CC: "Using your tools" section) ======

  test('工具选择：专用工具优于 run_terminal', () => {
    expect(p).toContain('Do NOT use the run_terminal')
    expect(p).toContain('workspace_read_file instead of cat')
    expect(p).toContain('workspace_edit_file instead of sed')
    expect(p).toContain('workspace_grep instead of grep')
    expect(p).toContain('workspace_glob instead of find')
    expect(p).toContain('This is CRITICAL')
  })

  test('工具链顺序', () => {
    expect(p).toContain('workspace_glob')
    expect(p).toContain('workspace_read_file')
    expect(p).toContain('workspace_edit_file')
    expect(p).toContain('run_terminal (verify)')
    expect(p).toContain('→')
  })

  test('不滥用终端：回退规则', () => {
    expect(p).toContain('dedicated tool')
    expect(p).toContain('only fallback')
    expect(p).toContain('absolutely necessary')
  })

  test('最大化并行工具调用', () => {
    expect(p).toContain('parallel tool calls')
    expect(p).toContain('Maximize use of parallel')
    expect(p).toContain('make all independent tool calls in parallel')
  })

  // ====== 安全 (CC: getActionsSection 长文) ======

  test('安全：风险成本 + 确认', () => {
    expect(p).toContain('cost of pausing to confirm is low')
    expect(p).toContain('check with the user before proceeding')
  })

  test('破坏性操作列表', () => {
    expect(p).toContain('deleting files/branches')
    expect(p).toContain('force-pushing')
    expect(p).toContain('git reset --hard')
  })

  test('单次授权不等于永久授权', () => {
    expect(p).toContain('does NOT mean that they approve it in all contexts')
  })

  test('measure twice, cut once', () => {
    expect(p).toContain('measure twice, cut once')
  })

  // ====== 通信风格 (CC: Tone & Style + Output Efficiency) ======

  test('通信风格：报告结果，不赘述过程', () => {
    expect(p).toContain('report the result')
    expect(p).toContain('limit to one')
    expect(p).toContain('file_path:line_number')
  })

  test('不尾随追问', () => {
    expect(p).toContain('Do not append')
  })

  test('输出效率：简洁', () => {
    expect(p).toContain('Go straight to the point')
    expect(p).toContain('If you can say it in one sentence')
  })

  // ====== 代码风格 (CC: getSimpleDoingTasksSection) ======

  test('代码风格：不越界', () => {
    expect(p).toContain("Don't add features")
    expect(p).toContain('beyond what was asked')
    expect(p).toContain('editing an existing file')
    expect(p).toContain('Default to writing no comments')
  })

  test('不过度抽象', () => {
    expect(p).toContain("Don't create helpers, utilities, or abstractions")
    expect(p).toContain('Three similar lines')
  })

  test('语言信号：创建 vs 解释', () => {
    expect(p).toContain('write a script')
    expect(p).toContain('show me how')
    expect(p).toContain('Code over 20 lines')
  })

  // ====== Agent 行为 (CC Verification Contract + brainPlus 增强) ======

  test('Agent 行为：委托 + 验证', () => {
    expect(p).toContain('delegate_task')
    expect(p).toContain('independent adversarial verification')
    expect(p).toContain('On FAIL: fix')
    expect(p).toContain('On PASS: spot-check')
    expect(p).toContain('VERDICT')
    expect(p).toContain('only the verifier')
  })

  test('反工具放弃：强制调工具', () => {
    expect(p).toContain('TOOL ABANDONMENT')
    expect(p).toContain('CRITICAL — Every factual claim')
    expect(p).toContain('MUST come from a tool call in the current turn')
  })

  // ====== 搜索 (CC: flat bullet in Doing Tasks) ======

  test('读代码优先：先理解再修改', () => {
    expect(p).toContain('do not propose changes to code you haven')
    expect(p).toContain('read it first')
    expect(p).toContain('Understand existing code')
  })
})

describe('DEFAULT_PROMPT_CHAT', () => {
  test('对话模式基础规则', () => {
    expect(DEFAULT_PROMPT_CHAT).toContain('friendly')
    expect(DEFAULT_PROMPT_CHAT).toContain('Use tools')
  })
})
