import type {
  Project,
  RunContextSnapshot,
  Skill,
  ArtifactRef,
  HandoffRef
} from './model'
import { sourceVersions } from './source-domain.ts'
import { validHandoffRefs } from './handoff-core.ts'

export function createRunContext(
  p: Project,
  request: RunContextSnapshot['request'],
  refs: {
    sourceIds: string[]
    artifactRefs: ArtifactRef[]
    handoffs?: HandoffRef[]
  },
  method: Pick<Skill, 'id' | 'name' | 'version' | 'instructions'> | undefined,
  historyMode: RunContextSnapshot['historyMode'],
  capturedAt: string
): RunContextSnapshot {
  const sources = refs.sourceIds.map((id) => {
    const source = p.sources.find((s) => s.id === id)
    if (!source) throw new Error('资料不属于当前项目')
    const v = sourceVersions(source, p.demo).at(-1)!
    return {
      id,
      version: v.version,
      title: v.title,
      mode: v.mode,
      hasContent: !!v.content
    }
  })
  return {
    schema: 1,
    capturedAt,
    request: {
      ...request,
      ...(request.stagePreparation
        ? {
            stagePreparation: {
              ...request.stagePreparation,
              projectScope: [...request.stagePreparation.projectScope]
            }
          }
        : {}),
      ...(request.webRead ? { webRead: { ...request.webRead } } : {})
    },
    sources,
    artifacts: refs.artifactRefs.map((r) => ({ ...r })),
    ...(refs.handoffs?.length
      ? { handoffs: refs.handoffs.map((ref) => ({ ...ref })) }
      : {}),
    ...(method
      ? {
          method: {
            id: method.id,
            name: method.name,
            version: method.version,
            instructions: method.instructions
          }
        }
      : {}),
    historyMode
  }
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).every((k) => names.includes(k))
const version = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0
export function validateRunContexts(p: Project): boolean {
  return p.runs.every((run) => {
    const s = run.contextSnapshot
    if (s === undefined) return true
    if (
      !object(s) ||
      !keys(s, [
        'schema',
        'capturedAt',
        'request',
        'sources',
        'artifacts',
        'method',
        'historyMode',
        'handoffs'
      ]) ||
      s.schema !== 1 ||
      typeof s.capturedAt !== 'string' ||
      !s.capturedAt ||
      !object(s.request) ||
      !keys(s.request, [
        'message',
        'sessionId',
        'webRead',
        'stagePreparation'
      ]) ||
      typeof s.request.message !== 'string' ||
      !s.request.message.trim() ||
      s.request.message.length > 65000 ||
      typeof s.request.sessionId !== 'string' ||
      !/^pm-[a-zA-Z0-9-]{1,100}$/.test(s.request.sessionId) ||
      !['selection', 'agent-session', 'none'].includes(s.historyMode) ||
      !Array.isArray(s.sources) ||
      !Array.isArray(s.artifacts)
    )
      return false
    if (s.request.stagePreparation !== undefined) {
      const b = s.request.stagePreparation
      if (
        !object(b) ||
        !keys(b, [
          'baseVersion',
          'projectScope',
          'sourceSignature',
          'stage',
          'upstreamSignature'
        ]) ||
        !Number.isSafeInteger(b.baseVersion) ||
        b.baseVersion < 0 ||
        !Array.isArray(b.projectScope) ||
        b.projectScope.length !== 4 ||
        !b.projectScope.every((x) => typeof x === 'string') ||
        typeof b.sourceSignature !== 'string' ||
        !Number.isInteger(b.stage ?? 0) ||
        (b.stage ?? 0) < 0 ||
        (b.stage ?? 0) > 7 ||
        (((b.stage ?? 0) > 0 || b.upstreamSignature !== undefined) &&
          typeof b.upstreamSignature !== 'string') ||
        run.stage !== (b.stage ?? 0) ||
        run.taskId ||
        run.selection ||
        s.request.webRead ||
        s.historyMode !== 'none'
      )
        return false
    }
    if (s.request.webRead !== undefined) {
      const web = s.request.webRead
      if (
        !object(web) ||
        !keys(web, ['sourceId', 'sourceVersion', 'url']) ||
        typeof web.sourceId !== 'string' ||
        typeof web.url !== 'string' ||
        !version(web.sourceVersion)
      )
        return false
      const source = p.sources.find((x) => x.id === web.sourceId)
      if (
        !source ||
        source.kind !== 'link' ||
        run.sourceIds.length !== 1 ||
        run.sourceIds[0] !== web.sourceId
      )
        return false
      const v = sourceVersions(source, p.demo).find(
        (v) => v.version === web.sourceVersion
      )
      if (
        !v ||
        v.url !== web.url ||
        !s.sources.some(
          (ref) =>
            object(ref) && ref.id === source.id && ref.version === v.version
        )
      )
        return false
    }
    if (
      s.handoffs !== undefined &&
      (!validHandoffRefs(p, s.handoffs) ||
        s.handoffs.some((ref) => ref.toStage !== run.stage))
    )
      return false
    if (
      s.method !== undefined &&
      (!object(s.method) ||
        !keys(s.method, ['id', 'name', 'version', 'instructions']) ||
        !['id', 'name', 'instructions'].every(
          (k) => typeof (s.method as Record<string, unknown>)[k] === 'string'
        ) ||
        !Number.isSafeInteger(s.method.version) ||
        s.method.version < 0)
    )
      return false
    if (
      s.sources.length !== run.sourceIds.length ||
      new Set(s.sources.map((x) => x?.id)).size !== s.sources.length ||
      !s.sources.every((ref) => {
        if (
          !object(ref) ||
          !keys(ref, ['id', 'version', 'title', 'mode', 'hasContent']) ||
          typeof ref.id !== 'string' ||
          !version(ref.version) ||
          !run.sourceIds.includes(ref.id)
        )
          return false
        const source = p.sources.find((x) => x.id === ref.id)
        const v =
          source &&
          sourceVersions(source, p.demo).find((x) => x.version === ref.version)
        return (
          !!v &&
          ref.title === v.title &&
          ref.mode === v.mode &&
          ref.hasContent === !!v.content
        )
      })
    )
      return false
    const refs = run.artifactRefs || []
    if (
      s.artifacts.length !== refs.length ||
      new Set(s.artifacts.map((x) => `${x?.id}:${x?.version}`)).size !==
        s.artifacts.length ||
      !s.artifacts.every((ref, i) => {
        if (
          !object(ref) ||
          !keys(ref, ['id', 'title', 'version']) ||
          typeof ref.id !== 'string' ||
          typeof ref.title !== 'string' ||
          !version(ref.version)
        )
          return false
        return (
          refs[i].id === ref.id &&
          refs[i].version === ref.version &&
          refs[i].title === ref.title &&
          !!p.artifacts
            .find((a) => a.id === ref.id)
            ?.revisions.some((r) => r.version === ref.version)
        )
      })
    )
      return false
    return true
  })
}
