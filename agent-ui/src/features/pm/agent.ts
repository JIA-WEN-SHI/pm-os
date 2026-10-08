export function isLocalOrigin(origin: string | null, host: string | null) {
  if (!origin) return true
  if (!host) return false
  try {
    const from = new URL(origin)
    const to = new URL(`http://${host}`)
    const loopback = ['localhost', '127.0.0.1', '[::1]']
    return (
      from.protocol === 'http:' &&
      loopback.includes(from.hostname) &&
      loopback.includes(to.hostname) &&
      from.port === to.port
    )
  } catch {
    return false
  }
}
export async function readAgentStream(
  response: Response,
  onText: (text: string) => void
): Promise<{ content: string; runId: string }> {
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body.error || body.detail || ''
    } catch {}
    throw new Error(
      typeof detail === 'string' && detail
        ? detail
        : `服务返回 ${response.status}，请检查连接后重试`
    )
  }
  if (!response.body) throw new Error('模型没有返回内容')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let complete = false
  let runId = ''
  function consume(block: string) {
    const lines = block.split('\n')
    const name = lines
      .find((x) => x.startsWith('event:'))
      ?.slice(6)
      .trim()
    const raw = lines
      .filter((x) => x.startsWith('data:'))
      .map((x) => x.slice(5).trimStart())
      .join('\n')
    if (!raw || raw === '[DONE]') return
    let item: Record<string, unknown>
    try {
      item = JSON.parse(raw)
    } catch {
      throw new Error('模型返回的数据格式无法读取')
    }
    const event = String(item.event || name || '')
    if (item.run_id) runId = String(item.run_id)
    if (/Error|Cancelled|Canceled/.test(event))
      throw new Error(String(item.content || item.error || '模型运行失败'))
    if (event === 'RunContent' || event === 'RunResponse') {
      if (typeof item.content === 'string') {
        content += item.content
        onText(content)
      }
    }
    if (event === 'RunCompleted') {
      complete = true
      if (typeof item.content === 'string') content = item.content
      onText(content)
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(
        /\r\n/g,
        '\n'
      )
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
      }
      if (done) {
        if (buffer.trim()) consume(buffer)
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (!complete)
    throw new Error(
      '连接中断，未收到运行完成确认；请先查看运行记录，不要把片段当作完整报告'
    )
  if (!content.trim()) throw new Error('运行结束但没有可保存的文本结果')
  return { content, runId }
}
