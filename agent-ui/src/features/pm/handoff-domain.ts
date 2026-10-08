import type { Project, HandoffFields, HandoffRevision } from './model'
import { now, uid, stageAccepted } from './domain.ts'
import { handoffForStage, handoffFresh, handoffFields } from './handoff-core.ts'
import { sourceVersions } from './source-domain.ts'

export function saveHandoff(
  p: Project,
  stage: number,
  fields: HandoffFields,
  expectedVersion: number
): Project {
  if (p.archived) throw new Error('项目已归档')
  if (!Number.isInteger(stage) || stage < 0 || stage > 6)
    throw new Error('该阶段没有下一阶段交接')
  if (!stageAccepted(p, stage))
    throw new Error('请先完成本阶段成果验收，再整理交接卡')
  const h = handoffForStage(p, stage)
  if ((h?.revisions.at(-1)?.version || 0) !== expectedVersion)
    throw new Error('交接卡版本已更新，当前输入已保留，请重新比较')
  if (!handoffFields.every((k) => typeof fields[k] === 'string'))
    throw new Error('交接内容无效')
  const w = p.stageWork![stage],
    a = w.acceptance!
  const ids = [
    ...new Set([
      ...w.sourceIds,
      ...a.artifactRefs.flatMap(
        (ref) => p.artifacts.find((a) => a.id === ref.id)!.sourceIds
      )
    ])
  ]
  const sourceRefs = ids.map((id) => {
    const s = p.sources.find((s) => s.id === id)
    if (!s) throw new Error('关联资料缺失，请先补齐引用')
    return { id, version: sourceVersions(s, p.demo).at(-1)!.version }
  })
  const r: HandoffRevision = {
    ...fields,
    version: expectedVersion + 1,
    at: now(),
    acceptanceId: a.id,
    planSignature: w.confirmedSignature!,
    projectScope: [p.name, p.goal, p.audience],
    artifactRefs: a.artifactRefs.map((ref) => ({ ...ref })),
    sourceRefs
  }
  const next = h
    ? { ...h, revisions: [...h.revisions, r] }
    : { id: uid(), fromStage: stage, toStage: stage + 1, revisions: [r] }
  return {
    ...p,
    handoffs: h
      ? p.handoffs!.map((old) => (old.id === h.id ? next : old))
      : [...(p.handoffs || []), next]
  }
}
export function confirmHandoff(
  p: Project,
  stage: number,
  expectedVersion: number
): Project {
  const h = handoffForStage(p, stage),
    r = h?.revisions.at(-1)
  if (p.archived) throw new Error('项目已归档')
  if (!h || !r || r.version !== expectedVersion || r.approvedAt)
    throw new Error('交接卡版本已更新或已经确认')
  if (!handoffFresh(p, r, stage))
    throw new Error('交接依据已变化，请重新保存草稿后确认')
  if (!handoffFields.every((k) => r[k].trim()))
    throw new Error('请完整填写交接内容；未知写待补充，没有的项目明确写无')
  return {
    ...p,
    handoffs: p.handoffs!.map((x) =>
      x.id === h.id
        ? {
            ...x,
            revisions: x.revisions.map((v) =>
              v.version === r.version ? { ...v, approvedAt: now() } : v
            )
          }
        : x
    ),
    artifacts: p.artifacts.map((a) =>
      a.stage > stage && a.status === 'approved' ? { ...a, status: 'stale' } : a
    ),
    tasks: p.tasks.map((t) =>
      t.stage > stage && t.status === 'done' ? { ...t, status: 'review' } : t
    )
  }
}
