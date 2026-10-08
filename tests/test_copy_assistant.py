import copy
import unittest
from pmos.workspace_schema import validate_workspace, InvalidWorkspace
from test_report_sections import sample

def text_sample():
    w=sample();p=w['projects'][0];raw='# 文案\r\n开头😀需要润色的描述。结尾。\r\n';p['artifacts'][0]['revisions'][0]['content']=raw
    quote='需要润色的描述';start=raw.index(quote);end=start+len(quote)
    s={'kind':'text','artifactId':'a1','version':1,'blockId':f'text-{start}-{end}','title':'选中文案：'+quote,'startOffset':start,'endOffset':end,'startLine':2,'endLine':2,'quote':quote}
    p['reportProposals'][0].update(selection=s,replacement='清晰文案')
    return w

class CopyAssistantTests(unittest.TestCase):
    def test_unicode_text_acceptance_changes_only_range(self):
        w=text_sample();validate_workspace(w);p=w['projects'][0];p['reportProposals'][0].update(status='accepted',appliedVersion=2);p['artifacts'][0]['revisions'].append({'version':2,'at':'now','content':'# 文案\r\n开头😀清晰文案。结尾。\r\n'});validate_workspace(w)
        p['artifacts'][0]['revisions'][1]['content']='整篇覆盖'
        with self.assertRaises(InvalidWorkspace):validate_workspace(w)

    def test_forged_ranges_modes_quotes_rejected(self):
        for key,value in [('startOffset',True),('endOffset',999),('quote','伪造'),('startLine',1),('kind','other'),('blockId','section-2')]:
            w=text_sample();w['projects'][0]['reportProposals'][0]['selection'][key]=value
            with self.subTest(key=key),self.assertRaises(InvalidWorkspace):validate_workspace(w)
        w=sample();w['projects'][0]['reportProposals'][0]['selection']['startOffset']=0
        with self.assertRaises(InvalidWorkspace):validate_workspace(w)
