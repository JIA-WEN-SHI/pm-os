'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { DataMode, Project, Source } from './model'
import { usePM } from './provider'
import { acceptWebRead } from './web-read-domain'
import {
  modeLabels,
  recordEvidence,
  reviseSource,
  sourceVersions
} from './source-domain'
import { Button, Card, Field, Heading, Modal, type Navigate } from './ui'

export function SourceDetail({
  p,
  source,
  navigate
}: {
  p: Project
  source: Source
  navigate: Navigate
}) {
  const store = usePM()
  const versions = sourceVersions(source, p.demo)
  const latest = versions.at(-1)!
  const [version, setVersion] = useState(latest.version)
  const selected = versions.find((v) => v.version === version) || latest
  const [edit, setEdit] = useState<null | {
    base: number
    title: string
    content: string
    url: string
    mode: DataMode
  }>(null)
  const [extract, setExtract] = useState(false)
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(1)
  const [note, setNote] = useState('')
  const lines = selected.content.replace(/\r\n/g, '\n').split('\n')
  const quote = lines.slice(start - 1, end).join('\n')
  const evidence = (p.evidence || []).filter((e) => e.sourceId === source.id)
  const webRuns = p.runs.filter(
    (r) => r.contextSnapshot?.request.webRead?.sourceId === source.id
  )
  const latestRead = webRuns.find((r) => r.status === 'success')
  const adopted =
    latestRead && versions.some((v) => v.readRunId === latestRead.id)
  const changed =
    latestRead &&
    latestRead.contextSnapshot!.request.webRead!.sourceVersion !==
      latest.version
  return (
    <>
      <Button onClick={() => navigate('sources', p.id)}>返回资料库</Button>
      <Heading
        title={source.title}
        description="资料保留每个版本；原文摘录与分析备注分别保存。"
        actions={
          <>
            {source.kind === 'link' && (
              <Button
                disabled={
                  p.archived ||
                  !!store.busy[p.id] ||
                  !latest.url ||
                  selected.version !== latest.version
                }
                onClick={async () => {
                  const id = await store.readWeb(p.id, source.id)
                  if (id) navigate('runs', p.id, id)
                }}
              >
                用 Hermes 读取网页
              </Button>
            )}
            <Button
              disabled={p.archived || selected.version !== latest.version}
              onClick={() =>
                setEdit({
                  base: latest.version,
                  title: latest.title,
                  content: latest.content,
                  url: latest.url || '',
                  mode: latest.mode
                })
              }
            >
              编辑并保存新版本
            </Button>
            <Button
              disabled={p.archived || !selected.content.trim()}
              variant="primary"
              onClick={() => {
                setStart(1)
                setEnd(1)
                setNote('')
                setExtract(true)
              }}
            >
              记录证据
            </Button>
          </>
        }
      />
      {source.kind === 'link' && (
        <Card title="网页读取与确认">
          <div className="pm-card-pad">
            <p className="pm-muted">
              读取指定的公开网页，不需要模型调用。链接会交给 Hermes
              内置的匿名网页读取服务；登录页面和内网不支持。返回内容可能有提取遗漏，核对后再保存。
            </p>
            {webRuns[0] && (
              <Button onClick={() => navigate('runs', p.id, webRuns[0].id)}>
                查看最近读取记录
              </Button>
            )}
            {latestRead ? (
              <>
                <p>
                  可用结果：{new Date(latestRead.at).toLocaleString('zh-CN')} ·
                  基于资料 v
                  {latestRead.contextSnapshot!.request.webRead!.sourceVersion}
                </p>
                <details>
                  <summary>预览读取的正文（未核实）</summary>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      maxHeight: 360,
                      overflow: 'auto'
                    }}
                  >
                    {latestRead.output}
                  </pre>
                </details>
                <p className="pm-muted">
                  {adopted
                    ? '此结果已保存为资料版本。'
                    : changed
                      ? '读取之后资料已更新，请重新读取或手工对照合并。'
                      : '确认后新增一个资料版本，原正文与旧证据保留；引用旧版的报告可能需要复核。'}
                </p>
                <Button
                  variant="primary"
                  disabled={p.archived || !!adopted || !!changed}
                  onClick={async () => {
                    const saved = await store.project(p.id, (q) =>
                      acceptWebRead(q, source.id, latestRead.id)
                    )
                    if (saved) {
                      setVersion(latest.version + 1)
                      toast.success('已保存为资料新版本，请核对正文和来源。')
                    }
                  }}
                >
                  {adopted ? '已保存读取结果' : '确认并保存为资料新版本'}
                </Button>
              </>
            ) : (
              <p>读取成功后会在这里预览，现有正文不会自动替换。</p>
            )}
          </div>
        </Card>
      )}
      <div className="pm-document-layout">
        <Card title={`原文 · v${selected.version}`}>
          <div className="pm-form">
            <Field label="资料版本">
              <select
                value={selected.version}
                onChange={(e) => setVersion(Number(e.target.value))}
              >
                {[...versions].reverse().map((v) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                    {v.version === latest.version
                      ? ' · 当前版本'
                      : ' · 历史版本'}{' '}
                    · {v.title}
                  </option>
                ))}
              </select>
            </Field>
            <p>{modeLabels[selected.mode]} · 内容未核实</p>
            {selected.readRunId && (
              <Button
                onClick={() => navigate('runs', p.id, selected.readRunId)}
              >
                查看此版本的网页读取记录
              </Button>
            )}
            {selected.origin === 'legacy_snapshot' && (
              <p className="pm-muted">
                旧资料基线：仅保留旧记录，原始取得时间与过程未知。
              </p>
            )}
            {selected.version !== latest.version && (
              <p className="pm-muted">
                正在查看历史原文。修改资料请先选择当前版本，旧证据不会随新版变化。
              </p>
            )}
            {selected.url && (
              <a href={selected.url} target="_blank" rel="noreferrer">
                查看来源链接
              </a>
            )}
            {!selected.content.trim() ? (
              <p>尚无正文，链接仅是线索，不能登记为已读取证据。</p>
            ) : (
              <pre
                aria-label="带行号的资料原文"
                style={{
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  maxHeight: 600,
                  overflow: 'auto'
                }}
              >
                {lines.map((line, i) => `${i + 1} │ ${line}`).join('\n')}
              </pre>
            )}
          </div>
        </Card>
        <div>
          <Card title={`证据记录 · ${evidence.length}`}>
            <div className="pm-form">
              <p className="pm-muted">
                摘录证明该版资料写了什么，不代表内容已经核验为事实。备注不属于原文。
              </p>
              {!evidence.length && (
                <p>尚无证据。选择原文行范围即可留存摘录。</p>
              )}
              {evidence.map((e) => (
                <article
                  key={e.id}
                  className="pm-soft-panel"
                  style={{ display: 'block' }}
                >
                  <strong>
                    v{e.sourceVersion} · 第 {e.startLine}–{e.endLine} 行
                  </strong>
                  <p className="pm-muted">
                    {modeLabels[e.mode]} · 未核实
                    {e.sourceVersion !== latest.version
                      ? ' · 引用历史版本'
                      : ''}
                  </p>
                  <blockquote style={{ whiteSpace: 'pre-wrap' }}>
                    {e.quote}
                  </blockquote>
                  {e.note && <p>备注：{e.note}</p>}
                  <Button onClick={() => setVersion(e.sourceVersion)}>
                    查看引用原文
                  </Button>
                </article>
              ))}
            </div>
          </Card>
          <Card title="引用此资料的报告">
            <div className="pm-form">
              {p.artifacts
                .filter((a) => a.sourceIds.includes(source.id))
                .map((a) => (
                  <Button
                    key={a.id}
                    onClick={() => navigate('artifacts', p.id, a.id)}
                  >
                    {a.title}
                    {a.status === 'stale' ? ' · 需复核' : ''}
                  </Button>
                ))}
              {!p.artifacts.some((a) => a.sourceIds.includes(source.id)) && (
                <p className="pm-muted">尚无关联报告。</p>
              )}
            </div>
          </Card>
        </div>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="保存资料新版本">
        {edit && (
          <form
            className="pm-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (
                await store.project(p.id, (q) =>
                  reviseSource(q, source.id, edit.base, {
                    title: edit.title,
                    content: edit.content,
                    ...(edit.url ? { url: edit.url } : {}),
                    mode: edit.mode
                  })
                )
              ) {
                setVersion(edit.base + 1)
                setEdit(null)
                toast.success('新版本已保存，历史原文和证据保持不变')
              }
            }}
          >
            <p>
              基于 v{edit.base} 修改，保存后生成 v{edit.base + 1}
              。已确认的关联报告将提示复核。
            </p>
            <Field label="资料名称">
              <input
                required
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            {source.kind === 'link' && (
              <Field label="来源链接">
                <input
                  type="url"
                  required
                  value={edit.url}
                  onChange={(e) => setEdit({ ...edit, url: e.target.value })}
                />
              </Field>
            )}
            <Field label="资料性质">
              <select
                value={edit.mode}
                onChange={(e) =>
                  setEdit({ ...edit, mode: e.target.value as DataMode })
                }
              >
                {Object.entries(modeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="资料正文">
              <textarea
                rows={12}
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </Field>
            <Button variant="primary" type="submit">
              保存新版本
            </Button>
          </form>
        )}
      </Modal>
      <Modal
        open={extract}
        onClose={() => setExtract(false)}
        title={`记录证据 · v${selected.version}`}
      >
        <form
          className="pm-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await store.project(p.id, (q) =>
                recordEvidence(q, source.id, selected.version, start, end, note)
              )
            ) {
              setExtract(false)
              toast.success('证据已保存并固定引用版本')
            }
          }}
        >
          <p>共 {lines.length} 行。证据保存原文，解释和疑问请写在备注中。</p>
          <Field label="起始行">
            <input
              type="number"
              min={1}
              max={lines.length}
              required
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </Field>
          <Field label="结束行">
            <input
              type="number"
              min={start}
              max={lines.length}
              required
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
            />
          </Field>
          <Field label="原文摘录（自动生成）">
            <textarea readOnly rows={6} value={quote} />
          </Field>
          <Field label="备注或待核实问题">
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="pm-muted">
            {modeLabels[selected.mode]} · 保存后仍为未核实，不自动生成结论。
          </p>
          <Button variant="primary" type="submit">
            保存证据
          </Button>
        </form>
      </Modal>
    </>
  )
}
