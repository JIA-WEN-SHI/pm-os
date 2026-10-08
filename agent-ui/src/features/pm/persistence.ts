import type { Workspace, WorkspaceCommit, WorkspaceEnvelope } from './model'

const RECOVERY_KEY = 'pmos.pending-commit.v1'
type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Options = {
  request: typeof fetch
  recoveryStorage: RecoveryStorage
  validate: (value: unknown) => Workspace
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}

export class WorkspacePersistence {
  private options: Options
  private envelope: WorkspaceEnvelope | null = null
  private pending: WorkspaceCommit | null = null
  private corruptRaw: string | null = null
  private sending = false

  constructor(options: Options) {
    this.options = options
    const raw = options.recoveryStorage.getItem(RECOVERY_KEY)
    if (raw !== null) {
      try {
        const value = JSON.parse(raw) as WorkspaceCommit
        options.validate(value.workspace)
        if (
          !Number.isSafeInteger(value.baseRevision) ||
          value.baseRevision < 0 ||
          !/^[0-9a-f-]{36}$/.test(value.operationId) ||
          !['initialize', 'legacy_import', 'edit', 'restore'].includes(
            value.reason
          )
        )
          throw new Error(
            '未保存内容缓存无法读取，请导出浏览器恢复缓存后再处理'
          )
        this.pending = value
      } catch {
        this.corruptRaw = raw
      }
    }
  }

  private readEnvelope(value: WorkspaceEnvelope) {
    if (
      !Number.isSafeInteger(value?.revision) ||
      value.revision < 1 ||
      typeof value.updatedAt !== 'string'
    )
      throw new Error('服务端保存结果无效，请保留内容后重试')
    this.options.validate(value.workspace)
    return value
  }

  private async parse(response: Response) {
    const body = await response.json()
    if (!response.ok)
      throw new Error(body.message || '无法保存，请检查本机项目服务')
    return this.readEnvelope(body)
  }

  async load(): Promise<
    { state: 'ready'; envelope: WorkspaceEnvelope } | { state: 'missing' }
  > {
    const response = await this.options.request('/api/pm/workspace', {
      cache: 'no-store'
    })
    if (response.status === 404) {
      const body = await response.json()
      if (body.code === 'workspace_missing') return { state: 'missing' }
      throw new Error('项目保存接口尚未就绪，请更新后端服务')
    }
    this.envelope = await this.parse(response)
    return { state: 'ready', envelope: this.envelope }
  }

  async initialize(workspace: Workspace, legacyRaw?: string) {
    return this.submit({
      operationId: crypto.randomUUID(),
      baseRevision: 0,
      workspace,
      reason: legacyRaw === undefined ? 'initialize' : 'legacy_import',
      ...(legacyRaw === undefined ? {} : { legacyRaw })
    })
  }

  async commit(workspace: Workspace, reason: 'edit' | 'restore' = 'edit') {
    if (!this.envelope) throw new Error('请先加载或迁移项目')
    return this.submit({
      operationId: crypto.randomUUID(),
      baseRevision: this.envelope.revision,
      workspace,
      reason
    })
  }

  private async submit(value: WorkspaceCommit) {
    if (this.pending || this.corruptRaw !== null || this.sending)
      throw new Error('还有未确认的保存，请先重试或导出恢复内容')
    this.options.validate(value.workspace)
    this.pending = JSON.parse(JSON.stringify(value)) as WorkspaceCommit
    return this.retryPending()
  }

  async retryPending(): Promise<WorkspaceEnvelope> {
    if (this.corruptRaw !== null)
      throw new Error('恢复缓存损坏，请导出原文并重新加载')
    if (!this.pending) throw new Error('没有待重试的保存')
    if (this.sending) throw new Error('保存正在进行，请稍候')
    this.sending = true
    try {
      const raw = JSON.stringify(this.pending)
      // A failed durable recovery write prevents network dispatch.
      this.options.recoveryStorage.setItem(RECOVERY_KEY, raw)
      const result = await this.parse(
        await this.options.request('/api/pm/workspace', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: raw
        })
      )
      if (
        result.revision !== this.pending.baseRevision + 1 ||
        canonical(result.workspace) !== canonical(this.pending.workspace)
      )
        throw new Error('保存回执版本不符合预期，请保留内容')
      this.envelope = result
      this.options.recoveryStorage.removeItem(RECOVERY_KEY)
      this.pending = null
      return result
    } finally {
      this.sending = false
    }
  }

  exportRecovery(): string | null {
    if (this.corruptRaw !== null)
      return JSON.stringify({ invalidRecoveryRaw: this.corruptRaw }, null, 2)
    return this.pending ? JSON.stringify(this.pending.workspace, null, 2) : null
  }

  preserveAndDiscardPending() {
    if (this.sending) throw new Error('请等当前保存结束')
    if (this.pending) {
      this.options.recoveryStorage.setItem(
        `pmos.recovery.${this.pending.operationId}`,
        JSON.stringify(this.pending)
      )
      this.options.recoveryStorage.removeItem(RECOVERY_KEY)
      this.pending = null
    }
    if (this.corruptRaw !== null) {
      this.options.recoveryStorage.setItem(
        `pmos.recovery.corrupt.${crypto.randomUUID()}`,
        this.corruptRaw
      )
      this.options.recoveryStorage.removeItem(RECOVERY_KEY)
      this.corruptRaw = null
    }
  }
}

export class WorkspaceWriteQueue {
  private tail: Promise<void> = Promise.resolve()
  private count = 0
  execute<T>(job: () => Promise<T>, allowQueue = false): Promise<T> {
    if (this.count && !allowQueue)
      return Promise.reject(new Error('保存正在进行，请稍候'))
    this.count++
    const result = this.tail.then(job).finally(() => {
      this.count--
    })
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
