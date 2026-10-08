import { isLocalOrigin } from '@/features/pm/agent'
export const dynamic = 'force-dynamic'
async function proxy(request: Request, method: 'GET' | 'POST') {
  if (
    !isLocalOrigin(
      request.headers.get('origin'),
      request.headers.get('host') || new URL(request.url).host
    )
  )
    return Response.json({ message: '不接受跨站请求' }, { status: 403 })
  const params = new URL(request.url).searchParams
  const project = params.get('project'),
    run = params.get('run'),
    action = params.get('action')
  if (
    !project ||
    !run ||
    project.length > 150 ||
    run.length > 150 ||
    (action && action !== 'cancel')
  )
    return Response.json({ message: '运行标识无效' }, { status: 400 })
  try {
    const upstream = await fetch(
      `http://127.0.0.1:7777/pm/projects/${encodeURIComponent(project)}/runs/${encodeURIComponent(run)}/execution${method === 'POST' && action === 'cancel' ? '/cancel' : ''}`,
      {
        method,
        cache: 'no-store',
        signal: AbortSignal.timeout(method === 'POST' ? 20000 : 10000)
      }
    )
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    })
  } catch {
    return Response.json(
      { message: '暂时无法查询后台，请稍后重试；不会自动重复执行。' },
      { status: 503 }
    )
  }
}
export const GET = (request: Request) => proxy(request, 'GET')
export const POST = (request: Request) => proxy(request, 'POST')
