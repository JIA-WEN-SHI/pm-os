import type { Project, Artifact } from './model.ts'
import { proposalReplacement } from './report-domain.ts'
import { preparationSummary } from './discovery-domain.ts'

export interface Execution {
  executor?: 'agno-assist' | 'agno-hermes-web' | 'hermes-agent'
  projectId: string
  runId: string
  attemptId: string
  status:
    | 'queued'
    | 'running'
    | 'cancelling'
    | 'success'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
    | 'timed_out'
  output: string
  error: string
  duration: number
  updatedAt: string
  upstreamId?: string
  events: { event: string; at: string; tool?: string }[]
}
export const executionLabels: Record<Execution['status'], string> = {
  queued: '等待执行',
  running: '后台运行中',
  cancelling: '正在停止',
  success: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  interrupted: '执行中断',
  timed_out: '已超时'
}
export const executionActive = (e: Execution) =>
  ['queued', 'running', 'cancelling'].includes(e.status)

export function finishExecution(p: Project, id: string, e: Execution): Project {
  if (e.projectId !== p.id || e.runId !== id || executionActive(e))
    throw new Error('后台结果与本任务不匹配')
  const r = p.runs.find((r) => r.id === id)
  if (!r || r.executionMode !== 'background')
    throw new Error('找不到后台运行记录')
  if (r.status !== 'running') return p
  const success = e.status === 'success' && !!e.output.trim()
  const error = e.error || '后台未返回完整文本，未生成报告。'
  const at = e.updatedAt
  const artifactId = r.taskId && success ? `result-${r.id}` : undefined
  const references = { sourceIds: r.sourceIds, artifactRefs: r.artifactRefs }
  const scope = r.selection
    ? { selection: r.selection, intent: r.intent, sourceRefs: r.sourceRefs }
    : {}
  const artifact: Artifact | undefined = artifactId
    ? {
        id: artifactId,
        title: r.title,
        stage: r.stage,
        stagePlanSignature: r.stagePlanSignature,
        status: 'review',
        ...references,
        revisions: [{ version: 1, content: e.output, at }]
      }
    : undefined
  return {
    ...p,
    artifacts: artifact ? [artifact, ...p.artifacts] : p.artifacts,
    ...(success && r.selection && r.intent === 'rewrite'
      ? {
          reportProposals: [
            ...(p.reportProposals || []),
            {
              id: `proposal-${r.id}`,
              selection: r.selection,
              request: r.requestText || r.title,
              replacement: proposalReplacement(r.selection, e.output),
              runId: r.id,
              sourceRefs: r.sourceRefs || [],
              at,
              status: 'pending' as const
            }
          ]
        }
      : {}),
    tasks: p.tasks.map((t) =>
      t.id === r.taskId
        ? {
            ...t,
            status: success ? 'review' : 'failed',
            ...(artifactId ? { artifactId } : {}),
            error: success ? undefined : error
          }
        : t
    ),
    runs: p.runs.map((run) =>
      run.id === id
        ? {
            ...run,
            status: success ? 'success' : 'failed',
            output: e.output,
            error: success ? undefined : error,
            duration: e.duration,
            upstreamId: e.upstreamId
          }
        : run
    ),
    messages: [
      ...p.messages,
      {
        id: `reply-${r.id}`,
        role: 'assistant',
        content: success
          ? r.contextSnapshot?.request.stagePreparation
            ? preparationSummary(e.output)
            : e.output
          : error,
        at,
        artifactId,
        ...references,
        stage: r.stage,
        ...scope,
        ...(!success ? { failed: true } : {})
      }
    ]
  }
}
