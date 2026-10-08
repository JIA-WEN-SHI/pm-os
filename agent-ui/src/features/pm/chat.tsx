'use client'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  FileText,
  Maximize2,
  Paperclip,
  Send,
  Sparkles,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { usePM } from './provider'
import type { Project } from './model'
import { now, uid } from './domain'
import { stages } from './catalog'
import { SourcePicker } from './workflow'
import { Button, Markdown, Modal, type Navigate } from './ui'

export function ProjectChat({
  p,
  stage,
  artifactId,
  taskId,
  onClose,
  focus,
  onFocus,
  navigate
}: {
  p: Project
  stage: number
  artifactId?: string
  taskId?: string
  onClose: () => void
  focus: boolean
  onFocus: () => void
  navigate: Navigate
}) {
  const store = usePM()
  const [text, setText] = useState(() => {
    try {
      return sessionStorage.getItem(`pmos.chat-draft.${p.id}`) || ''
    } catch {
      return ''
    }
  })
  const [sources, setSources] = useState<string[]>([])
  const [attach, setAttach] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const artifact = p.artifacts.find((a) => a.id === artifactId)
  const task = p.tasks.find((t) => t.id === taskId)
  const busy = !!store.busy[p.id]
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [p.messages.length, store.streaming, p.id])
  useEffect(() => {
    try {
      sessionStorage.setItem(`pmos.chat-draft.${p.id}`, text)
    } catch {}
  }, [text, p.id])
  const send = () => {
    if (!text.trim() || busy || p.archived) return
    const message = text.trim()
    setText('')
    void store
      .run(p.id, {
        message,
        stage,
        sourceIds: sources,
        artifactId,
        skillId: task?.skillId || p.skillId
      })
      .then((ok) => {
        if (!ok) setText((current) => current || message)
      })
  }
  return (
    <aside
      className={focus ? 'pm-chat pm-chat-focus' : 'pm-chat'}
      aria-label="项目对话"
    >
      <header className="pm-chat-head">
        <span>
          <Sparkles size={18} />
          项目对话
        </span>
        <div className="pm-actions">
          <button
            className="pm-icon-button"
            onClick={onFocus}
            aria-label={focus ? '恢复并排布局' : '对话专注模式'}
          >
            <Maximize2 size={15} />
          </button>
          <button
            className="pm-icon-button"
            onClick={onClose}
            aria-label="收起项目对话"
          >
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="pm-chat-context">
        <span>
          <span className="pm-status-dot" />
          跟随当前页面
        </span>
        <div>
          <span>{stages[stage].short}</span>
          {artifact && (
            <span>
              {artifact.title} · v{artifact.revisions.at(-1)!.version}
            </span>
          )}
          {task && <span>{task.title}</span>}
        </div>
      </div>
      <div className="pm-chat-messages">
        {!p.messages.length && (
          <div className="pm-chat-welcome">
            <span className="pm-chat-bot">
              <Sparkles size={25} />
            </span>
            <h3>一起推进这个项目</h3>
            <p>讨论想法、分析材料，或围绕当前成果继续追问。</p>
            {[
              '帮我梳理项目的下一步',
              '有哪些信息还需要补充？',
              '如何验证这个方案有效？'
            ].map((s) => (
              <button key={s} onClick={() => setText(s)}>
                {s}
                <ArrowUpRight size={14} />
              </button>
            ))}
            <small>只发送当前项目背景、所选内容和明确附加的资料。</small>
          </div>
        )}
        {p.messages.map((m) => (
          <div
            className={`pm-message pm-message-${m.role}${m.failed ? 'pm-message-error' : ''}`}
            key={m.id}
          >
            {m.role === 'assistant' && (
              <div className="pm-message-author">
                <Bot size={16} />
                <strong>PM OS 助手</strong>
                <small>{m.failed ? '运行未完成' : '项目助手'}</small>
              </div>
            )}
            <div className="pm-message-content">
              {m.artifactId ? (
                <>
                  <p>已生成交付物，请打开审阅并核对依据。</p>
                  <button
                    className="pm-chat-artifact"
                    onClick={() => navigate('artifacts', p.id, m.artifactId)}
                  >
                    <FileText size={21} />
                    <span>
                      <strong>
                        {p.artifacts.find((a) => a.id === m.artifactId)
                          ?.title || '交付物'}
                      </strong>
                      <small>打开当前版本</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                </>
              ) : (
                <Markdown>{m.content}</Markdown>
              )}
            </div>
            {m.role === 'assistant' && !m.failed && !m.artifactId && (
              <button
                className="pm-save-message"
                disabled={p.archived}
                onClick={async () => {
                  const id = uid()
                  if (
                    await store.project(p.id, (q) => ({
                      ...q,
                      artifacts: [
                        {
                          id,
                          title: `对话整理 · ${stages[m.stage ?? stage].short}`,
                          stage: m.stage ?? stage,
                          status: 'draft',
                          sourceIds: m.sourceIds || [],
                          artifactRefs: m.artifactRefs,
                          revisions: [
                            { version: 1, content: m.content, at: now() }
                          ]
                        },
                        ...q.artifacts
                      ],
                      messages: q.messages.map((message) =>
                        message.id === m.id
                          ? { ...message, artifactId: id }
                          : message
                      )
                    }))
                  ) {
                    toast.success('已保存为交付物草稿')
                    navigate('artifacts', p.id, id)
                  }
                }}
              >
                <FileText size={13} />
                保存为交付物
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="pm-message pm-message-assistant">
            <div className="pm-message-author">
              <span className="pm-pulse-dot" />
              <strong>正在生成</strong>
            </div>
            {store.streaming[p.id] ? (
              <Markdown>{store.streaming[p.id]}</Markdown>
            ) : (
              <p className="pm-muted">任务已提交，等待模型输出…</p>
            )}
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="pm-chat-bottom">
        {sources.length > 0 && (
          <button
            className="pm-chat-attachments"
            onClick={() => setAttach(true)}
          >
            <Paperclip size={14} />
            本次附加 {sources.length} 份资料 <ChevronDown size={13} />
          </button>
        )}
        <div className="pm-composer">
          <textarea
            aria-label="项目对话输入"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              p.archived
                ? '项目已归档，恢复后继续对话'
                : '补充背景，或继续安排工作…'
            }
            disabled={p.archived}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div>
            <button
              className="pm-icon-button"
              onClick={() => setAttach(true)}
              aria-label="选择对话资料"
            >
              <Paperclip size={17} />
            </button>
            <span className="pm-composer-model">{store.agent.model}</span>
            <button
              className="pm-send"
              aria-label="发送消息"
              disabled={busy || p.archived || !text.trim()}
              onClick={send}
            >
              <Send size={17} />
            </button>
          </div>
        </div>
        <small>Enter 发送 · Shift + Enter 换行</small>
      </div>
      <Modal
        open={attach}
        onClose={() => setAttach(false)}
        title="选择本次对话资料"
      >
        <div className="pm-form">
          <p>只附加选中的正文。链接未补充正文时仅能作为线索。</p>
          <SourcePicker p={p} ids={sources} onChange={setSources} />
          <Button variant="primary" onClick={() => setAttach(false)}>
            完成选择
          </Button>
        </div>
      </Modal>
    </aside>
  )
}
