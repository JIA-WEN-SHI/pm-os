import { createWorkspace } from './seed'
import type { WorkspaceEnvelope } from './model'
import type { Execution } from './execution-domain'

export const publicDemo = process.env.NEXT_PUBLIC_PORTFOLIO_DEMO === 'true'
const KEY = 'pmos.public-demo.workspace.v1'
let envelope: WorkspaceEnvelope | null = null
const jobs = new Map<string, { started: number; result: Execution }>()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
function loadDemo() {
  if (envelope) return envelope
  try { envelope = JSON.parse(localStorage.getItem(KEY) || 'null') } catch { /* Start a fresh sample when browser storage is unavailable. */ }
  if (!envelope || envelope.workspace?.schema !== 1) envelope = { revision: 1, updatedAt: new Date().toISOString(), workspace: createWorkspace() }
  return envelope
}
export function resetPublicDemo() {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem('pmos.pending-commit.v1')
  sessionStorage.removeItem('pmos.generated-recovery')
  window.location.href = window.location.pathname
}
// The original local backend remains the default. The public build only operates on synthetic browser data.
export const pmRequest: typeof fetch = async (input, init = {}) => {
  if (!publicDemo) return fetch(input, init)
  const url = new URL(String(input), 'https://demo.invalid')
  if (url.pathname === '/api/pm/status') return json({ connected: true, agent: '示例助手', model: '预设回复 · 无模型连接' })
  const current = loadDemo()
  if (url.pathname === '/api/pm/workspace') {
    if (init.method === 'PUT') {
      const value = JSON.parse(String(init.body))
      if (value.baseRevision !== current.revision) return json({ message: '演示保存版本不一致，请刷新页面' }, 409)
      const next = { revision: current.revision + 1, updatedAt: new Date().toISOString(), workspace: value.workspace }
      // A storage failure is returned to the existing recovery workflow instead of reporting a durable save.
      localStorage.setItem(KEY, JSON.stringify(next))
      envelope = next
      return json(envelope)
    }
    return json(current)
  }
  if (url.pathname === '/api/pm/execution') {
    const projectId = url.searchParams.get('project') || ''
    const runId = url.searchParams.get('run') || ''
    const key = `${projectId}:${runId}`
    const project = current.workspace.projects.find(p => p.id === projectId)
    const run = project?.runs.find(r => r.id === runId)
    if (init.method === 'POST' && url.searchParams.get('action') !== 'cancel') {
      if (!run) return json({ message: '找不到演示任务' }, 404)
      const output = '# 示例助手回复\n\n> 这是预设演示文本，不是实时 AI 分析，也不会读取外部网页。\n\n## 建议的工作顺序\n\n1. 核对资料与来源。\n2. 将事实、假设和待验证事项分开。\n3. 编辑报告并保留版本。\n4. 人工审阅后再确认交付。\n\n## 需要人工补充\n\n真实访谈、实际业务数据和可核对的评估结果仍需收集。可以在资料和交付物页面继续编辑。'
      jobs.set(key, { started: Date.now(), result: { projectId, runId, attemptId: `demo-${runId}`, status: 'success', output, error: '', duration: 2, updatedAt: new Date().toISOString(), events: [{ event: '示例回复已准备', at: new Date().toISOString() }] } })
    }
    const job = jobs.get(key)
    if (!job) return json({ projectId, runId, attemptId: `demo-${runId}`, status: 'interrupted', output: '', error: '演示运行已随页面刷新结束，可以重新发起。', duration: 0, updatedAt: new Date().toISOString(), events: [] })
    if (url.searchParams.get('action') === 'cancel') job.result = { ...job.result, status: 'cancelled', error: '已停止演示任务', output: '' }
    const waiting = Date.now() - job.started < 1400 && job.result.status === 'success'
    return json(waiting ? { ...job.result, status: 'running', output: '', events: [] } : job.result)
  }
  return json({ message: '此功能需要本地服务，不在公开演示范围内' }, 400)
}
