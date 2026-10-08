import copy
import unittest
from test_context_snapshot import sample
from pmos.workspace_schema import validate_workspace, InvalidWorkspace

class DiscoveryContextTests(unittest.TestCase):
    def test_later_stage_requires_matching_explicit_stage_and_upstream_signature(self):
        for stage in range(1,8):
            w=sample();r=w['projects'][0]['runs'][0];r['stage']=stage;r['contextSnapshot']['historyMode']='none'
            r['contextSnapshot']['request']['stagePreparation']={'stage':stage,'upstreamSignature':'[]','baseVersion':0,'projectScope':['a','b','c','d'],'sourceSignature':'[]'}
            self.assertEqual(validate_workspace(w),w)
            for bad_stage in (0,8,True):
                bad=copy.deepcopy(w);bad['projects'][0]['runs'][0]['contextSnapshot']['request']['stagePreparation']['stage']=bad_stage
                with self.assertRaises(InvalidWorkspace):validate_workspace(bad)
    def test_preparation_metadata_roundtrip_and_invalid_shapes(self):
        w=sample();r=w['projects'][0]['runs'][0]
        r['contextSnapshot']['historyMode']='none'
        r['contextSnapshot']['request']['stagePreparation']={'baseVersion':0,'projectScope':['name','goal','audience','outputs'],'sourceSignature':'[]'}
        self.assertEqual(validate_workspace(w),w)
        for mutate in [
            lambda r:r.update(stage=1),
            lambda r:r.update(taskId='task'),
            lambda r:r['contextSnapshot'].update(historyMode='agent-session'),
            lambda r:r['contextSnapshot']['request']['stagePreparation'].update(baseVersion=True),
            lambda r:r['contextSnapshot']['request']['stagePreparation'].update(projectScope=['missing']),
        ]:
            bad=copy.deepcopy(w);mutate(bad['projects'][0]['runs'][0])
            with self.assertRaises(InvalidWorkspace): validate_workspace(bad)
