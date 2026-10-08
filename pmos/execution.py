"""Durable execution journal. Workspace snapshots remain the input authority."""
import asyncio
import json
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timezone
from uuid import uuid4

from .workspace_store import serialized

ACTIVE = ('queued', 'running', 'cancelling')


def now():
    return datetime.now(timezone.utc).isoformat()


class ExecutionConflict(ValueError):
    pass


class ExecutionStore:
    def __init__(self, workspace, chat_executor='agno-assist'):
        self.workspace = workspace
        if chat_executor not in ('agno-assist','hermes-agent'):raise ValueError('Unknown chat executor')
        self.chat_executor = chat_executor
        with closing(workspace.connect()) as db, db:
            db.execute('''CREATE TABLE IF NOT EXISTS pm_executions (
                project_id TEXT NOT NULL, run_id TEXT NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY(project_id, run_id))''')

    def get(self, project_id, run_id):
        with closing(self.workspace.connect()) as db:
            row = db.execute('SELECT payload FROM pm_executions WHERE project_id=? AND run_id=?', (project_id, run_id)).fetchone()
            return json.loads(row[0]) if row else None

    def create(self, project_id, run_id, cancel=False):
        with closing(self.workspace.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            envelope = self.workspace.envelope(db.execute('SELECT * FROM workspace_revisions ORDER BY revision DESC LIMIT 1').fetchone())
            project = next((p for p in (envelope or {}).get('workspace', {}).get('projects', []) if p['id'] == project_id), None)
            run = next((r for r in (project or {}).get('runs', []) if r['id'] == run_id), None)
            if not run:
                raise KeyError('找不到本项目的运行记录')
            existing = db.execute('SELECT payload FROM pm_executions WHERE project_id=? AND run_id=?', (project_id, run_id)).fetchone()
            if existing:
                return json.loads(existing[0])
            request = run.get('contextSnapshot', {}).get('request')
            if (project['archived'] and not cancel) or run['status'] != 'running' or run.get('executionMode') != 'background' or not request:
                raise ExecutionConflict('此记录不允许派发，请从任务或对话创建新运行')
            if not cancel and request['sessionId'] not in (f'pm-{project_id}', f'pm-{project_id}-{run_id}'):
                raise ExecutionConflict('会话不属于当前项目；恢复副本中的旧任务不能自动重跑')
            # Serialize a shared project conversation and prevent competing task runs.
            for row in db.execute('SELECT payload FROM pm_executions WHERE project_id=?', (project_id,)):
                if not cancel and json.loads(row[0])['status'] in ACTIVE:
                    raise ExecutionConflict('项目仍有后台任务，请等待完成或取消后再运行')
            value = dict(projectId=project_id, runId=run_id, attemptId=str(uuid4()),
                         executor='agno-hermes-web' if request.get('webRead') else self.chat_executor,
                         status='queued', output='', error='', at=now(), updatedAt=now(),
                         duration=0, events=[], request=request)
            if value['executor']=='hermes-agent':
                previous=[r for r in project['runs'] if r['id']!=run_id and r['status']=='success'
                          and r.get('contextSnapshot',{}).get('historyMode')=='agent-session'][:4]
                value['history']=[]
                if run['contextSnapshot']['historyMode']=='agent-session':
                    for r in reversed(previous):
                        value['history'].extend([{'role':'user','content':r.get('requestText',r['title'])[:2000]},
                                                 {'role':'assistant','content':r['output'][:8000]}])
            if cancel: value.update(status='cancelled', error='已停止尚未派发的任务，不会重新执行。')
            db.execute('INSERT INTO pm_executions VALUES (?,?,?)', (project_id, run_id, serialized(value)))
            return value

    def update(self, project_id, run_id, **changes):
        with closing(self.workspace.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload FROM pm_executions WHERE project_id=? AND run_id=?', (project_id, run_id)).fetchone()
            if not row:
                raise KeyError(run_id)
            value = json.loads(row[0]); value.update(changes, updatedAt=now())
            db.execute('UPDATE pm_executions SET payload=? WHERE project_id=? AND run_id=?', (serialized(value), project_id, run_id))
            return value

    def recover_interrupted(self):
        with closing(self.workspace.connect()) as db, db:
            db.execute('BEGIN IMMEDIATE')
            for row in db.execute('SELECT project_id,run_id,payload FROM pm_executions').fetchall():
                value = json.loads(row[2])
                if value['status'] in ACTIVE:
                    value.update(status='interrupted', error='后端已重启，执行中断；已收到的片段保留，未自动重跑。', updatedAt=now())
                    db.execute('UPDATE pm_executions SET payload=? WHERE project_id=? AND run_id=?', (serialized(value), row[0], row[1]))


class ExecutionService:
    def __init__(self, store, runner, timeout=240, hermes_runner=None):
        self.store, self.runner, self.timeout = store, runner, timeout
        self.hermes_runner = hermes_runner
        self.jobs = {}
        self.pending = {}

    def get(self, project_id, run_id):
        key = (project_id, run_id)
        if key in self.pending:
            self.store.update(*key, **self.pending[key])
            del self.pending[key]
        return self.store.get(*key)

    async def submit(self, project_id, run_id):
        previous = self.get(project_id, run_id)
        value = self.store.create(project_id, run_id)
        key = (project_id, run_id)
        if previous is None and value['status'] == 'queued':
            self.jobs[key] = asyncio.create_task(self._execute(value))
        return value

    async def _execute(self, value):
        p, r = value['projectId'], value['runId']
        started = time.monotonic(); output = ''; events = []; upstream = None
        status = 'failed'; error = '连接结束但未收到完整结果，片段不作为报告。'
        terminal_error = False
        stream = None
        try:
            self.store.update(p, r, status='running')
            async with asyncio.timeout(self.timeout):
                if value['executor']=='hermes-agent':
                    if self.hermes_runner is None:raise ValueError('Hermes runner unavailable')
                    stream=self.hermes_runner(value['request'],value['attemptId'],p,value.get('history',[]))
                else:stream = self.runner(value['request'], value['attemptId'])
                async for event in stream:
                    name = str(event.get('event', 'Unknown'))[:80]
                    if event.get('run_id'): upstream = str(event['run_id'])
                    # Real lifecycle/tool event names, not fabricated progress. No provider diagnostics/credentials.
                    if name != 'RunContent' and len(events) < 200:
                        events.append({'event': name, 'at': now(), **({'tool':event['tool']} if event.get('tool') in ('web_extract','web_search') else {})})
                    content = event.get('content')
                    if name in ('RunContent', 'RunResponse') and isinstance(content, str): output += content
                    if name in ('RunCompleted','WorkflowCompleted') and not terminal_error:
                        if isinstance(content, str): output = content
                        if output.strip(): status, error = 'success', ''
                    if name in ('RunError', 'RunCancelled', 'RunCanceled', 'WorkflowError', 'WorkflowCancelled', 'StepError'):
                        terminal_error = True
                        status = 'cancelled' if name in ('RunCancelled','RunCanceled','WorkflowCancelled') else 'failed'
                        error = '执行已取消。' if status == 'cancelled' else 'Agno 运行失败，请检查模型配置后创建新尝试。'
                        if status=='failed' and value['request'].get('webRead'):
                            error='网页读取失败：Hermes 安装、网页或匿名读取服务暂不可用。原正文未被修改，可检查公开链接后重试。'
                    if len(output) > 2_000_000: raise ValueError('output limit')
                    self.store.update(p, r, output=output, events=events, upstreamId=upstream)
        except asyncio.CancelledError:
            status, error = 'cancelled', '本机执行已停止；远端模型的生成和计费是否停止无法确认。'
            if value['request'].get('webRead'): error='网页读取已停止，原资料正文未被修改。'
        except TimeoutError:
            status, error = 'timed_out', '运行超过时间限制，本机执行已停止；已接收片段保留。'
        except Exception:
            status, error = 'failed', '后台执行失败，已接收内容保留；请检查服务和模型配置。'
            if value['executor']=='hermes-agent':error='Hermes 未完成本次运行，请检查安装、模型或网页服务；未切换其他助手代答。'
            if value['request'].get('webRead'): error='网页读取未完成，请检查 Hermes 安装及公开链接；原资料正文未被修改。'
        finally:
            try:
                if stream is not None:
                    try: await stream.aclose()
                    except Exception:
                        status, error = 'failed', '执行器退出未正常确认，结果保留供检查。'
                self.pending[(p, r)] = dict(status=status, error=error, output=output[:2_000_000], events=events,
                                           upstreamId=upstream, duration=round((time.monotonic()-started)*1000))
                try: self.get(p, r)
                except (OSError, ValueError, sqlite3.Error):
                    pass  # Kept in memory; subsequent GET retries persistence, never model execution.
            finally:
                self.jobs.pop((p, r), None)

    async def cancel(self, project_id, run_id):
        value = self.get(project_id, run_id)
        if value is None: value = self.store.create(project_id, run_id, cancel=True)
        if value['status'] not in ACTIVE: return value
        self.store.update(project_id, run_id, status='cancelling')
        job = self.jobs.get((project_id, run_id))
        if job:
            if not job.cancelling(): job.cancel()
            try: await job
            except asyncio.CancelledError: pass  # cancellation before the coroutine first ran
            self.jobs.pop((project_id, run_id), None)
            current = self.store.get(project_id, run_id)
            if current['status'] == 'cancelling':
                return self.store.update(project_id, run_id, status='cancelled', error='执行已取消，未派发模型请求。')
            return current
        return self.store.update(project_id, run_id, status='interrupted', error='本机执行已不存在，未自动重跑。')

    async def wait(self, project_id, run_id):
        job = self.jobs.get((project_id, run_id))
        if job: await job

    async def close(self):
        for key in list(self.jobs):
            await self.cancel(*key)
        for key in list(self.pending):
            try: self.get(*key)
            except (OSError, ValueError, sqlite3.Error): pass


def agno_runner(agent):
    async def run(request, attempt):
        worker = agent.deep_copy()
        stream = worker.arun(request['message'], session_id=request['sessionId'], run_id=attempt,
                             stream=True, stream_events=True)
        try:
            async for event in stream:
                yield {'event': event.event, 'content': getattr(event, 'content', None), 'run_id': event.run_id}
        finally:
            await stream.aclose()
    return run
