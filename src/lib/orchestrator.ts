/**
 * Orchestrator — 模型自主委托（tier-based delegation）
 * 模型通过 delegate_task 工具按 fast/balanced/powerful 层级委托子任务
 */
import { delegateToModel } from './chatService'

export async function delegateByTier(
  tier: 'fast' | 'balanced' | 'powerful',
  task: string,
  systemContext?: string,
): Promise<string> {
  const result = await delegateToModel(tier, task, systemContext)
  return `[${result.modelName}]\n${result.result}`
}
