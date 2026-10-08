'use client'
import type { Run } from './model'
import { downloadText } from './domain'
import { modeLabels } from './source-domain'
import { Button, Card, Field } from './ui'

export function RunContext({ run }: { run: Run }) {
  const snapshot = run.contextSnapshot
  if (!snapshot)
    return (
      <Card title="本次上下文留痕">
        <div className="pm-card-pad">
          <p className="pm-muted">
            这条历史运行未记录输入快照，无法还原当时实际提交的正文。下方资料链接仅供查阅当前资料。
          </p>
        </div>
      </Card>
    )
  return (
    <Card
      title="本次上下文留痕"
      extra={
        <Button
          onClick={() =>
            downloadText(
              `运行-${run.id}-输入快照.json`,
              JSON.stringify(snapshot, null, 2),
              'application/json'
            )
          }
        >
          下载输入快照
        </Button>
      }
    >
      <div className="pm-card-pad pm-form">
        <p className="pm-muted">
          保存于 {new Date(snapshot.capturedAt).toLocaleString('zh-CN')}。以下为
          PM OS 本次提交给执行器的内容，资料后续修改不会改变这份记录；不包含
          执行器追加的系统指令或工具执行内容。
        </p>
        <p>
          {snapshot.historyMode === 'agent-session'
            ? '项目对话复用 Agno 会话。Agno 可能追加此前的会话历史，这部分未包含在本次快照中。'
            : snapshot.historyMode === 'selection'
              ? '本次使用独立会话；仅同版本、同选区最近至多 8 条有效对话写入提交正文，更早对话未传入。'
              : '本次使用独立会话，不复用之前的项目对话历史。'}
        </p>
        <div>
          <strong>固定的资料版本</strong>
          {snapshot.sources.length ? (
            snapshot.sources.map((s) => (
              <p key={s.id}>
                {s.title} · v{s.version} · {modeLabels[s.mode]} ·{' '}
                {snapshot.request.webRead
                  ? '固定链接版本；原正文未发送到网页读取服务'
                  : s.hasContent
                    ? snapshot.request.stagePreparation
                      ? '正文或开头节选已纳入，具体范围见提交正文'
                      : '正文已纳入'
                    : '无正文，未读取内容'}
              </p>
            ))
          ) : (
            <p className="pm-muted">未附加资料。</p>
          )}
        </div>
        {!!snapshot.artifacts.length && (
          <div>
            <strong>固定的报告版本</strong>
            {snapshot.artifacts.map((a) => (
              <p key={`${a.id}-${a.version}`}>
                {a.title} · v{a.version}
              </p>
            ))}
          </div>
        )}
        {!!snapshot.handoffs?.length && (
          <div>
            <strong>固定的交接卡版本</strong>
            {snapshot.handoffs.map((h) => (
              <p key={h.id}>
                S{h.fromStage + 1} → S{h.toStage + 1} · 交接卡 v{h.version}
              </p>
            ))}
          </div>
        )}
        <p>
          方法：
          {snapshot.request.webRead
            ? 'Hermes 指定网页读取（不调用模型）'
            : snapshot.request.stagePreparation
              ? '阶段方案：结合资料、上游成果与对话整理，等待用户采用'
              : snapshot.method
                ? `${snapshot.method.name} · v${snapshot.method.version}`
                : '通用对话（未指定方法）'}
        </p>
        <p className="pm-muted">
          {snapshot.request.stagePreparation
            ? '阶段方案对较长资料及上游成果使用明确标记的节选，并带入本阶段最近至多 3 轮准备对话的摘要；实际读取范围见下方正文。'
            : '本次提交正文未做自动截断；过长输入会在发起前提示缩小范围。'}
          记录输入不代表资料已核实，也不代表调用已成功。
        </p>
        <details>
          <summary>查看实际提交正文</summary>
          <Field label="本次实际提交给 Agno 的正文">
            <textarea readOnly rows={18} value={snapshot.request.message} />
          </Field>
          <p className="pm-muted pm-break">
            会话标识：{snapshot.request.sessionId}
          </p>
        </details>
        {snapshot.method && (
          <details>
            <summary>查看当时的方法说明</summary>
            <Field label="当时的方法说明">
              <textarea
                readOnly
                rows={8}
                value={snapshot.method.instructions}
              />
            </Field>
          </details>
        )}
      </div>
    </Card>
  )
}
