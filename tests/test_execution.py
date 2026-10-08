import asyncio
import copy
import tempfile
import sqlite3
import unittest
from pathlib import Path
from pmos.workspace_store import WorkspaceStore
from test_context_snapshot import sample
from test_workspace_store import commit
from pmos.execution import ExecutionService, ExecutionStore, ExecutionConflict


class ExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.ws = WorkspaceStore(Path(self.temp.name) / 'pmos.db')
        w = sample(); w['projects'][0]['runs'][0]['executionMode'] = 'background'
        w['projects'][0]['runs'][0]['contextSnapshot']['request']['sessionId'] = 'pm-p1'
        self.ws.commit(commit(w))
        self.store = ExecutionStore(self.ws)
        self.started = asyncio.Event(); self.release = asyncio.Event(); self.stopped = asyncio.Event()
        self.calls = []

    async def runner(self, request, attempt):
        self.calls.append((request, attempt)); self.started.set()
        try:
            yield {'event': 'RunStarted', 'run_id': attempt}
            yield {'event': 'RunContent', 'content': '部分'}
            await self.release.wait()
            yield {'event': 'RunCompleted', 'content': '完整结果'}
        finally:
            self.stopped.set()

    async def test_duplicate_submit_uses_saved_input_and_survives_page_absence(self):
        service = ExecutionService(self.store, self.runner)
        first = await service.submit('p1', 'r')
        await self.started.wait()
        second = await service.submit('p1', 'r')
        self.assertEqual(first['attemptId'], second['attemptId'])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][0], self.ws.read()['workspace']['projects'][0]['runs'][0]['contextSnapshot']['request'])
        self.release.set(); await service.wait('p1', 'r')
        result = ExecutionStore(self.ws).get('p1', 'r')
        self.assertEqual(result['status'], 'success'); self.assertEqual(result['output'], '完整结果')
        self.assertEqual(result['events'][-1]['event'], 'RunCompleted')
        self.assertEqual((await service.submit('p1', 'r'))['attemptId'], first['attemptId'])

    async def test_cancellation_acknowledged_only_after_worker_exits(self):
        service = ExecutionService(self.store, self.runner)
        await service.submit('p1', 'r'); await self.started.wait()
        await service.cancel('p1', 'r'); await service.wait('p1', 'r')
        self.assertTrue(self.stopped.is_set())
        result = self.store.get('p1', 'r')
        self.assertEqual(result['status'], 'cancelled'); self.assertEqual(result['output'], '部分')

    async def test_restart_never_replays_incomplete_attempt(self):
        first = self.store.create('p1', 'r')
        self.store.recover_interrupted()
        service = ExecutionService(self.store, self.runner)
        again = await service.submit('p1', 'r')
        self.assertEqual(again['status'], 'interrupted'); self.assertEqual(first['attemptId'], again['attemptId'])
        self.assertEqual(self.calls, [])

    async def test_foreign_project_and_restored_copy_do_not_reuse_attempt(self):
        service = ExecutionService(self.store, self.runner)
        with self.assertRaises(KeyError): await service.submit('foreign', 'r')
        self.assertIsNone(self.store.get('foreign', 'r'))
        w = self.ws.read()['workspace']; restored = copy.deepcopy(w['projects'][0]); restored['id'] = 'copy'
        w['projects'].append(restored); self.ws.commit(commit(w, 1, 'restore'))
        # Restored session still names the original project. Never automatically dispatch it.
        with self.assertRaises(ExecutionConflict): await service.submit('copy', 'r')

    async def test_unfinished_stream_is_not_success_and_timeout_stops_worker(self):
        async def broken(request, attempt):
            yield {'event': 'RunContent', 'content': '片段'}
        service = ExecutionService(self.store, broken)
        await service.submit('p1', 'r'); await service.wait('p1', 'r')
        self.assertEqual(self.store.get('p1', 'r')['status'], 'failed')

    async def test_timeout_preserves_partial_output(self):
        service = ExecutionService(self.store, self.runner, timeout=.03)
        await service.submit('p1', 'r'); await service.wait('p1', 'r')
        result = self.store.get('p1', 'r')
        self.assertEqual(result['status'], 'timed_out'); self.assertTrue(self.stopped.is_set())
        self.assertEqual(result['output'], '部分')

    async def test_cancel_before_dispatch_blocks_late_submit(self):
        service = ExecutionService(self.store, self.runner)
        cancelled = await service.cancel('p1', 'r')
        self.assertEqual(cancelled['status'], 'cancelled')
        late = await service.submit('p1', 'r')
        self.assertEqual(late['status'], 'cancelled'); self.assertEqual(self.calls, [])

    async def test_terminal_event_is_drained_and_cancelled_completion_is_not_success(self):
        async def cancelled(request, attempt):
            try:
                yield {'event': 'RunCancelled'}
                yield {'event': 'RunCompleted', 'content': '片段'}
            finally: self.stopped.set()
        service = ExecutionService(self.store, cancelled)
        await service.submit('p1', 'r'); await service.wait('p1', 'r')
        self.assertEqual(self.store.get('p1', 'r')['status'], 'cancelled')
        self.assertTrue(self.stopped.is_set())

    async def test_final_write_failure_can_be_retrieved_without_rerunning(self):
        service = ExecutionService(self.store, self.runner)
        original = self.store.update
        fail_final = True
        def failing(p, r, **changes):
            if changes.get('status') == 'success' and fail_final:
                raise sqlite3.OperationalError('disk temporarily locked')
            return original(p, r, **changes)
        self.store.update = failing
        await service.submit('p1', 'r'); self.release.set()
        try: await service.wait('p1', 'r')
        except sqlite3.OperationalError: pass
        self.assertEqual(self.store.get('p1', 'r')['status'], 'running')
        fail_final = False
        result = service.get('p1', 'r')
        self.assertEqual(result['status'], 'success'); self.assertEqual(result['output'], '完整结果')
        await service.submit('p1', 'r')
        self.assertEqual(len(self.calls), 1)

    async def test_agno_adapter_uses_actual_runtime_and_persists_completed_session(self):
        # Actual installed Agno lifecycle + local fake model; no external HTTP or user database.
        from agno.agent import Agent
        from agno.models.openai import OpenAIChat
        from agno.models.response import ModelResponse
        from agno.db.sqlite import SqliteDb
        from pmos.execution import agno_runner
        class LocalModel(OpenAIChat):
            async def ainvoke_stream(self, *args, **kwargs):
                yield ModelResponse(content='模拟 Agno 完整结果')
        db = SqliteDb(db_file=str(Path(self.temp.name) / 'agentos.db'))
        self.addCleanup(db.db_engine.dispose)
        agent = Agent(id='qa-agent', model=LocalModel(id='mock', api_key='unused'), db=db, telemetry=False)
        service = ExecutionService(self.store, agno_runner(agent))
        await service.submit('p1', 'r'); await service.wait('p1', 'r')
        result = service.get('p1', 'r')
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['output'], '模拟 Agno 完整结果')
        session = db.get_session(session_id='pm-p1')
        self.assertEqual(session.runs[-1].status, 'COMPLETED')

    async def test_api_project_boundaries_and_errors_do_not_expose_request(self):
        from fastapi import FastAPI
        import httpx
        from pmos.execution_api import create_execution_router
        service = ExecutionService(self.store, self.runner)
        app = FastAPI(); app.include_router(create_execution_router(service))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:7777') as client:
            path='/pm/projects/p1/runs/r/execution'
            self.assertEqual((await client.get(path)).status_code,404)
            self.assertEqual((await client.post(path,headers={'Origin':'https://evil.example'})).status_code,403)
            self.assertEqual((await client.post('/pm/projects/foreign/runs/r/execution')).status_code,404)
            result=await client.post(path)
            self.assertEqual(result.status_code,200); self.assertNotIn('request',result.json())
            again=await client.post(path)
            self.assertEqual(result.json()['attemptId'],again.json()['attemptId'])
            await service.cancel('p1','r')
