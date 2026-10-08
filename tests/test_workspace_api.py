import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pmos.workspace_api import create_workspace_router
from pmos.workspace_store import WorkspaceStore
from test_workspace_store import workspace, commit


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = WorkspaceStore(self.root / 'pmos.db')
        app = FastAPI()
        app.include_router(create_workspace_router(self.store, self.root / 'backups'))
        self.client = TestClient(app, base_url='http://127.0.0.1:7777')
        self.addCleanup(self.client.close)

    def test_missing_is_distinct_from_unavailable(self):
        self.assertEqual(self.client.get('/pm/workspace').status_code, 404)
        with patch.object(self.store, 'read', side_effect=OSError('private path')):
            r = self.client.get('/pm/workspace')
        self.assertEqual(r.status_code, 503)
        self.assertNotIn('private path', r.text)

    def test_import_preserves_original_and_retries_once(self):
        req = commit(reason='legacy_import')
        req['legacyRaw'] = json.dumps(req['workspace'], ensure_ascii=False, indent=2)
        first = self.client.put('/pm/workspace', json=req)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.client.put('/pm/workspace', json=req).json(), first.json())
        raw = self.root / 'backups' / req['operationId'] / 'legacy-workspace.json'
        self.assertEqual(raw.read_text(encoding='utf-8'), req['legacyRaw'])
        self.assertEqual(self.client.put('/pm/workspace', json=commit()).status_code, 409)
        self.assertEqual(WorkspaceStore(self.root / 'pmos.db').read()['workspace'], workspace())

    def test_invalid_or_failed_backup_never_initializes(self):
        req = commit(reason='legacy_import')
        req['legacyRaw'] = '{}'
        self.assertEqual(self.client.put('/pm/workspace', json=req).status_code, 422)
        req['legacyRaw'] = json.dumps(req['workspace'])
        with patch('pmos.workspace_api.preserve_legacy', side_effect=OSError('disk full')):
            self.assertEqual(self.client.put('/pm/workspace', json=req).status_code, 503)
        self.assertIsNone(self.store.read())

    def test_origin_and_body_limit(self):
        self.assertEqual(self.client.put('/pm/workspace', json=commit(), headers={'origin': 'https://evil.test'}).status_code, 403)
        self.assertEqual(self.client.get('/pm/workspace', headers={'host': 'evil.test'}).status_code, 403)
        with patch('pmos.workspace_api.MAX_BODY_BYTES', 100):
            self.assertEqual(self.client.put('/pm/workspace', content=iter([b' ' * 101])).status_code, 413)

    def test_conflict_and_invalid_data_have_safe_errors(self):
        self.assertEqual(self.client.put('/pm/workspace', json=commit()).status_code, 200)
        self.assertEqual(self.client.put('/pm/workspace', json=commit(base=1)).status_code, 200)
        r = self.client.put('/pm/workspace', json=commit(base=1))
        self.assertEqual((r.status_code, r.json()['code']), (409, 'revision_conflict'))
        req = commit(base=2)
        req['workspace']['projects'][0]['stage'] = True
        self.assertEqual(self.client.put('/pm/workspace', json=req).status_code, 422)

    def test_corrupt_saved_payload_is_not_returned_as_healthy(self):
        self.client.put('/pm/workspace', json=commit())
        with self.store.connect() as db:
            db.execute("UPDATE workspace_revisions SET payload_json='{}'")
        db.close()
        self.assertEqual(self.client.get('/pm/workspace').status_code, 503)
