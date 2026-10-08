import copy
import sqlite3
import tempfile
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from pmos.workspace_store import WorkspaceStore, RevisionConflict, OperationMismatch
from pmos.workspace_schema import InvalidWorkspace


def workspace():
    return {'schema': 1, 'skills': [], 'knowledge': [], 'projects': [{
        'id': 'p1', 'name': '模拟项目', 'goal': '保存', 'audience': '', 'outputs': '',
        'createdAt': '2026-10-03', 'updatedAt': '2026-10-03', 'skillId': '',
        'demo': True, 'archived': False, 'stage': 0, 'stageStates': ['未开始'] * 8,
        'stageNotes': {}, 'sources': [], 'tasks': [], 'runs': [], 'messages': [],
        'decisions': [], 'artifacts': [{'id': 'a1', 'title': '报告', 'stage': 0,
            'status': 'approved', 'sourceIds': [], 'revisions': [
                {'version': 1, 'content': '初稿', 'at': 'then'},
                {'version': 2, 'content': '确认稿', 'at': 'now', 'approvedAt': 'now'}]}],
        'stageWork': {'0': {'version': 1, 'inputs': ['未知', '待补充', '待补充'], 'sourceIds': [],
            'criteria': [], 'acceptance': {'id': 'review1', 'at': 'now',
            'planSignature': 'historic', 'reportSignature': 'historic',
            'artifactRefs': [{'id': 'a1', 'title': '报告', 'version': 2}], 'checks': []}}}
    }]}


def commit(data=None, base=0, reason=None):
    return {'operationId': str(uuid4()), 'baseRevision': base,
            'workspace': data if data is not None else workspace(),
            'reason': reason or ('initialize' if base == 0 else 'edit')}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'pmos.db'
        self.store = WorkspaceStore(self.path)

    def test_restart_preserves_history_and_stage_acceptance(self):
        original = workspace()
        saved = self.store.commit(commit(original))
        self.assertEqual(WorkspaceStore(self.path).read()['workspace'], original)
        self.assertEqual(saved['revision'], 1)
        changed = copy.deepcopy(original)
        changed['projects'][0]['name'] = '修改名称'
        self.store.commit(commit(changed, 1))
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM workspace_revisions').fetchone()[0], 2)

    def test_stale_commit_is_atomic(self):
        self.store.commit(commit())
        current = self.store.commit(commit(base=1))
        with self.assertRaises(RevisionConflict):
            self.store.commit(commit(base=1))
        self.assertEqual(self.store.read(), current)

    def test_same_operation_is_idempotent_even_after_later_edits(self):
        request = commit()
        first = self.store.commit(request)
        self.store.commit(commit(base=1))
        self.assertEqual(self.store.commit(request), first)
        request['workspace']['projects'][0]['name'] = 'different'
        with self.assertRaises(OperationMismatch):
            self.store.commit(request)

    def test_two_connections_only_one_wins(self):
        self.store.commit(commit())
        def attempt(_):
            try:
                return WorkspaceStore(self.path).commit(commit(base=1))['revision']
            except RevisionConflict:
                return 'conflict'
        with ThreadPoolExecutor(2) as pool:
            self.assertCountEqual(list(pool.map(attempt, range(2))), [2, 'conflict'])

    def test_invalid_data_never_changes_saved_revision(self):
        original = self.store.commit(commit())
        mutations = [
            lambda p: p.update(stage=True),
            lambda p: p['artifacts'][0].update(status='invented'),
            lambda p: p['artifacts'][0]['revisions'][0].update(version=2),
            lambda p: p['artifacts'].append(copy.deepcopy(p['artifacts'][0])),
            lambda p: p['stageWork']['0'].update(inputs=['缺少两项']),
        ]
        for change in mutations:
            data = workspace()
            change(data['projects'][0])
            with self.assertRaises(InvalidWorkspace):
                self.store.commit(commit(data, 1))
            self.assertEqual(self.store.read(), original)

    def test_failed_operation_registration_rolls_back_snapshot(self):
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute("CREATE TRIGGER reject_operation BEFORE INSERT ON workspace_operations BEGIN SELECT RAISE(ABORT, 'test failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.commit(commit())
        self.assertIsNone(self.store.read())


if __name__ == '__main__':
    unittest.main()
