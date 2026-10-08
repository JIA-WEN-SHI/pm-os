const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createProject,validateBackup,createContext}=require('../src/features/pm/domain.ts')
const {sourceVersions,reviseSource,recordEvidence}=require('../src/features/pm/source-domain.ts')
const project=()=>({...createProject({name:'QA',goal:'验证'}),sources:[{id:'s1',title:'材料',content:'原文 😀\r\n第二行',at:'old',kind:'text'}]})
test('legacy baseline and evidence survive a source revision',()=>{
  let p=recordEvidence(project(),'s1',1,1,1,'需要核实')
  assert.equal(p.evidence[0].quote,'原文 😀')
  assert.equal(p.evidence[0].mode,'unknown')
  p=reviseSource(p,'s1',1,{title:'新版',content:'修改内容',mode:'simulation'})
  assert.equal(p.sources[0].versions[0].content,'原文 😀\r\n第二行')
  assert.equal(p.sources[0].versions[0].origin,'legacy_snapshot')
  assert.equal(p.evidence[0].sourceVersion,1)
  assert.equal(p.sources[0].versions[1].mode,'simulation')
  assert.throws(()=>reviseSource(p,'s1',1,{title:'旧写入',content:'覆盖',mode:'real'}),/版本/)
})
test('invalid lines and unread links cannot become evidence',()=>{
  assert.throws(()=>recordEvidence(project(),'s1',1,0,1,''),/行/)
  assert.throws(()=>recordEvidence(project(),'s1',2,1,1,''),/版本/)
  const p=project();p.sources[0].content=''
  assert.throws(()=>recordEvidence(p,'s1',1,1,1,''),/正文/)
})
test('linked approved reports need review but unrelated reports do not',()=>{
  const p=project();p.artifacts=[{id:'a',sourceIds:['s1'],status:'approved'},{id:'b',sourceIds:[],status:'approved'}]
  const next=reviseSource(p,'s1',1,{title:'材料',content:'变化',mode:'unknown'})
  assert.equal(next.artifacts[0].status,'stale');assert.equal(next.artifacts[1].status,'approved')
})
test('backup rejects forged quotes and current context excludes old evidence',()=>{
  let p=recordEvidence(project(),'s1',1,2,2,'旧证据备注')
  const wrap=()=>({schema:1,projects:[p],skills:[],knowledge:[]})
  assert.doesNotThrow(()=>validateBackup(wrap()))
  p.evidence[0].quote='伪造摘录'
  assert.throws(()=>validateBackup(wrap()),/备份/)
  p=recordEvidence(project(),'s1',1,2,2,'旧证据备注')
  assert.match(createContext(p,'S01',['s1']),/旧证据备注/)
  p=reviseSource(p,'s1',1,{title:'材料',content:'最新原文',mode:'real'})
  assert.doesNotMatch(createContext(p,'S01',['s1']),/旧证据备注/)
  assert.match(createContext(p,'S01',['s1']),/最新原文/)
})
