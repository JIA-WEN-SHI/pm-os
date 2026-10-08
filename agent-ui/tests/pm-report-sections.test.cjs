const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createProject,validateBackup}=require('../src/features/pm/domain.ts')
const {reportSections,applyReportProposal,rejectReportProposal,validateSelection}=require('../src/features/pm/report-domain.ts')
const { selectionConversation }=require('../src/features/pm/report-domain.ts')
const { proposalReplacement }=require('../src/features/pm/report-domain.ts')
const project=()=>({...createProject({name:'QA',goal:'章节修改'}),artifacts:[{id:'a',title:'报告',stage:0,status:'approved',sourceIds:[],revisions:[{version:1,at:'old',approvedAt:'old',content:'# 报告\r\n\r\n## 问题\r\n原文 😀\r\n\r\n## 结论\r\n待核实\r\n'}]}]})
function proposal(p){return {id:'patch',selection:reportSections(p.artifacts[0],1)[1],request:'改得更清楚',replacement:'## 问题\r\n需要核实的描述\r\n\r\n',runId:'run',at:'now',status:'pending',sourceRefs:[]}}
test('sections preserve exact CRLF and ignore fenced headings including duplicate titles',()=>{
 const a=project().artifacts[0];a.revisions[0].content='开头\n## 同名\n```md\n## 假标题\n```\n## 同名\n最后'
 const s=reportSections(a,1);assert.equal(s.length,3);assert.equal(s.map(x=>x.quote).join(''),a.revisions[0].content);assert.notEqual(s[1].blockId,s[2].blockId)
 const p=project();assert.equal(reportSections(p.artifacts[0],1)[1].quote,'## 问题\r\n原文 😀\r\n\r\n')
 a.revisions[0].content='无标题 😀';assert.equal(reportSections(a,1).length,1)
})
test('accept changes only selected chapter and preserves confirmed revision',()=>{
 const p=project();p.reportProposals=[proposal(p)];p.artifacts.push({id:'downstream',stage:1,status:'approved',revisions:[]});p.tasks=[{artifactId:'a',status:'done'}]
 const next=applyReportProposal(p,'patch');assert.equal(next.artifacts[0].revisions.length,2);assert.deepEqual(next.artifacts[0].revisions[0],p.artifacts[0].revisions[0]);assert.equal(next.artifacts[0].revisions[1].content,'# 报告\r\n\r\n## 问题\r\n需要核实的描述\r\n\r\n## 结论\r\n待核实\r\n');assert.equal(next.artifacts[0].status,'draft');assert.equal(next.artifacts[1].status,'stale');assert.equal(next.tasks[0].status,'review');assert.equal(next.reportProposals[0].appliedVersion,2);assert.throws(()=>applyReportProposal(next,'patch'))
})
test('stale and forged selections cannot apply and rejection never changes report',()=>{
 const p=project();p.reportProposals=[proposal(p)];const rejected=rejectReportProposal(p,'patch');assert.deepEqual(rejected.artifacts,p.artifacts);assert.equal(rejected.reportProposals[0].status,'rejected');assert.throws(()=>applyReportProposal(rejected,'patch'))
 p.artifacts[0].revisions.push({version:2,content:'人工新版',at:'later'});assert.throws(()=>applyReportProposal(p,'patch'),/版本/)
 const sel={...proposal(project()).selection,quote:'伪造'};assert.throws(()=>validateSelection(project(),sel),/选区/)
})
test('backup validates proposal range and accepted version, preserves history after restore',()=>{
 let p=project();p.reportProposals=[proposal(p)];const wrap=()=>({schema:1,projects:[p],skills:[],knowledge:[]});assert.doesNotThrow(()=>validateBackup(wrap()));p=applyReportProposal(p,'patch');assert.doesNotThrow(()=>validateBackup(wrap()));p={...p,id:'restored'};assert.doesNotThrow(()=>validateBackup(wrap()));p.reportProposals[0].appliedVersion=1;assert.throws(()=>validateBackup(wrap()));p.reportProposals[0].appliedVersion=2;p.reportProposals[0].selection.quote='bad';assert.throws(()=>validateBackup(wrap()))
})
test('chapter followups include only this version and chapter successful discussion',()=>{
 const p=project(),s=proposal(p).selection;p.messages=[{role:'assistant',content:'本节建议',selection:s},{role:'assistant',content:'失败片段',selection:s,failed:true},{role:'assistant',content:'另一个版本',selection:{...s,version:2}},{role:'assistant',content:'另一章节',selection:{...s,blockId:'section-7'}}]
 const history=selectionConversation(p,s);assert.match(history,/本节建议/);assert.doesNotMatch(history,/失败片段|另一个版本|另一章节/)
})
test('model replacement without trailing newline does not join the next heading',()=>{
 const p=project(),x=proposal(p);x.replacement=proposalReplacement(x.selection,'## 问题\n改写');p.reportProposals=[x];const r=applyReportProposal(p,'patch').artifacts[0].revisions.at(-1);assert.match(r.content,/改写\r\n## 结论/)
})
test('expanded chapter ranges and imported missing separators are rejected',()=>{
 const p=project(),x=proposal(p);p.reportProposals=[x];x.selection.endLine=7;x.selection.quote=p.artifacts[0].revisions[0].content.split(/(?<=\n)/).slice(2,7).join('');assert.throws(()=>validateSelection(p,x.selection));
 p.reportProposals=[{...proposal(p),replacement:'无换行'}];assert.throws(()=>applyReportProposal(p,'patch'));assert.throws(()=>validateBackup({schema:1,projects:[p],skills:[],knowledge:[]}))
})
