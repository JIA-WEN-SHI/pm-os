import asyncio
import copy
import json
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch

from pmos.execution import ExecutionService, ExecutionStore
from pmos.workspace_store import WorkspaceStore
from test_context_snapshot import sample
from test_workspace_store import commit
from pmos.hermes_agent import HermesAgentAdapter, final_content, isolated_paths


class HermesAgentTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def workspace(self, with_history=False):
        ws = WorkspaceStore(self.root / 'workspace.db')
        w = sample()
        p = w['projects'][0]
        p['runs'][0]['executionMode'] = 'background'
        p['runs'][0]['contextSnapshot']['request']['sessionId'] = 'pm-p1'
        other = copy.deepcopy(p)
        other['id'] = 'p2'
        other['runs'][0]['contextSnapshot']['request']['sessionId'] = 'pm-p2'
        w['projects'].append(other)
        if with_history:
            for project in w['projects']:
                past=copy.deepcopy(project['runs'][0])
                past.update(id='past',status='success',output='private-'+project['id'],requestText='question-'+project['id'])
                project['runs'].append(past)
        ws.commit(commit(w))
        return ws

    async def test_routes_real_project_to_hermes_and_freezes_executor(self):
        ws = self.workspace()
        store = ExecutionStore(ws, chat_executor='hermes-agent')
        calls = []
        async def hermes(request, attempt, project_id, history):
            calls.append((project_id, request['sessionId'], history))
            yield {'event': 'RunCompleted', 'content': 'Hermes reply'}
        async def wrong(request, attempt):
            raise AssertionError('must not call Agno text runner')
            yield
        service = ExecutionService(store, wrong, hermes_runner=hermes)
        first = await service.submit('p1', 'r')
        await service.wait('p1', 'r')
        await service.submit('p2', 'r')
        await service.wait('p2', 'r')
        self.assertEqual(first['executor'], 'hermes-agent')
        self.assertEqual(calls, [('p1', 'pm-p1', []), ('p2', 'pm-p2', [])])
        self.assertEqual(store.get('p1','r')['status'],'success')
        store.chat_executor = 'agno-assist'
        self.assertEqual((await service.submit('p1','r'))['executor'], 'hermes-agent')
        self.assertEqual(len(calls), 2)

    def test_paths_reject_foreign_sessions_and_traversal(self):
        a = isolated_paths(self.root,'p1','00000000-0000-0000-0000-000000000001','pm-p1')
        b = isolated_paths(self.root,'p2','00000000-0000-0000-0000-000000000001','pm-p2')
        self.assertNotEqual(a,b)
        for project, session in [('../escape','pm-p1'),('p1','pm-p2'),('p1','pm-p1-other')]:
            with self.assertRaises(ValueError):
                isolated_paths(self.root,project,'00000000-0000-0000-0000-000000000001',session)

    def test_only_clean_final_result_is_success(self):
        self.assertEqual(final_content({'completed':True,'final_response':'ok'}),'ok')
        for bad in [{'completed':False,'final_response':'partial'}, {'completed':True,'failed':True,'final_response':'secret error'}, {'completed':True,'interrupted':True,'final_response':'partial'}, {'completed':True,'final_response':''}]:
            with self.assertRaises(ValueError):final_content(bad)

    def test_stage_output_requires_a_valid_json_object(self):
        valid = '{"plan":"first\\nsecond","summary":"ready"}'
        self.assertEqual(final_content({'completed':True,'final_response':valid}, structured=True),valid)
        for invalid in ['{"plan":"first\nsecond"}', '{"plan":', '[]', '{"plan":NaN}', 'not JSON']:
            with self.assertRaises(ValueError):
                final_content({'completed':True,'final_response':invalid}, structured=True)
        # Ordinary conversations and report prose must remain plain text.
        self.assertEqual(final_content({'completed':True,'final_response':'first\nsecond'}),'first\nsecond')

    def test_empty_optional_followup_questions_do_not_block_a_stage(self):
        value={'plan':'first\nsecond','summary':'ready','questions':['What is missing?','','  ']}
        normalized=json.loads(final_content({'completed':True,'final_response':json.dumps(value)},structured=True))
        self.assertEqual(normalized,{**value,'questions':['What is missing?']})

    async def test_missing_install_fails_without_fallback(self):
        adapter=HermesAgentAdapter(self.root/'work', self.root/'missing')
        with self.assertRaises(ValueError):
            async for _ in adapter.run({'sessionId':'pm-p1','message':'hello'},'00000000-0000-0000-0000-000000000001','p1',[]):pass

    async def test_cancellation_reaches_hermes_worker(self):
        store=ExecutionStore(self.workspace(), chat_executor='hermes-agent')
        started=asyncio.Event();stopped=asyncio.Event()
        async def hermes(request,attempt,project_id,history):
            try:
                started.set()
                yield {'event':'RunStarted'}
                await asyncio.Event().wait()
            finally:stopped.set()
        service=ExecutionService(store,None,hermes_runner=hermes)
        await service.submit('p1','r');await started.wait()
        await service.cancel('p1','r')
        self.assertTrue(stopped.is_set())
        self.assertEqual(store.get('p1','r')['status'],'cancelled')

    async def test_closing_adapter_terminates_the_real_child_process(self):
        # Real process/pipe/job lifecycle; fake SDK avoids a charged model call.
        sdk=self.root/'sdk';sdk.mkdir()
        (sdk/'run_agent.py').write_text(
            'import time\nclass AIAgent:\n'
            ' def __init__(self, **kw): self.tools=[]\n'
            ' def run_conversation(self, *a, **kw): time.sleep(30)\n',encoding='utf-8')
        adapter=HermesAgentAdapter(self.root/'workers',sdk)
        adapter.python=Path(sys.executable)
        processes=[]
        spawn=asyncio.create_subprocess_exec
        async def track(*args,**kwargs):
            process=await spawn(*args,**kwargs);processes.append(process);return process
        with patch('pmos.hermes_agent.asyncio.create_subprocess_exec',track):
            stream=adapter.run({'sessionId':'pm-p1','message':'hello'},'00000000-0000-0000-0000-000000000001','p1',[])
            try:
                event=await asyncio.wait_for(anext(stream),10)
                self.assertEqual(event['event'],'RunStarted')
            finally:await asyncio.wait_for(stream.aclose(),10)
        self.assertEqual(len(processes),1)
        self.assertIsNotNone(processes[0].returncode)

    async def test_stage_flag_reaches_sdk_json_mode_over_the_pipe(self):
        sdk=self.root/'sdk';sdk.mkdir()
        (sdk/'run_agent.py').write_text(
            'class AIAgent:\n'
            ' def __init__(self, **kw):\n'
            '  assert kw["request_overrides"] == {"response_format":{"type":"json_object"}}\n'
            '  assert kw["max_tokens"] == 32768\n'
            '  self.tools=[]\n'
            ' def run_conversation(self, *a, **kw):\n'
            '  return {"completed":True,"final_response":\'{"summary":"ready"}\'}\n',encoding='utf-8')
        adapter=HermesAgentAdapter(self.root/'workers',sdk)
        adapter.python=Path(sys.executable)
        events=[e async for e in adapter.run(
            {'sessionId':'pm-p1','message':'JSON please','stagePreparation':{'stage':0}},
            '00000000-0000-0000-0000-000000000001','p1',[])]
        self.assertEqual(events[-1]['event'],'RunCompleted')
        self.assertEqual(events[-1]['content'],'{"summary":"ready"}')

    def test_history_is_only_from_same_project_and_not_returned_as_other_project(self):
        store=ExecutionStore(self.workspace(with_history=True),chat_executor='hermes-agent')
        a=store.create('p1','r');b=store.create('p2','r')
        self.assertEqual(a['history'],[{'role':'user','content':'question-p1'},{'role':'assistant','content':'private-p1'}])
        self.assertEqual(b['history'],[{'role':'user','content':'question-p2'},{'role':'assistant','content':'private-p2'}])
