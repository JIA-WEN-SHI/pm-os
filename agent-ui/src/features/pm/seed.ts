import { createProject, now } from './domain'
import { stages } from './catalog'
import type { Workspace } from './model'
export function createWorkspace(): Workspace {
  const project = createProject({
    name: '企业知识助手',
    goal: '让分散的工作资料成为可查找、可引用、可复用的知识。',
    audience: '需要频繁查找资料与撰写报告的知识工作者'
  })
  project.id = 'demo-knowledge'
  project.demo = true
  project.stage = 3
  project.stageStates = [
    '已确认',
    '已确认',
    '已确认',
    '进行中',
    '未开始',
    '未开始',
    '未开始',
    '未开始'
  ]
  project.sources = [
    {
      id: 'demo-interview',
      title: '用户访谈纪要',
      kind: 'text',
      at: now(),
      content:
        '【示例资料，仅用于体验界面】\n观察：工作资料分散在多个目录。整理报告时需要反复核对出处。\n需求：能定位原始材料，分析结论有引用，报告可以编辑并保留版本。\n限制：这是界面示例，不是真实用户访谈。'
    },
    {
      id: 'demo-brief',
      title: '产品研究任务说明',
      kind: 'text',
      at: now(),
      content:
        '【示例资料】研究一个面向个人工作的知识助手，覆盖资料收集、分析拆分、报告生成和归档。保留对话和可视化工作区，允许配置自己的方法。'
    }
  ]
  project.artifacts = [
    {
      id: 'demo-report',
      title: '企业知识助手 · 产品方案',
      stage: 3,
      status: 'review',
      sourceIds: ['demo-interview', 'demo-brief'],
      revisions: [
        {
          version: 1,
          at: now(),
          content:
            '# 企业知识助手 · 产品方案\n\n> 示例文档，用于体验阅读、编辑、版本确认与导出。\n\n## 01 核心问题\n\n资料分散，检索与核对来源占用了大量工作时间。我们希望把资料、分析与报告组织在同一个项目中。\n\n## 02 产品路径\n\n**收集资料 → 定义问题 → 分析方案 → 生成报告 → 人工确认 → 归档复用**\n\n## 03 能力范围\n\n| 能力 | 用户价值 | 人工介入 |\n| --- | --- | --- |\n| 资料整理 | 保留原文与来源 | 核对材料完整性 |\n| 辅助分析 | 将材料拆成问题与机会 | 确认关键假设 |\n| 报告生成 | 汇总为可编辑的成果 | 审阅并确认版本 |\n\n## 04 待验证事项\n\n- 检索结果是否覆盖关键材料？\n- 每项结论是否有可核对的依据？\n- 实际节约的时间是多少？**尚未实测。**\n\n## 来源\n\n[1] 用户访谈纪要（示例）\n\n[2] 产品研究任务说明（示例）'
        }
      ]
    },
    {
      id: 'demo-problem',
      title: '问题定义与业务范围',
      stage: 1,
      status: 'approved',
      sourceIds: ['demo-interview'],
      revisions: [
        {
          version: 1,
          at: now(),
          approvedAt: now(),
          content:
            '# 问题定义\n\n> 示例内容\n\n为个人知识工作者提供资料整理、分析与报告工作区。\n\n## 业务范围\n资料收集、来源核对、报告编辑、版本确认与知识复用。\n\n## 成功标准\n通过真实任务记录检索耗时、引用完整性和人工修正量。基线待收集。'
        }
      ]
    }
  ]
  project.tasks = [
    {
      id: 'demo-task-review',
      title: '整理产品方案',
      goal: '把已有问题和研究发现转化为可审阅的产品方案。',
      stage: 3,
      status: 'review',
      sourceIds: ['demo-interview', 'demo-brief'],
      skillId: 'method-3',
      artifactId: 'demo-report'
    },
    {
      id: 'demo-task-plan',
      title: '定义验收标准',
      goal: '给关键用户流程定义明确的输入、预期结果与失败处理。',
      stage: 3,
      status: 'todo',
      sourceIds: ['demo-brief'],
      skillId: 'method-3'
    },
    {
      id: 'demo-task-research',
      title: '整理用户访谈',
      goal: '整理观察、问题和引用。',
      stage: 0,
      status: 'done',
      sourceIds: ['demo-interview'],
      skillId: 'method-0'
    }
  ]
  const second = createProject({
    name: '竞品研究与机会分析',
    goal: '梳理竞争格局，发现可以验证的产品机会。',
    audience: '产品经理'
  })
  second.id = 'demo-research'
  second.demo = true
  second.stageStates[0] = '进行中'
  return {
    schema: 1,
    projects: [project, second],
    skills: stages.map((s, i) => ({
      id: `method-${i}`,
      name: [
        '研究发现整理',
        '问题定义',
        'AI 可行性分析',
        '产品方案设计',
        '实验计划',
        '评估与迭代',
        '交付检查',
        '项目复盘'
      ][i],
      stage: i,
      description: s.goal,
      instructions: s.prompt,
      version: 1,
      personal: false
    })),
    knowledge: []
  }
}
