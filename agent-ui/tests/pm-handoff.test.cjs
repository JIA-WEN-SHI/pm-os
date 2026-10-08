const {test}=require('node:test');const assert=require('node:assert/strict');const d=require('../src/features/pm/domain.ts');const h=require('../src/features/pm/handoff-domain.ts');const core=require('../src/features/pm/handoff-core.ts');
const fields={summary:'资料表明存在待验证需求',scope:'仅模拟场景',constraints:'不得当作真实访谈',assumptions:'需求可能存在',openQuestions:'真实样本待补充，S02负责人待指派',nextActions:'定义问题并标注假设'};
function ready(){let p=d.createProject({name:'模拟项目',goal:'交接验证'});p.demo=true;p.sources=[{id:'s',title:'模拟材料',kind:'text',at:'then',content:'样例'}];p=d.saveStageDraft(p,0,{inputs:['目标','样例','问题'],sourceIds:['s'],criteria:[{id:'c',label:'完整',target:'可追溯',method:'核对'}]},0);p=d.confirmStagePlan(p,0,1);p.artifacts=[{id:'a',title:'研究报告',stage:0,status:'draft',sourceIds:['s'],revisions:[{version:1,at:'then',content:'模拟报告'}]}];return d.acceptStage(p,0,[{id:'a',title:'研究报告',version:1}],[{criterionId:'c',passed:true,evidence:'已核对模拟报告'}],d.stagePlanSignature(p,0))}
function draft(p){return h.saveHandoff(p,0,fields,0)}
function approved(){let p=draft(ready());return h.confirmHandoff(p,0,1)}
const wrap=p=>({schema:1,projects:[p],skills:[],knowledge:[]});
test('draft needs accepted stage, confirmation needs complete current saved version',()=>{
 assert.throws(()=>draft(d.createProject({name:'空项目',goal:'测试'})));
 let p=draft(ready());assert.equal(core.handoffForStage(p,0).revisions[0].approvedAt,undefined);assert.deepEqual(core.handoffInputs(p,1),[]);
 assert.throws(()=>h.confirmHandoff(p,0,2));p= h.confirmHandoff(p,0,1);assert.equal(core.handoffInputs(p,1)[0].version,1);assert.throws(()=>h.confirmHandoff(p,0,1));
 const x=h.saveHandoff(ready(),0,{...fields,assumptions:''},0);assert.throws(()=>h.confirmHandoff(x,0,1));
})
test('new drafts keep approved inputs; confirming new version invalidates downstream consent',()=>{
 let p=approved();p=d.saveStageDraft(p,1,{inputs:['问题','材料','假设'],sourceIds:[],criteria:[{id:'c',label:'完整',target:'完整',method:'核对'}]},0);p=d.confirmStagePlan(p,1,1);assert.equal(d.stageRunBlock(p,1),'');assert.match(d.stagePrompt(p,1),/不得当作真实访谈/);
 const old=structuredClone(p.handoffs[0].revisions[0]);p=h.saveHandoff(p,0,{...fields,nextActions:'更新任务'},1);assert.equal(core.handoffInputs(p,1)[0].version,1);assert.equal(d.stageRunBlock(p,1),'');
 p=h.confirmHandoff(p,0,2);assert.deepEqual(p.handoffs[0].revisions[0],old);assert.equal(core.handoffInputs(p,1)[0].version,2);assert.match(d.stageRunBlock(p,1),/确认/);
})
test('changed report, source, plan or project makes handoff stale without rewriting history',()=>{
 for(const mutate of [p=>p.artifacts[0]=d.reviseArtifact(p.artifacts[0],'修订',1),p=>p.sources[0].content='不同正文',p=>p.stageWork[0].inputs[0]='新目标',p=>p.goal='新范围',p=>p.artifacts[0].sourceIds.push('new-source')]){
  const p=approved();mutate(p);assert.equal(core.handoffFresh(p,core.handoffForStage(p,0).revisions[0],0),false);assert.equal(core.handoffInputs(p,1).length,0);assert.notEqual(d.stageRunBlock(p,1),'');
 }
})
test('snapshot preserves approved historical handoff refs and rejects foreign or draft ones',()=>{
 const p=approved();const {createRunContext}=require('../src/features/pm/context-domain.ts');
 const snapshot=createRunContext(p,{message:'交接正文',sessionId:'pm-handoff'},{sourceIds:[],artifactRefs:[],handoffs:core.handoffInputs(p,1)},undefined,'none','now');
 assert.equal(snapshot.handoffs[0].version,1);p.runs=[{id:'r',title:'生成',stage:1,status:'success',at:'now',output:'模拟',skill:'通用',sourceIds:[],contextSnapshot:snapshot}];assert.doesNotThrow(()=>d.validateBackup(wrap(p)));
 p.runs[0].contextSnapshot.handoffs[0].id='foreign';assert.throws(()=>d.validateBackup(wrap(p)));
})
test('first draft gates downstream generation while old no-card projects stay compatible',()=>{
 let p=ready();assert.equal(d.stageSequenceBlock(p,1),'');p=draft(p);assert.match(d.stageRunBlock(p,1),/交接/);
 assert.throws(()=>h.saveHandoff(p,0,fields,0));assert.throws(()=>h.saveHandoff({...p,archived:true},0,fields,1));
})
test('backup and historical context references validate exact approved scoped handoff',()=>{
 const p=approved();assert.doesNotThrow(()=>d.validateBackup(wrap(p)));p.id='restored';assert.doesNotThrow(()=>d.validateBackup(wrap(p)));
 for(const mutate of [p=>p.handoffs[0].revisions[0].artifactRefs[0].id='foreign',p=>p.handoffs[0].revisions[0].sourceRefs[0].version=99,p=>p.handoffs[0].revisions[0].version=true,p=>p.handoffs[0].fromStage=7,p=>p.handoffs[0].revisions[0].summary=null]){
  const bad=structuredClone(p);mutate(bad);assert.throws(()=>d.validateBackup(wrap(bad)));
 }
})
module.exports={ready,fields,approved};
test('server JSON key ordering does not invalidate unchanged stage consent',()=>{
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 const p=ready(),restored=sort(p);assert.equal(d.stageRunBlock(restored,0),'');assert.equal(d.stagePlanSignature(restored,0),p.stageWork[0].confirmedSignature);
})
