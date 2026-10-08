import copy
import json
import tempfile
import unittest
import asyncio
from pathlib import Path
from pmos.hermes_web import validate_public_url, parse_hermes_result, child_environment
from pmos.workspace_schema import validate_workspace, InvalidWorkspace
from test_context_snapshot import sample
from test_workspace_store import commit
from pmos.workspace_store import WorkspaceStore
from pmos.execution import ExecutionStore,ExecutionService
from pmos.hermes_web import hermes_workflow_runner


class HermesWebTests(unittest.TestCase):
    def test_reject_private_credentials_and_non_web_urls(self):
        for url in ['file:///C:/secret','http://localhost:3000','http://127.0.0.1','http://[::1]','http://192.168.1.1','http://169.254.169.254','https://user:pass@example.com','https://example.com/?api_key=secret','https://example.com:7777','https://localhost.','https://example.com/\nsecret']:
            with self.subTest(url=url),self.assertRaises(ValueError): validate_public_url(url)
        self.assertEqual(validate_public_url('https://example.com/'), 'https://example.com/')

    def test_result_requires_actual_nonempty_page_without_error(self):
        for value in [{'success':False,'error':'private details'}, {'results':[]}, {'results':[{'content':'','error':None}]}, {'results':[{'content':'error text','error':'blocked'}]}]:
            with self.assertRaises(ValueError): parse_hermes_result(value,'https://example.com/')
        r=parse_hermes_result({'results':[{'url':'https://example.com/','title':'Example','content':'正文','error':None}]},'https://example.com/')
        self.assertEqual(r['content'],'正文'); self.assertEqual(r['url'],'https://example.com/')

    def test_worker_env_isolated_and_does_not_inherit_model_secrets(self):
        env=child_environment(Path('C:/isolated'),{'SystemRoot':'C:/Windows','OPENAI_API_KEY':'secret','HERMES_HOME':'C:/personal','PATH':'C:/bin','HTTP_PROXY':'http://private'})
        self.assertNotIn('OPENAI_API_KEY',env);self.assertNotIn('HTTP_PROXY',env)
        self.assertEqual(env['HERMES_HOME'],'C:\\isolated')

    def test_truncated_result_is_explicit_and_does_not_export_worker_paths(self):
        result=parse_hermes_result({'results':[{'content':'head\n[TRUNCATED]\nFull text saved to: C:/private/cache\nTo read the omitted middle: read_file path=secret','error':None}]},'https://example.com/')
        self.assertTrue(result['truncated']);self.assertIn('截断',result['content'])
        self.assertNotIn('C:/private',result['content']);self.assertNotIn('read_file',result['content'])

    def test_web_read_contract_binds_exact_source_version_and_url(self):
        w=sample();p=w['projects'][0];s=p['sources'][0]
        s['kind']='link';s['url']='https://example.com/'
        r=p['runs'][0];r['contextSnapshot']['request']['webRead']={'sourceId':'s','sourceVersion':1,'url':s['url']}
        self.assertEqual(validate_workspace(w),w)
        for field,value in [('sourceId','foreign'),('sourceVersion',99),('url','https://other.example/')]:
            bad=copy.deepcopy(w);bad['projects'][0]['runs'][0]['contextSnapshot']['request']['webRead'][field]=value
            with self.subTest(field=field),self.assertRaises(InvalidWorkspace):validate_workspace(bad)


class HermesWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_agno_workflow_dispatches_single_tool_and_captures_result(self):
        with tempfile.TemporaryDirectory() as root:
            store=WorkspaceStore(Path(root)/'pmos.db');w=sample();p=w['projects'][0]
            p['sources'][0].update(kind='link',url='https://example.com/')
            r=p['runs'][0];r['executionMode']='background'
            r['contextSnapshot']['request'].update(sessionId='pm-p1-r',webRead={'sourceId':'s','sourceVersion':1,'url':'https://example.com/'})
            store.commit(commit(w))
            calls=[]
            class Adapter:
                async def read(self,url,attempt):
                    calls.append(url);return {'content':'模拟网页原文','title':'示例','url':url,'truncated':False}
            from agno.db.sqlite import SqliteDb
            db=SqliteDb(db_file=str(Path(root)/'agentos.db'))
            service=ExecutionService(ExecutionStore(store),hermes_workflow_runner(Adapter(),db))
            await service.submit('p1','r');await service.wait('p1','r')
            result=service.get('p1','r')
            self.assertEqual(result['status'],'success');self.assertEqual(result['output'],'模拟网页原文')
            self.assertEqual(calls,['https://example.com/'])
            self.assertEqual(result['executor'],'agno-hermes-web')
            self.assertTrue(any(e.get('tool')=='web_extract' for e in result['events']))
            session=db.get_session(session_id='pm-p1-r')
            self.assertEqual(session.runs[-1].status,'COMPLETED')
            db.close()

    async def test_workflow_failure_never_becomes_success(self):
        async def fail(url,attempt):raise ValueError('tool failure')
        await self.check_terminal(fail,'failed')

    async def test_workflow_timeout_stops_the_waiting_tool(self):
        stopped=asyncio.Event()
        async def wait(url,attempt):
            try:await asyncio.sleep(10)
            finally:stopped.set()
        await self.check_terminal(wait,'timed_out',timeout=.1)
        self.assertTrue(stopped.is_set())

    async def check_terminal(self,read,status,timeout=10):
        with tempfile.TemporaryDirectory() as root:
            store=WorkspaceStore(Path(root)/'pmos.db');w=sample();p=w['projects'][0]
            p['sources'][0].update(kind='link',url='https://example.com/')
            r=p['runs'][0];r['executionMode']='background'
            r['contextSnapshot']['request'].update(sessionId='pm-p1-r',webRead={'sourceId':'s','sourceVersion':1,'url':'https://example.com/'})
            store.commit(commit(w))
            class Adapter: pass
            adapter=Adapter();adapter.read=read
            service=ExecutionService(ExecutionStore(store),hermes_workflow_runner(adapter),timeout=timeout)
            await service.submit('p1','r');await service.wait('p1','r')
            self.assertEqual(service.get('p1','r')['status'],status)
            self.assertEqual(store.read()['workspace']['projects'][0]['sources'][0]['content'],p['sources'][0]['content'])
