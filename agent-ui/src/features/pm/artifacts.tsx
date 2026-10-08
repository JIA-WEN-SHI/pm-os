'use client'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Download,
  FileText,
  GitCompareArrows,
  Pencil,
  Plus,
  Save,
  Search
} from 'lucide-react'
import { toast } from 'sonner'
import type { Artifact, Project, ReportSelection } from './model'
import {
  approveArtifact,
  downloadText,
  now,
  reviseArtifact,
  uid
} from './domain'
import { stages } from './catalog'
import { usePM } from './provider'
import { ReportSections } from './report-sections'
import { CopyAssistant } from './copy-assistant'
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

export function Artifacts({
  p,
  item,
  navigate
}: {
  p: Project
  item?: string
  navigate: Navigate
}) {
  const store = usePM()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [create, setCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState(p.stage)
  const artifact = p.artifacts.find((a) => a.id === item)
  if (artifact)
    return (
      <ArtifactEditor
        key={artifact.id}
        p={p}
        artifact={artifact}
        navigate={navigate}
      />
    )
  const items = p.artifacts.filter(
    (a) =>
      (filter === 'all' || a.status === filter) &&
      a.title.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      <Heading
        eyebrow="PROJECT DELIVERABLES"
        title="交付物"
        description="把每个阶段的工作，沉淀成可以审阅与复用的成果。"
        actions={
          <Button
            variant="primary"
            disabled={p.archived}
            onClick={() => setCreate(true)}
          >
            <Plus size={16} />
            新建文档
          </Button>
        }
      />
      <div className="pm-list-toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: '全部', count: p.artifacts.length },
            { id: 'draft', label: '草稿' },
            { id: 'review', label: '待确认' },
            { id: 'approved', label: '已确认' },
            { id: 'stale', label: '需复核' }
          ]}
        />
        <div className="pm-search">
          <Search size={16} />
          <input
            aria-label="搜索交付物"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文档…"
          />
        </div>
      </div>
      <Card>
        {items.length ? (
          <div className="pm-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>文档名称</th>
                  <th>所属阶段</th>
                  <th>当前版本</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <button
                        className="pm-table-title"
                        onClick={() => navigate('artifacts', p.id, a.id)}
                      >
                        <span className="pm-file-icon">
                          <FileText size={18} />
                        </span>
                        <strong>{a.title}</strong>
                      </button>
                    </td>
                    <td>{stages[a.stage].short}</td>
                    <td>
                      <span className="pm-version">
                        v{a.revisions.at(-1)!.version}
                      </span>
                    </td>
                    <td>
                      <Badge status={a.status} />
                    </td>
                    <td>{dateLabel(a.revisions.at(-1)!.at)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => navigate('artifacts', p.id, a.id)}
                      >
                        打开 <ArrowUpRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              query || filter !== 'all'
                ? '没有符合条件的文档'
                : '让工作留下成果'
            }
            description="通过任务生成报告，或新建文档整理自己的分析。"
            action={
              <Button disabled={p.archived} onClick={() => setCreate(true)}>
                新建文档
              </Button>
            }
          />
        )}
      </Card>
      <Modal open={create} onClose={() => setCreate(false)} title="新建交付物">
        <form
          className="pm-form"
          onSubmit={async (e) => {
            e.preventDefault()
            const a: Artifact = {
              id: uid(),
              title: title.trim(),
              stage,
              status: 'draft',
              sourceIds: [],
              revisions: [
                {
                  version: 1,
                  content: `# ${title.trim()}\n\n## 目标\n\n请在这里整理目标与背景。\n\n## 内容\n\n## 待验证事项\n`,
                  at: now()
                }
              ]
            }
            if (
              await store.project(p.id, (q) => ({
                ...q,
                artifacts: [a, ...q.artifacts]
              }))
            ) {
              setCreate(false)
              navigate('artifacts', p.id, a.id)
            }
          }}
        >
          <Field label="文档名称">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="所属阶段">
            <select
              value={stage}
              onChange={(e) => setStage(Number(e.target.value))}
            >
              {stages.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="primary"
            type="submit"
            disabled={!title.trim() || p.archived}
          >
            创建文档
          </Button>
        </form>
      </Modal>
    </>
  )
}

function ArtifactEditor({
  p,
  artifact,
  navigate
}: {
  p: Project
  artifact: Artifact
  navigate: Navigate
}) {
  const store = usePM()
  const latest = artifact.revisions.at(-1)!
  const key = `pmos.draft.${p.id}.${artifact.id}`
  const [version, setVersion] = useState(latest.version)
  const [textSelection, setTextSelection] = useState<ReportSelection>()
  const [mode, setMode] = useState('read')
  const [compare, setCompare] = useState(false)
  const [knowledge, setKnowledge] = useState(false)
  const [conditions, setConditions] = useState('')
  const [edit, setEdit] = useState(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(key) || 'null')
      return draft &&
        typeof draft.content === 'string' &&
        typeof draft.base === 'number'
        ? draft
        : { content: latest.content, base: latest.version }
    } catch {
      return { content: latest.content, base: latest.version }
    }
  })
  const selected =
    artifact.revisions.find((r) => r.version === version) || latest
  const dirty =
    edit.content !==
    (artifact.revisions.find((r) => r.version === edit.base)?.content || '')
  useEffect(() => {
    if (!dirty) return
    try {
      sessionStorage.setItem(key, JSON.stringify(edit))
    } catch {
      toast.error('编辑草稿暂时无法保存，请复制内容备份')
    }
  }, [dirty, edit, key])
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [dirty])
  const save = async () => {
    if (!dirty) {
      setMode('read')
      return
    }
    const success = await store.project(p.id, (q) => ({
      ...q,
      artifacts: q.artifacts.map((a) =>
        a.id === artifact.id
          ? reviseArtifact(a, edit.content, edit.base)
          : a.stage > artifact.stage && a.status === 'approved'
            ? { ...a, status: 'stale' }
            : a
      ),
      tasks: q.tasks.map((t) =>
        t.artifactId === artifact.id ? { ...t, status: 'review' } : t
      )
    }))
    if (success) {
      setVersion(edit.base + 1)
      setEdit({ content: edit.content, base: edit.base + 1 })
      sessionStorage.removeItem(key)
      setMode('read')
      toast.success('新版本已保存，历史版本保持不变')
    }
  }
  return (
    <>
      <div className="pm-page-back">
        <button onClick={() => navigate('artifacts', p.id)}>
          <ArrowLeft size={15} />
          交付物
        </button>
        <span>{stages[artifact.stage].name}</span>
      </div>
      <Heading
        title={artifact.title}
        actions={
          <>
            <Button
              onClick={() =>
                navigate('workflow', p.id, undefined, artifact.stage)
              }
            >
              返回阶段验收
            </Button>
            <Button
              disabled={artifact.revisions.length < 2}
              onClick={() => setCompare(true)}
            >
              <GitCompareArrows size={16} />
              版本对比
            </Button>
            <Button
              onClick={() =>
                downloadText(
                  `${artifact.title}-v${selected.version}.md`,
                  selected.content
                )
              }
            >
              <Download size={16} />
              导出
            </Button>
            {mode === 'edit' ? (
              <Button variant="primary" disabled={p.archived} onClick={save}>
                <Save size={16} />
                保存新版本
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={
                  p.archived ||
                  version !== latest.version ||
                  dirty ||
                  artifact.status === 'approved'
                }
                onClick={async () => {
                  if (
                    await store.project(p.id, (q) => ({
                      ...q,
                      artifacts: q.artifacts.map((a) =>
                        a.id === artifact.id ? approveArtifact(a, version) : a
                      ),
                      tasks: q.tasks.map((t) =>
                        t.artifactId === artifact.id
                          ? { ...t, status: 'done' }
                          : t
                      )
                    }))
                  )
                    toast.success(`已确认 v${version}`)
                }}
              >
                <Check size={16} />
                确认此版本
              </Button>
            )}
          </>
        }
      />
      <div className="pm-document-toolbar">
        <div className="pm-actions">
          <Badge
            status={
              version === latest.version
                ? artifact.status
                : selected.approvedAt
                  ? 'approved'
                  : 'draft'
            }
          />
          <select
            aria-label="文档版本"
            value={version}
            onChange={(e) => {
              setVersion(Number(e.target.value))
              setMode('read')
            }}
          >
            {[...artifact.revisions].reverse().map((r) => (
              <option key={r.version} value={r.version}>
                v{r.version}
                {r.version === latest.version ? ' · 当前版本' : ' · 历史版本'}
              </option>
            ))}
          </select>
          <span className="pm-muted">
            {store.saveError
              ? '未保存'
              : dirty
                ? '有待保存的编辑草稿'
                : '已保存'}
          </span>
        </div>
        <div className="pm-actions">
          <Button
            variant="ghost"
            disabled={p.archived || version !== latest.version}
            onClick={() => {
              if (!dirty)
                setEdit({ content: latest.content, base: latest.version })
              setMode(mode === 'edit' ? 'read' : 'edit')
            }}
          >
            <Pencil size={15} />
            {mode === 'edit'
              ? '阅读文档'
              : artifact.status === 'approved'
                ? '创建修改稿'
                : dirty
                  ? '继续编辑草稿'
                  : '编辑文档'}
          </Button>
          <Button variant="ghost" onClick={() => setKnowledge(true)}>
            <BookOpen size={15} />
            沉淀知识
          </Button>
        </div>
      </div>
      {version !== latest.version && (
        <div className="pm-inline-note">
          正在查看历史版本 v{version}，当前版本是 v{latest.version}
          。历史内容只读。
        </div>
      )}
      {artifact.status === 'stale' && (
        <div className="pm-warning-note">
          较早阶段的文档已修改。请复核相关结论后重新确认。
        </div>
      )}
      <div className="pm-document-layout">
        <article className="pm-paper">
          {mode === 'edit' ? (
            <>
              <div className="pm-editor-hint">
                Markdown 编辑 · 保存会创建新版本，已确认版本不会被覆盖
              </div>
              <textarea
                className="pm-document-editor"
                aria-label="报告正文"
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </>
          ) : (
            <CopyAssistant
              key={selected.version}
              artifact={artifact}
              version={selected.version}
              disabled={dirty || p.archived || !!store.busy[p.id]}
              onSelect={setTextSelection}
            />
          )}
        </article>
        <div>
          <ReportSections
            key={selected.version}
            p={p}
            artifact={artifact}
            version={selected.version}
            dirty={dirty}
            textSelection={
              textSelection?.version === selected.version
                ? textSelection
                : undefined
            }
            onApplied={(nextVersion, content) => {
              setVersion(nextVersion)
              setEdit({ base: nextVersion, content })
              setMode('read')
              sessionStorage.removeItem(key)
            }}
          />
          <Card title="资料依据">
            {artifact.sourceIds.length ? (
              artifact.sourceIds.map((id, i) => (
                <button
                  className="pm-task-compact"
                  key={id}
                  onClick={() => navigate('sources', p.id, id)}
                >
                  <span className="pm-citation">{i + 1}</span>
                  <span>
                    {p.sources.find((s) => s.id === id)?.title || '来源不可用'}
                  </span>
                  <ArrowUpRight size={13} />
                </button>
              ))
            ) : (
              <div className="pm-card-pad pm-muted">
                尚未关联原始资料，请核对内容依据。
              </div>
            )}
          </Card>
          {!!artifact.artifactRefs?.length && (
            <Card title="参考交付物">
              {artifact.artifactRefs.map((ref) => (
                <button
                  className="pm-task-compact"
                  key={ref.id}
                  onClick={() => navigate('artifacts', p.id, ref.id)}
                >
                  <FileText size={15} />
                  <span>
                    {ref.title}
                    <small>
                      生成时参考 v{ref.version}，打开后可切换历史版本
                    </small>
                  </span>
                </button>
              ))}
            </Card>
          )}
          <Card title="版本历史">
            <div className="pm-version-list">
              {[...artifact.revisions].reverse().map((r) => (
                <button
                  key={r.version}
                  onClick={() => {
                    setVersion(r.version)
                    setMode('read')
                  }}
                >
                  <span className="pm-version">v{r.version}</span>
                  <span className="pm-grow">
                    {dateLabel(r.at)}
                    {r.approvedAt && <small>已确认</small>}
                  </span>
                  {r.version === version && <Check size={15} />}
                </button>
              ))}
            </div>
          </Card>
          <div className="pm-note-card">
            <SparkNote />
            <strong>让结论有据可查</strong>
            <p>
              打开右侧项目对话，围绕当前报告追问、核对依据或提出修改建议。AI
              回复不会自动覆盖正文。
            </p>
          </div>
        </div>
      </div>
      <Modal
        wide
        open={compare}
        onClose={() => setCompare(false)}
        title={`版本对照 · v${artifact.revisions.length > 1 ? artifact.revisions.at(-2)!.version : 1} → v${latest.version}`}
      >
        <div className="pm-compare">
          <section>
            <h3>上一版本</h3>
            <Markdown>{artifact.revisions.at(-2)?.content || ''}</Markdown>
          </section>
          <section>
            <h3>当前版本</h3>
            <Markdown>{latest.content}</Markdown>
          </section>
        </div>
        <div className="pm-card-pad pm-muted">
          完整版本并排对照；确认操作仍以当前最新版本为准。
        </div>
      </Modal>
      <Modal
        open={knowledge}
        onClose={() => setKnowledge(false)}
        title="保存为知识草稿"
      >
        <div className="pm-form">
          <p>
            保存所查看的 v{selected.version}
            ，保留来源项目与文档版本，之后在知识库审阅发布。
          </p>
          <Field label="适用条件与限制">
            <textarea
              rows={4}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder="这份结论适合什么场景？有哪些尚未验证的部分？"
            />
          </Field>
          <Button
            variant="primary"
            onClick={async () => {
              if (
                await store.update((w) => ({
                  ...w,
                  knowledge: [
                    {
                      id: uid(),
                      title: artifact.title,
                      content: selected.content,
                      conditions: conditions || '适用条件待补充',
                      projectId: p.id,
                      projectName: p.name,
                      artifactId: artifact.id,
                      version: selected.version,
                      status: 'draft',
                      at: now()
                    },
                    ...w.knowledge
                  ]
                }))
              ) {
                setKnowledge(false)
                toast.success('已保存为知识草稿')
                navigate('knowledge')
              }
            }}
          >
            保存知识草稿
          </Button>
        </div>
      </Modal>
    </>
  )
}
function SparkNote() {
  return <BookOpen size={21} />
}
