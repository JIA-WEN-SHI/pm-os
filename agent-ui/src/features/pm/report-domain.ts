import type { Artifact, Project, ReportSelection, SourceRef } from './model'

// Keep original terminators: patching one range must not normalize the rest.
const linesOf = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) || []
export function makeTextSelection(
  a: Artifact,
  version: number,
  start: number,
  end: number
): ReportSelection {
  const raw = a.revisions.find((r) => r.version === version)?.content
  if (
    raw === undefined ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > raw.length
  )
    throw new Error('请在原文中选中要修改的文字')
  const splitsPair = (i: number) =>
    i > 0 &&
    i < raw.length &&
    /[\uD800-\uDBFF]/.test(raw[i - 1]) &&
    /[\uDC00-\uDFFF]/.test(raw[i])
  if (splitsPair(start) || splitsPair(end))
    throw new Error('选区不能拆开一个完整字符')
  const quote = raw.slice(start, end)
  if (!quote.trim()) throw new Error('请选择非空文案')
  const startOffset = Array.from(raw.slice(0, start)).length,
    endOffset = Array.from(raw.slice(0, end)).length
  return {
    kind: 'text',
    artifactId: a.id,
    version,
    blockId: `text-${startOffset}-${endOffset}`,
    title: `选中文案：${Array.from(quote).slice(0, 20).join('')}`,
    startOffset,
    endOffset,
    startLine: raw.slice(0, start).split('\n').length,
    endLine: raw.slice(0, end - 1).split('\n').length,
    quote
  }
}
export function locateTextSelection(
  a: Artifact,
  version: number,
  quote: string
): ReportSelection | null {
  const raw = a.revisions.find((r) => r.version === version)?.content
  if (raw === undefined || !quote.trim()) return null
  const start = raw.indexOf(quote)
  if (start < 0 || raw.indexOf(quote, start + 1) >= 0) return null
  return makeTextSelection(a, version, start, start + quote.length)
}
export function proposalReplacement(s: ReportSelection, text: string) {
  return s.kind !== 'text' && s.quote.endsWith('\n') && !text.endsWith('\n')
    ? text + (s.quote.endsWith('\r\n') ? '\r\n' : '\n')
    : text
}
export function makeEditorTextSelection(
  a: Artifact,
  version: number,
  start: number,
  end: number
): ReportSelection {
  const raw = a.revisions.find((r) => r.version === version)?.content
  if (
    raw === undefined ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > raw.replace(/\r\n?/g, '\n').length
  )
    throw new Error('原文选区无效')
  const originalOffset = (offset: number) => {
    let i = 0
    for (let n = 0; n < offset; n++)
      i += raw[i] === '\r' && raw[i + 1] === '\n' ? 2 : 1
    return i
  }
  return makeTextSelection(
    a,
    version,
    originalOffset(start),
    originalOffset(end)
  )
}
export function locateRenderedTextSelection(
  a: Artifact,
  version: number,
  nodeText: string,
  start: number,
  end: number,
  sourceStart: number,
  sourceEnd: number
): ReportSelection | null {
  const raw = a.revisions.find((r) => r.version === version)?.content
  if (
    raw === undefined ||
    ![start, end, sourceStart, sourceEnd].every(Number.isInteger) ||
    sourceStart < 0 ||
    sourceEnd > raw.length ||
    sourceEnd <= sourceStart ||
    start < 0 ||
    end > nodeText.length ||
    end <= start
  )
    return null
  if (!nodeText || raw.slice(sourceStart, sourceEnd) !== nodeText) return null
  try {
    return makeTextSelection(a, version, sourceStart + start, sourceStart + end)
  } catch {
    return null
  }
}
export function selectionConversation(p: Project, s: ReportSelection) {
  return JSON.stringify(
    p.messages
      .filter(
        (m) =>
          !m.failed &&
          m.selection?.artifactId === s.artifactId &&
          m.selection.version === s.version &&
          m.selection.blockId === s.blockId
      )
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }))
  )
}
export function reportSections(
  a: Artifact,
  version: number
): ReportSelection[] {
  const r = a.revisions.find((r) => r.version === version)
  if (!r) return []
  const lines = linesOf(r.content)
  const starts: { at: number; title: string }[] = []
  let fence = '',
    length = 0
  lines.forEach((line, i) => {
    const mark = line.match(/^ {0,3}(`{3,}|~{3,})(.*)/)
    if (fence) {
      if (
        mark &&
        mark[1][0] === fence &&
        mark[1].length >= length &&
        !mark[2].trim()
      )
        fence = ''
      return
    }
    if (mark) {
      fence = mark[1][0]
      length = mark[1].length
      return
    }
    const title = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/)
    if (title) starts.push({ at: i, title: title[1] })
  })
  if (lines.length && (!starts.length || starts[0].at > 0))
    starts.unshift({ at: 0, title: '开篇 / 正文' })
  return starts.map((s, i) => ({
    artifactId: a.id,
    version,
    blockId: `section-${s.at + 1}`,
    title: s.title,
    startLine: s.at + 1,
    endLine: starts[i + 1]?.at ?? lines.length,
    quote: lines.slice(s.at, starts[i + 1]?.at ?? lines.length).join('')
  }))
}
export function validateSelection(p: Project, s: ReportSelection) {
  const a = p.artifacts.find((a) => a.id === s?.artifactId)
  const r = a?.revisions.find((r) => r.version === s.version)
  if (
    !r ||
    !Number.isInteger(s.version) ||
    !Number.isInteger(s.startLine) ||
    !Number.isInteger(s.endLine) ||
    typeof s.title !== 'string'
  )
    throw new Error('报告选区无效')
  const lines = linesOf(r.content)
  if (s.kind === 'text') {
    const points = Array.from(r.content)
    if (
      !Number.isInteger(s.startOffset) ||
      !Number.isInteger(s.endOffset) ||
      s.startOffset! < 0 ||
      s.endOffset! > points.length ||
      s.endOffset! <= s.startOffset!
    )
      throw new Error('文案选区偏移无效')
    const canonical = makeTextSelection(
      a!,
      s.version,
      points.slice(0, s.startOffset).join('').length,
      points.slice(0, s.endOffset).join('').length
    )
    if (
      ['blockId', 'title', 'startLine', 'endLine', 'quote'].some(
        (k) =>
          s[k as keyof ReportSelection] !==
          canonical[k as keyof ReportSelection]
      )
    )
      throw new Error('文案选区与原文不符')
    return { artifact: a!, revision: r, lines }
  }
  if (
    s.kind !== undefined ||
    s.startOffset !== undefined ||
    s.endOffset !== undefined ||
    s.blockId !== `section-${s.startLine}`
  )
    throw new Error('报告选区类型无效')
  if (
    s.startLine < 1 ||
    s.endLine < s.startLine ||
    s.endLine > lines.length ||
    !s.quote?.trim() ||
    s.quote !== lines.slice(s.startLine - 1, s.endLine).join('')
  )
    throw new Error('报告选区与原文不符')
  const canonical = reportSections(a!, s.version).find(
    (x) => x.blockId === s.blockId
  )
  if (
    !canonical ||
    canonical.startLine !== s.startLine ||
    canonical.endLine !== s.endLine ||
    canonical.title !== s.title
  )
    throw new Error('报告选区不是完整的原章节')
  return { artifact: a!, revision: r, lines }
}
function replaced(p: Project, s: ReportSelection, text: string) {
  if (s.kind !== 'text' && s.quote.endsWith('\n') && !text.endsWith('\n'))
    throw new Error('章节替换需保留末尾换行')
  const { lines, revision } = validateSelection(p, s)
  if (s.kind === 'text') {
    const points = Array.from(revision.content)
    return (
      points.slice(0, s.startOffset).join('') +
      text +
      points.slice(s.endOffset).join('')
    )
  }
  return (
    lines.slice(0, s.startLine - 1).join('') +
    text +
    lines.slice(s.endLine).join('')
  )
}
export function sourceRefsFor(p: Project, ids: string[]): SourceRef[] {
  return p.sources
    .filter((s) => ids.includes(s.id))
    .map((s) => ({ id: s.id, version: s.versions?.at(-1)?.version || 1 }))
}
export function applyReportProposal(p: Project, id: string): Project {
  const proposal = p.reportProposals?.find((x) => x.id === id)
  if (p.archived || !proposal || proposal.status !== 'pending')
    throw new Error('该建议已处理或项目已归档')
  const { artifact } = validateSelection(p, proposal.selection)
  if (artifact.revisions.at(-1)!.version !== proposal.selection.version)
    throw new Error('报告版本已更新，旧建议已保留，请基于新版重新提出修改')
  if (!proposal.replacement.trim()) throw new Error('修改内容不能为空')
  const version = proposal.selection.version + 1
  const content = replaced(p, proposal.selection, proposal.replacement)
  return {
    ...p,
    artifacts: p.artifacts.map((a) =>
      a.id === artifact.id
        ? {
            ...a,
            status: 'draft',
            revisions: [
              ...a.revisions,
              { version, content, at: new Date().toISOString() }
            ]
          }
        : a.stage > artifact.stage && a.status === 'approved'
          ? { ...a, status: 'stale' }
          : a
    ),
    tasks: p.tasks.map((t) =>
      t.artifactId === artifact.id ? { ...t, status: 'review' } : t
    ),
    reportProposals: p.reportProposals!.map((x) =>
      x.id === id ? { ...x, status: 'accepted', appliedVersion: version } : x
    )
  }
}
export function rejectReportProposal(p: Project, id: string): Project {
  if (p.archived) throw new Error('归档项目不可修改')
  const proposal = p.reportProposals?.find((x) => x.id === id)
  if (!proposal || proposal.status !== 'pending')
    throw new Error('该建议已处理')
  return {
    ...p,
    reportProposals: p.reportProposals!.map((x) =>
      x.id === id ? { ...x, status: 'rejected' } : x
    )
  }
}
export function validateReportData(p: Project): boolean {
  try {
    const checkRefs = (refs: SourceRef[] | undefined) => {
      if (refs === undefined) return
      if (!Array.isArray(refs)) throw new Error()
      for (const r of refs) {
        const s = p.sources.find((s) => s.id === r?.id)
        if (
          !s ||
          !Number.isInteger(r.version) ||
          r.version < 1 ||
          !(s.versions
            ? s.versions.some((v) => v.version === r.version)
            : r.version === 1)
        )
          throw new Error()
      }
    }
    for (const entry of [...p.runs, ...p.messages]) {
      if (entry.selection !== undefined) validateSelection(p, entry.selection)
      if (
        entry.intent !== undefined &&
        !['explain', 'rewrite'].includes(entry.intent)
      )
        return false
      checkRefs(entry.sourceRefs)
    }
    if (p.reportProposals === undefined) return true
    if (
      !Array.isArray(p.reportProposals) ||
      new Set(p.reportProposals.map((x) => x.id)).size !==
        p.reportProposals.length
    )
      return false
    for (const x of p.reportProposals) {
      if (
        !x ||
        !['id', 'request', 'replacement', 'runId', 'at'].every(
          (k) => typeof x[k as keyof typeof x] === 'string'
        ) ||
        !x.replacement.trim() ||
        !['pending', 'accepted', 'rejected'].includes(x.status) ||
        !Array.isArray(x.sourceRefs)
      )
        return false
      const { artifact } = validateSelection(p, x.selection)
      if (
        x.selection.kind !== 'text' &&
        x.selection.quote.endsWith('\n') &&
        !x.replacement.endsWith('\n')
      )
        return false
      checkRefs(x.sourceRefs)
      if (x.status === 'accepted') {
        if (
          x.appliedVersion !== x.selection.version + 1 ||
          artifact.revisions.find((r) => r.version === x.appliedVersion)
            ?.content !== replaced(p, x.selection, x.replacement)
        )
          return false
      } else if (x.appliedVersion !== undefined) return false
    }
    return true
  } catch {
    return false
  }
}
