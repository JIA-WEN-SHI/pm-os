'use client'
import type { Project, Run } from './model'
import type { Preparation } from './discovery-domain'
import { stagePlanTitles } from './stage-presentation'
import { stageContracts } from './stage-catalog'
import { Markdown } from './ui'

export function ResearchPlan({
  p,
  index = 0,
  proposal,
  run
}: {
  index?: number
  p: Project
  proposal: Preparation | null
  run?: Run
}) {
  const work = p.stageWork?.[index]
  const inputs = proposal?.inputs ||
    work?.inputs || [
      `${p.goal}\n目标用户：${p.audience || '待补充'}`,
      '资料尚待梳理，不能作为已核实事实。',
      '请在右侧告诉 AI 这次希望弄清的问题。'
    ]
  const sourceIds = proposal?.sourceIds || work?.sourceIds || []
  const criteria = proposal?.criteria || work?.criteria || []
  return (
    <article
      className="pm-research-plan"
      aria-label={`完整${stagePlanTitles[index]}`}
    >
      <div className="pm-plan-kicker">STAGE PLAN</div>
      <h2>
        {p.name} · {stagePlanTitles[index]}
      </h2>
      {!proposal && !work && (
        <p className="pm-work-note">
          以下为待完善的方案框架。在右侧直接交流，AI 会结合项目资料补齐内容。
        </p>
      )}
      {proposal?.plan ? (
        <Markdown>{proposal.plan}</Markdown>
      ) : (
        <>
          {stageContracts[index].fields
            .map((f) => f[0])
            .map((heading, i) => (
              <section key={heading}>
                <h3>{heading}</h3>
                <Markdown>{inputs[i] || '待补充'}</Markdown>
              </section>
            ))}
          <section>
            <h3>方法与步骤 · 建议框架</h3>
            <ol>
              {stageContracts[index].process.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="pm-muted">
              具体执行方式、负责人和时间尚未约定，可在右侧补充。
            </p>
          </section>
          <section>
            <h3>预期交付物</h3>
            <p>{stageContracts[index].output}</p>
          </section>
        </>
      )}
      <section>
        <h3>本方案关联的资料</h3>
        {sourceIds.length ? (
          <ul>
            {sourceIds.map((id) => {
              const ref = run?.contextSnapshot?.sources.find((s) => s.id === id)
              return (
                <li key={id}>
                  {ref?.title ||
                    p.sources.find((s) => s.id === id)?.title ||
                    id}
                  {ref ? ` · v${ref.version}` : ''}
                </li>
              )
            })}
          </ul>
        ) : (
          <p>暂无采用的外部资料；项目说明和用户陈述仍需核实。</p>
        )}
      </section>
      {!!run?.contextSnapshot?.artifacts.length && (
        <section>
          <h3>承接的上游成果</h3>
          <ul>
            {run.contextSnapshot.artifacts.map((ref) => (
              <li key={ref.id}>
                {ref.title} · v{ref.version}
              </li>
            ))}
          </ul>
          <p className="pm-muted">
            依据本次运行保存的版本；较长正文使用标注过的节选。
          </p>
        </section>
      )}
      {!!proposal?.evidence.length && (
        <section>
          <h3>提取依据</h3>
          {proposal.evidence.map((e, i) => (
            <blockquote key={i}>
              <p>{e.quote}</p>
              <small>
                来源：
                {run?.contextSnapshot?.sources.find((s) => s.id === e.sourceId)
                  ?.title ||
                  p.sources.find((s) => s.id === e.sourceId)?.title ||
                  e.sourceId}
              </small>
            </blockquote>
          ))}
        </section>
      )}
      <section>
        <h3>完成标准</h3>
        {criteria.length ? (
          criteria.map((c, i) => (
            <div key={i}>
              <h4>
                {i + 1}. {c.label}
              </h4>
              <p>{c.target}</p>
              <p className="pm-muted">核验方式：{c.method}</p>
            </div>
          ))
        ) : (
          <p>由 AI 根据阶段目标提出，再与你核对。</p>
        )}
      </section>
      <section>
        <h3>待确认事项</h3>
        {proposal?.questions.length ? (
          <ul>
            {proposal.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        ) : (
          <p>
            {proposal
              ? '本次未提出额外问题。方案中的假设和待验证内容仍需后续核对。'
              : '具体范围、可用证据与执行安排，可在右侧逐步补充。'}
          </p>
        )}
      </section>
    </article>
  )
}
