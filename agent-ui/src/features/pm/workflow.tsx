'use client'
import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Play,
  Plus,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { stages } from './catalog'
import {
  uid,
  activeStage,
  stageAccepted,
  stageRunBlock,
  stageState
} from './domain'
import { StageWorkbench } from './stage-workbench'
import { usePM } from './provider'
import type { Project, Task } from './model'
import {
  ArtifactRow,
  Badge,
  Button,
  Card,
  cx,
  Empty,
  Field,
  Heading,
  Modal,
  Tabs,
  type Navigate
} from './ui'

export function SourcePicker({
  p,
  ids,
  onChange,
  disabled = false
}: {
  p: Project
  ids: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  return (
    <div className="pm-source-picker">
      {p.sources.length ? (
        p.sources.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={ids.includes(s.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...ids, s.id]
                    : ids.filter((id) => id !== s.id)
                )
              }
            />
            <FileText size={16} />
            <span className="pm-grow">{s.title}</span>
            <small>{s.content ? '有正文' : '尚无正文'}</small>
          </label>
        ))
      ) : (
        <p className="pm-muted">
          还没有资料。可以先添加资料，也可以仅根据任务说明生成初稿。
        </p>
      )}
    </div>
  )
}
export function NewTask({
  p,
  stage,
  open,
  onClose,
  navigate
}: {
  p: Project
  stage: number
  open: boolean
  onClose: () => void
  navigate: Navigate
}) {
  const store = usePM()
  const [title, setTitle] = useState(stages[stage].verb)
  const [goal, setGoal] = useState(stages[stage].prompt)
  const [sources, setSources] = useState<string[]>(
    p.stageWork?.[stage]?.sourceIds || []
  )
  const [skill, setSkill] = useState(p.skillId || `method-${stage}`)
  return (
    <Modal open={open} onClose={onClose} title="创建一项具体任务">
      <form
        className="pm-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!title.trim() || !goal.trim()) return
          const blocked = stageRunBlock(p, stage)
          if (blocked) {
            toast.error(blocked)
            return
          }
          const task: Task = {
            id: uid(),
            title: title.trim(),
            goal,
            stage,
            status: 'todo',
            sourceIds: sources,
            skillId: skill
          }
          if (
            await store.project(p.id, (q) => ({
              ...q,
              tasks: [...q.tasks, task],
              stage,
              stageStates: q.stageStates.map((s, i) =>
                i === stage && s === '未开始' ? '进行中' : s
              )
            }))
          ) {
            onClose()
            navigate('task', p.id, task.id, stage)
          }
        }}
      >
        <Field label="任务名称">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="目标与输出要求">
          <textarea
            required
            rows={4}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </Field>
        <Field label="工作方法">
          <select value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="">通用分析</option>
            {store.data.skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · v{s.version}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <h3 className="pm-field-label">选择本次使用的资料</h3>
          <SourcePicker p={p} ids={sources} onChange={setSources} disabled />
          <p className="pm-muted">
            沿用阶段工作台已确认的资料；更换资料需回到工作台重新确认。
          </p>
        </div>
        <p className="pm-muted">
          创建后可以查看输入与方法，再启动真实模型调用。
        </p>
        <div className="pm-modal-actions">
          <Button type="button" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={p.archived}>
            创建任务 <ArrowRight size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function Workflow({
  p,
  stage,
  navigate
}: {
  p: Project
  stage?: number
  navigate: Navigate
}) {
  const [create, setCreate] = useState(false)
  const [tab, setTab] = useState('workbench')
  const index = stage ?? activeStage(p)
  const tasks = p.tasks.filter((t) => t.stage === index)
  if (stage === undefined)
    return (
      <>
        <Heading
          eyebrow="PRODUCT LIFECYCLE"
          title="流程与任务"
          description="从项目材料到作品集，八个阶段逐步产出；每一步都由你确认指标、验收成果。"
        />
        <div className="pm-flow-intro">
          <Sparkles size={24} />
          <div className="pm-grow">
            <strong>
              当前待办：S{activeStage(p) + 1} · {stages[activeStage(p)].name}
            </strong>
            <p>点击阶段查看输入、Agent 处理方法、预期产出与验收指标。</p>
          </div>
          <Button
            variant="primary"
            onClick={() =>
              navigate('workflow', p.id, undefined, activeStage(p))
            }
          >
            继续工作 <ArrowRight size={16} />
          </Button>
        </div>
        <div className="pm-flow-list">
          {stages.map((s, i) => (
            <button
              key={s.name}
              className={cx('pm-flow-row', i === activeStage(p) && 'active')}
              onClick={() => navigate('workflow', p.id, undefined, i)}
            >
              <span className="pm-stage-number">
                {stageAccepted(p, i) ? (
                  <Check size={20} />
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              <div className="pm-grow">
                <h3>{s.name}</h3>
                <p>{s.goal}</p>
                <div className="pm-chips">
                  {s.outputs.map((o) => (
                    <span key={o}>{o}</span>
                  ))}
                </div>
              </div>
              <Badge status={stageAccepted(p, i) ? 'approved' : undefined}>
                {stageState(p, i)}
              </Badge>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </>
    )
  return (
    <>
      <div className="pm-page-back">
        <button onClick={() => navigate('workflow', p.id)}>
          <ArrowLeft size={15} />
          完整流程
        </button>
        <span>阶段 {String(index + 1).padStart(2, '0')} / 08</span>
      </div>
      <div className="pm-stage-mini-nav">
        {stages.map((s, i) => (
          <button
            key={s.name}
            className={cx(index === i && 'active')}
            onClick={() => navigate('workflow', p.id, undefined, i)}
          >
            <span>{stageAccepted(p, i) ? '✓' : i + 1}</span>
            {s.short}
          </button>
        ))}
      </div>
      <Heading title={stages[index].name} description={stages[index].goal} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'workbench', label: '阶段工作台' },
          { id: 'tasks', label: '任务记录', count: tasks.length }
        ]}
      />
      {tab === 'workbench' && (
        <StageWorkbench p={p} index={index} navigate={navigate} />
      )}
      {tab === 'tasks' && (
        <Card
          title="阶段任务"
          extra={
            <Button
              disabled={!!stageRunBlock(p, index)}
              onClick={() => setCreate(true)}
            >
              <Plus size={16} />
              新建任务
            </Button>
          }
        >
          {!!stageRunBlock(p, index) && (
            <p className="pm-card-pad pm-muted">{stageRunBlock(p, index)}</p>
          )}
          {tasks.length ? (
            tasks.map((t) => (
              <button
                className="pm-task-row"
                key={t.id}
                onClick={() => navigate('task', p.id, t.id, index)}
              >
                <span className="pm-grow">
                  <strong>{t.title}</strong>
                  <small>{t.goal}</small>
                </span>
                <Badge status={t.status} />
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="尚无任务"
              description={
                index === 0
                  ? '先和 AI 梳理调研目标并采用整理结果，即可生成研究简报。'
                  : '在阶段工作台确认输入与指标后，即可启动 Agent 生成成果。'
              }
            />
          )}
        </Card>
      )}
      <NewTask
        key={`new-${index}`}
        p={p}
        stage={index}
        open={create}
        onClose={() => setCreate(false)}
        navigate={navigate}
      />
    </>
  )
}

export function TaskDetail({
  p,
  task,
  navigate
}: {
  p: Project
  task: Task
  navigate: Navigate
}) {
  const store = usePM()
  const [tab, setTab] = useState('detail')
  const [sources, setSources] = useState(
    p.stageWork?.[task.stage]?.sourceIds || task.sourceIds
  )
  const [goal, setGoal] = useState(task.goal)
  const [skill, setSkill] = useState(task.skillId)
  const runs = p.runs.filter((r) => r.taskId === task.id)
  const output = p.artifacts.find((a) => a.id === task.artifactId)
  const running = !!store.busy[p.id]
  const save = async () =>
    await store.project(p.id, (q) => ({
      ...q,
      tasks: q.tasks.map((t) =>
        t.id === task.id
          ? { ...t, goal, sourceIds: sources, skillId: skill }
          : t
      )
    }))
  return (
    <>
      <div className="pm-page-back">
        <button
          onClick={() => navigate('workflow', p.id, undefined, task.stage)}
        >
          <ArrowLeft size={15} />
          {stages[task.stage].name}
        </button>
      </div>
      <Heading
        eyebrow="TASK DETAILS"
        title={task.title}
        description="输入、方法、执行与产出，集中在一项任务里。"
        actions={
          <>
            <Badge status={task.status} />
            <Button
              variant="primary"
              disabled={
                p.archived ||
                running ||
                !goal.trim() ||
                !!stageRunBlock(p, task.stage)
              }
              onClick={async () => {
                if (await save())
                  void store.run(p.id, {
                    message: goal,
                    stage: task.stage,
                    sourceIds: sources,
                    taskId: task.id,
                    skillId: skill
                  })
              }}
            >
              <Play size={15} />
              {running
                ? '项目正在执行…'
                : task.status === 'failed'
                  ? '重新运行'
                  : '运行并生成报告'}
            </Button>
          </>
        }
      />
      {!!stageRunBlock(p, task.stage) && (
        <div className="pm-gate-banner">
          <p className="pm-grow">{stageRunBlock(p, task.stage)}</p>
          <Button
            onClick={() => navigate('workflow', p.id, undefined, task.stage)}
          >
            打开阶段工作台
          </Button>
        </div>
      )}
      {task.error && <div className="pm-error-note">{task.error}</div>}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: 'detail', label: '任务详情' },
          { id: 'runs', label: '执行过程', count: runs.length },
          { id: 'output', label: '产出' }
        ]}
      />
      {tab === 'detail' && (
        <div className="pm-stage-layout">
          <div>
            <Card title="目标与输出要求">
              <div className="pm-form">
                <textarea
                  aria-label="任务目标"
                  rows={5}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  disabled={running || p.archived}
                />
              </div>
            </Card>
            <Card title="本次输入资料">
              <SourcePicker
                p={p}
                ids={sources}
                onChange={setSources}
                disabled
              />
              <div className="pm-card-pad">
                <p className="pm-muted">
                  使用阶段工作台已确认的资料；更换资料前请返回阶段工作台修改并重新确认。
                </p>
                <Button onClick={() => navigate('sources', p.id)}>
                  管理资料
                </Button>
              </div>
            </Card>
          </div>
          <div>
            <Card title="执行配置">
              <div className="pm-form">
                <Field label="工作方法">
                  <select
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                    disabled={running || p.archived}
                  >
                    <option value="">通用分析</option>
                    {store.data.skills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · v{s.version}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="pm-config-row">
                  <span>模型</span>
                  <strong>{store.agent.model}</strong>
                </div>
                <p className="pm-muted">
                  方法说明将作为任务上下文发送给现有 Agent；工具能力由后端提供。
                </p>
                <Button
                  disabled={running || p.archived}
                  onClick={async () => {
                    if (await save()) toast.success('任务配置已保存')
                  }}
                >
                  保存任务配置
                </Button>
              </div>
            </Card>
            <Card title="成果确认">
              <div className="pm-card-pad">
                <ClipboardCheck size={25} className="pm-blue" />
                <p>
                  生成结果保存为待确认文档。你可以编辑、核对来源，再确认具体版本。
                </p>
                {output && (
                  <Button
                    onClick={() => navigate('artifacts', p.id, output.id)}
                  >
                    打开交付物
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
      {tab === 'runs' && (
        <Card>
          {runs.length ? (
            runs.map((r) => (
              <button
                className="pm-task-row"
                key={r.id}
                onClick={() => navigate('runs', p.id, r.id)}
              >
                <span className="pm-grow">
                  <strong>{r.title}</strong>
                  <small>{new Date(r.at).toLocaleString('zh-CN')}</small>
                </span>
                <Badge status={r.status} />
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <Empty
              title="尚未执行"
              description="启动任务后，这里会记录真实执行结果。"
            />
          )}
        </Card>
      )}
      {tab === 'output' && (
        <Card>
          {output ? (
            <ArtifactRow
              title={output.title}
              version={output.revisions.at(-1)!.version}
              status={output.status}
              onClick={() => navigate('artifacts', p.id, output.id)}
            />
          ) : (
            <Empty
              title="还没有交付物"
              description="生成成功后会保存报告；失败片段仅保留在运行记录。"
            />
          )}
        </Card>
      )}
      {running && (
        <Card title="正在接收模型输出">
          <div className="pm-stream-preview">
            {store.streaming[p.id] || '已提交任务，等待模型返回内容…'}
          </div>
        </Card>
      )}
    </>
  )
}
