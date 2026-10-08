import copy
import tempfile
import unittest
from pathlib import Path
from pmos.workspace_schema import validate_workspace, InvalidWorkspace
from pmos.workspace_store import WorkspaceStore
from test_workspace_store import workspace, commit

def sample():
    w=workspace();p=w['projects'][0]
    p['artifacts'][0]['revisions']=[{'version':1,'at':'old','content':'# 报告\r\n## 问题\r\n原文 😀\r\n## 结论\r\n保留','approvedAt':'old'}]
    p['stageWork']={}
    p['reportProposals']=[{'id':'patch','selection':{'artifactId':'a1','version':1,'blockId':'section-2','title':'问题','startLine':2,'endLine':3,'quote':'## 问题\r\n原文 😀\r\n'},'request':'更清楚','replacement':'## 问题\r\n改写\r\n','runId':'run','sourceRefs':[],'at':'now','status':'pending'}]
    return w

def accept(w):
    w=copy.deepcopy(w);p=w['projects'][0];p['reportProposals'][0].update(status='accepted',appliedVersion=2)
    p['artifacts'][0]['status']='draft'
    p['artifacts'][0]['revisions'].append({'version':2,'at':'now','content':'# 报告\r\n## 问题\r\n改写\r\n## 结论\r\n保留'})
    return w

class ReportSectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.store=WorkspaceStore(Path(self.tmp.name)/'pmos.db')

    def test_invalid_selection_or_accepted_content_rejected(self):
        for key,value in [('quote','伪造'),('artifactId','foreign'),('version',True),('startLine',0)]:
            w=sample();w['projects'][0]['reportProposals'][0]['selection'][key]=value
            with self.subTest(key=key),self.assertRaises(InvalidWorkspace):validate_workspace(w)
        w=accept(sample());w['projects'][0]['artifacts'][0]['revisions'][1]['content']='整篇覆盖'
        with self.assertRaises(InvalidWorkspace):validate_workspace(w)

    def test_accept_keeps_old_revision_and_refuses_rewrite_or_revert(self):
        w=sample();self.store.commit(commit(w));next=accept(w);self.store.commit(commit(next,1))
        for change in ('history','proposal','revert','delete'):
            bad=copy.deepcopy(next);p=bad['projects'][0]
            if change=='history':p['artifacts'][0]['revisions'][0]['at']='tampered'
            if change=='proposal':p['reportProposals'][0]['request']='rewritten'
            if change=='revert':p['reportProposals'][0]['status']='pending';del p['reportProposals'][0]['appliedVersion']
            if change=='delete':p['reportProposals']=[]
            with self.subTest(change=change),self.assertRaises(InvalidWorkspace):self.store.commit(commit(bad,self.store.read()['revision']))

    def test_stale_pending_proposal_cannot_claim_previous_manual_revision(self):
        w=sample();self.store.commit(commit(w));changed=accept(w);changed['projects'][0]['reportProposals']=copy.deepcopy(w['projects'][0]['reportProposals']);self.store.commit(commit(changed,1))
        with self.assertRaises(InvalidWorkspace):self.store.commit(commit(accept(w),2))

    def test_legacy_workspace_and_restore_copy_still_supported(self):
        self.store.commit(commit(workspace()));w=workspace();restored=accept(sample())['projects'][0];restored['id']='restored';w['projects'].append(restored);self.store.commit(commit(w,1))
        self.assertEqual(len(self.store.read()['workspace']['projects']),2)

    def test_expanded_chapter_and_missing_separator_are_rejected(self):
        w=sample();x=w['projects'][0]['reportProposals'][0];x['selection'].update(endLine=5,quote='## 问题\r\n原文 😀\r\n## 结论\r\n保留')
        with self.assertRaises(InvalidWorkspace):validate_workspace(w)
        w=sample();w['projects'][0]['reportProposals'][0]['replacement']='无换行'
        with self.assertRaises(InvalidWorkspace):validate_workspace(w)
