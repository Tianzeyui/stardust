/**
 * 系统提示词回归测试
 * 纯文本验证，不调 API
 * 对齐 CC 后的新提示词
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

  // ====== 工具选择 ======

  test('工具选择：对比式引导', () => {
    expect(p).toContain('Prefer workspace_glob')
    expect(p).toContain('Prefer workspace_grep')
    expect(p).toContain('Prefer workspace_edit_file')
    expect(p).toContain('reserve run_terminal for')
  })

  test('工具链顺序', () => {
    expect(p).toContain('workspace_glob')
    expect(p).toContain('workspace_read_file')
    expect(p).toContain('workspace_edit_file')
    expect(p).toContain('run_terminal (verify)')
    expect(p).toContain('→')
  })

  test('不滥用终端', () => {
    expect(p).toContain('Do NOT use it for file')
    expect(p).toContain('dedicated tools')
  })

  // ====== 安全 ======

  test('安全：风险成本 + 确认', () => {
    expect(p).toContain('cost of pausing to confirm is low')
    expect(p).toContain('confirm with the user')
  })

  test('破坏性操作列表', () => {
    expect(p).toContain('deleting files/branches')
    expect(p).toContain('force-pushing')
    expect(p).toContain('git reset --hard')
  })

  test('单次授权不等于永久授权', () => {
    expect(p).toContain('NOT mean approval in all contexts')
  })

  // ====== 通信风格 ======

  test('通信风格：报告结果，不赘述过程', () => {
    expect(p).toContain('report the result')
    expect(p).toContain('one question per response')
    expect(p).toContain('file_path:line_number')
  })

  test('不尾随追问', () => {
    expect(p).toContain('Do not append')
  })

  // ====== 代码风格 ======

  test('代码风格：不越界', () => {
    expect(p).toContain("Don't add features")
    expect(p).toContain('beyond what was asked')
    expect(p).toContain('editing existing files')
    expect(p).toContain('Default to writing no comments')
  })

  test('不过度抽象', () => {
    expect(p).toContain("Don't create helpers, utilities, or abstractions")
    expect(p).toContain('Three similar lines is better')
  })

  test('语言信号：创建 vs 解释', () => {
    expect(p).toContain('write a script')
    expect(p).toContain('show me how')
    expect(p).toContain('Code over 20 lines')
  })

  // ====== Agent 行为 ======

  test('Agent 行为：委托 + 验证', () => {
    expect(p).toContain('delegate_task')
    expect(p).toContain('independent adversarial verification')
    expect(p).toContain('On FAIL: fix the issues')
    expect(p).toContain('On PASS: spot-check')
    expect(p).toContain('VERDICT')
    expect(p).toContain('only the verifier')
  })

  // ====== 搜索 ======

  test('搜索优先', () => {
    expect(p).toContain('Search before saying unknown')
    expect(p).toContain('Before changing code, read it')
  })
})

describe('DEFAULT_PROMPT_CHAT', () => {
  test('对话模式基础规则', () => {
    expect(DEFAULT_PROMPT_CHAT).toContain('friendly')
    expect(DEFAULT_PROMPT_CHAT).toContain('Use tools')
  })
})
