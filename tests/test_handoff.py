import copy,json,tempfile,unittest
from pathlib import Path
from pmos.workspace_schema import validate_workspace,InvalidWorkspace
from pmos.workspace_store import WorkspaceStore
from test_workspace_store import workspace,commit

def ready():
    w=workspace();p=w['projects'][0];p['stageWork']={};p['artifacts'][0]['revisions']=p['artifacts'][0]['revisions'][:1];p['artifacts'][0]['revisions'][0]['approvedAt']='now'
    plan={'version':1,'inputs':['目标','材料','问题'],'sourceIds':[],'criteria':[{'id':'c','label':'完整','target':'完整','method':'核对'}],'confirmedAt':'now'}
    plan['confirmedSignature']=json.dumps({'project':[p['name'],p['goal'],p['audience']],'stage':0,'version':1,'inputs':plan['inputs'],'criteria':plan['criteria'],'sources':[],'upstream':[]},ensure_ascii=False)
    refs=[{'id':'a1','title':'报告','version':1}]
    plan['acceptance']={'id':'accept','at':'now','planSignature':plan['confirmedSignature'],'artifactRefs':refs,'reportSignature':json.dumps([['a1',0,1,'初稿']],ensure_ascii=False),'checks':[{'criterionId':'c','passed':True,'evidence':'核对'}]}
    p['stageWork']['0']=plan
    revision={'version':1,'at':'now','acceptanceId':'accept','planSignature':plan['confirmedSignature'],'projectScope':[p['name'],p['goal'],p['audience']],'artifactRefs':refs,'sourceRefs':[],'summary':'摘要','scope':'模拟','constraints':'待核实','assumptions':'假设','openQuestions':'待处理','nextActions':'定义问题'}
    p['handoffs']=[{'id':'h','fromStage':0,'toStage':1,'revisions':[revision]}]
    return w

class HandoffTests(unittest.TestCase):
    def test_malformed_or_foreign_handoffs_rejected(self):
        for key,value in [('version',True),('summary',None),('sourceRefs',[{'id':'other','version':1}]),('artifactRefs',[{'id':'foreign','title':'x','version':1}])]:
            w=ready();w['projects'][0]['handoffs'][0]['revisions'][0][key]=value
            with self.subTest(key=key),self.assertRaises(InvalidWorkspace):validate_workspace(w)

    def test_confirm_requires_current_accepted_stage_and_content(self):
        for change in ('report','plan','empty','scope','same-commit-edit'):
            with tempfile.TemporaryDirectory() as root:
                store=WorkspaceStore(Path(root)/'db');w=ready()
                if change=='report':w['projects'][0]['artifacts'][0]['status']='draft'
                if change=='plan':w['projects'][0]['stageWork']['0']['inputs'][0]='不同目标'
                if change=='empty':w['projects'][0]['handoffs'][0]['revisions'][0]['summary']=' '
                if change=='scope':w['projects'][0]['goal']='新范围'
                store.commit(commit(w));bad=copy.deepcopy(w);r=bad['projects'][0]['handoffs'][0]['revisions'][0];r['approvedAt']='later'
                if change=='same-commit-edit':r['summary']='暗改'
                with self.subTest(change=change),self.assertRaises(InvalidWorkspace):store.commit(commit(bad,1))

    def test_history_immutable_new_draft_and_restore_preserved(self):
        with tempfile.TemporaryDirectory() as root:
            store=WorkspaceStore(Path(root)/'db');w=ready();store.commit(commit(w));w['projects'][0]['handoffs'][0]['revisions'][0]['approvedAt']='later';store.commit(commit(w,1))
            for change in ('delete','edit','revoke'):
                bad=copy.deepcopy(w);h=bad['projects'][0]['handoffs'][0]
                if change=='delete':bad['projects'][0]['handoffs']=[]
                if change=='edit':h['revisions'][0]['constraints']='新限制'
                if change=='revoke':del h['revisions'][0]['approvedAt']
                with self.subTest(change=change),self.assertRaises(InvalidWorkspace):store.commit(commit(bad,2))
            r=copy.deepcopy(w['projects'][0]['handoffs'][0]['revisions'][0]);r.pop('approvedAt');r['version']=2;w['projects'][0]['handoffs'][0]['revisions'].append(r);store.commit(commit(w,2))
            restored=copy.deepcopy(w['projects'][0]);restored['id']='restored';w['projects'].append(restored);store.commit(commit(w,3,reason='restore'));self.assertEqual(store.read()['workspace'],w)
