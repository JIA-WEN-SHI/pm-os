'use client'
import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  Search,
  Sparkles,
  Target,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { usePM } from './provider'
import { createProject, downloadText } from './domain'
import { stages } from './catalog'
import type { Project } from './model'
import {
  ArtifactRow,
  Badge,
  Button,
  Card,
  cx,
  dateLabel,
  Empty,
  Field,
  Heading,
  Modal,
  Tabs,
  type Navigate
} from './ui'

export function NewProject({
  open,
  onClose,
  navigate
}: {
  open: boolean
  onClose: () => void
  navigate: Navigate
}) {
  const { update } = usePM()
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [outputs, setOutputs] = useState('研究报告、产品方案、验证计划')
  return (
    <Modal open={open} onClose={onClose} title="从一个真实问题开始">
      <form
        className="pm-form"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const p = createProject({ name, goal, audience, outputs })
            if (await update((w) => ({ ...w, projects: [p, ...w.projects] }))) {
              onClose()
              navigate('overview', p.id)
              toast.success('项目已创建')
            }
          } catch (error) {
            toast.error((error as Error).message)
          }
        }}
      >
        <p className="pm-muted">先定义目标，资料和方法可以在项目中逐步补充。</p>
        <Field label="项目名称 *">
          <input
            required
            maxLength={80}
            placeholder="例如：企业知识助手"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="希望解决什么问题？ *">
          <textarea
            required
            rows={3}
            placeholder="描述目前的工作方式、困难，以及希望改善的地方…"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </Field>
        <Field label="目标用户与使用场景">
          <input
            placeholder="谁会使用？在什么情况下使用？"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />
        </Field>
        <Field label="预期产出">
          <input
            required
            value={outputs}
            onChange={(e) => setOutputs(e.target.value)}
          />
        </Field>
        <div className="pm-soft-panel">
          <Sparkles size={18} />
          <div>
            <strong>AI 产品完整路径</strong>
            <p>从调研与发现，到交付和知识沉淀，共 8 个阶段。</p>
          </div>
        </div>
        <div className="pm-modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit">
            创建并进入项目 <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function ProjectHome({ navigate }: { navigate: Navigate }) {
  const { data, update } = usePM()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [list, setList] = useState(false)
  const active = data.projects.filter((p) => !p.archived)
  const pending = active.flatMap((p) =>
    p.artifacts
      .filter((a) => ['review', 'stale'].includes(a.status))
      .map((a) => ({ p, a }))
  )
  const failed = active.flatMap((p) =>
    p.tasks.filter((t) => t.status === 'failed').map((t) => ({ p, t }))
  )
  const projects = data.projects.filter(
    (p) =>
      (filter === 'archived' ? p.archived : !p.archived) &&
      (filter !== 'mine' || !p.demo) &&
      `${p.name} ${p.goal}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      <Heading
        eyebrow="YOUR WORKSPACE"
        title="我的项目"
        description="从问题出发，让每一步都有产出。"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            新建项目
          </Button>
        }
      />
      <div className="pm-home-summary">
        <div>
          <FolderKanban size={19} />
          <strong>{active.length}</strong>
          <span>进行中的项目</span>
        </div>
        <div>
          <FileText size={19} />
          <strong>{active.reduce((n, p) => n + p.artifacts.length, 0)}</strong>
          <span>已保存的交付物</span>
        </div>
        <div>
          <Bell size={19} />
          <strong>{pending.length + failed.length}</strong>
          <span>待处理事项</span>
        </div>
        <span className="pm-summary-note">
          <span className="pm-status-dot" />
          本机项目服务 · 各浏览器共享
        </span>
      </div>
      {(pending.length > 0 || failed.length > 0) && (
        <Card
          title="待我处理"
          extra={
            <span className="pm-count">{pending.length + failed.length}</span>
          }
          className="pm-attention-card"
        >
          {pending.slice(0, 3).map(({ p, a }) => (
            <button
              className="pm-attention-row"
              key={a.id}
              onClick={() => navigate('artifacts', p.id, a.id)}
            >
              <span className="pm-attention-icon">
                <FileText size={18} />
              </span>
              <div className="pm-grow">
                <strong>{a.title}</strong>
                <small>
                  {p.name}
                  {p.demo ? ' · 示例项目' : ''} · 请审阅当前版本
                </small>
              </div>
              <Badge status={a.status} />
              <span className="pm-text-link">
                打开审阅 <ArrowUpRight size={14} />
              </span>
            </button>
          ))}
          {failed.slice(0, 2).map(({ p, t }) => (
            <button
              className="pm-attention-row"
              key={t.id}
              onClick={() => navigate('task', p.id, t.id, t.stage)}
            >
              <span className="pm-attention-icon">
                <Clock3 size={18} />
              </span>
              <span className="pm-grow">
                <strong>{t.title}</strong>
                <small>{p.name} · 查看原因后重试</small>
              </span>
              <Badge status="failed" />
              <ChevronRight size={17} />
            </button>
          ))}
        </Card>
      )}
      <div className="pm-list-toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: '全部项目', count: active.length },
            { id: 'mine', label: '我的项目' },
            { id: 'archived', label: '已归档' }
          ]}
        />
        <div className="pm-actions">
          <div className="pm-search">
            <Search size={16} />
            <input
              aria-label="搜索项目"
              placeholder="搜索项目…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className="pm-icon-button"
            onClick={() => setList(!list)}
            aria-label={list ? '卡片视图' : '列表视图'}
          >
            {list ? <LayoutGrid size={17} /> : <List size={17} />}
          </button>
        </div>
      </div>
      <div className={cx('pm-project-grid', list && 'pm-project-list')}>
        {projects.map((p, i) => (
          <article className="pm-project-card" key={p.id}>
            <div className="pm-project-card-head">
              <span className={cx('pm-project-avatar', i % 2 !== 0 && 'teal')}>
                <FolderKanban size={24} />
              </span>
              {p.demo && <span className="pm-demo-pill">示例项目</span>}
              <span className="pm-project-card-arrow">
                <ArrowUpRight size={18} />
              </span>
            </div>
            <button
              className="pm-title-button"
              onClick={() => navigate('overview', p.id)}
            >
              <h2>{p.name}</h2>
            </button>
            <p className="pm-project-description">{p.goal}</p>
            <div className="pm-card-meta">
              <span>当前阶段</span>
              <Badge status={p.archived ? undefined : 'running'}>
                {p.archived ? '已归档' : stages[p.stage].name}
              </Badge>
            </div>
            <div className="pm-mini-steps" aria-label="八阶段进度">
              {p.stageStates.map((s, j) => (
                <i
                  key={j}
                  className={cx(
                    s === '已确认' && 'complete',
                    j === p.stage && 'current'
                  )}
                />
              ))}
            </div>
            <div className="pm-project-card-footer">
              <span>
                <Clock3 size={13} />
                {dateLabel(p.updatedAt)} 更新
              </span>
              {p.archived ? (
                <Button
                  onClick={async () =>
                    await update((w) => ({
                      ...w,
                      projects: w.projects.map((x) =>
                        x.id === p.id ? { ...x, archived: false } : x
                      )
                    }))
                  }
                >
                  恢复项目
                </Button>
              ) : (
                <button
                  className="pm-text-link"
                  onClick={() => navigate('overview', p.id)}
                >
                  继续工作 <ArrowRight size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
        {filter !== 'archived' && !query && (
          <button className="pm-new-card" onClick={() => setOpen(true)}>
            <span>
              <Plus size={25} />
            </span>
            <strong>开启下一个项目</strong>
            <p>把一个想法，变成可推进的工作</p>
          </button>
        )}
      </div>
      {!projects.length && (query || filter === 'archived') && (
        <Empty
          title={query ? '没有找到匹配的项目' : '还没有归档项目'}
          description={
            query
              ? '换一个关键词，或清除搜索条件。'
              : '归档后的项目和成果会保留在这里。'
          }
        />
      )}
      <div className="pm-home-bottom">
        <BookOpen size={20} />
        <div>
          <strong>好的方法，会让下一次工作更轻松</strong>
          <p>在方法库中管理自己的 Skills，让每个项目都可以复用。</p>
        </div>
        <Button variant="ghost" onClick={() => navigate('methods')}>
          打开方法库 <ArrowUpRight size={16} />
        </Button>
      </div>
      <NewProject
        open={open}
        onClose={() => setOpen(false)}
        navigate={navigate}
      />
    </>
  )
}

export function ProjectOverview({
  p,
  navigate
}: {
  p: Project
  navigate: Navigate
}) {
  const pending = p.artifacts.filter((a) =>
    ['review', 'stale'].includes(a.status)
  )
  const tasks = p.tasks.filter((t) => t.status !== 'done')
  return (
    <>
      <Heading
        eyebrow="PROJECT OVERVIEW"
        title={p.name}
        description={p.goal}
        actions={
          <>
            <Button onClick={() => navigate('config', p.id)}>编辑项目</Button>
            <Button
              variant="primary"
              disabled={p.archived}
              onClick={() => navigate('workflow', p.id, undefined, p.stage)}
            >
              继续当前阶段 <ArrowRight size={16} />
            </Button>
          </>
        }
      />
      {p.demo && (
        <div className="pm-inline-note">
          <Sparkles size={16} />
          这是示例项目，可体验编辑与审阅。示例内容不是真实研究或运行结果。
        </div>
      )}
      <div className="pm-overview-stats">
        <Card>
          <span className="pm-stat-icon">
            <Target size={20} />
          </span>
          <small>当前关注阶段</small>
          <strong>{stages[p.stage].name}</strong>
          <span className="pm-muted">第 {p.stage + 1} / 8 阶段</span>
        </Card>
        <Card>
          <span className="pm-stat-icon amber">
            <FileText size={20} />
          </span>
          <small>需要你确认</small>
          <strong>
            {pending.length}
            <em> 份交付物</em>
          </strong>
          <span className="pm-muted">每次确认都绑定具体版本</span>
        </Card>
        <Card>
          <span className="pm-stat-icon teal">
            <CheckCircle2 size={20} />
          </span>
          <small>已确认成果</small>
          <strong>
            {p.artifacts.filter((a) => a.status === 'approved').length}
            <em> 份文档</em>
          </strong>
          <span className="pm-muted">可随时查看与导出</span>
        </Card>
      </div>
      <Card
        title="业务路径"
        extra={
          <button
            className="pm-text-link"
            onClick={() => navigate('workflow', p.id)}
          >
            查看完整流程 <ArrowUpRight size={14} />
          </button>
        }
      >
        <div className="pm-stage-strip">
          {stages.map((s, i) => (
            <button
              key={s.name}
              className={cx(
                p.stage === i && 'active',
                p.stageStates[i] === '已确认' && 'complete'
              )}
              onClick={() => navigate('workflow', p.id, undefined, i)}
            >
              <span>
                {p.stageStates[i] === '已确认' ? (
                  <CheckCircle2 size={19} />
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              <strong>{s.short}</strong>
              <small>{p.stageStates[i]}</small>
            </button>
          ))}
        </div>
      </Card>
      <div className="pm-two-columns">
        <Card
          title="待我处理"
          extra={<span className="pm-count">{pending.length}</span>}
        >
          {pending.length ? (
            pending.map((a) => (
              <ArtifactRow
                key={a.id}
                title={a.title}
                version={a.revisions.at(-1)!.version}
                status={a.status}
                onClick={() => navigate('artifacts', p.id, a.id)}
              />
            ))
          ) : (
            <Empty
              title="当前没有待确认的成果"
              description="完成一个任务后，在这里审阅产出。"
            />
          )}
        </Card>
        <Card title="接下来做什么">
          {tasks.length ? (
            tasks.slice(0, 3).map((t) => (
              <button
                className="pm-task-compact"
                key={t.id}
                onClick={() => navigate('task', p.id, t.id, t.stage)}
              >
                <span className="pm-check-outline" />
                <span className="pm-grow">
                  <strong>{t.title}</strong>
                  <small>{stages[t.stage].name}</small>
                </span>
                <Badge status={t.status} />
              </button>
            ))
          ) : (
            <div className="pm-next-step">
              <span className="pm-stat-icon">
                <Sparkles size={20} />
              </span>
              <h3>
                {p.sources.length ? stages[p.stage].verb : '先添加一份工作资料'}
              </h3>
              <p>
                {p.sources.length
                  ? '已有资料可以作为输入，创建一项具体任务开始分析。'
                  : '上传文本、粘贴内容，或者记录需要研究的来源链接。'}
              </p>
              <Button
                onClick={() =>
                  navigate(
                    p.sources.length ? 'workflow' : 'sources',
                    p.id,
                    undefined,
                    p.stage
                  )
                }
              >
                {p.sources.length ? '进入阶段' : '添加资料'}{' '}
                <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </Card>
      </div>
      <div className="pm-two-columns">
        <Card title="最近交付物">
          {p.artifacts.length ? (
            p.artifacts
              .slice(0, 3)
              .map((a) => (
                <ArtifactRow
                  key={a.id}
                  title={a.title}
                  version={a.revisions.at(-1)!.version}
                  status={a.status}
                  subtitle={stages[a.stage].name}
                  onClick={() => navigate('artifacts', p.id, a.id)}
                />
              ))
          ) : (
            <Empty
              title="成果会保存在这里"
              description="通过 Agent 生成，或自己新建一份文档。"
            />
          )}
        </Card>
        <Card title="项目约定">
          <dl className="pm-definition">
            <dt>目标用户</dt>
            <dd>{p.audience || '待补充'}</dd>
            <dt>预期产出</dt>
            <dd>{p.outputs}</dd>
            <dt>执行方式</dt>
            <dd>Agent 辅助 · 人工审阅确认</dd>
          </dl>
        </Card>
      </div>
    </>
  )
}

export function ProjectConfig({
  p,
  navigate
}: {
  p: Project
  navigate: Navigate
}) {
  const store = usePM()
  const [name, setName] = useState(p.name)
  const [goal, setGoal] = useState(p.goal)
  const [audience, setAudience] = useState(p.audience)
  const [outputs, setOutputs] = useState(p.outputs)
  const [skill, setSkill] = useState(p.skillId)
  return (
    <>
      <Heading
        eyebrow="PROJECT SETTINGS"
        title="项目配置"
        description="明确目标、选择方法，让项目按你的方式推进。"
      />
      <div className="pm-settings-grid">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim() || !goal.trim()) {
              toast.error('请填写名称与目标')
              return
            }
            if (
              await store.project(p.id, (q) => ({
                ...q,
                name: name.trim(),
                goal,
                audience,
                outputs,
                skillId: skill
              }))
            )
              toast.success('项目配置已保存')
          }}
        >
          <Card title="基本信息">
            <div className="pm-form">
              <Field label="项目名称">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="业务目标">
                <textarea
                  required
                  rows={3}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </Field>
              <Field label="目标用户与场景">
                <input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                />
              </Field>
              <Field label="预期产出">
                <input
                  value={outputs}
                  onChange={(e) => setOutputs(e.target.value)}
                />
              </Field>
            </div>
          </Card>
          <Card title="方法与模型">
            <div className="pm-form">
              <Field
                label="默认工作方法"
                hint="未设置时，任务使用对应阶段的方法；任务可单独调整。"
              >
                <select
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                >
                  <option value="">继承阶段方法</option>
                  {store.data.skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · v{s.version}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pm-config-row">
                <span>当前模型</span>
                <strong>{store.agent.model}</strong>
              </div>
              <p className="pm-muted">
                使用 Agno 后端的模型配置。前端不储存 API 密钥。
              </p>
              <Button type="submit" variant="primary" disabled={p.archived}>
                保存配置
              </Button>
            </div>
          </Card>
        </form>
        <div>
          <Card title="项目数据">
            <div className="pm-form">
              <p className="pm-muted">
                项目内容自动保存。不同浏览器访问同一服务时共享项目，可导出备份。
              </p>
              <Button
                onClick={() =>
                  downloadText(
                    `${p.name}-项目备份.json`,
                    JSON.stringify(
                      {
                        schema: 1,
                        projects: [p],
                        skills: store.data.skills,
                        knowledge: store.data.knowledge.filter(
                          (k) => k.projectId === p.id
                        )
                      },
                      null,
                      2
                    ),
                    'application/json'
                  )
                }
              >
                <Upload size={16} />
                导出项目备份
              </Button>
            </div>
          </Card>
          <Card title="归档与恢复">
            <div className="pm-form">
              <p className="pm-muted">归档会保留资料与成果，并停止新增执行。</p>
              <Button
                disabled={!!store.busy[p.id]}
                onClick={async () => {
                  if (
                    await store.project(p.id, (q) => ({
                      ...q,
                      archived: !q.archived
                    }))
                  ) {
                    toast.success(p.archived ? '项目已恢复' : '项目已归档')
                    navigate('home')
                  }
                }}
              >
                {p.archived ? '恢复项目' : '归档项目'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
