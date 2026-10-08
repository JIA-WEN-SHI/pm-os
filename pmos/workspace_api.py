import json
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .workspace_backup import preserve_legacy, snapshot_sqlite
from .workspace_schema import InvalidWorkspace, validate_commit
from .workspace_store import WorkspaceStore, RevisionConflict, OperationMismatch

MAX_BODY_BYTES = 32 * 1024 * 1024
LOOPBACK = {'localhost', '127.0.0.1', '::1'}


def local_request(request):
    host = urlparse('http://' + request.headers.get('host', ''))
    if host.hostname not in LOOPBACK:
        return False
    origin = request.headers.get('origin')
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme not in ('http', 'https') or parsed.hostname not in LOOPBACK:
            return False
        # AgentOS accepts the local UI as well as its own Swagger page.
        if parsed.port not in (3000, host.port):
            return False
    return True


def response(body, status=200):
    return JSONResponse(body, status_code=status, headers={'Cache-Control': 'no-store'})


def failure(code, message, status, **extra):
    return response({'code': code, 'message': message, **extra}, status)


def create_workspace_router(store: WorkspaceStore, backup_root: Path, project_files=None) -> APIRouter:
    router = APIRouter()

    def backup_initial(request):
        folder = backup_root / request['operationId']
        folder.mkdir(parents=True, exist_ok=True)
        manifest = preserve_legacy(request['legacyRaw'], request['operationId'], backup_root) if request['reason'] == 'legacy_import' else {}
        source = store.path.parent / 'agentos.db'
        if source.exists():
            snapshot_sqlite(source.resolve(), folder / 'agentos.db')
            manifest['agentos'] = 'snapshot'
        else:
            manifest['agentos'] = 'absent'
        (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        return manifest

    @router.get('/pm/workspace')
    async def read_workspace(request: Request):
        try:
            if not local_request(request):
                return failure('foreign_origin', '不接受外站请求', 403)
            value = await run_in_threadpool(store.read)
            return response(value) if value else failure('workspace_missing', '尚未创建服务端工作区', 404)
        except (OSError, sqlite3.Error, ValueError, RecursionError):
            return failure('storage_unavailable', '无法读取本机资料，请检查后端服务和磁盘', 503)

    @router.put('/pm/workspace')
    async def put_workspace(request: Request):
        try:
            if not local_request(request):
                return failure('foreign_origin', '不接受外站请求', 403)
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > MAX_BODY_BYTES:
                    return failure('payload_too_large', '保存内容超过 32 MiB，请减少单次内容', 413)
            try:
                value = validate_commit(json.loads(body))
            except (ValueError, TypeError, RecursionError):
                return failure('invalid_workspace', '工作区格式无效，原资料未被替换', 422)
            result = await run_in_threadpool(store.commit, value, backup_initial)
            if project_files is not None:
                # The DB commit is durable even when its optional file projection fails.
                try: await run_in_threadpool(project_files.sync, store)
                except (OSError, sqlite3.Error, ValueError): pass
            return response(result)
        except RevisionConflict as exc:
            return failure('revision_conflict', str(exc), 409, currentRevision=exc.current_revision)
        except OperationMismatch as exc:
            return failure('operation_mismatch', str(exc), 409)
        except InvalidWorkspace:
            return failure('invalid_workspace', '工作区格式无效，原资料未被替换', 422)
        except (OSError, sqlite3.Error, ValueError, RecursionError):
            return failure('storage_unavailable', '保存未确认，请保留内容并重试；不要重复新建任务', 503)

    if project_files is not None:
        async def files_action(request, project_id, sync=False):
            if not local_request(request):return failure('foreign_origin','不接受外站请求',403)
            try:
                await run_in_threadpool(project_files.status,store,project_id)
                if sync:await run_in_threadpool(project_files.sync,store,project_id)
                return response(await run_in_threadpool(project_files.status,store,project_id))
            except KeyError:return failure('project_missing','找不到项目',404)
            except (OSError,sqlite3.Error,ValueError):return failure('files_unavailable','无法确认本地文件状态',503)

        @router.get('/pm/projects/{project_id}/files')
        async def files_status(request: Request,project_id: str):
            return await files_action(request,project_id)

        @router.post('/pm/projects/{project_id}/files/sync')
        async def files_sync(request: Request,project_id: str):
            return await files_action(request,project_id,True)

    return router
