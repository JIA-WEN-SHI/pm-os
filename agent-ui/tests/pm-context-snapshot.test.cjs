const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createProject,validateBackup}=require('../src/features/pm/domain.ts')
const context=require('../src/features/pm/context-domain.ts')
function sample(){
 const p=createProject({name:'快照项目',goal:'留痕'});
 p.sources=[{id:'s',title:'旧标题',kind:'text',content:'原始😀\r\n资料',at:'then'},{id:'empty',title:'未读取链接',kind:'link',content:'',at:'then',url:'https://example.com'}];
 p.artifacts=[{id:'a',title:'报告',stage:0,status:'draft',sourceIds:['s'],revisions:[{version:1,content:'旧报告',at:'then'}]}];
 return p
}
function run(p){const refs={sourceIds:['s','empty'],artifactRefs:[{id:'a',title:'报告',version:1}]};return {id:'r',title:'模拟运行',stage:0,status:'running',at:'now',output:'',skill:'方法 v1',...refs,contextSnapshot:context.createRunContext(p,{message:'精确的请求😀\r\n原文',sessionId:'pm-test-r'},refs,{id:'m',name:'方法',version:1,instructions:'旧方法'},'none','now')}}
const wrap=p=>({schema:1,projects:[p],skills:[],knowledge:[]})
test('request and historical source/method metadata stay fixed after live edits',()=>{
 const p=sample(),r=run(p);p.runs=[r];
 assert.equal(r.contextSnapshot.request.message,'精确的请求😀\r\n原文');assert.equal(r.contextSnapshot.sources[1].hasContent,false);
 p.sources[0].versions=[{version:1,title:'旧标题',content:p.sources[0].content,at:'then',mode:'unknown',origin:'legacy_snapshot'},{version:2,title:'新标题',content:'新资料',at:'later',mode:'real',origin:'user_saved'}];p.sources[0].title='新标题';p.sources[0].content='新资料';
 assert.doesNotThrow(()=>validateBackup(wrap(p)));assert.equal(r.contextSnapshot.sources[0].title,'旧标题');assert.equal(r.contextSnapshot.method.instructions,'旧方法');
 p.id='restored';assert.doesNotThrow(()=>validateBackup(wrap(p)));
})
test('backup rejects forged metadata, foreign references, malformed requests and history mode',()=>{
 for(const mutate of [s=>s.sources[0].version=99,s=>s.sources[0].id='other-project',s=>s.sources[0].title='伪造',s=>s.sources[0].mode='real',s=>s.sources[0].hasContent=false,s=>s.artifacts[0].version=99,s=>s.request.message={},s=>s.request.sessionId='bad',s=>s.historyMode='full-model',s=>s.method.version=true,s=>s.schema=2,s=>s.sources.push({...s.sources[0]}),s=>s.request.authorization='secret']){
  const p=sample();p.runs=[run(p)];mutate(p.runs[0].contextSnapshot);assert.throws(()=>validateBackup(wrap(p)));
 }
 const p=sample();p.runs=[run(p)];p.runs[0].sourceIds=[];assert.throws(()=>validateBackup(wrap(p)));
})
test('creator copies caller inputs and refuses missing project references; legacy runs remain readable',()=>{
 const p=sample(),request={message:'请求',sessionId:'pm-test'},refs={sourceIds:['s'],artifactRefs:[]},method={id:'m',name:'方法',version:1,instructions:'原方法'};
 const s=context.createRunContext(p,request,refs,method,'agent-session','now');request.message='改写';method.instructions='新版';refs.sourceIds=[];
 assert.equal(s.request.message,'请求');assert.equal(s.method.instructions,'原方法');assert.equal(s.sources.length,1);
 assert.throws(()=>context.createRunContext(p,request,{sourceIds:['foreign'],artifactRefs:[]},undefined,'none','now'));
 p.runs=[run(p)];delete p.runs[0].contextSnapshot;assert.doesNotThrow(()=>validateBackup(wrap(p)));
})
test('historically valid method version zero can still be captured',()=>{
 const p=sample();p.runs=[run(p)];p.runs[0].contextSnapshot.method.version=0;assert.doesNotThrow(()=>validateBackup(wrap(p)));
})
