const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createProject}=require('../src/features/pm/domain.ts')
const {finishExecution}=require('../src/features/pm/execution-domain.ts')
function sample(){const p=createProject({name:'后台测试',goal:'可靠运行'});p.tasks=[{id:'t',title:'报告',stage:0,status:'running',goal:'测试',sourceIds:[],skillId:''}];p.runs=[{id:'r',taskId:'t',stage:0,title:'报告',at:'now',status:'running',output:'',skill:'通用',sourceIds:[],artifactRefs:[],executionMode:'background',requestText:'请生成'}];return p}
const result={projectId:'p',runId:'r',attemptId:'attempt',status:'success',output:'完整报告',error:'',duration:123,upstreamId:'up',updatedAt:'then',events:[]}
test('collecting a durable result twice creates one report and one reply',()=>{let p=sample();const e={...result,projectId:p.id};p=finishExecution(p,'r',e);assert.equal(p.artifacts.length,1);assert.equal(p.messages.length,1);assert.equal(p.tasks[0].artifactId,p.artifacts[0].id);assert.equal(p.runs[0].status,'success');assert.deepEqual(finishExecution(p,'r',e),p)})
test('interrupted and cancelled partial results never become reports',()=>{for(const status of ['cancelled','interrupted','failed','timed_out']){const p=sample();const done=finishExecution(p,'r',{...result,projectId:p.id,status,error:'未完成'});assert.equal(done.artifacts.length,0);assert.equal(done.runs[0].status,'failed');assert.equal(done.runs[0].output,'完整报告');assert.equal(done.tasks[0].status,'failed')}})
test('foreign or active results cannot be collected',()=>{const p=sample();assert.throws(()=>finishExecution(p,'r',result));assert.throws(()=>finishExecution(p,'r',{...result,projectId:p.id,status:'running'}))})
