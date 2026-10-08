const {test}=require('node:test'),assert=require('node:assert/strict')
const {createProject,validateBackup}=require('../src/features/pm/domain.ts')
const {makeTextSelection,locateTextSelection,applyReportProposal,validateSelection,proposalReplacement}=require('../src/features/pm/report-domain.ts')
const {locateRenderedTextSelection}=require('../src/features/pm/report-domain.ts')
const {makeEditorTextSelection}=require('../src/features/pm/report-domain.ts')
const fixture=()=>({...createProject({name:'QA',goal:'局部改写'}),artifacts:[{id:'a',title:'报告',stage:0,status:'draft',sourceIds:[],revisions:[{version:1,at:'now',content:'# 文案\r\n开头😀需要润色的描述。结尾。\r\n'}]}]})
test('unique rendered text becomes a precise code-point selection and only it changes',()=>{
 const p=fixture(),a=p.artifacts[0],s=locateTextSelection(a,1,'需要润色的描述');assert.equal(s.kind,'text');assert.equal(s.startOffset,Array.from('# 文案\r\n开头😀').length);assert.equal(s.quote,'需要润色的描述');validateSelection(p,s)
 p.reportProposals=[{id:'x',selection:s,request:'润色',replacement:'清晰文案',runId:'r',at:'now',status:'pending',sourceRefs:[]}]
 const next=applyReportProposal(p,'x');assert.equal(next.artifacts[0].revisions[1].content,'# 文案\r\n开头😀清晰文案。结尾。\r\n');assert.doesNotThrow(()=>validateBackup({schema:1,projects:[next],skills:[],knowledge:[]}))
})
test('ambiguous rendered text must be explicitly selected in original',()=>{
 const p=fixture(),a=p.artifacts[0];a.revisions[0].content='相同文案\n相同文案';assert.equal(locateTextSelection(a,1,'相同文案'),null);const s=makeTextSelection(a,1,5,9);assert.equal(s.startOffset,5);assert.equal(s.quote,'相同文案');validateSelection(p,s);assert.equal(locateTextSelection(a,1,'不存在'),null)
})
test('reject empty, out of range, split emoji and forged offsets or line ranges',()=>{
 const p=fixture(),a=p.artifacts[0],text=a.revisions[0].content,index=text.indexOf('😀');assert.throws(()=>makeTextSelection(a,1,index+1,index+2));assert.throws(()=>makeTextSelection(a,1,1,1));assert.throws(()=>makeTextSelection(a,1,0,999));const s=makeTextSelection(a,1,index,index+2);assert.equal(s.quote,'😀');for(const change of [{startOffset:s.startOffset+1},{quote:'伪造'},{endLine:99},{kind:'bad'}])assert.throws(()=>validateSelection(p,{...s,...change}))
})
test('text selection preserves replacement verbatim including intentional line changes',()=>{
 const p=fixture(),a=p.artifacts[0],s=makeTextSelection(a,1,0,a.revisions[0].content.length);assert.equal(proposalReplacement(s,'单段新文案'),'单段新文案')
})
test('rendered selection is mapped within its actual source node, not an unrelated raw match',()=>{
 const a=fixture().artifacts[0];a.revisions[0].content='hello&#32;world and hello world';assert.equal(locateRenderedTextSelection(a,1,'hello world and hello world',0,11,0,a.revisions[0].content.length),null)
 a.revisions[0].content='重复文案\n\n重复文案';const s=locateRenderedTextSelection(a,1,'重复文案',0,4,6,10);assert.equal(s.startOffset,6)
})
test('decoded text must never map to another literal occurrence within its enclosing element',()=>{
 const a=fixture().artifacts[0];a.revisions[0].content='hello&#32;world**x**hello world';assert.equal(locateRenderedTextSelection(a,1,'hello world',0,11,0,a.revisions[0].content.length),null)
})
test('textarea normalized newlines map back to original CRLF offsets',()=>{
 const a=fixture().artifacts[0],display=a.revisions[0].content.replace(/\r\n?/g,'\n'),start=display.indexOf('需要润色');const s=makeEditorTextSelection(a,1,start,start+7);assert.equal(s.quote,'需要润色的描述');assert.equal(s.startOffset,Array.from('# 文案\r\n开头😀').length)
})
