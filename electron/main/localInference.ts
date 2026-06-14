/**
 * 本地模型推理服务 — node-llama-cpp v3
 */
import path from 'path'
import { app } from 'electron'

let loadedModelId: string | null = null
let loadedModel: any = null
let loadedContext: any = null
let llamaInstance: any = null

const modelDir = path.join(app.getPath('userData'), 'models')

function modelPath(id: string): string {
  return path.join(modelDir, `${id}.gguf`)
}

export async function isLocalModelReady(): Promise<boolean> {
  return loadedModel !== null && loadedContext !== null
}

export async function loadModel(id: string): Promise<{ success: boolean; error?: string }> {
  const mp = modelPath(id)
  if (loadedModelId === id && loadedModel && loadedContext) return { success: true }
  await unloadModel()
  try {
    if (!llamaInstance) {
      const { getLlama } = await import('node-llama-cpp')
      llamaInstance = await getLlama()
    }
    const model = await llamaInstance.loadModel({ modelPath: mp })
    const context = await model.createContext()
    loadedModel = model
    loadedContext = context
    loadedModelId = id
    return { success: true }
  } catch (e: any) {
    console.error('[localInference] 加载失败:', e.message)
    return { success: false, error: e.message }
  }
}

export async function unloadModel(): Promise<void> {
  try {
    if (loadedModel) { await loadedModel.dispose?.(); loadedModel = null }
    loadedContext = null
    loadedModelId = null
  } catch {}
}

export async function* chatLocal(
  messages: Array<{ role: string; content: string }>,
): AsyncGenerator<string> {
  if (!loadedModel || !loadedContext) throw new Error('模型未加载')

  const nlc = await import('node-llama-cpp')
  const { LlamaChatSession } = nlc

  const seq = loadedContext.getSequence()
  const session = new LlamaChatSession({
    contextSequence: seq,
    systemPrompt: '你是一个智能助手。请用简洁、准确的中文回答用户问题。',
  })

  const prompt = messages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n') + '\n助手: '

  try {
    const chunkQueue: string[] = []
    let streamDone = false
    let streamError: Error | null = null

    const generatePromise = session.prompt(prompt, {
      temperature: 0.7,
      maxTokens: 2048,
      onTextChunk: (text: string) => {
        chunkQueue.push(text)
      },
    }).then(() => { streamDone = true }).catch((e: Error) => { streamError = e; streamDone = true })

    // 轮询：有新 chunk 就 yield，直到生成完成
    let lastIdx = 0
    while (!streamDone) {
      if (chunkQueue.length > lastIdx) {
        const newChunks = chunkQueue.slice(lastIdx)
        lastIdx = chunkQueue.length
        yield newChunks.join('')
      } else {
        await new Promise(r => setTimeout(r, 30))
      }
    }

    // yield 剩余 chunks
    if (chunkQueue.length > lastIdx) {
      yield chunkQueue.slice(lastIdx).join('')
    }

    if (streamError) throw streamError
  } finally {
    try { seq.dispose() } catch {}
  }
}
