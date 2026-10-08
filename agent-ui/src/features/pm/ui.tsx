'use client'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { ArrowUpRight, FileText, FolderOpen, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { labels } from './catalog'
import { usePMSaving, usePMSaveError } from './provider'
export const cx = (...items: (string | false | undefined)[]) =>
  items.filter(Boolean).join(' ')
export function Button({
  children,
  variant = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'default' | 'ghost' | 'danger'
}) {
  const saving = usePMSaving()
  return (
    <button
      {...props}
      disabled={props.disabled || saving}
      className={cx('pm-button', `pm-button-${variant}`, className)}
    >
      {children}
    </button>
  )
}
export function Badge({
  status,
  children
}: {
  status?: string
  children?: ReactNode
}) {
  return (
    <span className={cx('pm-badge', status && `status-${status}`)}>
      <i />
      {children || labels[status || ''] || status}
    </span>
  )
}
export function Heading({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="pm-heading">
      <div>
        {eyebrow && <div className="pm-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="pm-actions">{actions}</div>}
    </div>
  )
}
export function Card({
  title,
  extra,
  children,
  className
}: {
  title?: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('pm-card', className)}>
      {(title || extra) && (
        <header>
          <h2>{title}</h2>
          {extra}
        </header>
      )}
      {children}
    </section>
  )
}
export function Empty({
  title,
  description,
  action
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="pm-empty">
      <div className="pm-empty-icon">
        <FolderOpen size={25} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Modal({
  open,
  onClose,
  title,
  children,
  wide
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const saving = usePMSaving()
  const saveError = usePMSaveError()
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="pm-modal-overlay" />
        <Dialog.Content
          className={cx('pm-modal', wide && 'pm-modal-wide')}
          aria-describedby={undefined}
        >
          <div className="pm-modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="pm-icon-button"
                aria-label="关闭"
                disabled={saving}
              >
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>
          {saveError && (
            <p role="alert" className="pm-save-warning">
              {saveError}
              。表单内容仍保留；关闭此窗口后可在页面顶部重试原提交或导出恢复副本。
            </p>
          )}
          <fieldset
            disabled={saving}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            {children}
          </fieldset>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="pm-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}
export function Tabs({
  items,
  value,
  onChange
}: {
  items: { id: string; label: string; count?: number }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="pm-tabs">
      {items.map((t) => (
        <button
          key={t.id}
          className={cx(value === t.id && 'active')}
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
        >
          {t.label}
          {t.count !== undefined && <span>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
type PositionedNode = {
  type: string
  position?: { start: { offset?: number }; end: { offset?: number } }
  children?: PositionedNode[]
  [key: string]: unknown
}
function rehypeTextPositions() {
  return (tree: PositionedNode) => {
    const visit = (parent: PositionedNode) => {
      parent.children = parent.children?.map((node) => {
        const start = node.position?.start.offset,
          end = node.position?.end.offset
        if (
          node.type === 'text' &&
          typeof start === 'number' &&
          typeof end === 'number'
        )
          return {
            type: 'element',
            tagName: 'span',
            properties: { 'data-source-start': start, 'data-source-end': end },
            children: [node]
          }
        if (node.children) visit(node)
        return node
      })
    }
    visit(tree)
  }
}
export function Markdown({
  children,
  sourcePositions = false
}: {
  children: string
  sourcePositions?: boolean
}) {
  return (
    <div className="pm-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={sourcePositions ? [rehypeTextPositions] : []}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
export function ArtifactRow({
  title,
  status,
  version,
  onClick,
  subtitle
}: {
  title: string
  status: string
  version: number
  onClick: () => void
  subtitle?: string
}) {
  return (
    <button className="pm-file-row" onClick={onClick}>
      <span className="pm-file-icon">
        <FileText size={19} />
      </span>
      <span className="pm-grow">
        <strong>{title}</strong>
        <small>{subtitle || `版本 v${version}`}</small>
      </span>
      <Badge status={status} />
      <ArrowUpRight size={16} />
    </button>
  )
}
export const dateLabel = (value: string) => {
  const d = new Date(value)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
export type Navigate = (
  view: string,
  projectId?: string,
  item?: string,
  stage?: number
) => void
