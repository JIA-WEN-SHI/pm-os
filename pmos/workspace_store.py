import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .workspace_schema import validate_commit, validate_workspace, validate_content_transition


class RevisionConflict(ValueError):
    def __init__(self, current_revision):
        self.current_revision = current_revision
        super().__init__('其他窗口已更新数据，请保留草稿后重新加载')


class OperationMismatch(ValueError):
    pass


def serialized(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


class WorkspaceStore:
    def __init__(self, db_path: Path):
        self.path = db_path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self.connect()) as db, db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS workspace_revisions (
                    revision INTEGER PRIMARY KEY, payload_json TEXT NOT NULL,
                    payload_hash TEXT NOT NULL, created_at TEXT NOT NULL, reason TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS workspace_operations (
                    operation_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
                    revision INTEGER NOT NULL REFERENCES workspace_revisions(revision));
                CREATE TABLE IF NOT EXISTS workspace_imports (
                    operation_id TEXT PRIMARY KEY REFERENCES workspace_operations(operation_id),
                    raw_path TEXT NOT NULL, raw_hash TEXT NOT NULL, manifest_json TEXT NOT NULL);
            ''')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA busy_timeout=5000')
        return db

    @staticmethod
    def envelope(row):
        if row is None:
            return None
        if digest(row['payload_json']) != row['payload_hash']:
            raise ValueError('stored snapshot checksum mismatch')
        return {'revision': row['revision'], 'updatedAt': row['created_at'],
                'workspace': validate_workspace(json.loads(row['payload_json']))}

    def read(self):
        with closing(self.connect()) as db:
            return self.envelope(db.execute('SELECT * FROM workspace_revisions ORDER BY revision DESC LIMIT 1').fetchone())

    def commit(self, commit: dict, before_initialize=None):
        validate_commit(commit)
        request_hash = digest(serialized(commit))
        with closing(self.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM workspace_operations WHERE operation_id=?', (commit['operationId'],)).fetchone()
            if prior:
                if prior['request_hash'] != request_hash:
                    raise OperationMismatch('提交标识已被用于不同内容')
                return self.envelope(db.execute('SELECT * FROM workspace_revisions WHERE revision=?', (prior['revision'],)).fetchone())
            current = db.execute('SELECT COALESCE(MAX(revision),0) FROM workspace_revisions').fetchone()[0]
            initializing = commit['reason'] in ('initialize', 'legacy_import')
            if current != commit['baseRevision'] or initializing != (current == 0):
                raise RevisionConflict(current)
            if current:
                previous = self.envelope(db.execute('SELECT * FROM workspace_revisions WHERE revision=?', (current,)).fetchone())
                validate_content_transition(previous['workspace'], commit['workspace'])
            manifest = before_initialize(commit) if initializing and before_initialize else None
            payload = serialized(commit['workspace'])
            revision = current + 1
            at = datetime.now(timezone.utc).isoformat()
            db.execute('INSERT INTO workspace_revisions VALUES (?,?,?,?,?)', (revision, payload, digest(payload), at, commit['reason']))
            db.execute('INSERT INTO workspace_operations VALUES (?,?,?)', (commit['operationId'], request_hash, revision))
            if manifest:
                db.execute('INSERT INTO workspace_imports VALUES (?,?,?,?)', (commit['operationId'], manifest.get('raw_path', ''), manifest.get('raw_hash', ''), serialized(manifest)))
            return {'revision': revision, 'updatedAt': at, 'workspace': commit['workspace']}
