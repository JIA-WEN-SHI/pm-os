'use client'
import { useEffect, useState } from 'react'
import type { Run } from './model'
import { usePM } from './provider'
import {
  executionActive,
  executionLabels,
  type Execution
} from './execution-domain'
import { Card, Button } from './ui'

export function RunExecution({
  projectId,
  run
}: {
  projectId: string
  run: Run
}) {
  const store = usePM()
  const [saved, setSaved] = useState<Execution | null>(null)
  const [note, setNote] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const live = store.executions[`${projectId}:${run.id}`]
  useEffect(() => {
    const controller = new AbortController()
    setSaved(null)
    setNote('')
    if (run.executionMode === 'background')
      void fetch(
        `/api/pm/execution?project=${encodeURIComponent(projectId)}&run=${encodeURIComponent(run.id)}`,
        { signal: controller.signal, cache: 'no-store' }
      )
        .then(async (response) => {
          const value = await response.json()
          if (!response.ok) throw new Error(value.message || '后台记录暂不可用')
          setSaved(value)
        })
        .catch((error) => {
          if (!controller.signal.aborted) setNote(error.message)
        })
    return () => controller.abort()
  }, [projectId, run.id, run.executionMode])
  if (run.executionMode !== 'background') return null
  const execution = live || saved
  return (
    <Card title="后台执行">
      <div className="pm-card-pad">
        <p>
          {execution
            ? executionLabels[execution.status]
            : note || '正在查询后台记录…'}
        </p>
        <p className="pm-muted">
          执行结果保存在本机后端。关闭页面后任务会继续；重新打开项目会取回结果。后端重启会标记中断，不会自动重跑。
        </p>
        {run.contextSnapshot?.request.webRead && (
          <a
            className="pm-button"
            href={`/?view=sources&project=${encodeURIComponent(projectId)}&item=${encodeURIComponent(run.contextSnapshot.request.webRead.sourceId)}`}
          >
            返回资料，核对并保存读取结果
          </a>
        )}
        {execution && (
          <>
            <dl className="pm-definition">
              <dt>执行器</dt>
              <dd>
                {run.contextSnapshot?.request.webRead
                  ? 'Agno → Hermes 网页工具'
                  : execution.executor === 'hermes-agent'
                    ? 'Hermes Agent'
                    : 'Agno Assist'}
              </dd>
              <dt>本次尝试</dt>
              <dd className="pm-break">{execution.attemptId || '未派发'}</dd>
            </dl>
            {execution.error && (
              <p className="pm-error-note">{execution.error}</p>
            )}
            {executionActive(execution) && (
              <Button
                disabled={cancelling || execution.status === 'cancelling'}
                onClick={async () => {
                  setCancelling(true)
                  try {
                    await store.cancelRun(projectId, run.id)
                  } finally {
                    setCancelling(false)
                  }
                }}
              >
                {cancelling || execution.status === 'cancelling'
                  ? '正在停止…'
                  : '停止本次执行'}
              </Button>
            )}
            {!!execution.events.length && (
              <details>
                <summary>查看实际执行事件（{execution.events.length}）</summary>
                <ul>
                  {execution.events.map((event, i) => (
                    <li key={i}>
                      {new Date(event.at).toLocaleTimeString('zh-CN')} ·{' '}
                      {event.event}
                      {event.tool ? ` · Hermes ${event.tool}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
