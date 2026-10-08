export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:7777/agents', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) throw new Error('unavailable')
    const data = await response.json()
    const list = Array.isArray(data) ? data : data.data || []
    const agent = list.find((a: { id: string }) => a.id === 'agno-assist')
    if (!agent) throw new Error('agent missing')
    const model =
      typeof agent.model === 'string'
        ? agent.model
        : agent.model?.id ||
          agent.model?.model ||
          agent.model?.name ||
          '后端已配置模型'
    const runtimeResponse = await fetch('http://127.0.0.1:7777/pm/assistant', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    })
    const runtime = runtimeResponse.ok ? await runtimeResponse.json() : null
    return Response.json({
      connected: true,
      agent: runtime?.agent || agent.name || 'Agno Assist',
      model: runtime?.model || model
    })
  } catch {
    return Response.json({
      connected: false,
      agent: 'Agno Assist',
      model: '未连接',
      error: '无法连接本机 Agno，请启动后端服务。'
    })
  }
}
