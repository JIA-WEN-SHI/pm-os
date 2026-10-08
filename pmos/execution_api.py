import sqlite3
from fastapi import APIRouter, Request
from .workspace_api import local_request, response, failure
from .execution import ExecutionConflict


def create_execution_router(service):
    router = APIRouter()

    async def handle(request, project_id, run_id, action):
        if not local_request(request): return failure('foreign_origin', '不接受外站请求', 403)
        try:
            if action == 'submit': value = await service.submit(project_id, run_id)
            elif action == 'cancel': value = await service.cancel(project_id, run_id)
            else: value = service.get(project_id, run_id)
            if value is None: return failure('execution_missing', '后台尚未接收此任务；未自动重新执行。', 404)
            return response({k: v for k, v in value.items() if k not in ('request','history')})
        except KeyError: return failure('run_missing', '找不到本项目的运行记录', 404)
        except ExecutionConflict as exc: return failure('execution_conflict', str(exc), 409)
        except (OSError, sqlite3.Error, ValueError): return failure('execution_unavailable', '暂时无法确认后台状态，请稍后查询，勿重复创建任务。', 503)

    @router.post('/pm/projects/{project_id}/runs/{run_id}/execution')
    async def submit(request: Request, project_id: str, run_id: str):
        return await handle(request, project_id, run_id, 'submit')

    @router.get('/pm/projects/{project_id}/runs/{run_id}/execution')
    async def get(request: Request, project_id: str, run_id: str):
        return await handle(request, project_id, run_id, 'get')

    @router.post('/pm/projects/{project_id}/runs/{run_id}/execution/cancel')
    async def cancel(request: Request, project_id: str, run_id: str):
        return await handle(request, project_id, run_id, 'cancel')

    return router
