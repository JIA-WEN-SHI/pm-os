const { test } = require('node:test')
const assert = require('node:assert/strict')
const d = require('../src/features/pm/domain.ts')
const draft = () => ({
  inputs: ['目标用户与场景', '已有事实和材料', '希望验证的问题'],
  sourceIds: [],
  criteria: [
    {
      id: 'coverage',
      label: '完整性',
      target: '三个输出章节齐全',
      method: '核对目录'
    }
  ]
})
test('remote plan updates preserve a dirty editor and keep its stale-write protection', () => {
  const editor = {
    baseVersion: 1,
    baseDraft: draft(),
    draft: { ...draft(), inputs: ['未保存的长输入', '材料', '问题'] }
  }
  const updated = d.reconcileStageEditor(
    editor,
    { ...draft(), inputs: ['另一窗口的修改', '材料', '问题'] },
    2
  )
  assert.deepEqual(updated, editor)
  const clean = { baseVersion: 1, baseDraft: draft(), draft: draft() }
  assert.equal(d.reconcileStageEditor(clean, draft(), 2).baseVersion, 2)
})
function project() {
  return d.createProject({ name: '个人项目', goal: '整理作品集' })
}
function planned(p, i = 0) {
  p = d.saveStageDraft(p, i, draft(), 0)
  return d.confirmStagePlan(p, i, 1)
}
function report(p, i = 0) {
  return {
    ...p,
    artifacts: [
      ...p.artifacts,
      {
        id: `a${i}`,
        title: '成果',
        stage: i,
        status: 'review',
        sourceIds: [],
        stagePlanSignature: d.stagePlanSignature(p, i),
        revisions: [{ version: 1, content: '真实产出', at: '2026-09-24' }]
      }
    ]
  }
}
function accepted(p, i = 0) {
  return d.acceptStage(
    p,
    i,
    [{ id: `a${i}`, title: '成果', version: 1 }],
    [
      {
        criterionId: 'coverage',
        evidence: '成果第 1–3 节已逐项核对',
        passed: true
      }
    ],
    d.stagePlanSignature(p, i)
  )
}

test('stage execution requires confirmed inputs and criteria; legacy completion cannot unlock stages', () => {
  let p = project()
  p.stageStates.fill('已确认')
  assert.match(d.stageRunBlock(p, 0), /确认/)
  assert.match(d.stageRunBlock(p, 1), /S1/)
  p = planned(p)
  assert.equal(d.stageRunBlock(p, 0), '')
  assert.match(d.stageRunBlock(p, 1), /S1/)
  assert.throws(() => d.confirmStagePlan(p, 1, 0), /S1/)
})
test('invalid or blank stage inputs and metric definitions cannot be confirmed', () => {
  let p = d.saveStageDraft(
    project(),
    0,
    { ...draft(), inputs: ['', '', ''] },
    0
  )
  assert.throws(() => d.confirmStagePlan(p, 0, 1), /输入/)
  p = d.saveStageDraft(p, 0, { ...draft(), criteria: [] }, 1)
  assert.throws(() => d.confirmStagePlan(p, 0, 2), /指标/)
  assert.throws(() => d.saveStageDraft(p, 0, draft(), 1), /更新/)
})
test('output acceptance needs evidence for every criterion and the exact current report version', () => {
  const p = report(planned(project()))
  const refs = [{ id: 'a0', title: '成果', version: 1 }]
  const sig = d.stagePlanSignature(p, 0)
  assert.throws(() => d.acceptStage(p, 0, refs, [], sig), /指标/)
  assert.throws(
    () =>
      d.acceptStage(
        p,
        0,
        refs,
        [{ criterionId: 'coverage', passed: true, evidence: ' ' }],
        sig
      ),
    /依据/
  )
  assert.throws(
    () =>
      d.acceptStage(
        p,
        0,
        [{ ...refs[0], version: 2 }],
        [{ criterionId: 'coverage', passed: true, evidence: '核对' }],
        sig
      ),
    /版本/
  )
  const next = accepted(p)
  assert.equal(d.stageAccepted(next, 0), true)
  assert.equal(next.stage, 1)
  assert.equal(next.artifacts[0].status, 'approved')
  assert.match(d.stageRunBlock(next, 1), /确认/)
})
test('source changes and upstream report revisions invalidate downstream permission', () => {
  let p = project()
  p.sources = [
    { id: 's', title: '访谈', content: '旧材料', kind: 'text', at: 'now' }
  ]
  p = d.saveStageDraft(p, 0, { ...draft(), sourceIds: ['s'] }, 0)
  p = d.confirmStagePlan(p, 0, 1)
  p = accepted(report(p))
  p = planned(p, 1)
  assert.equal(d.stageRunBlock(p, 1), '')
  const edited = structuredClone(p)
  edited.sources[0].content = '新材料'
  assert.equal(d.stageAccepted(edited, 0), false)
  assert.match(d.stageRunBlock(edited, 1), /S1/)
  const revised = structuredClone(p)
  revised.artifacts[0] = d.reviseArtifact(revised.artifacts[0], '修订', 1)
  assert.equal(d.stageAccepted(revised, 0), false)
  assert.match(d.stageRunBlock(revised, 1), /S1/)
})
test('changing a confirmed plan rejects old generation and stale review', () => {
  let p = report(planned(project()))
  const oldSig = d.stagePlanSignature(p, 0)
  p = d.saveStageDraft(
    p,
    0,
    { ...draft(), inputs: ['新场景', '新资料', '新问题'] },
    1
  )
  p = d.confirmStagePlan(p, 0, 2)
  assert.throws(
    () =>
      d.acceptStage(
        p,
        0,
        [{ id: 'a0', title: '成果', version: 1 }],
        [{ criterionId: 'coverage', passed: true, evidence: '已核对' }],
        oldSig
      ),
    /变化/
  )
  assert.throws(() => accepted(p), /旧.*约定/)
})
test('backup round trips stage plans and rejects malformed stage data', () => {
  const p = accepted(report(planned(project())))
  const w = { schema: 1, projects: [p], skills: [], knowledge: [] }
  assert.equal(
    d.stageAccepted(
      d.validateBackup(JSON.parse(JSON.stringify(w))).projects[0],
      0
    ),
    true
  )
  const bad = structuredClone(w)
  bad.projects[0].stageWork['0'].criteria = 'bad'
  assert.throws(() => d.validateBackup(bad), /备份/)
})
