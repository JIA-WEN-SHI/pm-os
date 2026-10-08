import copy
import tempfile
import unittest
from pathlib import Path
from pmos.workspace_schema import validate_workspace, InvalidWorkspace
from pmos.workspace_store import WorkspaceStore
from test_workspace_store import workspace, commit

def sample():
    w=workspace();p=w['projects'][0]
    p['sources']=[{'id':'s','title':'资料','kind':'text','content':'原文😀','at':'then'}]
    p['runs']=[{'id':'r','title':'运行','stage':0,'status':'running','at':'now','output':'','skill':'通用对话','sourceIds':['s'],'artifactRefs':[],
      'contextSnapshot':{'schema':1,'capturedAt':'now','request':{'message':'请求😀\r\n原文','sessionId':'pm-test'},'sources':[{'id':'s','title':'资料','version':1,'mode':'simulation','hasContent':True}],'artifacts':[],'historyMode':'agent-session'}}]
    return w

class ContextTests(unittest.TestCase):
    def test_method_version_zero_remains_valid(self):
        w=sample();w['projects'][0]['runs'][0]['contextSnapshot']['method']={'id':'m','name':'导入方法','version':0,'instructions':'旧方法'}
        self.assertEqual(validate_workspace(w),w)

    def test_invalid_snapshot_or_foreign_reference_rejected(self):
        for key,value in [('schema',True),('request',{'message':{},'sessionId':'pm-test'}),('historyMode','full'),('sources',[]),('method',{'id':'m','name':'方法','version':True,'instructions':'x'})]:
            w=sample();w['projects'][0]['runs'][0]['contextSnapshot'][key]=value
            with self.subTest(key=key),self.assertRaises(InvalidWorkspace):validate_workspace(w)
        for key,value in [('id','foreign'),('version',99),('title','伪造'),('mode','real'),('hasContent',False)]:
            w=sample();w['projects'][0]['runs'][0]['contextSnapshot']['sources'][0][key]=value
            with self.subTest(key=key),self.assertRaises(InvalidWorkspace):validate_workspace(w)

    def test_snapshot_is_immutable_but_failure_result_can_be_saved(self):
        with tempfile.TemporaryDirectory() as root:
            store=WorkspaceStore(Path(root)/'pmos.db');w=sample();store.commit(commit(w))
            for change in ('rewrite','remove','delete-run','scope'):
                bad=copy.deepcopy(w);r=bad['projects'][0]['runs'][0]
                if change=='rewrite':r['contextSnapshot']['request']['message']='改写'
                if change=='remove':del r['contextSnapshot']
                if change=='delete-run':bad['projects'][0]['runs']=[]
                if change=='scope':r['stage']=1
                with self.subTest(change=change),self.assertRaises(InvalidWorkspace):store.commit(commit(bad,1))
            w['projects'][0]['runs'][0].update(status='failed',error='测试失败',output='部分输出');store.commit(commit(w,1))
            self.assertEqual(store.read()['workspace'],w)
            restored=copy.deepcopy(w['projects'][0]);restored['id']='copy';w['projects'].append(restored);store.commit(commit(w,2,reason='restore'))
            self.assertEqual(store.read()['workspace'],w)

    def test_old_runs_cannot_be_backfilled_with_newly_invented_snapshot(self):
        with tempfile.TemporaryDirectory() as root:
            store=WorkspaceStore(Path(root)/'pmos.db');w=sample();del w['projects'][0]['runs'][0]['contextSnapshot'];store.commit(commit(w))
            with self.assertRaises(InvalidWorkspace):store.commit(commit(sample(),1))
