'use client'
import { useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  Link2,
  Plus,
  Search,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { now, uid } from './domain'
import { usePM } from './provider'
import type { Project, Source, DataMode } from './model'
import { SourceDetail } from './source-detail'
import { RunContext } from './run-context'
import { RunExecution } from './run-execution'
import { versionSource, modeLabels } from './source-domain'
import { stages } from './catalog'
import {
  Badge,
  Button,
  Card,
  dateLabel,
  Empty,
  Field,
  Heading,
  Markdown,
  Modal,
  Tabs,
  type Navigate
} from './ui'

export function Sources({
  p,
  item,
  navigate
}: {
  p: Project
  item?: string
  navigate: Navigate
}) {
  const store = usePM()
  const [modal, setModal] = useState<'text' | 'link' | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [dataMode, setDataMode] = useState<DataMode>(
    p.demo ? 'simulation' : 'unknown'
  )
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const file = useRef<HTMLInputElement>(null)
  const source = p.sources.find((s) => s.id === item)
  const add = async (s: Source) => {
    if (
      await store.project(p.id, (q) => ({
        ...q,
        sources: [versionSource(s, dataMode), ...q.sources]
      }))
    ) {
      toast.success('资料已保存')
      setModal(null)
      setTitle('')
      setBody('')
      setUrl('')
      navigate('sources', p.id, s.id)
    }
  }
  if (source)
    return (
      <SourceDetail key={source.id} p={p} source={source} navigate={navigate} />
    )
  function renderModal() {
    return (
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'link' ? '添加来源链接' : '添加文本资料'}
      >
        <form
          className="pm-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim()) return
            if (modal === 'link') {
              try {
                if (!['http:', 'https:'].includes(new URL(url).protocol))
                  throw new Error()
              } catch {
                toast.error('请输入有效的 http 或 https 链接')
                return
              }
            } else if (!body.trim()) {
              toast.error('请填写正文')
              return
            }
            if (body.length > 200000) {
              toast.error('单份资料请控制在 20 万字符以内')
              return
            }
            add({
              id: uid(),
              title: title.trim(),
              content: body,
              kind: modal === 'link' ? 'link' : 'text',
              ...(modal === 'link' ? { url } : {}),
              at: now()
            })
          }}
        >
          <Field label="资料性质">
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
            >
              {Object.entries(modeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="资料名称">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：用户访谈纪要"
            />
          </Field>
          {modal === 'link' && (
            <Field label="来源链接">
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
          )}
          <Field
            label={modal === 'link' ? '补充正文（可稍后补充）' : '资料正文'}
          >
            <textarea
              rows={9}
              required={modal !== 'link'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="粘贴原文、观察记录或已有研究内容…"
            />
          </Field>
          {modal === 'link' && (
            <p className="pm-muted">
              当前保存链接与手动补充的正文，不会自动抓取网页。
            </p>
          )}
          <div className="pm-modal-actions">
            <Button type="button" onClick={() => setModal(null)}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={p.archived}>
              保存资料
            </Button>
          </div>
        </form>
      </Modal>
    )
  }
  const rows = p.sources.filter(
    (s) =>
      (filter === 'all' || s.kind === filter) &&
      s.title.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      <Heading
        eyebrow="PROJECT SOURCES"
        title="资料库"
        description="为项目保留可追溯的原始材料。"
        actions={
          <>
            <Button disabled={p.archived} onClick={() => setModal('link')}>
              <Link2 size={16} />
              添加链接
            </Button>
            <Button disabled={p.archived} onClick={() => setModal('text')}>
              <Plus size={16} />
              粘贴文本
            </Button>
            <Button
              variant="primary"
              disabled={p.archived}
              onClick={() => file.current?.click()}
            >
              <Upload size={16} />
              上传文本
            </Button>
          </>
        }
      />
      <input
        ref={file}
        hidden
        type="file"
        accept=".txt,.md,.csv,.json"
        onChange={async (e) => {
          const selected = e.target.files?.[0]
          e.target.value = ''
          if (!selected) return
          if (
            !/\.(txt|md|csv|json)$/i.test(selected.name) ||
            selected.size > 500000
          ) {
            toast.error('支持 500KB 以内的 TXT、Markdown、CSV 或 JSON 文本文件')
            return
          }
          try {
            const content = await selected.text()
            if (content.includes('\u0000') || !content.trim()) throw new Error()
            add({
              id: uid(),
              title: selected.name,
              kind: 'file',
              content,
              at: now()
            })
          } catch {
            toast.error('文件无法读取为文本，请粘贴正文重试')
          }
        }}
      />
      <div className="pm-list-toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: '全部资料', count: p.sources.length },
            { id: 'file', label: '文件' },
            { id: 'link', label: '链接' },
            { id: 'text', label: '文本' }
          ]}
        />
        <div className="pm-search">
          <Search size={16} />
          <input
            aria-label="搜索资料"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索资料名称…"
          />
        </div>
      </div>
      <Card>
        {rows.length ? (
          <div className="pm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>资料名称</th>
                  <th>类型</th>
                  <th>处理状态</th>
                  <th>引用情况</th>
                  <th>保存时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button
                        className="pm-table-title"
                        onClick={() => navigate('sources', p.id, s.id)}
                      >
                        {s.kind === 'link' ? (
                          <Link2 size={18} />
                        ) : (
                          <FileText size={18} />
                        )}
                        <strong>{s.title}</strong>
                      </button>
                    </td>
                    <td>
                      {s.kind === 'file'
                        ? '文件'
                        : s.kind === 'link'
                          ? '链接'
                          : '文本'}
                    </td>
                    <td>
                      <Badge status={s.content ? 'approved' : 'review'}>
                        {s.content ? '正文可用' : '待补正文'}
                      </Badge>
                    </td>
                    <td>
                      {
                        p.artifacts.filter((a) => a.sourceIds.includes(s.id))
                          .length
                      }{' '}
                      份交付物
                    </td>
                    <td>{dateLabel(s.at)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => navigate('sources', p.id, s.id)}
                      >
                        查看 <ArrowUpRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={query ? '没有匹配的资料' : '添加第一份工作资料'}
            description="支持文本文件、来源链接和粘贴正文。PDF 与 Word 自动解析尚未接入。"
            action={
              <Button
                variant="primary"
                disabled={p.archived}
                onClick={() => setModal('text')}
              >
                <Plus size={16} />
                添加资料
              </Button>
            }
          />
        )}
      </Card>
      <div className="pm-bottom-note">
        <FileText size={15} />
        原始资料与分析结论分开保存。上传文本保留正文，链接需补充正文才能参与分析。
      </div>
      {renderModal()}
    </>
  )
}

export function Decisions({ p }: { p: Project }) {
  const store = usePM()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [choice, setChoice] = useState('')
  const [reason, setReason] = useState('')
  return (
    <>
      <Heading
        eyebrow="PROJECT DECISIONS"
        title="决策记录"
        description="不仅保存做了什么，也留下为什么这样做。"
        actions={
          <Button
            variant="primary"
            disabled={p.archived}
            onClick={() => setOpen(true)}
          >
            <Plus size={16} />
            记录决策
          </Button>
        }
      />
      {p.decisions.length ? (
        <div className="pm-decision-list">
          {p.decisions.map((d) => (
            <Card
              key={d.id}
              title={d.title}
              extra={<span className="pm-muted">{dateLabel(d.at)}</span>}
            >
              <div className="pm-card-pad">
                <span className="pm-mini-label">最终选择</span>
                <h3>{d.choice}</h3>
                <span className="pm-mini-label">依据与原因</span>
                <p className="pm-preserve">{d.reason}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title="为关键选择留下依据"
            description="方案取舍、模型选择、功能范围，都可以成为一条可回顾的决策。"
            action={
              <Button disabled={p.archived} onClick={() => setOpen(true)}>
                记录第一条决策
              </Button>
            }
          />
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="记录一项决策">
        <form
          className="pm-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await store.project(p.id, (q) => ({
                ...q,
                decisions: [
                  { id: uid(), title, choice, reason, at: now() },
                  ...q.decisions
                ]
              }))
            ) {
              setOpen(false)
              setTitle('')
              setChoice('')
              setReason('')
              toast.success('决策已保存')
            }
          }}
        >
          <Field label="需要作出什么选择？">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="最终选择">
            <input
              required
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            />
          </Field>
          <Field label="备选方案、依据与复核条件">
            <textarea
              required
              rows={6}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={p.archived}>
            保存决策
          </Button>
        </form>
      </Modal>
    </>
  )
}

export function Runs({
  p,
  item,
  navigate
}: {
  p: Project
  item?: string
  navigate: Navigate
}) {
  const run = p.runs.find((r) => r.id === item)
  if (run)
    return (
      <>
        <div className="pm-page-back">
          <button onClick={() => navigate('runs', p.id)}>
            <ArrowLeft size={15} />
            运行记录
          </button>
        </div>
        <Heading
          eyebrow="RUN DETAILS"
          title={run.title}
          actions={<Badge status={run.status} />}
        />
        <div className="pm-two-columns">
          <Card title="执行信息">
            <dl className="pm-definition">
              <dt>运行开始</dt>
              <dd>{new Date(run.at).toLocaleString('zh-CN')}</dd>
              <dt>所属阶段</dt>
              <dd>{stages[run.stage]?.name}</dd>
              <dt>工作方法</dt>
              <dd>{run.skill}</dd>
              <dt>耗时</dt>
              <dd>
                {run.duration ? `${(run.duration / 1000).toFixed(1)} 秒` : '—'}
              </dd>
              <dt>费用</dt>
              <dd>不可用</dd>
              <dt>运行 ID</dt>
              <dd className="pm-break">{run.upstreamId || '未返回'}</dd>
            </dl>
          </Card>
          <Card title="本次输入">
            <div className="pm-card-pad">
              {run.sourceIds.length ? (
                run.sourceIds.map((id) => (
                  <button
                    className="pm-source-chip"
                    key={id}
                    onClick={() => navigate('sources', p.id, id)}
                  >
                    <FileText size={14} />
                    {p.sources.find((s) => s.id === id)?.title ||
                      '来源已不可用'}
                  </button>
                ))
              ) : (
                <p className="pm-muted">
                  本次使用任务说明或对话上下文，没有附加资料。
                </p>
              )}
              {run.artifactRefs?.map((ref) => (
                <p key={ref.id} className="pm-muted">
                  参考交付物：{ref.title} · v{ref.version}
                </p>
              ))}
              {run.taskId && (
                <Button
                  onClick={() => navigate('task', p.id, run.taskId, run.stage)}
                >
                  打开关联任务 <ArrowUpRight size={15} />
                </Button>
              )}
            </div>
          </Card>
        </div>
        {run.error && <div className="pm-error-note">{run.error}</div>}
        <RunContext run={run} />
        <RunExecution key={`${p.id}:${run.id}`} projectId={p.id} run={run} />
        <Card
          title={
            run.status === 'failed' ? '已接收片段 · 不代表完整结果' : '实际输出'
          }
        >
          <div className="pm-card-pad">
            {run.output ? (
              <Markdown>{run.output}</Markdown>
            ) : (
              <Empty
                title={
                  run.status === 'running' ? '正在等待输出' : '没有可展示的输出'
                }
              />
            )}
          </div>
        </Card>
      </>
    )
  return (
    <>
      <Heading
        eyebrow="EXECUTION HISTORY"
        title="运行记录"
        description="查看 Agent 实际执行了什么，以及每次运行的结果。"
      />
      <Card>
        {p.runs.length ? (
          <div className="pm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>任务 / 对话</th>
                  <th>阶段</th>
                  <th>状态</th>
                  <th>耗时</th>
                  <th>开始时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        className="pm-table-title"
                        onClick={() => navigate('runs', p.id, r.id)}
                      >
                        <strong>{r.title}</strong>
                      </button>
                    </td>
                    <td>{stages[r.stage]?.short}</td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      {r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td>{dateLabel(r.at)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => navigate('runs', p.id, r.id)}
                      >
                        查看 <ArrowUpRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="还没有实际运行记录"
            description="从任务或项目对话发起一次调用，真实结果会记录在这里。"
            action={
              <Button
                onClick={() => navigate('workflow', p.id, undefined, p.stage)}
              >
                进入当前阶段
              </Button>
            }
          />
        )}
      </Card>
    </>
  )
}
