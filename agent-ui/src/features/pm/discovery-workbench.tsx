'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FileText, Sparkles, Play } from 'lucide-react'
import type { Project } from './model'
import { usePM } from './provider'
import { stageAccepted, stageRunBlock, uid } from './domain'
import { IncomingHandoff } from './handoff-panel'
import { stagePlanTitles } from './stage-presentation'
import { stages } from './catalog'
import { stageContracts } from './stage-catalog'
import {
  adoptPreparation,
  parsePreparation,
  preparationBlock,
  preparationError
} from './discovery-domain'
import { ResearchPlan } from './research-plan'
import { Badge, Button, Card, Markdown, Modal, type Navigate } from './ui'

export function DiscoveryWorkbench({
  p,
  index,
  navigate,
  details,
  review
}: {
  p: Project
  index: number
  navigate: Navigate
  details: ReactNode
  review: ReactNode
}) {
  const store = usePM()
  const planTitle = stagePlanTitles[index]
  const stage = stages[index]
  const contract = stageContracts[index]
  const preparationBlocked = preparationBlock(p, index)
  const [panel, setPanel] = useState<'details' | 'review' | null>(null)
  const [view, setView] = useState<'plan' | 'sources' | 'reports'>('plan')
  const [viewedRun, setViewedRun] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const documentRef = useRef<HTMLDivElement>(null)
  const draftKey = `pmos.discovery-chat.${p.id}${index ? `.${index}` : ''}`
  const [text, setText] = useState(() => {
    try {
      return sessionStorage.getItem(draftKey) || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(draftKey, text)
      else sessionStorage.removeItem(draftKey)
    } catch {
      /* The unsent text remains visible. */
    }
  }, [text, draftKey])
  const busy = !!store.busy[p.id]
  const disabled =
    p.archived ||
    busy ||
    store.saving ||
    !!store.saveError ||
    !!preparationBlocked
  const work = p.stageWork?.[index]
  const block = stageRunBlock(p, index)
  const runs = p.runs.filter(
    (r) => r.stage === index && r.contextSnapshot?.request.stagePreparation
  )
  const latest = runs[0]
  const available = runs.filter((r) => {
    try {
      return r.status === 'success' && !!parsePreparation(r.output)
    } catch {
      return false
    }
  })
  const selected =
    viewedRun === 'saved'
      ? undefined
      : available.find((r) => r.id === viewedRun) || available[0]
  useEffect(() => {
    if (latest?.status === 'success') {
      setViewedRun(latest.id)
      setView('plan')
    }
  }, [latest?.id, latest?.status])
  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [runs.length, latest?.status])
  let candidate: ReturnType<typeof parsePreparation> | null = null
  if (selected?.status === 'success') {
    try {
      candidate = parsePreparation(selected.output)
    } catch {
      /* Show the actionable validation error below. */
    }
  }
  const adoptionError = selected ? preparationError(p, selected) : ''
  const reports = p.artifacts.filter((a) => a.stage === index)
  const active = p.runs.find((r) => r.status === 'running')
  const accepted = stageAccepted(p, index)
  const lastReportRun = p.runs.find((r) => r.stage === index && r.taskId)
  const adopted =
    !!selected &&
    !!work?.criteria.length &&
    work.criteria.every((c) => c.id.startsWith(`prep-${selected.id}-`))
  async function send(message: string) {
    if (disabled || !message.trim()) return
    const ok = await store.run(p.id, {
      stage: index,
      sourceIds: [],
      message: message.trim(),
      prepareStage: true,
      preparationRunId: selected?.id
    })
    if (ok)
      setText((current) => (current.trim() === message.trim() ? '' : current))
  }
  async function generate() {
    const id = uid()
    if (
      !(await store.project(p.id, (q) => {
        const reason = stageRunBlock(q, index)
        if (reason) throw new Error(reason)
        return {
          ...q,
          tasks: [
            ...q.tasks,
            {
              id,
              title: `S${index + 1} · ${stage.outputs[0]}`,
              goal: stage.prompt,
              stage: index,
              status: 'todo',
              sourceIds: q.stageWork![index].sourceIds,
              skillId: q.skillId || `method-${index}`
            }
          ]
        }
      }))
    )
      return
    await store.run(p.id, {
      taskId: id,
      stage: index,
      sourceIds: work!.sourceIds,
      skillId: p.skillId || `method-${index}`,
      message: `${stage.prompt}\n请输出：${contract.output}\n说明所用资料与待验证事项，末尾附完成标准对应的章节和缺口，等待人工审阅。`
    })
  }
  return (
    <div className="pm-discovery-workspace">
      <div className="pm-discovery-document" ref={documentRef}>
        {index > 0 && (
          <details>
            <summary>查看上游结论与交接</summary>
            <IncomingHandoff p={p} index={index} navigate={navigate} />
          </details>
        )}
        {preparationBlocked && (
          <p role="status" className="pm-work-note">
            {preparationBlocked}。可以先查看本阶段方案框架。
          </p>
        )}
        <div className="pm-discovery-toolbar">
          <div className="pm-actions">
            {(['plan', 'sources', 'reports'] as const).map((tab) => (
              <Button
                key={tab}
                variant={view === tab ? 'primary' : undefined}
                onClick={() => setView(tab)}
              >
                {tab === 'plan'
                  ? planTitle
                  : tab === 'sources'
                    ? '项目资料'
                    : '阶段成果'}
              </Button>
            ))}
          </div>
          <Button onClick={() => setPanel('details')}>详细配置</Button>
        </div>
        {view === 'plan' && (
          <Card
            title={`完整${planTitle}`}
            extra={
              <Badge>
                {selected
                  ? adopted
                    ? block
                      ? '需更新'
                      : '已采用'
                    : '修改建议'
                  : work
                    ? '已保存配置'
                    : '待完善'}
              </Badge>
            }
          >
            <div className="pm-plan-scroll">
              <ResearchPlan
                index={index}
                p={p}
                proposal={candidate}
                run={selected}
              />
            </div>
            <div className="pm-plan-footer">
              {selected && (
                <p className="pm-muted">
                  {new Date(selected.at).toLocaleString('zh-CN')} 的方案
                  {selected.id !== latest?.id ? ' · 历史版本' : ''}
                  。右侧对话围绕这份方案继续。
                </p>
              )}
              {candidate && selected && (
                <>
                  <p className="pm-muted">
                    {adopted
                      ? block
                        ? '资料或范围已变化，请重新沟通后采用新方案。'
                        : '已采用，可继续对话提出修改。'
                      : adoptionError ||
                        '核对方案后采用，修改建议不会自动覆盖已有配置。'}
                  </p>
                  <div className="pm-actions">
                    <Button
                      variant="primary"
                      disabled={disabled || !!adoptionError}
                      onClick={async () => {
                        if (
                          await store.project(p.id, (q) =>
                            adoptPreparation(q, selected.id)
                          )
                        )
                          toast.success(
                            `方案已采用，可以生成${stage.outputs[0]}`
                          )
                      }}
                    >
                      {adopted ? '已采用' : '采用此方案'}
                    </Button>
                    {work && (
                      <Button onClick={() => setViewedRun('saved')}>
                        查看已保存配置
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>
        )}
        {view === 'sources' && (
          <Card
            title="项目资料"
            extra={
              <Button onClick={() => navigate('sources', p.id)}>
                添加 / 管理资料
              </Button>
            }
          >
            <div className="pm-card-pad">
              {!p.sources.length ? (
                <p>还没有资料也可以直接和 AI 聊，缺少的信息会标为待补充。</p>
              ) : (
                p.sources.map((s) => (
                  <div key={s.id} className="pm-gate-actions">
                    <FileText size={16} />
                    <span className="pm-grow">{s.title}</span>
                    <small>
                      {!s.content.trim()
                        ? '待获取正文'
                        : work?.sourceIds.includes(s.id)
                          ? '本次采用'
                          : '可供 AI 筛选'}
                    </small>
                    <Button onClick={() => navigate('sources', p.id, s.id)}>
                      查看
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}
        {view === 'reports' && (
          <Card
            title="阶段成果"
            extra={
              <Button
                variant="primary"
                disabled={disabled || !!block}
                onClick={() => void generate()}
              >
                <Play size={16} />
                生成{stage.outputs[0]}
              </Button>
            }
          >
            <div className="pm-card-pad">
              {block && (
                <p className="pm-muted">
                  先核对并采用{planTitle}，再生成{stage.outputs[0]}。
                </p>
              )}
              {lastReportRun?.status === 'failed' && (
                <p role="alert">
                  {lastReportRun.error}
                  <Button
                    onClick={() => navigate('runs', p.id, lastReportRun.id)}
                  >
                    查看失败记录
                  </Button>
                </p>
              )}
              {!reports.length ? (
                <p>{stage.outputs.join('、')}会保存在这里。</p>
              ) : (
                reports.map((a) => (
                  <div key={a.id} className="pm-gate-actions">
                    <span className="pm-grow">
                      {a.title} · v{a.revisions.at(-1)?.version}
                    </span>
                    <Badge status={a.status} />
                    <Button onClick={() => navigate('artifacts', p.id, a.id)}>
                      打开报告
                    </Button>
                  </div>
                ))
              )}
              {!!reports.length && (
                <Button onClick={() => setPanel('review')}>
                  {accepted ? '查看验收与交接' : '审阅成果并继续'}
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
      <aside className="pm-discovery-chat" aria-label={`${planTitle}对话`}>
        <header>
          <div>
            <Sparkles size={18} />
            <strong>和 AI 一起做{stage.name}</strong>
          </div>
          <span className="pm-muted">
            {store.agent.agent} · {store.agent.model} · 当前项目独立上下文
          </span>
          <span className="pm-muted">
            {view === 'plan'
              ? '围绕左侧方案交流，修改后可核对采用'
              : `对话保留，可随时回到${planTitle}`}
          </span>
        </header>
        <div
          className="pm-discovery-messages"
          ref={messagesRef}
          aria-live="polite"
        >
          {!runs.length && (
            <div className="pm-discovery-note">
              <strong>这一阶段你想解决什么？</strong>
              <p>
                可以直接说想法，也可以先让我阅读项目资料，形成完整{planTitle}。
              </p>
              <Button
                disabled={disabled}
                onClick={() =>
                  void send(
                    `请先从项目资料和已验收上游成果中筛选相关内容，整理完整${planTitle}；只问现有资料里找不到的关键信息。`
                  )
                }
              >
                从已有资料生成方案
              </Button>
            </div>
          )}
          {runs
            .slice(0, 12)
            .reverse()
            .map((r) => {
              let reply = null
              try {
                if (r.status === 'success') reply = parsePreparation(r.output)
              } catch {}
              return (
                <div key={r.id} className="pm-discovery-exchange">
                  <div className="pm-discovery-user">
                    <strong>你</strong>
                    <p>{r.requestText}</p>
                  </div>
                  <div className="pm-discovery-reply">
                    <strong>{stage.name}助手</strong>
                    {r.status === 'running' ? (
                      <p>正在整理你的想法和资料…</p>
                    ) : r.status === 'failed' ? (
                      <p role="alert">{r.error || '本次未完成，请重试。'}</p>
                    ) : reply ? (
                      <>
                        <Markdown>{reply.summary}</Markdown>
                        {!!reply.questions.length && (
                          <ul>
                            {reply.questions.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        )}
                        <Button
                          onClick={() => {
                            setViewedRun(r.id)
                            setView('plan')
                            if (window.innerWidth <= 1100)
                              requestAnimationFrame(() =>
                                documentRef.current?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'start'
                                })
                              )
                          }}
                        >
                          查看完整{planTitle}
                        </Button>
                      </>
                    ) : (
                      <p role="alert">
                        本次没有形成有效方案，可继续对话让 AI 重新整理。
                      </p>
                    )}
                    <details>
                      <summary>运行记录</summary>
                      <Button onClick={() => navigate('runs', p.id, r.id)}>
                        查看本次记录
                      </Button>
                    </details>
                  </div>
                </div>
              )
            })}
        </div>
        <form
          className="pm-discovery-composer"
          onSubmit={(e) => {
            e.preventDefault()
            void send(text)
          }}
        >
          {active && (
            <div className="pm-actions">
              <small className="pm-grow">{active.title} · 正在处理</small>
              <Button
                type="button"
                onClick={() => void store.cancelRun(p.id, active.id)}
              >
                停止
              </Button>
            </div>
          )}
          <label htmlFor="discovery-message">直接和 AI 说你的想法</label>
          <textarea
            id="discovery-message"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例如：这一段为什么这样安排？请根据上一步的结论缩小范围。"
          />
          <div className="pm-actions">
            <small className="pm-grow">
              {selected
                ? '本次将带入当前查看的方案'
                : '结合项目资料与本阶段最近的对话'}
            </small>
            <Button
              type="submit"
              variant="primary"
              disabled={disabled || !text.trim()}
            >
              {busy ? '正在处理…' : '发送'}
            </Button>
          </div>
          <details>
            <summary>本次会参考哪些内容</summary>
            <p>
              本项目资料正文、已验收上游成果、已确认交接、当前方案和本阶段最近对话；较长资料使用标注过的开头节选。使用已配置的模型，未知内容保留待补充。
            </p>
          </details>
        </form>
      </aside>
      <Modal
        wide
        open={panel === 'details'}
        onClose={() => setPanel(null)}
        title={`${stage.name}详细配置`}
      >
        {details}
      </Modal>
      <Modal
        wide
        open={panel === 'review'}
        onClose={() => setPanel(null)}
        title={`审阅${stage.name}成果`}
      >
        {review}
      </Modal>
    </div>
  )
}
