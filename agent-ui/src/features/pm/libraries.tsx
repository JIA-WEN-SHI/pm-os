'use client'
import { useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Download,
  FileText,
  Layers3,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { usePM } from './provider'
import { stages } from './catalog'
import { downloadText, now, uid, validateBackup } from './domain'
import type { Skill, Workspace } from './model'
import {
  Badge,
  Button,
  Card,
  cx,
  Empty,
  Field,
  Heading,
  Markdown,
  Modal,
  Tabs
} from './ui'

export function Methods() {
  const store = usePM()
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Skill | null>(null)
  const [binding, setBinding] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const list = store.data.skills.filter(
    (s) =>
      (tab !== 'mine' || s.personal) &&
      `${s.name} ${s.description}`.includes(query)
  )
  const newMethod = () =>
    setSelected({
      id: uid(),
      name: '',
      stage: 0,
      description: '',
      instructions: '',
      version: 1,
      personal: true
    })
  return (
    <>
      <Heading
        eyebrow="YOUR METHODS"
        title="方法库"
        description="把你的工作方法，接入每一次分析与产出。"
        actions={
          <>
            <Button onClick={() => file.current?.click()}>
              <Upload size={16} />
              导入 Skill
            </Button>
            <Button variant="primary" onClick={newMethod}>
              <Plus size={16} />
              新建个人方法
            </Button>
          </>
        }
      />
      <input
        ref={file}
        type="file"
        hidden
        accept=".md,.txt"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (f.size > 100000 || !/\.(md|txt)$/i.test(f.name)) {
            toast.error('请选择 100KB 以内的 Markdown 或文本方法说明')
            return
          }
          try {
            const text = await f.text()
            setSelected({
              id: uid(),
              name: f.name.replace(/\.(md|txt)$/i, ''),
              instructions: text,
              description: '导入的个人方法，使用前请核对输入输出要求。',
              stage: 0,
              version: 1,
              personal: true
            })
          } catch {
            toast.error('无法读取文件')
          }
        }}
      />
      <div className="pm-list-toolbar">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'all', label: '全部方法', count: store.data.skills.length },
            { id: 'mine', label: '我的 Skills' },
            { id: 'templates', label: '流程模板' }
          ]}
        />
        <div className="pm-search">
          <Search size={16} />
          <input
            aria-label="搜索方法"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索方法或用途…"
          />
        </div>
      </div>
      {tab === 'templates' ? (
        <>
          <div className="pm-flow-intro">
            <span className="pm-stat-icon">
              <Layers3 size={20} />
            </span>
            <div>
              <strong>AI 产品完整路径</strong>
              <p>
                当前项目使用的八阶段流程。任务方法可在项目与任务配置中调整。
              </p>
            </div>
            <Badge>内置模板</Badge>
          </div>
          <div className="pm-method-template">
            {stages.map((s, i) => (
              <Card
                key={s.name}
                title={`${String(i + 1).padStart(2, '0')} · ${s.name}`}
              >
                <div className="pm-card-pad">
                  <p>{s.goal}</p>
                  <span className="pm-mini-label">输入</span>
                  <div className="pm-chips">
                    {s.inputs.map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                  <span className="pm-mini-label">产出</span>
                  <div className="pm-chips">
                    {s.outputs.map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        store.data.skills.find((m) => m.id === `method-${i}`) ||
                          null
                      )
                    }
                  >
                    查看阶段方法 <ArrowUpRight size={14} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <div className="pm-method-grid">
          {list.map((s, i) => (
            <button
              className="pm-method-card"
              key={s.id}
              onClick={() => {
                setSelected({ ...s })
                setBinding('')
              }}
            >
              <div className="pm-method-top">
                <span
                  className={cx(
                    'pm-method-icon',
                    i % 3 === 1 && 'teal',
                    i % 3 === 2 && 'amber'
                  )}
                >
                  <BookOpen size={22} />
                </span>
                <span className="pm-version">v{s.version}</span>
              </div>
              <h2>{s.name}</h2>
              <p>{s.description}</p>
              <div className="pm-method-bottom">
                <span className="pm-label-chip">{stages[s.stage].short}</span>
                <span>{s.personal ? '个人方法' : '内置方法说明'}</span>
                <ArrowUpRight size={16} />
              </div>
            </button>
          ))}
          {!list.length && (
            <Empty
              title="还没有个人方法"
              description="创建一个方法，或导入自己的 Skill 说明文件。"
              action={<Button onClick={newMethod}>新建方法</Button>}
            />
          )}
        </div>
      )}
      <div className="pm-bottom-note">
        <ShieldCheck size={16} />
        方法正文作为模型任务上下文使用。导入不会执行脚本，也不会自动安装工具。
      </div>
      <Modal
        wide
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name || '新建个人方法'}
      >
        {selected && (
          <form
            className="pm-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!selected.name.trim() || !selected.instructions.trim()) return
              const existing = store.data.skills.find(
                (s) => s.id === selected.id
              )
              const value: Skill = {
                ...selected,
                personal: true,
                id: existing && !existing.personal ? uid() : selected.id,
                version: existing?.personal ? existing.version + 1 : 1
              }
              if (
                await store.update((w) => ({
                  ...w,
                  skills: w.skills.some((s) => s.id === value.id)
                    ? w.skills.map((s) => (s.id === value.id ? value : s))
                    : [...w.skills, value]
                }))
              ) {
                setSelected(null)
                toast.success('个人方法已保存；进行中的任务配置不变')
              }
            }}
          >
            <div className="pm-two-columns">
              <Field label="方法名称">
                <input
                  required
                  value={selected.name}
                  onChange={(e) =>
                    setSelected({ ...selected, name: e.target.value })
                  }
                />
              </Field>
              <Field label="适用阶段">
                <select
                  value={selected.stage}
                  onChange={(e) =>
                    setSelected({ ...selected, stage: Number(e.target.value) })
                  }
                >
                  {stages.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="用途说明">
              <input
                value={selected.description}
                onChange={(e) =>
                  setSelected({ ...selected, description: e.target.value })
                }
              />
            </Field>
            <Field label="方法正文：输入要求、执行步骤、输出规范">
              <textarea
                required
                rows={9}
                value={selected.instructions}
                onChange={(e) =>
                  setSelected({ ...selected, instructions: e.target.value })
                }
              />
            </Field>
            {store.data.skills.some((s) => s.id === selected.id) && (
              <div className="pm-binding">
                <select
                  aria-label="选择应用方法的项目"
                  value={binding}
                  onChange={(e) => setBinding(e.target.value)}
                >
                  <option value="">选择项目…</option>
                  {store.data.projects
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  disabled={!binding}
                  onClick={async () => {
                    if (
                      await store.project(binding, (p) => ({
                        ...p,
                        skillId: selected.id
                      }))
                    )
                      toast.success('已将保存的此方法设为项目默认')
                  }}
                >
                  设为项目默认
                </Button>
              </div>
            )}
            <div className="pm-modal-actions">
              <span className="pm-muted">
                {selected.personal
                  ? '修改将保存为新方法版本。'
                  : '内置方法修改后保存为个人副本。'}
              </span>
              <Button variant="primary" type="submit">
                保存个人方法
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}

export function KnowledgeLibrary() {
  const store = usePM()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [conditions, setConditions] = useState('')
  const [projectId, setProjectId] = useState('')
  const item = store.data.knowledge.find((k) => k.id === selected)
  const list = store.data.knowledge.filter(
    (k) =>
      (filter === 'all' || k.status === filter) &&
      `${k.title} ${k.conditions}`.includes(query)
  )
  return (
    <>
      <Heading
        eyebrow="COLLECTIVE LEARNING"
        title="知识库"
        description="让一次项目的经验，成为下一次工作的起点。"
      />
      <div className="pm-list-toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            {
              id: 'all',
              label: '全部知识',
              count: store.data.knowledge.length
            },
            { id: 'draft', label: '待审阅草稿' },
            { id: 'published', label: '已发布' }
          ]}
        />
        <div className="pm-search">
          <Search size={16} />
          <input
            aria-label="搜索知识"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索案例、结论或适用场景…"
          />
        </div>
      </div>
      {list.length ? (
        <div className="pm-method-grid">
          {list.map((k) => (
            <button
              key={k.id}
              className="pm-method-card"
              onClick={() => {
                setSelected(k.id)
                setConditions(k.conditions)
                setProjectId('')
              }}
            >
              <div className="pm-method-top">
                <span className="pm-method-icon teal">
                  <BookOpen size={22} />
                </span>
                <Badge status={k.status} />
              </div>
              <h2>{k.title}</h2>
              <p>{k.conditions}</p>
              <div className="pm-method-bottom">
                <span>来自 {k.projectName}</span>
                <ArrowUpRight size={16} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title="把成果变成可复用的知识"
            description="打开项目交付物，点击「沉淀知识」，形成有来源、有适用条件的知识草稿。"
          />
        </Card>
      )}
      <Modal
        wide
        open={!!item}
        onClose={() => setSelected('')}
        title={item?.title || ''}
      >
        {item && (
          <div className="pm-form">
            <div className="pm-actions">
              <Badge status={item.status} />
              <span className="pm-muted">
                来源：{item.projectName} · 文档 v{item.version || 1}
              </span>
            </div>
            <div className="pm-knowledge-body">
              <Markdown>{item.content}</Markdown>
            </div>
            <Field label="适用条件与限制">
              <textarea
                rows={3}
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
              />
            </Field>
            <div className="pm-actions">
              <Button
                onClick={async () => {
                  if (
                    await store.update((w) => ({
                      ...w,
                      knowledge: w.knowledge.map((k) =>
                        k.id === item.id ? { ...k, conditions } : k
                      )
                    }))
                  )
                    toast.success('适用条件已保存')
                }}
              >
                保存说明
              </Button>
              {item.status === 'draft' && (
                <Button
                  variant="primary"
                  disabled={
                    !conditions.trim() || conditions === '适用条件待补充'
                  }
                  onClick={async () => {
                    if (
                      await store.update((w) => ({
                        ...w,
                        knowledge: w.knowledge.map((k) =>
                          k.id === item.id
                            ? { ...k, conditions, status: 'published' }
                            : k
                        )
                      }))
                    )
                      toast.success('知识已发布')
                  }}
                >
                  <Check size={16} />
                  审阅并发布
                </Button>
              )}
            </div>
            {item.status === 'published' && (
              <div className="pm-binding">
                <select
                  aria-label="选择引用知识的项目"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">选择引用项目…</option>
                  {store.data.projects
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="primary"
                  disabled={!projectId}
                  onClick={async () => {
                    if (
                      await store.project(projectId, (p) => ({
                        ...p,
                        sources: [
                          ...p.sources,
                          {
                            id: uid(),
                            title: `知识引用 · ${item.title}`,
                            kind: 'text',
                            at: now(),
                            content: `来源项目：${item.projectName}\n文档版本：v${item.version || 1}\n知识条目：${item.id}\n适用条件：${item.conditions}\n\n${item.content}`
                          }
                        ]
                      }))
                    ) {
                      toast.success('已作为来源资料加入项目')
                      setSelected('')
                    }
                  }}
                >
                  引用到项目 <ArrowRight size={15} />
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

export function Settings() {
  const store = usePM()
  const [tab, setTab] = useState('model')
  const file = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<Workspace | null>(null)
  const [checking, setChecking] = useState(false)
  return (
    <>
      <Heading
        eyebrow="WORKSPACE SETTINGS"
        title="设置"
        description="查看连接状态，管理本地资料与备份。"
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'model', label: '模型与中转站' },
          { id: 'tools', label: '工具连接' },
          { id: 'storage', label: '储存与备份' }
        ]}
      />
      {tab === 'model' && (
        <div className="pm-settings-grid">
          <Card
            title="当前 Agno 连接"
            extra={
              <Badge status={store.agent.connected ? 'approved' : 'failed'}>
                {store.agent.connected ? '服务可用' : '未连接'}
              </Badge>
            }
          >
            <div className="pm-form">
              <div className="pm-connection-logo">
                <Sparkles size={24} />
                <div>
                  <strong>{store.agent.agent}</strong>
                  <span>本机 AgentOS · OpenAI 兼容模型</span>
                </div>
              </div>
              <Field label="AgentOS 地址">
                <input readOnly value="http://127.0.0.1:7777" />
              </Field>
              <Field label="当前模型">
                <input readOnly value={store.agent.model} />
              </Field>
              <Field label="模型服务配置">
                <input readOnly value="由后端 .env 管理，前端不读取密钥" />
              </Field>
              <p className="pm-muted">
                更换模型、中转站或密钥后，需要重启 Agno
                后端。当前前端不提供每个任务动态切换模型的能力。
              </p>
              <Button
                variant="primary"
                disabled={checking}
                onClick={async () => {
                  setChecking(true)
                  await store.checkConnection()
                  setChecking(false)
                }}
              >
                <RefreshCw size={16} className={checking ? 'pm-spin' : ''} />
                {checking ? '正在检查…' : '检查服务连接'}
              </Button>
              {store.agent.error && (
                <p className="pm-danger">{store.agent.error}</p>
              )}
            </div>
          </Card>
          <Card title="能力说明">
            <div className="pm-capability-list">
              <div>
                <Check size={17} />
                <span>项目对话与单项生成</span>
                <Badge>
                  {store.agent.connected ? '可发起调用' : '需连接服务'}
                </Badge>
              </div>
              <div>
                <FileText size={17} />
                <span>文本资料上下文</span>
                <Badge>已支持</Badge>
              </div>
              <div>
                <Link2 size={17} />
                <span>网页采集 / PDF 解析</span>
                <Badge>尚未接入</Badge>
              </div>
              <div>
                <Settings2 size={17} />
                <span>任务级多模型切换</span>
                <Badge>尚未接入</Badge>
              </div>
            </div>
            <div className="pm-card-pad pm-muted">
              服务连通不代表模型调用一定成功，实际调用结果记录在项目运行记录中。
            </div>
          </Card>
        </div>
      )}
      {tab === 'tools' && (
        <div className="pm-method-grid">
          {[
            {
              name: '文本资料读取',
              text: 'TXT、Markdown、CSV、JSON 和粘贴正文，可以选入任务上下文。',
              state: '已支持',
              icon: FileText
            },
            {
              name: '网页资料采集',
              text: '目前可保存来源链接和手动补充正文；自动采集尚未接入后端。',
              state: '未接入',
              icon: Link2
            },
            {
              name: 'PDF / Word 解析',
              text: '请先提取所需正文后粘贴到资料库。当前不会将二进制文件误报为已解析。',
              state: '未接入',
              icon: BookOpen
            }
          ].map((t) => (
            <Card key={t.name} title={t.name}>
              <div className="pm-card-pad">
                <t.icon size={27} className="pm-blue" />
                <p>{t.text}</p>
                <Badge status={t.state === '已支持' ? 'approved' : undefined}>
                  {t.state}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'storage' && (
        <div className="pm-settings-grid">
          <Card title="本地数据与导出">
            <div className="pm-form">
              <div className="pm-soft-panel">
                <ShieldCheck size={21} />
                <div>
                  <strong>保存在本机项目服务</strong>
                  <p>
                    项目、资料正文、报告版本、方法和知识保存于本机数据库。浏览器保留恢复草稿；原
                    Agno 会话独立保存。
                  </p>
                </div>
              </div>
              <dl className="pm-definition">
                <dt>项目</dt>
                <dd>{store.data.projects.length} 个</dd>
                <dt>交付物</dt>
                <dd>
                  {store.data.projects.reduce(
                    (n, p) => n + p.artifacts.length,
                    0
                  )}{' '}
                  份
                </dd>
                <dt>知识条目</dt>
                <dd>{store.data.knowledge.length} 条</dd>
              </dl>
              <p className="pm-muted">
                同一台电脑打开本机服务可以继续工作。请定期下载备份；未确认保存的草稿仍需先导出。
              </p>
              {store.legacyAvailable && (
                <Button
                  onClick={() => {
                    const raw = localStorage.getItem('pmos.workspace.v1')
                    if (raw)
                      downloadText(
                        'PM-OS-浏览器迁移原件.json',
                        raw,
                        'application/json'
                      )
                  }}
                >
                  下载保留的浏览器旧资料
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() =>
                  downloadText(
                    `PM-OS-备份-${new Date().toISOString().slice(0, 10)}.json`,
                    JSON.stringify(store.data, null, 2),
                    'application/json'
                  )
                }
              >
                <Download size={16} />
                下载完整备份
              </Button>
            </div>
          </Card>
          <Card title="从备份恢复">
            <div className="pm-form">
              <p>
                导入已导出的 PM OS JSON
                文件。恢复会创建独立项目副本，保留当前项目。
              </p>
              <Button onClick={() => file.current?.click()}>
                <Upload size={16} />
                选择备份文件
              </Button>
              <input
                ref={file}
                type="file"
                hidden
                accept=".json"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  if (f.size > 10000000) {
                    toast.error('备份文件超过 10MB，请拆分项目导入')
                    return
                  }
                  try {
                    setBackup(validateBackup(JSON.parse(await f.text())))
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : '备份无法读取'
                    )
                  }
                }}
              />
              <p className="pm-muted">
                内容校验通过后才会显示恢复范围，不会直接覆盖当前数据。
              </p>
            </div>
          </Card>
        </div>
      )}
      <Modal
        open={!!backup}
        onClose={() => setBackup(null)}
        title="恢复为独立副本"
      >
        {backup && (
          <div className="pm-form">
            <p>
              将恢复 {backup.projects.length} 个项目、{backup.skills.length}{' '}
              个方法、{backup.knowledge.length} 条知识。原项目保持不变。
            </p>
            <Button
              variant="primary"
              onClick={async () => {
                const projectIds = new Map(
                  backup.projects.map((p) => [p.id, uid()])
                )
                const skillIds = new Map(
                  backup.skills.map((s) => [s.id, uid()])
                )
                const success = await store.update((w) => ({
                  ...w,
                  projects: [
                    ...w.projects,
                    ...backup.projects.map((p) => ({
                      ...p,
                      id: projectIds.get(p.id)!,
                      name: `${p.name} · 恢复副本`,
                      skillId: skillIds.get(p.skillId) || '',
                      archived: false,
                      updatedAt: now(),
                      tasks: p.tasks.map((t) => ({
                        ...t,
                        skillId: skillIds.get(t.skillId) || '',
                        status:
                          t.status === 'running'
                            ? ('failed' as const)
                            : t.status
                      })),
                      runs: p.runs.map((r) =>
                        r.status === 'running'
                          ? {
                              ...r,
                              status: 'failed' as const,
                              error: '备份中的运行未确认完成，请核对后重试。'
                            }
                          : r
                      )
                    }))
                  ],
                  skills: [
                    ...w.skills,
                    ...backup.skills.map((s) => ({
                      ...s,
                      id: skillIds.get(s.id)!,
                      personal: true
                    }))
                  ],
                  knowledge: [
                    ...w.knowledge,
                    ...backup.knowledge.map((k) => ({
                      ...k,
                      id: uid(),
                      projectId: projectIds.get(k.projectId) || k.projectId
                    }))
                  ]
                }))
                if (success) {
                  setBackup(null)
                  toast.success('备份已恢复为独立副本')
                }
              }}
            >
              确认恢复副本
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}
