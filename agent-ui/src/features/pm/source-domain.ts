import type { DataMode, Project, Source, SourceVersion } from './model'

export const modeLabels: Record<DataMode, string> = {
  real: '真实材料（内容未核实）',
  simulation: '模拟材料',
  unknown: '性质待确认'
}
export function sourceVersions(source: Source, demo = false): SourceVersion[] {
  return (
    source.versions || [
      {
        version: 1,
        title: source.title,
        content: source.content,
        ...(source.url === undefined ? {} : { url: source.url }),
        at: source.at,
        mode: demo ? 'simulation' : 'unknown',
        origin: 'legacy_snapshot'
      }
    ]
  )
}
export function versionSource(source: Source, mode: DataMode): Source {
  return {
    ...source,
    versions: [
      {
        version: 1,
        title: source.title,
        content: source.content,
        ...(source.url === undefined ? {} : { url: source.url }),
        at: source.at,
        mode,
        origin: 'user_saved'
      }
    ]
  }
}
export function reviseSource(
  p: Project,
  sourceId: string,
  expectedVersion: number,
  input: { title: string; content: string; url?: string; mode: DataMode }
): Project {
  if (p.archived) throw new Error('归档项目不能修改资料')
  const source = p.sources.find((s) => s.id === sourceId)
  if (!source) throw new Error('资料不属于当前项目')
  const history = sourceVersions(source, p.demo)
  if (history.at(-1)!.version !== expectedVersion)
    throw new Error('资料版本已更新，请重新比较后保存')
  if (!input.title.trim() || (source.kind !== 'link' && !input.content.trim()))
    throw new Error('请填写名称与正文')
  if (input.content.length > 200000) throw new Error('正文不能超过20万字符')
  if (!['real', 'simulation', 'unknown'].includes(input.mode))
    throw new Error('请选择资料性质')
  if (input.url && !['http:', 'https:'].includes(new URL(input.url).protocol))
    throw new Error('来源链接无效')
  const next = {
    ...input,
    title: input.title.trim(),
    version: expectedVersion + 1,
    at: new Date().toISOString(),
    origin: 'user_saved' as const
  }
  return {
    ...p,
    sources: p.sources.map((s) =>
      s.id === sourceId
        ? {
            ...s,
            title: next.title,
            content: next.content,
            url: next.url,
            versions: [...history, next]
          }
        : s
    ),
    artifacts: p.artifacts.map((a) =>
      a.status === 'approved' && a.sourceIds.includes(sourceId)
        ? { ...a, status: 'stale' }
        : a
    )
  }
}
export function recordEvidence(
  p: Project,
  sourceId: string,
  version: number,
  startLine: number,
  endLine: number,
  note: string
): Project {
  if (p.archived) throw new Error('归档项目不能新增证据')
  const source = p.sources.find((s) => s.id === sourceId)
  if (!source) throw new Error('资料不属于当前项目')
  const history = sourceVersions(source, p.demo)
  const selected = history.find((v) => v.version === version)
  if (!selected) throw new Error('资料版本不存在')
  if (!selected.content.trim()) throw new Error('尚无正文，不能记录证据')
  const lines = selected.content.replace(/\r\n/g, '\n').split('\n')
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > lines.length
  )
    throw new Error('原文行范围无效')
  const quote = lines.slice(startLine - 1, endLine).join('\n')
  if (!quote.trim()) throw new Error('选中行没有正文')
  return {
    ...p,
    sources: p.sources.map((s) =>
      s.id === sourceId ? { ...s, versions: history } : s
    ),
    evidence: [
      ...(p.evidence || []),
      {
        id: crypto.randomUUID(),
        sourceId,
        sourceVersion: version,
        startLine,
        endLine,
        quote,
        note,
        mode: selected.mode,
        verification: 'unverified',
        at: new Date().toISOString()
      }
    ]
  }
}
