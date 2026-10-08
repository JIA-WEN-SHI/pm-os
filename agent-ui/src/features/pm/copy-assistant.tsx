'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Artifact, ReportSelection } from './model'
import {
  locateRenderedTextSelection,
  makeEditorTextSelection
} from './report-domain'
import { Button, Field, Markdown, Modal } from './ui'

export function CopyAssistant({
  artifact,
  version,
  disabled,
  onSelect
}: {
  artifact: Artifact
  version: number
  disabled: boolean
  onSelect: (selection: ReportSelection) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const raw = artifact.revisions.find((r) => r.version === version)!.content
  const [floating, setFloating] = useState<null | {
    selection: ReportSelection | null
    quote: string
    left: number
    top: number
  }>(null)
  const [picker, setPicker] = useState(false)
  const [picked, setPicked] = useState<ReportSelection | null>(null)
  const [hint, setHint] = useState('')
  function pickText(t: HTMLTextAreaElement) {
    try {
      setPicked(
        makeEditorTextSelection(
          artifact,
          version,
          t.selectionStart,
          t.selectionEnd
        )
      )
    } catch {
      setPicked(null)
    }
  }
  function capture() {
    if (disabled) {
      setFloating(null)
      return
    }
    const s = window.getSelection()
    if (
      !s ||
      s.isCollapsed ||
      !s.anchorNode ||
      !s.focusNode ||
      !root.current?.contains(s.anchorNode) ||
      !root.current.contains(s.focusNode)
    ) {
      setFloating(null)
      return
    }
    const quote = s.toString()
    if (!quote.trim()) return
    const range = s.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const node = range.startContainer
    const source = node.parentElement?.closest(
      '[data-source-start][data-source-end]'
    )
    const selection =
      range.endContainer === node && node.nodeType === Node.TEXT_NODE && source
        ? locateRenderedTextSelection(
            artifact,
            version,
            node.textContent || '',
            range.startOffset,
            range.endOffset,
            Number(source.getAttribute('data-source-start')),
            Number(source.getAttribute('data-source-end'))
          )
        : null
    setFloating({
      selection,
      quote,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 240)),
      top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 60))
    })
  }
  function openPicker(message = '在下方原文中选中需要讨论或修改的文字。') {
    setHint(message)
    setPicked(null)
    setPicker(true)
    setFloating(null)
  }
  return (
    <>
      <div className="pm-actions" style={{ marginBottom: 16 }}>
        <Button disabled={disabled} onClick={() => openPicker()}>
          AI 文案助手
        </Button>
        <span className="pm-muted">
          {disabled
            ? '请先完成保存或等待当前运行结束'
            : '选中文字，与 AI 一起解释、润色或改写。'}
        </span>
      </div>
      <div
        ref={root}
        aria-label="可选取的报告文案"
        onMouseUp={capture}
        onKeyUp={capture}
      >
        <Markdown sourcePositions>{raw}</Markdown>
      </div>
      {floating && !disabled && (
        <div
          style={{
            position: 'fixed',
            left: floating.left,
            top: floating.top,
            zIndex: 45,
            boxShadow: '0 6px 24px #17255425',
            borderRadius: 10,
            background: 'white'
          }}
        >
          <Button
            variant="primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (floating.selection) {
                onSelect(floating.selection)
                setFloating(null)
              } else
                openPicker(
                  '选中文字可能重复出现或包含排版格式，请在原文中明确选取要修改的那一处。'
                )
            }}
          >
            {floating.selection ? '与 AI 修改' : '确认选区后修改'}
          </Button>
        </div>
      )}
      <Modal
        wide
        open={picker}
        onClose={() => setPicker(false)}
        title={`选择文案 · v${version}`}
      >
        <div className="pm-form">
          <p>{hint}此处只选择范围，不修改正文。</p>
          <Field label="在原文中选取文案">
            <textarea
              readOnly
              rows={14}
              value={raw.replace(/\r\n?/g, '\n')}
              onSelect={(e) => pickText(e.currentTarget)}
              onMouseUp={(e) => pickText(e.currentTarget)}
              onKeyUp={(e) => pickText(e.currentTarget)}
            />
          </Field>
          <Field label="将与 AI 讨论的原文">
            <textarea readOnly rows={3} value={picked?.quote || ''} />
          </Field>
          <Button
            variant="primary"
            disabled={!picked || disabled}
            onClick={() => {
              if (!picked) return
              try {
                onSelect(picked)
                setPicker(false)
              } catch (e) {
                toast.error(e instanceof Error ? e.message : '无法选择文案')
              }
            }}
          >
            与 AI 讨论这段文案
          </Button>
        </div>
      </Modal>
    </>
  )
}
