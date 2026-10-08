const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validateBackup } = require('../src/features/pm/domain.ts')
const { WorkspacePersistence, WorkspaceWriteQueue } = require('../src/features/pm/persistence.ts')
const empty = () => ({ schema: 1, projects: [], skills: [], knowledge: [] })
function storage() {
  const values = new Map()
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }
}
function server() {
  let envelope = null
  const operations = new Map()
  let drop = false
  return {
    dropNext: () => { drop = true },
    current: () => envelope,
    request: async (_, options) => {
      if (!options?.method || options.method === 'GET') return Response.json(envelope || {code:'workspace_missing'}, {status:envelope ? 200 : 404})
      const body = JSON.parse(options.body)
      if (operations.has(body.operationId)) return Response.json(operations.get(body.operationId))
      if (body.baseRevision !== (envelope?.revision || 0)) return Response.json({code:'revision_conflict',message:'conflict'}, {status:409})
      envelope = { revision: body.baseRevision + 1, updatedAt:'now',workspace:body.workspace }
      operations.set(body.operationId, envelope)
      if (drop) { drop = false; throw new Error('connection lost after commit') }
      return Response.json(envelope)
    }
  }
}
const client = (s, cache = storage()) => new WorkspacePersistence({request:s.request,recoveryStorage:cache,validate:validateBackup})

test('offline or unavailable is never treated as an empty workspace', async () => {
  const s = { request: async () => Response.json({message:'offline'}, {status:503}) }
  await assert.rejects(client(s).load(), /offline/)
  assert.equal((await client(server()).load()).state, 'missing')
})

test('lost acknowledgement can be retried after reload without another write', async () => {
  const s = server(), cache = storage(), a = client(s, cache)
  await a.initialize(empty())
  s.dropNext()
  await assert.rejects(a.commit(empty()), /connection lost/)
  assert.ok(a.exportRecovery())
  const b = client(s, cache)
  const result = await b.retryPending()
  assert.equal(result.revision, 2)
  assert.equal(s.current().revision, 2)
  assert.equal(b.exportRecovery(), null)
})

test('stale window preserves its pending content and never rebases silently', async () => {
  const s = server(), a = client(s), b = client(s)
  await a.initialize(empty()); await b.load(); await a.commit(empty())
  const next = {...empty(), knowledge:[], personalExtension:'my unsaved change'}
  await assert.rejects(b.commit(next), /conflict/)
  assert.equal(JSON.parse(b.exportRecovery()).personalExtension, 'my unsaved change')
  await assert.rejects(b.commit(empty()), /未确认/)
  assert.equal(s.current().revision, 2)
})

test('concurrent submissions do not both write and migration preserves raw input', async () => {
  const s = server(), a = client(s)
  const raw = JSON.stringify(empty(), null, 2)
  await a.initialize(empty(), raw)
  const results = await Promise.allSettled([a.commit(empty()), a.commit(empty())])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(s.current().revision, 2)
})

test('full recovery storage prevents dispatch and retains a downloadable copy', async () => {
  const s = server(), cache = storage(), a = client(s, cache)
  await a.initialize(empty())
  cache.setItem = () => {throw new Error('quota')}
  await assert.rejects(a.commit(empty()), /quota/)
  assert.equal(s.current().revision, 1)
  assert.ok(a.exportRecovery())
})

test('an unexpected acknowledgement never discards the pending document', async () => {
  const s = server(), a = client(s)
  await a.initialize(empty())
  s.request = async () => Response.json({revision:2, updatedAt:'now', workspace:empty()})
  const broken = new WorkspacePersistence({request:s.request, recoveryStorage:storage(),validate:validateBackup})
  // Loading establishes revision 2; response to commit incorrectly claims revision 2 again.
  await broken.load()
  await assert.rejects(broken.commit({...empty(), note:'keep me'}), /版本/)
  assert.equal(JSON.parse(broken.exportRecovery()).note, 'keep me')
})

test('corrupt recovery cache can be exported and isolated without blocking healthy reads', async () => {
  const s = server(), cache = storage()
  await client(s).initialize(empty())
  cache.setItem('pmos.pending-commit.v1', '{broken original')
  const a = client(s, cache)
  assert.equal((await a.load()).state, 'ready')
  assert.match(a.exportRecovery(), /broken original/)
  await assert.rejects(a.commit(empty()), /未确认/)
  a.preserveAndDiscardPending()
  assert.equal(a.exportRecovery(), null)
  assert.equal((await a.commit(empty())).revision, 2)
})

test('generated results wait for the current write and use its saved state', async () => {
  const queue = new WorkspaceWriteQueue()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const saved = []
  const a = queue.execute(async () => { await gate; saved.push('A') })
  const b = queue.execute(async () => { assert.deepEqual(saved,['A']); saved.push('B') }, true)
  await assert.rejects(queue.execute(async () => saved.push('duplicate')), /保存/)
  release()
  await Promise.all([a,b])
  assert.deepEqual(saved,['A','B'])
})
