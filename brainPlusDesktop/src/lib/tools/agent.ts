/**
 * Agent 工具：ask_user, show_progress, notify_complete, update_task_list, delegate_task
 */
import { jsonSchema } from 'ai'
import type { ToolMap } from './registry'
import { delegateToModel } from '../chatService'
import type { AskQuestion } from '../chatService'

let onAgentUIEvent: ((event: any) => void) | null = null

export function setAgentToolHandler(handler: ((event: any) => void) | null) {
  onAgentUIEvent = handler
}

export function registerAgentTools(tools: ToolMap, autoMode?: boolean) {
  tools['ask_user'] = {
    description:
      '向用户提问以获取决策或补充信息。**优先使用多问题模式一次问清楚**，减少往返。\n' +
      '多问题模式：传入 title 标题 + questions 数组，每个问题可独立设置输入类型(input/select/confirm)。\n' +
      '单问题模式：传入 question + inputType(兼容旧版)。\n' +
      '注意：信息充分时立即执行任务，不要在信息完备时继续提问。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        title: { type: 'string', description: '表单标题，如"请提供发票查询信息"' },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '问题唯一标识，如"invoice_code"' },
              label: { type: 'string', description: '问题文本，如"发票代码"' },
              inputType: { type: 'string', enum: ['input', 'select', 'confirm'], description: '输入类型' },
              options: { type: 'array', items: { type: 'string' }, description: 'select/confirm 的选项' },
              placeholder: { type: 'string', description: '输入框提示文字' },
              required: { type: 'boolean', description: '是否必填' },
            },
            required: ['id', 'label', 'inputType'],
          },
          description: '问题列表（多问多答模式，推荐）',
        },
        question: { type: 'string', description: '（旧格式）单个问题文本' },
        options: { type: 'array', items: { type: 'string' }, description: '（旧格式）选项列表' },
        inputType: { type: 'string', enum: ['select', 'input', 'confirm'], description: '（旧格式）交互类型' },
      },
    }),
    execute: async (args: { title?: string; questions?: AskQuestion[]; question?: string; options?: string[]; inputType?: string }) => {
      return new Promise<string>((resolve) => {
        if (onAgentUIEvent) {
          if (args.questions && args.questions.length > 0) {
            onAgentUIEvent({ type: 'ask_user', title: args.title, questions: args.questions, resolve })
          } else {
            onAgentUIEvent({
              type: 'ask_user',
              question: args.question || '请提供信息',
              options: args.options,
              inputType: (args.inputType as 'select' | 'input' | 'confirm') || 'confirm',
              resolve,
            })
          }
        } else {
          resolve('用户不在线，请自行决策。' + (args.options ? ` 可选: ${args.options.join(', ')}` : ''))
        }
      })
    },
  }

  tools['show_progress'] = {
    description:
      '显示长时间任务的进度。调用后告知用户当前进展，避免用户焦虑等待。' +
      'current/total 用于百分比进度，仅传 message 则显示不确定进度条。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        message: { type: 'string', description: '进度描述，如 "正在生成 PPT 第 2/5 页..."' },
        current: { type: 'number', description: '当前进度（可选）' },
        total: { type: 'number', description: '总进度（可选）' },
      },
      required: ['message'],
    }),
    execute: async (args: { message: string; current?: number; total?: number }) => {
      onAgentUIEvent?.({ type: 'show_progress', message: args.message, current: args.current, total: args.total })
      return '进度已更新'
    },
  }

  tools['notify_complete'] = {
    description:
      '通知用户任务完成。用于异步任务结束时告知结果。' +
      'message 为完成消息，result 为可选的结果摘要（如文件路径、数据统计）。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        message: { type: 'string', description: '完成消息，如 "PPT 生成完成"' },
        result: { type: 'string', description: '结果摘要（可选），如文件路径' },
      },
      required: ['message'],
    }),
    execute: async (args: { message: string; result?: string }) => {
      onAgentUIEvent?.({ type: 'notify_complete', message: args.message, result: args.result })
      return '已通知用户: ' + args.message
    },
  }

  tools['update_task_list'] = {
    description:
      '管理复杂任务的任务清单。首次调用时传入完整任务列表（全部 pending），' +
      '之后每次只需传入状态有变化的任务项即可增量更新。' +
      'id 为唯一标识，title 为任务描述，status: pending(待执行)/running(执行中)/done(已完成)/cancelled(取消)。' +
      '用法：接到复杂任务时先创建清单 → 开始某项时标记 running → 完成后标记 done。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '唯一标识，如 "1"/"2"/"3"' },
              title: { type: 'string', description: '任务描述' },
              status: { type: 'string', enum: ['pending', 'running', 'done', 'cancelled'], description: '任务状态' },
            },
            required: ['id', 'title', 'status'],
          },
        },
      },
      required: ['tasks'],
    }),
    execute: async (args: { tasks: Array<{ id: string; title: string; status: string }> }) => {
      onAgentUIEvent?.({ type: 'update_task_list', tasks: args.tasks.map(t => ({ id: t.id, title: t.title, status: t.status as any })) })
      const done = args.tasks.filter(t => t.status === 'done').length
      return `任务清单已更新 (${done}/${args.tasks.length} 完成)`
    },
  }

  if (autoMode) {
    tools['delegate_task'] = {
      description:
        '将复杂子任务委托给更合适的模型处理。' +
        'tier: "fast" 简单任务(分类/摘要/翻译), "balanced" 日常任务, "powerful" 复杂任务(推理/代码/长文)。' +
        'task 描述要具体，包含上下文。委托后你会收到子任务结果，继续基于结果回复用户。',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['fast', 'balanced', 'powerful'], description: '目标模型层级' },
          task: { type: 'string', description: '子任务描述（含必要上下文）' },
          reason: { type: 'string', description: '委托原因（可选）' },
        },
        required: ['tier', 'task'],
      }),
      execute: async (args: { tier: string; task: string }) => {
        try {
          const result = await delegateToModel(args.tier as 'fast' | 'balanced' | 'powerful', args.task)
          return `[${result.modelName}]\n${result.result}`
        } catch (e: any) {
          return `委托失败: ${e.message}`
        }
      },
    }
  }
}
