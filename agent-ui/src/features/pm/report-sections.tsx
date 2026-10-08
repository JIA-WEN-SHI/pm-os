'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  Artifact,
  Project,
  ReportProposal,
  ReportSelection
} from './model'
import {
  reportSections,
  applyReportProposal,
  rejectReportProposal
} from './report-domain'
import { usePM } from './provider'
import { Button, Card, Field, Markdown, Modal } from './ui'

export function ReportSections({
  p,
  artifact,
  version,
  dirty,
  textSelection,
  onApplied
}: {
  p: Project
  artifact: Artifact
  version: number
  dirty: boolean
  textSelection?: ReportSelection
  onApplied: (version: number, content: string) => void
}) {
  const store = usePM()
  const sections = reportSections(artifact, version)
  const [block, setBlock] = useState(sections[0]?.blockId || '')
  const [focused, setFocused] = useState<ReportSelection | null>(null)
  const selected =
    focused || sections.find((s) => s.blockId === block) || sections[0]
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState<Record<string, string>>({})
  const scopeKey = selected?.blockId || ''
  const question = questions[scopeKey] || ''
  const setQuestion = (value: string | ((current: string) => string)) =>
    setQuestions((all) => ({
      ...all,
      [scopeKey]:
        typeof value === 'function' ? value(all[scopeKey] || '') : value
    }))
  const [intent, setIntent] = useState<'explain' | 'rewrite'>('explain')
  const [proposalId, setProposalId] = useState<string | null>(null)
  useEffect(() => {
    if (textSelection) {
      setFocused(textSelection)
      setOpen(true)
    }
  }, [textSelection])
  const proposals = (p.reportProposals || []).filter(
    (x) => x.selection.artifactId === artifact.id
  )
  const proposal = proposals.find((x) => x.id === proposalId)
  const messages = p.messages.filter(
    (m) =>
      m.selection?.artifactId === artifact.id &&
      m.selection.version === version &&
      m.selection.blockId === selected?.blockId
  )
  const busy = !!store.busy[p.id]
  async function accept(x: ReportProposal) {
    if (dirty) {
      toast.error('请先保存已有的编辑草稿，再比较修改建议')
      return
    }
    const saved = await store.project(p.id, (q) => applyReportProposal(q, x.id))
    if (saved) {
      const updated = applyReportProposal(p, x.id)
        .artifacts.find((a) => a.id === artifact.id)!
        .revisions.at(-1)!
      setProposalId(null)
      setOpen(false)
      onApplied(updated.version, updated.content)
      toast.success('已采纳为新版本，请重新审阅确认')
    }
  }
  return (
    <>
      <Card title="章节问答与修改">
        <div className="pm-form">
          <Field label="选择报告章节">
            <select
              disabled={busy}
              value={block}
              onChange={(e) => {
                setBlock(e.target.value)
                setFocused(null)
              }}
            >
              {sections.map((s) => (
                <option key={s.blockId} value={s.blockId}>
                  {s.title} · 第{s.startLine}–{s.endLine}行
                </option>
              ))}
            </select>
          </Field>
          <p className="pm-muted">
            对话固定引用 v{version}{' '}
            的原文。解释不会改正文，修改建议需比较后采纳。
          </p>
          <Button
            disabled={!sections.length}
            onClick={() => {
              setFocused(null)
              setOpen(true)
            }}
          >
            围绕本节交流
          </Button>
          {!!proposals.length && (
            <>
              <strong>修改建议 · {proposals.length}</strong>
              {[...proposals].reverse().map((x) => (
                <Button key={x.id} onClick={() => setProposalId(x.id)}>
                  {x.selection.title} · v{x.selection.version} ·{' '}
                  {x.status === 'pending'
                    ? '待处理'
                    : x.status === 'accepted'
                      ? `已采纳 v${x.appliedVersion}`
                      : '已拒绝'}
                </Button>
              ))}
            </>
          )}
        </div>
      </Card>
      <Modal
        wide
        open={open}
        onClose={() => setOpen(false)}
        title={`${selected?.kind === 'text' ? 'AI 文案协作' : '章节交流'} · ${selected?.title || ''} · v${version}`}
      >
        {selected && (
          <div className="pm-form">
            <div className="pm-compare">
              <section>
                <h3>
                  引用原文 · 第{selected.startLine}–{selected.endLine}行
                </h3>
                <Markdown>{selected.quote}</Markdown>
              </section>
              <section>
                <h3>当前选区对话记录</h3>
                {!messages.length && (
                  <p className="pm-muted">还没有这个版本和选区的对话。</p>
                )}
                {messages.map((m) => (
                  <div key={m.id}>
                    <strong>
                      {m.role === 'user'
                        ? '你的问题'
                        : m.failed
                          ? '运行未完成'
                          : 'AI 回复'}
                    </strong>
                    <Markdown>{m.content}</Markdown>
                  </div>
                ))}
                {busy && (
                  <p role="status">正在处理，结果会留在原选区的记录中。</p>
                )}
              </section>
            </div>
            <p className="pm-muted">
              同时提供该版本全文及报告关联资料的当前版本作为上下文。不会自动联网。建议仍需核实。
            </p>
            <form
              className="pm-form"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!question.trim()) return
                const submitted = question
                const saved = await store.run(p.id, {
                  message: question,
                  stage: artifact.stage,
                  sourceIds: artifact.sourceIds,
                  artifactId: artifact.id,
                  selection: selected,
                  intent
                })
                if (saved)
                  setQuestion((current) =>
                    current === submitted ? '' : current
                  )
              }}
            >
              <div className="pm-actions">
                {[
                  {
                    label: '解释这段',
                    intent: 'explain',
                    text: '请解释这段内容的含义、依据和需要核实的地方。'
                  },
                  {
                    label: '润色',
                    intent: 'rewrite',
                    text: '请润色选中文案，使表达清晰自然，保留原意，不新增未经证实的事实。'
                  },
                  {
                    label: '精简',
                    intent: 'rewrite',
                    text: '请精简选中文案，保留核心意思和必要的限制条件。'
                  },
                  {
                    label: '改写',
                    intent: 'rewrite',
                    text: '请按照我的要求改写选中文案：'
                  }
                ].map((action) => (
                  <Button
                    key={action.label}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setIntent(action.intent as 'explain' | 'rewrite')
                      setQuestion(action.text)
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
              <Field label="本次操作">
                <select
                  disabled={busy}
                  value={intent}
                  onChange={(e) => setIntent(e.target.value as typeof intent)}
                >
                  <option value="explain">提问 / 理解选区</option>
                  <option value="rewrite">生成选区修改建议</option>
                </select>
              </Field>
              <Field label="你想问什么或怎样修改">
                <textarea
                  disabled={busy}
                  rows={3}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="例如：这个判断的依据是什么？或：把未知信息改为待验证假设。"
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  busy ||
                  p.archived ||
                  !store.agent.connected ||
                  !question.trim()
                }
              >
                {busy
                  ? '处理中…'
                  : intent === 'explain'
                    ? '发送问题'
                    : '生成修改建议'}
              </Button>
              {!store.agent.connected && (
                <p className="pm-muted">模型服务未连接，请在设置中检查。</p>
              )}
            </form>
            {proposals
              .filter(
                (x) =>
                  x.selection.version === version &&
                  x.selection.blockId === selected.blockId
              )
              .map((x) => (
                <Button
                  key={x.id}
                  onClick={() => {
                    setOpen(false)
                    setProposalId(x.id)
                  }}
                >
                  查看修改对照 ·{' '}
                  {x.status === 'pending'
                    ? '待采纳'
                    : x.status === 'accepted'
                      ? '已采纳'
                      : '已拒绝'}
                </Button>
              ))}
          </div>
        )}
      </Modal>
      <Modal
        wide
        open={!!proposal}
        onClose={() => setProposalId(null)}
        title={`修改对照 · ${proposal?.selection.title || ''}`}
      >
        {proposal && (
          <div className="pm-form">
            <p>修改要求：{proposal.request}</p>
            <p>
              基于报告 v{proposal.selection.version}，当前为 v
              {artifact.revisions.at(-1)!.version}
              。仅替换选中的内容，采纳后生成草稿版本；后续已确认报告需复核。
            </p>
            <div className="pm-compare">
              <section>
                <h3>原文</h3>
                <Markdown>{proposal.selection.quote}</Markdown>
              </section>
              <section>
                <h3>建议替换内容</h3>
                <Markdown>{proposal.replacement}</Markdown>
              </section>
            </div>
            <p className="pm-muted">
              参考资料：
              {proposal.sourceRefs.length
                ? proposal.sourceRefs
                    .map(
                      (r) =>
                        `${p.sources.find((s) => s.id === r.id)?.title || r.id} v${r.version}`
                    )
                    .join('；')
                : '无关联资料，请核对事实依据'}
            </p>
            {dirty && (
              <p className="pm-warning-note">
                有未保存的正文草稿，请先保存再处理建议。
              </p>
            )}
            {proposal.status === 'pending' &&
              proposal.selection.version !==
                artifact.revisions.at(-1)!.version && (
                <p className="pm-warning-note">
                  报告已更新，旧建议不能直接采纳。请保留此建议，基于当前版本重新提出修改。
                </p>
              )}
            {proposal.status === 'pending' ? (
              <div className="pm-actions">
                <Button
                  disabled={p.archived || busy}
                  onClick={async () => {
                    if (
                      await store.project(p.id, (q) =>
                        rejectReportProposal(q, proposal.id)
                      )
                    ) {
                      setProposalId(null)
                      toast.success('已拒绝建议，正文保持不变')
                    }
                  }}
                >
                  拒绝建议
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    dirty ||
                    p.archived ||
                    busy ||
                    proposal.selection.version !==
                      artifact.revisions.at(-1)!.version
                  }
                  onClick={() => accept(proposal)}
                >
                  采纳并保存新版本
                </Button>
              </div>
            ) : (
              <p>
                {proposal.status === 'accepted'
                  ? `已采纳为 v${proposal.appliedVersion}`
                  : '已拒绝，正文未修改'}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
