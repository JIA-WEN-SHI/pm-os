import { isLocalOrigin } from '@/features/pm/agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function proxy(request: Request) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || url.host
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(`http://${host}`).hostname
    ) ||
    !isLocalOrigin(request.headers.get('origin'), host)
  )
    return Response.json({ message: '不接受外站请求' }, { status: 403 })
  const project = url.searchParams.get('project')
  if (!project) return Response.json({ message: '缺少项目' }, { status: 400 })
  try {
    const suffix = request.method === 'POST' ? '/sync' : ''
    const result = await fetch(
      `http://127.0.0.1:7777/pm/projects/${encodeURIComponent(project)}/files${suffix}`,
      {
        method: request.method,
        cache: 'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)])
      }
    )
    return new Response(result.body, {
      status: result.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    })
  } catch {
    return Response.json(
      { message: '无法确认本地文件状态，请稍后重试' },
      { status: 502 }
    )
  }
}
export const GET = proxy
export const POST = proxy
