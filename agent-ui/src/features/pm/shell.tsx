'use client'
import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Command,
  FileText,
  FolderKanban,
  FolderOpen,
  LayoutDashboard,
  Layers3,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Search,
  Settings2,
  Sparkles,
  Waypoints
} from 'lucide-react'
import { PMProvider, usePM } from './provider'
import { projectNav, stages } from './catalog'
import { ProjectConfig, ProjectHome, ProjectOverview } from './projects'
import { TaskDetail, Workflow } from './workflow'
import { Decisions, Runs, Sources } from './resources'
import { Artifacts } from './artifacts'
import { KnowledgeLibrary, Methods, Settings } from './libraries'
import { ProjectChat } from './chat'
import { Button, Card, cx, Empty, Modal, type Navigate } from './ui'
import { downloadText } from './domain'
import './pm.css'

const icons = {
  overview: LayoutDashboard,
  workflow: Waypoints,
  sources: FolderOpen,
  artifacts: FileText,
  decisions: CheckCircle2,
  runs: Activity,
  config: Settings2
}
export default function PMShell() {
  return (
    <PMProvider>
      <Workspace />
    </PMProvider>
  )
}
function Workspace() {
  const store = usePM()
  const router = useRouter()
  const params = useSearchParams()
  const view = params.get('view') || 'home'
  const pid = params.get('project') || ''
  const item = params.get('item') || undefined
  const rawStage = params.get('stage')
  const stage =
    rawStage !== null && /^\d$/.test(rawStage) && Number(rawStage) < 8
      ? Number(rawStage)
      : undefined
  const p = store.data.projects.find((p) => p.id === pid)
  const [chat, setChat] = useState(false)
  const [focus, setFocus] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [compact, setCompact] = useState(false)
  const [search, setSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [help, setHelp] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const navigate: Navigate = useCallback(
    (next, projectId, target, stageIndex) => {
      const query = new URLSearchParams()
      if (next !== 'home') query.set('view', next)
      if (projectId) query.set('project', projectId)
      if (target) query.set('item', target)
      if (stageIndex !== undefined) query.set('stage', String(stageIndex))
      router.push('/' + (query.size ? '?' + query.toString() : ''))
      setMobileNav(false)
      setFocus(false)
    },
    [router]
  )
  const global =
    view === 'methods'
      ? 'methods'
      : view === 'knowledge'
        ? 'knowledge'
        : view === 'settings'
          ? 'settings'
          : 'home'
  const label = p
    ? projectNav.find(([v]) => v === view)?.[1] ||
      (view === 'task' ? '任务详情' : '项目工作区')
    : {
        home: '项目',
        methods: '方法库',
        knowledge: '知识库',
        settings: '设置'
      }[global]
  const notificationRows = store.data.projects
    .filter((p) => !p.archived)
    .flatMap((p) =>
      p.artifacts
        .filter((a) => ['review', 'stale'].includes(a.status))
        .map((a) => ({ p, a }))
    )
  const findings = query.trim()
    ? store.data.projects
        .flatMap((p) => [
          {
            title: p.name,
            type: '项目',
            action: () => navigate('overview', p.id)
          },
          ...p.artifacts.map((a) => ({
            title: a.title,
            type: `${p.name} · 交付物`,
            action: () => navigate('artifacts', p.id, a.id)
          })),
          ...p.sources.map((s) => ({
            title: s.title,
            type: `${p.name} · 资料`,
            action: () => navigate('sources', p.id, s.id)
          })),
          ...p.tasks.map((t) => ({
            title: t.title,
            type: `${p.name} · 任务`,
            action: () => navigate('task', p.id, t.id, t.stage)
          }))
        ])
        .filter((x) =>
          `${x.title} ${x.type}`.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 15)
    : []
  const content = () => {
    if (view === 'home') return <ProjectHome navigate={navigate} />
    if (view === 'methods') return <Methods />
    if (view === 'knowledge') return <KnowledgeLibrary />
    if (view === 'settings') return <Settings />
    if (!p)
      return (
        <Empty
          title="没有找到这个项目"
          description="此项目尚未保存在本机工作区，或尚未从备份恢复。"
          action={
            <Button onClick={() => navigate('home')}>返回项目列表</Button>
          }
        />
      )
    switch (view) {
      case 'overview':
        return <ProjectOverview p={p} navigate={navigate} />
      case 'workflow':
        return (
          <Workflow
            key={`${p.id}-${stage}`}
            p={p}
            stage={stage}
            navigate={navigate}
          />
        )
      case 'task': {
        const task = p.tasks.find((t) => t.id === item)
        return task ? (
          <TaskDetail key={task.id} p={p} task={task} navigate={navigate} />
        ) : (
          <Empty
            title="任务不存在"
            action={
              <Button onClick={() => navigate('workflow', p.id)}>
                查看流程
              </Button>
            }
          />
        )
      }
      case 'sources':
        return <Sources key={p.id} p={p} item={item} navigate={navigate} />
      case 'artifacts':
        return <Artifacts key={p.id} p={p} item={item} navigate={navigate} />
      case 'decisions':
        return <Decisions key={p.id} p={p} />
      case 'runs':
        return <Runs p={p} item={item} navigate={navigate} />
      case 'config':
        return <ProjectConfig key={p.id} p={p} navigate={navigate} />
      default:
        return <ProjectOverview p={p} navigate={navigate} />
    }
  }
  return (
    <div
      className={cx(
        'pm-app',
        compact && 'pm-compact',
        p && 'pm-in-project',
        chat && p && 'pm-chat-open',
        focus && 'pm-chat-focused'
      )}
    >
      {mobileNav && (
        <button
          className="pm-nav-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="关闭导航"
        />
      )}
      <aside className={cx('pm-global-nav', mobileNav && 'pm-nav-visible')}>
        <button
          className="pm-brand"
          onClick={() => navigate('home')}
          aria-label="PM OS 首页"
        >
          <span className="pm-brand-symbol">
            <Layers3 size={22} />
          </span>
          <strong>
            PM <em>OS</em>
          </strong>
        </button>
        <div className="pm-workspace-label">
          个人工作空间 <ChevronDown size={13} />
        </div>
        <nav aria-label="全局导航">
          {[
            { id: 'home', title: '项目', icon: FolderKanban },
            { id: 'methods', title: '方法库', icon: BookOpen },
            { id: 'knowledge', title: '知识库', icon: Layers3 },
            { id: 'settings', title: '设置', icon: Settings2 }
          ].map((n) => (
            <button
              key={n.id}
              className={cx(global === n.id && 'active')}
              title={n.title}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.title}</span>
              {n.id === 'home' && (
                <small>
                  {store.data.projects.filter((p) => !p.archived).length}
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="pm-nav-footer">
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            <span>使用说明</span>
          </button>
          <Link
            href="/chat?db_id=pm-local-db&agent=agno-assist"
            target="_blank"
          >
            <MessageSquare size={17} />
            <span>原版 Agno 对话</span>
            <ArrowUpRight size={13} />
          </Link>
          <div className="pm-local-profile">
            <span className="pm-person-avatar">我</span>
            <div>
              <strong>我的工作台</strong>
              <small>Local workspace</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="pm-app-body">
        <header className="pm-topbar">
          <div className="pm-breadcrumb">
            <button
              className="pm-icon-button pm-mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="展开导航"
            >
              <Menu size={19} />
            </button>
            <button
              className="pm-icon-button pm-collapse"
              onClick={() => setCompact(!compact)}
              aria-label="折叠全局导航"
            >
              <PanelLeftClose size={18} />
            </button>
            <button onClick={() => navigate('home')}>工作空间</button>
            <span>/</span>
            {p ? (
              <>
                <button onClick={() => navigate('overview', p.id)}>
                  {p.name}
                </button>
                <span>/</span>
              </>
            ) : null}
            <strong>{label}</strong>
          </div>
          <div className="pm-topbar-actions">
            <button
              className="pm-header-search"
              onClick={() => setSearch(true)}
            >
              <Search size={16} />
              <span>搜索工作内容</span>
              <Command size={12} />
            </button>
            <span className="pm-connection-status">
              <i className={store.agent.connected ? 'connected' : ''} />
              {store.agent.agent} {store.agent.connected ? '已连接' : '未连接'}
            </span>
            <button
              className="pm-icon-button pm-bell"
              aria-label="待处理事项"
              onClick={() => setNotifications(true)}
            >
              <Bell size={18} />
              {notificationRows.length > 0 && <i />}
            </button>
            {p && (
              <Button
                variant={chat ? 'primary' : 'default'}
                onClick={() => {
                  setChat(!chat)
                  setFocus(false)
                }}
              >
                <Sparkles size={16} />
                <span>项目对话</span>
              </Button>
            )}
          </div>
        </header>
        {store.saveError && (
          <div className="pm-save-warning" role="alert">
            {store.saveError}
            <button
              disabled={store.saving}
              onClick={() => void store.retrySave()}
            >
              重试原提交
            </button>
            <button
              disabled={store.saving}
              onClick={() => void store.reloadWorkspace()}
            >
              保留恢复副本并重新加载
            </button>
            <button
              onClick={() =>
                downloadText(
                  'PM-OS-紧急备份.json',
                  store.exportRecovery() || JSON.stringify(store.data, null, 2),
                  'application/json'
                )
              }
            >
              导出当前内容
            </button>
          </div>
        )}
        {store.saving && (
          <div className="pm-save-warning" role="status">
            正在保存到本机项目服务…
          </div>
        )}
        <div className="pm-workspace-body">
          {p && (
            <aside
              className={cx('pm-project-nav', mobileNav && 'pm-nav-visible')}
            >
              <button
                className="pm-back-projects"
                onClick={() => navigate('home')}
              >
                <ArrowLeft size={14} />
                所有项目
              </button>
              <div className="pm-project-identity">
                <span>
                  <FolderKanban size={19} />
                </span>
                <strong>{p.name}</strong>
              </div>
              <span className="pm-project-nav-caption">项目工作区</span>
              <nav aria-label="项目导航">
                {projectNav.map(([id, name]) => {
                  const Icon = icons[id]
                  return (
                    <button
                      key={id}
                      className={cx(
                        (view === id ||
                          (view === 'task' && id === 'workflow')) &&
                          'active'
                      )}
                      onClick={() => navigate(id, p.id)}
                    >
                      <Icon size={17} />
                      {name}
                      {id === 'artifacts' && p.artifacts.length > 0 && (
                        <small>{p.artifacts.length}</small>
                      )}
                    </button>
                  )
                })}
              </nav>
              <div className="pm-project-nav-foot">
                <span className="pm-mini-label">当前阶段</span>
                <strong>
                  {String(p.stage + 1).padStart(2, '0')} ·{' '}
                  {stages[p.stage].short}
                </strong>
                <div className="pm-mini-steps">
                  {stages.map((s, i) => (
                    <i
                      key={s.name}
                      className={cx(
                        p.stageStates[i] === '已确认' && 'complete',
                        i === p.stage && 'current'
                      )}
                    />
                  ))}
                </div>
                <small>
                  {p.archived
                    ? '已归档 · 只读浏览'
                    : p.demo
                      ? '示例项目 · 可编辑体验'
                      : '资料保存于本机项目服务'}
                </small>
              </div>
            </aside>
          )}
          <main className="pm-main" key={`${pid}:${view}`} id="main-content">
            {!store.ready ? (
              <div className="pm-loading">
                <span className="pm-pulse-dot" />
                正在打开工作空间…
              </div>
            ) : (
              <div className="pm-main-inner">
                {p?.archived && (
                  <div className="pm-inline-note">
                    项目已归档。如需继续编辑或运行，请在项目配置中恢复。
                  </div>
                )}
                {content()}
              </div>
            )}
          </main>
          {p && chat && (
            <ProjectChat
              key={p.id}
              p={p}
              stage={
                stage ??
                p.artifacts.find((a) => a.id === item)?.stage ??
                p.tasks.find((t) => t.id === item)?.stage ??
                p.stage
              }
              artifactId={view === 'artifacts' ? item : undefined}
              taskId={view === 'task' ? item : undefined}
              onClose={() => {
                setChat(false)
                setFocus(false)
              }}
              focus={focus}
              onFocus={() => setFocus(!focus)}
              navigate={navigate}
            />
          )}
        </div>
      </div>
      <Modal
        open={search}
        onClose={() => setSearch(false)}
        title="搜索工作内容"
      >
        <div className="pm-form">
          <div className="pm-search pm-search-full">
            <Search size={18} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="项目、资料、任务或交付物名称…"
            />
          </div>
          {findings.map((f, i) => (
            <button
              className="pm-search-result"
              key={i}
              onClick={() => {
                f.action()
                setSearch(false)
              }}
            >
              <FileText size={17} />
              <span>
                <strong>{f.title}</strong>
                <small>{f.type}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {query && !findings.length && (
            <p className="pm-muted">没有匹配的内容。</p>
          )}
        </div>
      </Modal>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="待处理事项"
      >
        <div className="pm-form">
          {notificationRows.length ? (
            notificationRows.map(({ p, a }) => (
              <button
                className="pm-search-result"
                key={`${p.id}-${a.id}`}
                onClick={() => {
                  navigate('artifacts', p.id, a.id)
                  setNotifications(false)
                }}
              >
                <FileText size={18} />
                <span>
                  <strong>{a.title}</strong>
                  <small>{p.name} · 待审阅当前版本</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))
          ) : (
            <Empty title="当前没有待审阅的成果" />
          )}
        </div>
      </Modal>
      <Modal
        open={help}
        onClose={() => setHelp(false)}
        title="让工作沿着项目推进"
      >
        <div className="pm-form">
          <p>
            创建项目 → 添加资料 → 进入阶段并创建任务 → 运行 Agent → 审阅交付物 →
            复盘与知识沉淀。
          </p>
          <Card title="当前可以使用">
            <div className="pm-card-pad">
              项目与任务管理、文本资料、真实 Agno
              对话与单项生成、报告编辑与版本确认、方法说明、知识发布与备份。
            </div>
          </Card>
          <Card title="保存与连接">
            <div className="pm-card-pad">
              业务资料保存在本机项目服务，请定期在设置中导出。浏览器保留恢复草稿。模型使用已有后端配置；自动网页采集、PDF
              解析、批量评测和完整工作流调度尚未接入。
            </div>
          </Card>
          <Button onClick={() => setHelp(false)}>
            开始工作 <ArrowRightIcon />
          </Button>
        </div>
      </Modal>
    </div>
  )
}
function ArrowRightIcon() {
  return <ArrowUpRight size={15} />
}
