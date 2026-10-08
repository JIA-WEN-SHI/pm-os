const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  readAgentStream,
  isLocalOrigin
} = require('../src/features/pm/agent.ts')
function response(parts) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts)
          controller.enqueue(new TextEncoder().encode(part))
        controller.close()
      }
    })
  )
}
test('chunk boundaries preserve complete output and completion status', async () => {
  const r = await readAgentStream(
    response([
      'event: RunContent\ndata: {"content":"你',
      '好"}\n\nevent: RunCompleted\ndata: {"content":"你好","run_id":"r1"}\n\n'
    ]),
    () => {}
  )
  assert.equal(r.content, '你好')
  assert.equal(r.runId, 'r1')
})
test('stream errors reject instead of approving partial output', async () => {
  await assert.rejects(
    () =>
      readAgentStream(
        response([
          'event: RunContent\ndata: {"content":"partial"}\n\nevent: RunError\ndata: {"content":"provider failed"}\n\n'
        ]),
        () => {}
      ),
    /provider failed/
  )
})
test('an interrupted stream never becomes a completed result', async () => {
  await assert.rejects(
    () =>
      readAgentStream(
        response(['event: RunContent\ndata: {"content":"partial"}\n\n']),
        () => {}
      ),
    /中断/
  )
})
test('CRLF separators may be split across network chunks', async () => {
  const r = await readAgentStream(
    response([
      'event: RunContent\r',
      '\ndata: {"content":"hello"}\r',
      '\n\r',
      '\nevent: RunCompleted\r\ndata: {"content":"hello"}\r\n\r\n'
    ]),
    () => {}
  )
  assert.equal(r.content, 'hello')
})
test('multiline SSE data is reassembled', async () => {
  const r = await readAgentStream(
    response(['event: RunCompleted\ndata: {"content":\ndata: "complete"}\n\n']),
    () => {}
  )
  assert.equal(r.content, 'complete')
})
test('local proxy permits loopback aliases on the same port but rejects foreign origins', () => {
  assert.equal(isLocalOrigin('http://127.0.0.1:3001', 'localhost:3001'), true)
  assert.equal(isLocalOrigin('http://localhost:3000', '127.0.0.1:3000'), true)
  assert.equal(isLocalOrigin('https://evil.example', 'localhost:3000'), false)
  assert.equal(isLocalOrigin('http://localhost:3002', 'localhost:3000'), false)
})
