import { isLocalOrigin } from '@/features/pm/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX_BODY_BYTES = 32 * 1024 * 1024

async function proxy(request: Request) {
  const host = request.headers.get('host') || new URL(request.url).host
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(`http://${host}`).hostname
    ) ||
    !isLocalOrigin(request.headers.get('origin'), host)
  )
    return Response.json({ message: '不接受外站请求' }, { status: 403 })
  try {
    let body: Uint8Array | undefined
    if (request.method === 'PUT') {
      const reader = request.body?.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > MAX_BODY_BYTES) {
              await reader.cancel()
              return Response.json(
                { message: '保存内容超过 32 MiB' },
                { status: 413 }
              )
            }
            chunks.push(value)
          }
        } finally {
          reader.releaseLock()
        }
      }
      body = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.byteLength
      }
    }
    const result = await fetch('http://127.0.0.1:7777/pm/workspace', {
      method: request.method,
      headers: { 'Content-Type': 'application/json' },
      body: body as BodyInit | undefined,
      cache: 'no-store',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)])
    })
    return new Response(result.body, {
      status: result.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    })
  } catch {
    return Response.json(
      { message: '无法确认保存，请检查本机项目服务后重试原提交' },
      { status: 502 }
    )
  }
}
export const GET = proxy
export const PUT = proxy
