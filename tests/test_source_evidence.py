import copy
import tempfile
import unittest
from pathlib import Path
from pmos.workspace_store import WorkspaceStore
from pmos.workspace_schema import InvalidWorkspace, validate_workspace
from test_workspace_store import workspace, commit

def source_workspace():
    w=workspace()
    w['projects'][0]['sources']=[{'id':'s1','title':'材料','kind':'text','at':'old','content':'第一行 😀\r\n第二行'}]
    return w

def upgrade(w):
    w=copy.deepcopy(w)
    s=w['projects'][0]['sources'][0]
    s['versions']=[{'version':1,'title':s['title'],'content':s['content'],'at':s['at'],'mode':'simulation','origin':'legacy_snapshot'}]
    w['projects'][0]['evidence']=[{'id':'e1','sourceId':'s1','sourceVersion':1,'startLine':1,'endLine':1,'quote':'第一行 😀','note':'待核实','mode':'simulation','verification':'unverified','at':'now'}]
    return w

class SourceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=WorkspaceStore(Path(self.tmp.name)/'pmos.db')

    def test_quote_and_scope_validation(self):
        for field,value in [('quote','伪造'),('sourceId','another-project-source'),('sourceVersion',2),('mode','real'),('startLine',True)]:
            with self.subTest(field=field):
                w=upgrade(source_workspace());w['projects'][0]['evidence'][0][field]=value
                with self.assertRaises(InvalidWorkspace):validate_workspace(w)

    def test_legacy_upgrade_and_append_preserve_evidence(self):
        old=source_workspace();self.store.commit(commit(old))
        w=upgrade(old);self.store.commit(commit(w,1))
        s=w['projects'][0]['sources'][0]
        s['versions'].append({**s['versions'][0],'version':2,'content':'新材料','at':'now','origin':'user_saved'})
        s['content']='新材料'
        self.store.commit(commit(w,2))
        self.assertEqual(self.store.read()['workspace']['projects'][0]['evidence'][0]['quote'],'第一行 😀')

    def test_history_and_evidence_cannot_be_removed_or_rewritten(self):
        w=upgrade(source_workspace());self.store.commit(commit(w))
        for change in ('rewrite','delete_versions','delete_evidence','rewrite_evidence','delete_source'):
            next=copy.deepcopy(w);p=next['projects'][0]
            if change=='rewrite':p['sources'][0]['versions'][0]['at']='tampered'
            elif change=='delete_versions':del p['sources'][0]['versions']
            elif change=='delete_evidence':p['evidence']=[]
            elif change=='rewrite_evidence':p['evidence'][0]['note']='replaced'
            elif change=='delete_source':p['sources']=[];p['evidence']=[]
            with self.subTest(change=change),self.assertRaises(InvalidWorkspace):self.store.commit(commit(next,1))

    def test_first_baseline_cannot_fabricate_old_content(self):
        w=source_workspace();self.store.commit(commit(w))
        next=upgrade(w);next['projects'][0]['sources'][0]['versions'][0]['at']='invented'
        with self.assertRaises(InvalidWorkspace):self.store.commit(commit(next,1))
