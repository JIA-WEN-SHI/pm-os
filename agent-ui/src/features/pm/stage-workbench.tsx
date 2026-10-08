'use client'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  LockKeyhole,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  ArtifactRef,
  Project,
  StageCheck,
  StageDraft,
  StageWork
} from './model'
import {
  acceptStage,
  activeStage,
  confirmStagePlan,
  saveStageDraft,
  reconcileStageEditor,
  restoreStageEditor,
  stageAccepted,
  stagePlanSignature,
  stageRunBlock,
  stageSequenceBlock,
  stageState,
  uid
} from './domain'
import { defaultStageDraft, stageContracts } from './stage-catalog'
import { stages } from './catalog'
import { usePM } from './provider'
import { HandoffPanel, IncomingHandoff } from './handoff-panel'
import { Badge, Button, Card, Field, type Navigate } from './ui'
import { DiscoveryWorkbench } from './discovery-workbench'

export function StageWorkbench({
  p,
  index,
  navigate
}: {
  p: Project
  index: number
  navigate: Navigate
}) {
  const store = usePM()
  const work = p.stageWork?.[index]
  return (
    <DiscoveryWorkbench
      key={`${p.id}-${index}`}
      index={index}
      p={p}
      navigate={navigate}
      review={
        <>
          <StageReview
            key={`${stagePlanSignature(p, index)}-${JSON.stringify(p.artifacts)}`}
            p={p}
            index={index}
            navigate={navigate}
            disabled={!!store.busy[p.id] || !!stageRunBlock(p, index)}
          />
          <HandoffPanel p={p} index={index} disabled={!!store.busy[p.id]} />
        </>
      }
      details={
        <StageEditor
          key={`${p.id}-${index}`}
          p={p}
          index={index}
          work={work}
          navigate={navigate}
          busy={!!store.busy[p.id]}
        />
      }
    />
  )
}
function StageEditor({
  p,
  index,
  work,
  navigate,
  busy
}: {
  p: Project
  index: number
  work?: StageWork
  navigate: Navigate
  busy: boolean
}) {
  const store = usePM()
  const initial = work
    ? {
        inputs: work.inputs,
        sourceIds: work.sourceIds,
        criteria: work.criteria
      }
    : defaultStageDraft(index)
  const draftKey = `pmos.stage-draft.${p.id}.${index}`
  const [editor, setEditor] = useState(() => {
    try {
      return restoreStageEditor(
        sessionStorage.getItem(draftKey),
        initial,
        work?.version || 0
      )
    } catch {
      return restoreStageEditor(null, initial, work?.version || 0)
    }
  })
  const draft = editor.draft
  const setDraft = (change: (d: StageDraft) => StageDraft) =>
    setEditor((e) => ({ ...e, draft: change(e.draft) }))
  const [skill, setSkill] = useState(p.skillId || `method-${index}`)
  const dirty = JSON.stringify(draft) !== JSON.stringify(editor.baseDraft)
  const conflict = editor.baseVersion !== (work?.version || 0)
  useEffect(() => {
    const incoming = work
      ? {
          inputs: work.inputs,
          sourceIds: work.sourceIds,
          criteria: work.criteria
        }
      : defaultStageDraft(index)
    setEditor((e) => reconcileStageEditor(e, incoming, work?.version || 0))
  }, [work, index])
  useEffect(() => {
    try {
      if (dirty) sessionStorage.setItem(draftKey, JSON.stringify(editor))
      else sessionStorage.removeItem(draftKey)
    } catch {
      toast.error('阶段草稿未能暂存，请先保存草稿或复制内容')
    }
  }, [editor, dirty, draftKey])
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  const contract = stageContracts[index]
  const sequenceBlock = stageSequenceBlock(p, index)
  const runBlock = stageRunBlock(p, index)
  const accepted = stageAccepted(p, index)
  const confirmed = !runBlock
  const disabled = p.archived || busy
  const currentSignature = stagePlanSignature(p, index)
  const save = async (confirm = false) => {
    let savedVersion = editor.baseVersion
    const ok = await store.project(p.id, (q) => {
      if ((q.stageWork?.[index]?.version || 0) !== editor.baseVersion)
        throw new Error('另一窗口已更新约定，当前草稿已保留，请先处理版本冲突')
      let next =
        dirty || !work ? saveStageDraft(q, index, draft, editor.baseVersion) : q
      savedVersion = next.stageWork![index].version
      if (confirm) next = confirmStagePlan(next, index, savedVersion)
      return next
    })
    if (ok) setEditor({ baseVersion: savedVersion, baseDraft: draft, draft })
    return ok
  }
  const lastRun = p.runs.find((r) => r.stage === index && r.taskId)
  const updateMetric = (
    id: string,
    key: 'label' | 'target' | 'method',
    value: string
  ) =>
    setDraft((d) => ({
      ...d,
      criteria: d.criteria.map((c) =>
        c.id === id ? { ...c, [key]: value } : c
      )
    }))
  const start = async () => {
    const id = uid()
    if (
      !(await store.project(p.id, (q) => {
        const block = stageRunBlock(q, index)
        if (block) throw new Error(block)
        return {
          ...q,
          tasks: [
            ...q.tasks,
            {
              id,
              title: `S${index + 1} · ${stages[index].outputs[0]}`,
              goal: `${stages[index].prompt}\n请输出：${contract.output}\n末尾逐项列出验收指标对应的章节、证据与尚未满足的部分，等待用户验收。`,
              stage: index,
              status: 'todo',
              sourceIds: q.stageWork![index].sourceIds,
              skillId: skill
            }
          ]
        }
      }))
    )
      return
    await store.run(p.id, {
      taskId: id,
      stage: index,
      sourceIds: draft.sourceIds,
      skillId: skill,
      message: `${stages[index].prompt}\n产出：${contract.output}\n附指标对应章节及缺口，等待用户验收。`
    })
  }
  return (
    <div className="pm-workbench">
      <IncomingHandoff p={p} index={index} navigate={navigate} />
      {conflict && (
        <div className="pm-gate-banner">
          <div className="pm-grow">
            <strong>另一窗口已更新阶段约定，你的草稿已保留</strong>
            <p>请比较最新约定后选择如何继续。处理冲突前不能生成或验收成果。</p>
          </div>
          <Button
            onClick={() =>
              setEditor({
                baseVersion: work?.version || 0,
                baseDraft: initial,
                draft
              })
            }
          >
            保留我的草稿继续编辑
          </Button>
          <Button
            onClick={() =>
              setEditor({
                baseVersion: work?.version || 0,
                baseDraft: initial,
                draft: initial
              })
            }
          >
            放弃草稿并加载最新约定
          </Button>
        </div>
      )}
      <div className="pm-gate-banner">
        {sequenceBlock ? <LockKeyhole size={22} /> : <CheckCircle2 size={22} />}
        <div className="pm-grow">
          <strong>{stageState(p, index)}</strong>
          <p>
            {sequenceBlock ||
              (accepted
                ? '本阶段已由你验收。下一阶段仍需单独确认输入和指标。'
                : '先约定什么算完成，再让 Agent 工作；成果经你逐项验收后才解锁下一阶段。')}
          </p>
        </div>
        {sequenceBlock && (
          <Button
            onClick={() =>
              navigate('workflow', p.id, undefined, activeStage(p))
            }
          >
            返回 S{activeStage(p) + 1}
          </Button>
        )}
      </div>
      <div className="pm-work-steps">
        {['填写输入', '确认指标', 'Agent 产出', '验收并继续'].map((s, i) => (
          <span key={s}>
            <b>{i + 1}</b>
            {s}
          </span>
        ))}
      </div>
      <div className="pm-two-columns">
        <Card
          title="01 · 你输入什么"
          extra={<Badge>{work ? `约定 v${work.version}` : '待填写'}</Badge>}
        >
          <div className="pm-form">
            {contract.fields.map(([label, hint], i) => (
              <Field key={label} label={label} hint={hint}>
                <textarea
                  rows={3}
                  value={draft.inputs[i]}
                  disabled={disabled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      inputs: d.inputs.map((v, j) =>
                        j === i ? e.target.value : v
                      )
                    }))
                  }
                />
              </Field>
            ))}
            <div>
              <h3 className="pm-field-label">本阶段使用的资料</h3>
              <p className="pm-muted">
                已验收的上游成果自动带入。外部链接需先在资料库补充正文。
              </p>
              <div className="pm-source-picker">
                {p.sources.map((s) => (
                  <label key={s.id}>
                    <input
                      type="checkbox"
                      checked={draft.sourceIds.includes(s.id)}
                      disabled={disabled}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          sourceIds: e.target.checked
                            ? [...d.sourceIds, s.id]
                            : d.sourceIds.filter((id) => id !== s.id)
                        }))
                      }
                    />
                    <span className="pm-grow">{s.title}</span>
                    <small>{s.content.trim() ? '有正文' : '待补正文'}</small>
                  </label>
                ))}
              </div>
              <Button onClick={() => navigate('sources', p.id)}>
                管理资料
              </Button>
            </div>
          </div>
        </Card>
        <div>
          <Card title="Agent 怎么处理">
            <ol className="pm-process-list">
              {contract.process.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="pm-card-pad pm-muted">
              按已确认的输入、指标及所选 Skill
              整理分析；缺少材料会标注缺口，不会自动补成事实。
            </p>
          </Card>
          <Card title="你会得到什么">
            <div className="pm-card-pad">
              <FileText size={24} className="pm-blue" />
              <h3>{stages[index].outputs.join(' · ')}</h3>
              <p>{contract.output}</p>
              <div className="pm-work-note">
                保存为可编辑、可追溯版本的阶段成果。此处产出文档，不代表已自动执行真实用户测试、部署或发布。
              </div>
            </div>
          </Card>
          <Card title="推进规则">
            <div className="pm-card-pad">
              <p>① 你确认输入与指标，才可启动生成。</p>
              <p>② Agent 生成后停在待验收。</p>
              <p>③ 你核对成果、填写依据并确认，才解锁下一阶段。</p>
              <p className="pm-muted">
                修改约定、引用资料或已验收版本后，需要重新确认。右侧对话继续保留，用于讨论与修改建议。
              </p>
            </div>
          </Card>
        </div>
      </div>
      <Card
        title="02 · 什么算完成？先由你确认指标"
        extra={
          <Badge status={confirmed && !dirty ? 'approved' : 'review'}>
            {confirmed && !dirty ? '指标已确认' : '等待你确认'}
          </Badge>
        }
      >
        <div className="pm-card-pad">
          <p className="pm-muted">
            以下为建议指标，可直接修改或增删。所有保留的指标都必须达标；这是人工核验标准，系统不会自动判断真实性。
          </p>
          <div className="pm-metric-list">
            {draft.criteria.map((c, i) => (
              <div className="pm-metric-editor" key={c.id}>
                <div className="pm-metric-title">
                  <b>M{String(i + 1).padStart(2, '0')}</b>
                  <Field label={`指标 ${i + 1} 名称`}>
                    <input
                      disabled={disabled}
                      value={c.label}
                      onChange={(e) =>
                        updateMetric(c.id, 'label', e.target.value)
                      }
                    />
                  </Field>
                  <Button
                    aria-label={`删除指标 ${i + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        criteria: d.criteria.filter((k) => k.id !== c.id)
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="pm-two-columns">
                  <Field label={`指标 ${i + 1} 达标要求`}>
                    <textarea
                      rows={2}
                      disabled={disabled}
                      value={c.target}
                      onChange={(e) =>
                        updateMetric(c.id, 'target', e.target.value)
                      }
                    />
                  </Field>
                  <Field label={`指标 ${i + 1} 核验方式`}>
                    <textarea
                      rows={2}
                      disabled={disabled}
                      value={c.method}
                      onChange={(e) =>
                        updateMetric(c.id, 'method', e.target.value)
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <Button
            disabled={disabled}
            onClick={() =>
              setDraft((d) => ({
                ...d,
                criteria: [
                  ...d.criteria,
                  { id: uid(), label: '', target: '', method: '' }
                ]
              }))
            }
          >
            <Plus size={16} />
            添加指标
          </Button>
          <div className="pm-gate-actions">
            <div className="pm-grow">
              <strong>
                {dirty
                  ? '有未保存的输入或指标'
                  : confirmed
                    ? `你已确认约定 v${work?.version}`
                    : '确认后仅解锁生成，不会自动调用模型'}
              </strong>
              <p className="pm-muted">
                保存修改会撤销原约定的确认，后续成果需按新约定重新验收。
              </p>
            </div>
            <Button
              disabled={disabled || conflict || (!dirty && !!work)}
              onClick={async () => {
                if (await save()) toast.success('输入和指标草稿已保存')
              }}
            >
              <Save size={16} />
              保存草稿
            </Button>
            <Button
              variant="primary"
              disabled={
                disabled || conflict || !!sequenceBlock || (confirmed && !dirty)
              }
              onClick={async () => {
                const ok = await save(true)
                if (ok)
                  toast.success('输入与验收指标已确认，现在可以启动 Agent')
              }}
            >
              确认输入与指标 <CheckCircle2 size={16} />
            </Button>
          </div>
        </div>
      </Card>
      <Card title="03 · 按约定让 Agent 产出">
        <div className="pm-card-pad">
          <div className="pm-gate-actions">
            <Field label="本阶段工作方法 / Skill">
              <select
                value={skill}
                disabled={disabled}
                onChange={(e) => setSkill(e.target.value)}
              >
                <option value="">通用分析</option>
                {store.data.skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · v{s.version}
                  </option>
                ))}
              </select>
            </Field>
            <div className="pm-grow">
              <strong>{store.agent.model}</strong>
              <p className="pm-muted">
                使用已配置的模型；生成结果自动保存为待验收成果。
              </p>
            </div>
            <Button
              variant="primary"
              disabled={disabled || conflict || !!runBlock || dirty}
              onClick={() => void start()}
            >
              <Play size={16} />
              {busy ? 'Agent 正在生成…' : '启动 Agent 生成成果'}
            </Button>
          </div>
          {(runBlock || dirty) && (
            <p className="pm-muted">
              {dirty ? '请先保存并确认修改后的输入与指标。' : runBlock}
            </p>
          )}
          {busy && (
            <div className="pm-stream-preview">
              {store.streaming[p.id] || '等待模型返回内容…'}
            </div>
          )}
          {!busy && lastRun?.status === 'failed' && (
            <div className="pm-error-note">
              <strong>本次生成未完成</strong>
              <p>{lastRun.error}</p>
              <Button onClick={() => navigate('runs', p.id, lastRun.id)}>
                查看失败记录
              </Button>
              <p>未保存为阶段成果，也未放行下一步。处理原因后可重新生成。</p>
            </div>
          )}
        </div>
      </Card>
      <StageReview
        key={`${currentSignature}-${JSON.stringify(p.artifacts.filter((a) => a.stage === index).map((a) => [a.id, a.revisions.at(-1)?.version]))}`}
        p={p}
        index={index}
        navigate={navigate}
        disabled={disabled || conflict || dirty || !!runBlock}
      />
      <HandoffPanel
        p={p}
        index={index}
        disabled={disabled || conflict || dirty}
      />
    </div>
  )
}
export function StageReview({
  p,
  index,
  navigate,
  disabled
}: {
  p: Project
  index: number
  navigate: Navigate
  disabled: boolean
}) {
  const store = usePM()
  const work = p.stageWork?.[index]
  const done = stageAccepted(p, index)
  const [selected, setSelected] = useState<ArtifactRef[]>(
    done ? work!.acceptance!.artifactRefs : []
  )
  const [checks, setChecks] = useState<StageCheck[]>(
    done ? work!.acceptance!.checks : []
  )
  const artifacts = p.artifacts.filter((a) => a.stage === index)
  const eligible = artifacts.filter(
    (a) =>
      !a.stagePlanSignature ||
      a.stagePlanSignature === stagePlanSignature(p, index)
  )
  const signature = stagePlanSignature(p, index)
  const setCheck = (id: string, change: Partial<StageCheck>) =>
    setChecks((values) => {
      const old = values.find((v) => v.criterionId === id) || {
        criterionId: id,
        passed: false,
        evidence: ''
      }
      return [
        ...values.filter((v) => v.criterionId !== id),
        { ...old, ...change }
      ]
    })
  const canAccept =
    selected.length > 0 &&
    !!work?.criteria.length &&
    work.criteria.every((c) =>
      checks.some(
        (k) => k.criterionId === c.id && k.passed && k.evidence.trim()
      )
    )
  return (
    <Card
      title="04 · 你验收成果，再进入下一步"
      extra={
        <Badge status={done ? 'approved' : 'review'}>
          {done ? '已验收' : '等待人工验收'}
        </Badge>
      }
    >
      <div className="pm-card-pad">
        <p>
          先打开成果核对内容，再勾选要验收的版本，并为每项指标填写核验依据。不达标时保留未勾选，编辑成果或重新生成。
        </p>
        {!artifacts.length && (
          <div className="pm-work-note">
            <Sparkles size={18} /> Agent
            完成后，成果与验收清单会集中显示在这里。
          </div>
        )}
        {artifacts.map((a) => {
          const ref = {
            id: a.id,
            title: a.title,
            version: a.revisions.at(-1)!.version
          }
          const available = eligible.some((x) => x.id === a.id)
          return (
            <div className="pm-review-artifact" key={a.id}>
              <label>
                <input
                  type="checkbox"
                  disabled={disabled || done || !available}
                  checked={selected.some((r) => r.id === a.id)}
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, ref]
                        : selected.filter((r) => r.id !== a.id)
                    )
                    setChecks([])
                  }}
                />
                <span>
                  {a.title} · v{ref.version}
                </span>
              </label>
              {!available && <small>基于旧约定，请重新生成</small>}
              <Button onClick={() => navigate('artifacts', p.id, a.id)}>
                打开成果
              </Button>
            </div>
          )
        })}
        {!!work?.criteria.length && (
          <div className="pm-review-checks">
            {work.criteria.map((c, i) => {
              const check = checks.find((k) => k.criterionId === c.id)
              return (
                <div key={c.id} className="pm-review-check">
                  <label>
                    <input
                      type="checkbox"
                      checked={check?.passed || false}
                      disabled={disabled || done || !selected.length}
                      onChange={(e) =>
                        setCheck(c.id, { passed: e.target.checked })
                      }
                    />
                    <strong>
                      M{i + 1} · {c.label}：我已核验达标
                    </strong>
                  </label>
                  <p>{c.target}</p>
                  <small>核验方式：{c.method}</small>
                  <Field label={`指标 ${i + 1} 核验依据`}>
                    <textarea
                      rows={2}
                      placeholder="例如：研究简报第 2 节，3 条发现均已核对来源。填写实测结果时请说明样本与记录位置。"
                      value={check?.evidence || ''}
                      disabled={disabled || done || !selected.length}
                      onChange={(e) =>
                        setCheck(c.id, { evidence: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )
            })}
          </div>
        )}
        <div className="pm-gate-actions">
          <p className="pm-muted pm-grow">
            {done
              ? `验收时间：${new Date(work!.acceptance!.at).toLocaleString('zh-CN')}`
              : '所有指标达标且有核验依据后可确认。确认会保存成果版本与验收记录。'}
          </p>
          {done ? (
            <Button
              variant="primary"
              onClick={() =>
                navigate(
                  index < 7 ? 'workflow' : 'artifacts',
                  p.id,
                  undefined,
                  index < 7 ? index + 1 : undefined
                )
              }
            >
              {index < 7 ? `进入 S${index + 2}` : '查看全部成果'}
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={disabled || !canAccept}
              onClick={async () => {
                if (
                  await store.project(p.id, (q) =>
                    acceptStage(q, index, selected, checks, signature)
                  )
                ) {
                  toast.success(
                    index === 7
                      ? '八个阶段均已验收，项目成果已归档在交付物中'
                      : `S${index + 1} 已验收，S${index + 2} 已解锁`
                  )
                  navigate(
                    index < 7 ? 'workflow' : 'artifacts',
                    p.id,
                    undefined,
                    index < 7 ? index + 1 : undefined
                  )
                }
              }}
            >
              {index < 7
                ? `确认成果并进入 S${index + 2}`
                : '确认成果并完成本项目'}
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
