const {test}=require('node:test');const assert=require('node:assert/strict')
const d=require('../src/features/pm/domain.ts'),x=require('../src/features/pm/discovery-domain.ts'),c=require('../src/features/pm/context-domain.ts')
function readyFor(stage){let p=d.createProject({name:'全流程模拟',goal:'验证阶段交接'});p.demo=true;for(let i=0;i<stage;i++){p=d.saveStageDraft(p,i,{inputs:['目标','事实','问题'],sourceIds:[],criteria:[{id:'c',label:'完整',target:'有证据',method:'核对'}]},0);p=d.confirmStagePlan(p,i,1);const a={id:'a'+i,title:'上游成果'+i,stage:i,status:'review',sourceIds:[],revisions:[{version:1,content:'上游依据-'+i,at:'now'}]};p.artifacts.push(a);p=d.acceptStage(p,i,[{id:a.id,title:a.title,version:1}],[{criterionId:'c',passed:true,evidence:'已检查'}],d.stagePlanSignature(p,i))}return p}
function proposal(p,stage){const run={id:'r'+stage,stage,title:'准备',status:'success',at:'now',output:JSON.stringify({plan:'阶段专属约束-'+stage,summary:'方案',inputs:['目标','事实','问题'],sourceIds:[],criteria:[{label:'完整',target:'有依据',method:'核对'}],questions:[],evidence:[]}),skill:'通用',sourceIds:[]};run.contextSnapshot=c.createRunContext(p,{message:'准备',sessionId:'pm-test',stagePreparation:x.preparationBaseline(p,stage)},{sourceIds:[],artifactRefs:x.preparationUpstream(p,stage)},undefined,'none','now');run.artifactRefs=run.contextSnapshot.artifacts;p.runs.unshift(run);return run}
test('all eight stages adopt into their own versioned plan without modifying another stage',()=>{for(let stage=0;stage<8;stage++){const p=readyFor(stage),before=JSON.stringify(p.stageWork?.[stage-1]),r=proposal(p,stage);const next=x.adoptPreparation(p,r.id);assert.equal(d.stageRunBlock(next,stage),'');assert.match(d.stagePrompt(next,stage),new RegExp('阶段专属约束-'+stage));assert.equal(JSON.stringify(next.stageWork?.[stage-1]),before);assert.equal(c.validateRunContexts(next),true)}})
test('preparation reads accepted upstream artifacts before current stage is confirmed',()=>{const p=readyFor(2);assert.equal(p.stageWork[2],undefined);const prompt=x.preparationContext(p,2);assert.match(prompt,/上游依据-1/);assert.match(x.preparationPrompt(p,undefined,2),/可行性/);assert.equal(x.preparationUpstream(p,2).length,2)})
test('changed upstream and missing earlier acceptance block adoption',()=>{const p=readyFor(1),r=proposal(p,1);p.artifacts[0]=d.reviseArtifact(p.artifacts[0],'变更',1);assert.throws(()=>x.adoptPreparation(p,r.id));const empty=readyFor(0);assert.notEqual(x.preparationBlock(empty,7),'')})
test('dialog history and selected plan cannot cross stages',()=>{const p=readyFor(2);proposal(p,0);const r=proposal(p,1);const text=x.preparationPrompt(p,r.id,2);assert.ok(!text.includes('阶段专属约束-0'));assert.ok(!text.includes('阶段专属约束-1'))})
module.exports={readyFor,proposal}

test('stage-specific analysis requirements reach both chat and report generation',()=>{
 const expectations=[/资料索引/,/AS-IS/,/收益与成本假设/,/状态机/,/逐例实际结果/,/证据不足/,/观测窗口/,/方法更新候选/];
 for(let stage=0;stage<8;stage++){
  const p=readyFor(stage),r=proposal(p,stage),next=x.adoptPreparation(p,r.id);
  assert.match(x.preparationPrompt(p,undefined,stage),expectations[stage]);
  assert.match(d.stagePrompt(next,stage),expectations[stage]);
  assert.equal(d.stageAccepted(next,stage),false);
 }
});

test('versioned source proposals remain adoptable after server key-order roundtrip',()=>{
 const {versionSource,reviseSource}=require('../src/features/pm/source-domain.ts');
 const p=readyFor(1);p.sources=[versionSource({id:'s',title:'模拟资料',kind:'text',content:'模拟内容',at:'now'},'simulation')];
 const r=proposal(p,1);
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 assert.equal(x.preparationError(sort(p),sort(r)),'');
 const changed=reviseSource(p,'s',1,{title:'模拟资料',content:'修改内容',mode:'simulation'});
 assert.match(x.preparationError(changed,r),/更新/);
});

test('handoff confirmation changes invalidate proposals and JSON key order does not',()=>{
 const h=require('../src/features/pm/handoff-domain.ts');
 const fields={summary:'上游结论',scope:'模拟',constraints:'不冒充实测',assumptions:'待验证',openQuestions:'样本待补充',nextActions:'定义问题'};
 let p=readyFor(1);p=h.saveHandoff(p,0,fields,0);assert.match(x.preparationBlock(p,1),/交接/);p=h.confirmHandoff(p,0,1);
 const r=proposal(p,1);assert.match(x.preparationContext(p,1),/不冒充实测/);
 const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
 assert.equal(x.preparationError(sort(p),sort(r)),'');
 p=h.saveHandoff(p,0,{...fields,nextActions:'修改交接要求'},1);p=h.confirmHandoff(p,0,2);assert.match(x.preparationError(p,r),/更新/);
});
