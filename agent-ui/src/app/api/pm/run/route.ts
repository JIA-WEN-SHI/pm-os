import { isLocalOrigin } from '@/features/pm/agent'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (
    !isLocalOrigin(
      origin,
      request.headers.get('host') || new URL(request.url).host
    )
  )
    return Response.json({ error: '不接受跨站请求' }, { status: 403 })
  try {
    const body = await request.json()
    if (
      typeof body.message !== 'string' ||
      !body.message.trim() ||
      body.message.length > 70000 ||
      typeof body.sessionId !== 'string' ||
      !/^pm-[a-zA-Z0-9-]{1,100}$/.test(body.sessionId)
    )
      return Response.json(
        { error: '请求内容或项目会话标识无效' },
        { status: 400 }
      )
    const form = new FormData()
    form.set('message', body.message)
    form.set('stream', 'true')
    form.set('session_id', body.sessionId)
    const upstream = await fetch(
      'http://127.0.0.1:7777/agents/agno-assist/runs',
      { method: 'POST', body: form, signal: request.signal }
    )
    if (!upstream.ok)
      return Response.json(
        { error: `Agno 返回 ${upstream.status}，请检查后端服务和模型配置` },
        { status: upstream.status }
      )
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      }
    })
  } catch {
    return Response.json(
      { error: '无法连接本机 Agno 服务，请确认 7777 端口的后端已启动' },
      { status: 502 }
    )
  }
}
