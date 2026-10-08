const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  createProject,
  reviseArtifact,
  approveArtifact,
  validateBackup,
  createContext,
  persistChange,
  consultedReferences
} = require('../src/features/pm/domain.ts')

test('new projects reject blank goals and never inherit demo material', () => {
  assert.throws(() => createProject({ name: ' ', goal: 'Research' }), /名称/)
  assert.throws(() => createProject({ name: 'Work', goal: '' }), /目标/)
  const project = createProject({ name: ' Work ', goal: 'Research' })
  assert.equal(project.name, 'Work')
  assert.equal(project.demo, false)
  assert.deepEqual(project.sources, [])
  assert.deepEqual(project.artifacts, [])
})

const report = () => ({
  id: 'a1',
  title: 'Report',
  stage: 0,
  status: 'approved',
  sourceIds: [],
  revisions: [
    {
      version: 1,
      content: 'original',
      at: '2026-09-22',
      approvedAt: '2026-09-22'
    }
  ]
})

test('editing an approved report preserves the approved revision', () => {
  const original = report()
  const next = reviseArtifact(original, 'changed', 1)
  assert.equal(original.revisions.length, 1)
  assert.equal(next.revisions[0].content, 'original')
  assert.ok(next.revisions[0].approvedAt)
  assert.equal(next.revisions[1].version, 2)
  assert.equal(next.status, 'draft')
})

test('stale edits and approvals cannot overwrite a newer report', () => {
  const next = reviseArtifact(report(), 'changed', 1)
  assert.throws(() => approveArtifact(next, 1), /版本/)
  assert.throws(() => reviseArtifact(next, 'stale', 1), /版本/)
  assert.equal(approveArtifact(next, 2).status, 'approved')
})

test('backup validation rejects malformed projects before replacing data', () => {
  assert.throws(
    () =>
      validateBackup({
        schema: 1,
        projects: [{ id: 'x' }],
        skills: [],
        knowledge: []
      }),
    /备份/
  )
  const p = createProject({ name: 'Work', goal: 'Research' })
  const data = { schema: 1, projects: [p], skills: [], knowledge: [] }
  assert.equal(validateBackup(data).projects[0].name, 'Work')
  assert.throws(() => validateBackup({ ...data, projects: [p, p] }), /备份/)
})

test('context contains only explicitly selected readable sources of this project', () => {
  const p = createProject({ name: 'One', goal: 'Analyse' })
  p.sources = [
    {
      id: 's1',
      title: 'Selected',
      kind: 'text',
      content: 'visible evidence',
      at: 'now'
    },
    {
      id: 's2',
      title: 'Private unselected',
      kind: 'text',
      content: 'not selected',
      at: 'now'
    },
    {
      id: 's3',
      title: 'Unfetched',
      kind: 'link',
      content: '',
      url: 'https://example.com',
      at: 'now'
    }
  ]
  const context = createContext(p, 'Research', ['s1', 'missing', 's3'])
  assert.match(context, /visible evidence/)
  assert.doesNotMatch(context, /not selected/)
  assert.match(context, /尚无正文/)
})
test('restored source URLs cannot execute code', () => {
  const p = createProject({ name: 'Work', goal: 'Research' })
  p.sources = [
    {
      id: 's1',
      title: 'Unsafe',
      kind: 'link',
      content: '',
      at: 'now',
      url: 'javascript:alert(1)'
    }
  ]
  assert.throws(
    () =>
      validateBackup({ schema: 1, projects: [p], skills: [], knowledge: [] }),
    /备份/
  )
})
test('malformed optional fields are rejected before they reach UI rendering', () => {
  const p = createProject({ name: 'Work', goal: 'Research' })
  p.messages = [
    {
      id: 'm1',
      role: 'assistant',
      content: 'text',
      at: 'now',
      sourceIds: 'bad'
    }
  ]
  assert.throws(
    () =>
      validateBackup({ schema: 1, projects: [p], skills: [], knowledge: [] }),
    /备份/
  )
  p.messages = []
  p.tasks = [
    {
      id: 't1',
      title: 'Task',
      goal: 'Goal',
      stage: 0,
      status: 'failed',
      skillId: '',
      sourceIds: [],
      error: { text: 'invalid' }
    }
  ]
  assert.throws(
    () =>
      validateBackup({ schema: 1, projects: [p], skills: [], knowledge: [] }),
    /备份/
  )
})
test('reconfirmation preserves the original approval and appends an audit entry', () => {
  const a = { ...report(), status: 'stale' }
  const next = approveArtifact(a, 1)
  assert.equal(next.revisions[0].approvedAt, '2026-09-22')
  assert.equal(next.revisions[0].confirmations.length, 2)
})
test('failed revision persistence preserves the base so saving can be retried', () => {
  const p = createProject({ name: 'Work', goal: 'Research' })
  p.artifacts = [report()]
  const base = { schema: 1, projects: [p], skills: [], knowledge: [] }
  const mutation = (w) => ({
    ...w,
    projects: w.projects.map((p) => ({
      ...p,
      artifacts: p.artifacts.map((a) => reviseArtifact(a, 'changed', 1))
    }))
  })
  const failed = persistChange(base, mutation, () => {
    throw new Error('quota')
  })
  assert.equal(failed.saved, false)
  assert.equal(failed.data.projects[0].artifacts[0].revisions.length, 1)
  const retry = persistChange(failed.data, mutation, () => {})
  assert.equal(retry.saved, true)
  assert.equal(
    retry.data.projects[0].artifacts[0].revisions[1].content,
    'changed'
  )
})
test('actual model output remains recoverable in memory if persistence fails', () => {
  const p = createProject({ name: 'Work', goal: 'Research' })
  const base = { schema: 1, projects: [p], skills: [], knowledge: [] }
  const result = persistChange(
    base,
    (w) => ({
      ...w,
      projects: w.projects.map((p) => ({ ...p, artifacts: [report()] }))
    }),
    () => {
      throw new Error('quota')
    },
    true
  )
  assert.equal(result.saved, false)
  assert.equal(
    result.data.projects[0].artifacts[0].revisions[0].content,
    'original'
  )
})
test('report-context replies retain the report version and inherited sources', () => {
  const p = createProject({ name: 'Work', goal: 'Research' })
  p.artifacts = [{ ...report(), sourceIds: ['s1'] }]
  const refs = consultedReferences(p, 'a1', [])
  assert.deepEqual(refs.sourceIds, ['s1'])
  assert.deepEqual(refs.artifactRefs, [
    { id: 'a1', title: 'Report', version: 1 }
  ])
})
