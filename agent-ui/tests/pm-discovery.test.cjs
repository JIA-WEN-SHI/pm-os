const { test } = require('node:test')
const assert = require('node:assert/strict')
const d = require('../src/features/pm/domain.ts')
const c = require('../src/features/pm/context-domain.ts')
const x = require('../src/features/pm/discovery-domain.ts')
function fixture() {
  const p = d.createProject({name:'测试',goal:'了解用户如何查资料'})
  p.sources = [{id:'s',title:'访谈',kind:'text',content:'查资料需要反复切换工具。',at:'now'}]
  const value = {summary:'研究资料查找流程',inputs:['用户：待补充','已有访谈片段','了解切换工具的原因'],sourceIds:['s'],criteria:[{label:'证据',target:'发现有来源',method:'对照原文'}],questions:['访谈对象是谁？'],evidence:[{sourceId:'s',quote:'反复切换工具'}]}
  const run = {id:'r',stage:0,title:'梳理调研',status:'success',at:'now',output:JSON.stringify(value),skill:'通用对话',sourceIds:['s'],contextSnapshot:c.createRunContext(p,{message:'整理',sessionId:'pm-test',stagePreparation:x.preparationBaseline(p)},{sourceIds:['s'],artifactRefs:[]},undefined,'none','now')}
  p.runs=[run]
  return {p,run,value}
}
test('AI preparation is a proposal until adopted; adoption fills and confirms the stage without accepting reports',()=>{
  const {p,run}=fixture()
  assert.equal(p.stageWork,undefined)
  const next=x.adoptPreparation(p,run.id)
  assert.deepEqual(next.stageWork[0].sourceIds,['s'])
  assert.equal(next.stageWork[0].inputs[0],'用户：待补充')
  assert.equal(d.stageRunBlock(next,0),'')
  assert.equal(d.stageAccepted(next,0),false)
  assert.throws(()=>x.adoptPreparation(next,run.id),/更新/)
  assert.equal(c.validateRunContexts(next),true)
})
test('malformed, failed, foreign and invented-source outputs cannot be adopted',()=>{
  for(const mutate of [
    ({run})=>run.status='failed',
    ({run})=>run.output='不是 JSON',
    ({value})=>value.sourceIds=['foreign'],
    ({value})=>value.evidence[0].quote='不存在的原文',
    ({value})=>value.inputs=['缺字段'],
    ({value})=>value.criteria=[],
  ]) {const f=fixture(); mutate(f); if(f.run.output.startsWith('{')) f.run.output=JSON.stringify(f.value); assert.throws(()=>x.adoptPreparation(f.p,f.run.id))}
})
test('changed source, project scope or stage draft invalidates pending preparation',()=>{
  for(const mutate of [
    p=>p.goal='改过的目标',
    p=>p.sources[0].content='修改后的原文',
    p=>p.sources.push({id:'new',title:'新增',kind:'text',content:'新信息',at:'now'}),
    p=>p.stageWork={0:{inputs:['a','b','c'],sourceIds:[],criteria:[],version:1}},
  ]) {const {p,run}=fixture(); mutate(p); assert.throws(()=>x.adoptPreparation(p,run.id),/更新/)}
})
test('preparation request is scoped, isolated and carries current draft and followup context',()=>{
  const {p}=fixture()
  const text=x.preparationPrompt(p)
  assert.match(text,/JSON/)
  assert.match(text,/待补充/)
  assert.match(text,/访谈对象是谁/)
})
test('preparation snapshots reject invalid modes, task scopes and null metadata',()=>{
  for(const mutate of [
    r=>r.contextSnapshot.request.stagePreparation=null,
    r=>r.contextSnapshot.request.stagePreparation.baseVersion=true,
    r=>r.contextSnapshot.historyMode='agent-session',
    r=>r.stage=1,
    r=>r.taskId='task',
  ]) {const {p,run}=fixture();mutate(run);assert.equal(c.validateRunContexts(p),false)}
})
test('full research plan is optional for legacy results but validated and carried into followup',()=>{
  const {p,run,value}=fixture()
  assert.equal(x.parsePreparation(run.output).plan,undefined)
  value.plan='## 调研目标\n查明出处追溯的问题\n## 调研方法\n访谈与资料对照，时间待定'
  run.output=JSON.stringify(value)
  assert.equal(x.parsePreparation(run.output).plan,value.plan)
  assert.match(x.preparationPrompt(p),/访谈与资料对照/)
  const next=x.adoptPreparation(p,run.id)
  assert.match(d.stagePrompt(next,0),/访谈与资料对照/)
  assert.match(next.stageWork[0].inputs[2],/时间待定/)
  value.plan={bad:'not text'}
  assert.throws(()=>x.parsePreparation(JSON.stringify(value)))
})
test('long sources become clearly marked excerpts without mutating project material',()=>{
  const {p}=fixture(); p.sources[0].content='长资料'.repeat(30000)
  const original=p.sources[0].content
  const prompt=x.preparationContext(p)
  assert.ok(prompt.length<35000)
  assert.match(prompt,/节选/)
  assert.equal(p.sources[0].content,original)
  let planned=d.saveStageDraft(p,0,{inputs:['目标','事实','问题'],sourceIds:['s'],criteria:[{id:'metric',label:'证据',target:'有引用',method:'核对'}]},0)
  planned=d.confirmStagePlan(planned,0,1)
  const followup=x.preparationContext(planned)+x.preparationPrompt(planned)
  assert.ok(followup.length<50000)
  assert.ok(!x.preparationPrompt(planned).includes('confirmedSignature'))
})
test('followup targets the selected historical plan without importing another project run',()=>{
  const {p,run,value}=fixture()
  value.plan='历史方案独有约束：只研究桌面端'
  run.output=JSON.stringify(value)
  p.runs=[1,2,3,4].map(i=>({...run,id:'new-'+i,output:JSON.stringify({...value,plan:'新方案'+i})})).concat(run)
  assert.match(x.preparationPrompt(p,run.id),/历史方案独有约束/)
  assert.ok(!x.preparationPrompt(p,'other-project-run').includes('历史方案独有约束'))
})
