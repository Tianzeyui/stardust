/**
 * 系统提示词回归测试
 * 纯文本验证，不调 API
 */
import { describe, test, expect } from 'vitest'
import { DEFAULT_PROMPT_CODE, DEFAULT_PROMPT_CHAT } from '../lib/config'

describe('DEFAULT_PROMPT_CODE 核心规则', () => {
  const p = DEFAULT_PROMPT_CODE

  test('反幻觉：必须验证再报告', () => {
    expect(p).toContain('Verify before reporting done')
    expect(p).toContain('Report truthfully')
    expect(p).toContain('never say tests pass when they fail')
  })

  test('工具选择：对比式引导', () => {
    expect(p).toContain('Prefer glob over grep')
    expect(p).toContain('Prefer edit over write')
    expect(p).toContain('run_terminal for builds')
  })

  test('工具链顺序', () => {
    expect(p).toContain('workspace_glob(find files)')
    expect(p).toContain('workspace_read_file(read)')
    expect(p).toContain('workspace_edit_file(change)')
    expect(p).toContain('run_terminal(verify)')
  })

  test('安全：风险成本 + 确认', () => {
    expect(p).toContain('cost of pausing to confirm is low')
    expect(p).toContain('confirm with user')
  })

  test('通信风格', () => {
    expect(p).toContain('Report the outcome')
    expect(p).toContain('One question per response')
    expect(p).toContain('file_path:line_number')
  })

  test('代码风格', () => {
    expect(p).toContain('Do not add features beyond what was asked')
    expect(p).toContain('editing existing files')
    expect(p).toContain('Default to no comments')
  })

  test('Agent 行为', () => {
    expect(p).toContain('delegate_task')
    expect(p).toContain('verification')
    expect(p).toContain('Fork')
  })

  test('语言信号', () => {
    expect(p).toContain('write/create/save')
    expect(p).toContain('show me/explain/what is')
    expect(p).toContain('Code >20 lines')
  })
})

describe('DEFAULT_PROMPT_CHAT', () => {
  test('对话模式基础规则', () => {
    expect(DEFAULT_PROMPT_CHAT).toContain('friendly')
    expect(DEFAULT_PROMPT_CHAT).toContain('Use tools')
  })
})
