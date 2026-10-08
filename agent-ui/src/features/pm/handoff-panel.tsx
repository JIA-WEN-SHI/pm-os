'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Project, HandoffFields, HandoffRevision } from './model'
import {
  handoffForStage,
  approvedHandoff,
  handoffFresh,
  handoffFields
} from './handoff-core'
import { saveHandoff, confirmHandoff } from './handoff-domain'
import { stageAccepted, downloadText } from './domain'
import { usePM } from './provider'
import { Button, Card, Field, type Navigate } from './ui'
import { toast } from 'sonner'

const labels: Record<keyof HandoffFields, string> = {
  summary: '发现与结论摘要',
  scope: '适用范围与资料性质',
  constraints: '必须遵守的限制与决策',
  assumptions: '仍需验证的假设',
  openQuestions: '开放问题、影响与处理人',
  nextActions: '下一阶段要完成什么'
}
const fieldsOf = (r?: HandoffRevision): HandoffFields =>
  Object.fromEntries(
    handoffFields.map((k) => [k, r?.[k] || ''])
  ) as unknown as HandoffFields

function ReadHandoff({ r }: { r: HandoffRevision }) {
  return (
    <>
      <p className="pm-muted">
        交接卡 v{r.version} · {r.approvedAt ? '用户已确认' : '草稿，尚未确认'}
        。确认不等于假设已被证实。
      </p>
      {handoffFields.map((k) => (
        <div key={k}>
          <strong>{labels[k]}</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>{r[k] || '待补充'}</p>
        </div>
      ))}
      <p className="pm-muted">
        报告依据：
        {r.artifactRefs.map((a) => `${a.title} v${a.version}`).join('、')}
        。固定资料：
        {r.sourceRefs.length
          ? r.sourceRefs.map((s) => `${s.id} v${s.version}`).join('、')
          : '未附加资料'}
        。
      </p>
    </>
  )
}

export function IncomingHandoff({
  p,
  index,
  navigate
}: {
  p: Project
  index: number
  navigate: Navigate
}) {
  if (!index) return null
  const h = handoffForStage(p, index - 1),
    r = approvedHandoff(p, index - 1),
    valid = !!r && handoffFresh(p, r, index - 1)
  return (
    <Card title={`上游交接 · S${index} → S${index + 1}`}>
      <div className="pm-card-pad pm-form">
        {!h ? (
          <p className="pm-muted">
            尚未建立交接卡，当前沿用已验收报告作为上游输入。可返回上一阶段整理并确认交接卡，明确限制和待解决问题。
          </p>
        ) : !r ? (
          <p className="pm-error-note">
            上游交接卡尚未确认，暂不能启动本阶段任务。
          </p>
        ) : (
          <>
            <p className={valid ? 'pm-muted' : 'pm-error-note'}>
              {valid
                ? '本阶段运行会引用此确认版本，并记录在输入快照中。'
                : '上游依据已变化，此交接卡需要复核；请返回上一阶段更新后再运行。'}
            </p>
            <ReadHandoff r={r} />
          </>
        )}
        <Button
          onClick={() => navigate('workflow', p.id, undefined, index - 1)}
        >
          查看上一阶段交接
        </Button>
      </div>
    </Card>
  )
}

export function HandoffPanel({
  p,
  index,
  disabled: externalDisabled
}: {
  p: Project
  index: number
  disabled: boolean
}) {
  const store = usePM(),
    h = handoffForStage(p, index),
    latest = h?.revisions.at(-1)
  const key = `pmos.handoff-draft.${p.id}.${index}`
  const [submitting, setSubmitting] = useState(false)
  const disabled = externalDisabled || submitting
  const incoming = useMemo(() => fieldsOf(latest), [latest]),
    version = latest?.version || 0
  const [editor, setEditor] = useState(() => {
    const initial = { version, base: incoming, fields: incoming }
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null')
      if (
        c &&
        Number.isInteger(c.version) &&
        c.version >= 0 &&
        handoffFields.every(
          (k) =>
            typeof c.base?.[k] === 'string' && typeof c.fields?.[k] === 'string'
        )
      )
        return c as typeof initial
    } catch {}
    return initial
  })
  const dirty = JSON.stringify(editor.fields) !== JSON.stringify(editor.base),
    conflict = editor.version !== version
  useEffect(() => {
    if (!dirty) setEditor({ version, base: incoming, fields: incoming })
  }, [version, dirty, incoming])
  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(key, JSON.stringify(editor))
      else sessionStorage.removeItem(key)
    } catch {
      toast.error('交接草稿未能暂存，请先保存或复制内容')
    }
  }, [editor, dirty, key])
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  if (index === 7) return null
  const accepted = stageAccepted(p, index),
    effective = approvedHandoff(p, index),
    fresh = !!latest && handoffFresh(p, latest, index)
  return (
    <Card title={`05 · 交接给 S${index + 2}`}>
      <div className="pm-card-pad pm-form">
        <p>
          把已验收报告整理成下一阶段能使用的交接说明。保存草稿会固定当前验收报告与资料版本；确认后才进入下游上下文。没有的信息写“待补充”，没有的事项明确写“无”。
        </p>
        {!accepted && (
          <p className="pm-error-note">
            请先完成本阶段成果验收，再保存或确认交接卡。
          </p>
        )}
        {latest && (
          <p className={fresh ? 'pm-muted' : 'pm-error-note'}>
            最新交接 v{version} · {latest.approvedAt ? '已确认' : '待确认'} ·{' '}
            {fresh ? '依据未变化' : '依据已变化，重新验收后保存新版交接'}
            {effective && effective.version !== version
              ? `；下游仍引用已确认 v${effective.version}`
              : ''}
          </p>
        )}
        <p className="pm-muted">
          当前验收报告：
          {p.stageWork?.[index]?.acceptance?.artifactRefs
            .map((a) => `${a.title} v${a.version}`)
            .join('、') || '尚未验收'}
          。
        </p>
        {conflict && (
          <div className="pm-error-note">
            另一窗口已保存新交接版本，当前输入已保留。
            <Button
              onClick={() =>
                downloadText(
                  '交接草稿.json',
                  JSON.stringify(editor.fields, null, 2),
                  'application/json'
                )
              }
            >
              导出当前草稿
            </Button>
            <Button
              onClick={() =>
                setEditor((e) => ({ ...e, version, base: incoming }))
              }
            >
              保留文字，与最新版本合并
            </Button>
          </div>
        )}
        {handoffFields.map((k) => (
          <Field key={k} label={labels[k]}>
            <textarea
              rows={3}
              value={editor.fields[k]}
              disabled={disabled}
              onChange={(e) =>
                setEditor((old) => ({
                  ...old,
                  fields: { ...old.fields, [k]: e.target.value }
                }))
              }
            />
          </Field>
        ))}
        <div className="pm-actions">
          <Button
            disabled={
              disabled || !accepted || conflict || (!dirty && !!latest && fresh)
            }
            onClick={async () => {
              setSubmitting(true)
              try {
                if (
                  await store.project(p.id, (q) =>
                    saveHandoff(q, index, editor.fields, editor.version)
                  )
                ) {
                  setEditor((e) => ({
                    ...e,
                    version: e.version + 1,
                    base: e.fields
                  }))
                  toast.success('交接草稿已保存，尚未确认')
                }
              } finally {
                setSubmitting(false)
              }
            }}
          >
            保存交接草稿
          </Button>
          <Button
            variant="primary"
            disabled={
              disabled ||
              !accepted ||
              dirty ||
              conflict ||
              !latest ||
              !!latest.approvedAt ||
              !fresh
            }
            onClick={async () => {
              setSubmitting(true)
              try {
                if (
                  await store.project(p.id, (q) =>
                    confirmHandoff(q, index, version)
                  )
                )
                  toast.success('交接已确认，下一阶段需按此版本核对输入')
              } finally {
                setSubmitting(false)
              }
            }}
          >
            确认交接 v{version || '—'}
          </Button>
        </div>
        {!!h?.revisions.length && (
          <details>
            <summary>交接历史 · {h.revisions.length} 版</summary>
            {[...h.revisions].reverse().map((r) => (
              <details key={r.version}>
                <summary>
                  v{r.version} · {r.approvedAt ? '已确认' : '历史草稿'}
                </summary>
                <ReadHandoff r={r} />
              </details>
            ))}
          </details>
        )}
      </div>
    </Card>
  )
}
