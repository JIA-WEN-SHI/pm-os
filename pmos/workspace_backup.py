import hashlib
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path


def preserve_legacy(raw: str, operation_id: str, backup_root: Path) -> dict:
    folder = backup_root / operation_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / 'legacy-workspace.json'
    payload = raw.encode('utf-8')
    if path.exists():
        if path.read_bytes() != payload:
            raise OSError('migration original differs')
    else:
        with path.open('xb') as out:
            out.write(payload)
            out.flush()
            os.fsync(out.fileno())
    if path.read_bytes() != payload:
        raise OSError('migration original verification failed')
    w = json.loads(raw)
    counts = {key: len(w[key]) for key in ('projects', 'skills', 'knowledge')}
    counts['artifactRevisions'] = sum(len(a['revisions']) for p in w['projects'] for a in p['artifacts'])
    return {'raw_path': str(path), 'raw_hash': hashlib.sha256(payload).hexdigest(), 'counts': counts}


def snapshot_sqlite(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    # A completed snapshot is immutable on a retry; failed .partial files can be overwritten.
    if destination.exists():
        with closing(sqlite3.connect(destination)) as check:
            if check.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise OSError('backup integrity failed')
        return
    partial = destination.with_suffix('.partial')
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as src:
        with closing(sqlite3.connect(partial)) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise OSError('backup integrity failed')
    partial.replace(destination)
