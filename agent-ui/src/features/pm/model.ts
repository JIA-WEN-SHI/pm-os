export type ArtifactStatus = 'draft' | 'review' | 'approved' | 'stale'
export type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'failed'
export interface Source {
  versions?: SourceVersion[]
  id: string
  title: string
  kind: 'text' | 'file' | 'link'
  content: string
  url?: string
  at: string
}
export type DataMode = 'real' | 'simulation' | 'unknown'
export interface SourceVersion {
  readRunId?: string
  version: number
  title: string
  content: string
  url?: string
  at: string
  mode: DataMode
  origin: 'legacy_snapshot' | 'user_saved'
}
export interface Evidence {
  id: string
  sourceId: string
  sourceVersion: number
  startLine: number
  endLine: number
  quote: string
  note: string
  mode: DataMode
  verification: 'unverified'
  at: string
}
export interface Revision {
  version: number
  content: string
  at: string
  approvedAt?: string
  confirmations?: string[]
}
export interface ReportSelection {
  kind?: 'text'
  startOffset?: number
  endOffset?: number
  artifactId: string
  version: number
  blockId: string
  title: string
  startLine: number
  endLine: number
  quote: string
}
export interface SourceRef {
  id: string
  version: number
}
export interface ReportProposal {
  id: string
  selection: ReportSelection
  request: string
  replacement: string
  runId: string
  sourceRefs: SourceRef[]
  at: string
  status: 'pending' | 'accepted' | 'rejected'
  appliedVersion?: number
}
export interface ArtifactRef {
  id: string
  title: string
  version: number
}
export interface Artifact {
  stagePlanSignature?: string
  id: string
  title: string
  stage: number
  status: ArtifactStatus
  sourceIds: string[]
  artifactRefs?: ArtifactRef[]
  revisions: Revision[]
}
export interface Task {
  id: string
  title: string
  goal: string
  stage: number
  status: TaskStatus
  sourceIds: string[]
  skillId: string
  artifactId?: string
  error?: string
}
export interface Run {
  executionMode?: 'background'
  requestText?: string
  contextSnapshot?: RunContextSnapshot
  selection?: ReportSelection
  intent?: 'explain' | 'rewrite'
  sourceRefs?: SourceRef[]
  stagePlanSignature?: string
  id: string
  taskId?: string
  title: string
  stage: number
  status: 'running' | 'success' | 'failed'
  at: string
  duration?: number
  output: string
  error?: string
  upstreamId?: string
  skill: string
  sourceIds: string[]
  artifactRefs?: ArtifactRef[]
}
export interface RunContextSnapshot {
  handoffs?: HandoffRef[]
  schema: 1
  capturedAt: string
  request: {
    message: string
    sessionId: string
    webRead?: { sourceId: string; sourceVersion: number; url: string }
    stagePreparation?: {
      stage?: number
      upstreamSignature?: string
      baseVersion: number
      projectScope: string[]
      sourceSignature: string
    }
  }
  sources: Array<
    SourceRef & { title: string; mode: DataMode; hasContent: boolean }
  >
  artifacts: ArtifactRef[]
  method?: { id: string; name: string; version: number; instructions: string }
  historyMode: 'selection' | 'agent-session' | 'none'
}
export interface Message {
  selection?: ReportSelection
  intent?: 'explain' | 'rewrite'
  sourceRefs?: SourceRef[]
  id: string
  role: 'user' | 'assistant'
  content: string
  at: string
  artifactId?: string
  failed?: boolean
  sourceIds?: string[]
  artifactRefs?: ArtifactRef[]
  stage?: number
}
export interface Decision {
  id: string
  title: string
  choice: string
  reason: string
  at: string
}
export interface Project {
  handoffs?: Handoff[]
  reportProposals?: ReportProposal[]
  evidence?: Evidence[]
  stageWork?: Record<string, StageWork>
  id: string
  name: string
  goal: string
  audience: string
  outputs: string
  createdAt: string
  updatedAt: string
  demo: boolean
  archived: boolean
  stage: number
  stageStates: string[]
  stageNotes: Record<string, string>
  sources: Source[]
  artifacts: Artifact[]
  tasks: Task[]
  runs: Run[]
  messages: Message[]
  decisions: Decision[]
  skillId: string
}
export interface HandoffFields {
  summary: string
  scope: string
  constraints: string
  assumptions: string
  openQuestions: string
  nextActions: string
}
export interface HandoffRevision extends HandoffFields {
  version: number
  at: string
  approvedAt?: string
  acceptanceId: string
  planSignature: string
  projectScope: string[]
  artifactRefs: ArtifactRef[]
  sourceRefs: SourceRef[]
}
export interface Handoff {
  id: string
  fromStage: number
  toStage: number
  revisions: HandoffRevision[]
}
export interface HandoffRef {
  id: string
  version: number
  fromStage: number
  toStage: number
}
export interface StageCriterion {
  id: string
  label: string
  target: string
  method: string
}
export interface StageCheck {
  criterionId: string
  passed: boolean
  evidence: string
}
export interface StageDraft {
  inputs: string[]
  sourceIds: string[]
  criteria: StageCriterion[]
}
export interface StageEditorDraft {
  baseVersion: number
  baseDraft: StageDraft
  draft: StageDraft
}
export interface StageWork extends StageDraft {
  version: number
  confirmedAt?: string
  confirmedSignature?: string
  acceptance?: {
    id: string
    at: string
    planSignature: string
    artifactRefs: ArtifactRef[]
    reportSignature: string
    checks: StageCheck[]
  }
}
export interface Skill {
  id: string
  name: string
  stage: number
  description: string
  instructions: string
  version: number
  personal: boolean
}
export interface Knowledge {
  id: string
  title: string
  content: string
  conditions: string
  projectId: string
  projectName: string
  artifactId?: string
  version?: number
  status: 'draft' | 'published'
  at: string
}
export interface Workspace {
  schema: 1
  projects: Project[]
  skills: Skill[]
  knowledge: Knowledge[]
}
export interface AgentStatus {
  connected: boolean
  agent: string
  model: string
  error?: string
}
export interface WorkspaceEnvelope {
  revision: number
  updatedAt: string
  workspace: Workspace
}
export interface WorkspaceCommit {
  operationId: string
  baseRevision: number
  workspace: Workspace
  reason: 'initialize' | 'legacy_import' | 'edit' | 'restore'
  legacyRaw?: string
}
