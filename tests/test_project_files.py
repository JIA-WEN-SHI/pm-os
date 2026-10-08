import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pmos.workspace_store import WorkspaceStore
from pmos.workspace_api import create_workspace_router
from pmos.project_files import ProjectFiles, key
from test_workspace_store import workspace, commit


class ProjectFilesTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.store=WorkspaceStore(self.root/'data/pmos.db')
        self.files=ProjectFiles(self.root/'projects')
        app=FastAPI();app.include_router(create_workspace_router(self.store,self.root/'backups',self.files))
        self.client=TestClient(app,base_url='http://127.0.0.1:7777');self.addCleanup(self.client.close)

    def save(self,w=None,base=0):
        response=self.client.put('/pm/workspace',json=commit(w or workspace(),base))
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def status(self):
        response=self.client.get('/pm/projects/p1/files')
        self.assertEqual(response.status_code,200,response.text)
        return response.json()

    def test_new_project_and_edits_are_written_as_markdown(self):
        self.save();s=self.status();folder=Path(s['path'])
        self.assertEqual(s['state'],'synced')
        self.assertIn('模拟项目',(folder/'项目说明.md').read_text(encoding='utf-8'))
        self.assertEqual(len(list((folder/'流程').iterdir())),8)
        self.assertTrue(any('确认稿' in f.read_text(encoding='utf-8') for f in folder.rglob('*.md')))
        changed=workspace();changed['projects'][0]['name']='新名称'
        self.save(changed,1)
        self.assertIn('新名称',(folder/'项目说明.md').read_text(encoding='utf-8'))
        self.assertEqual(self.status()['path'],s['path'])

    def test_external_edits_are_preserved_and_reported(self):
        self.save();f=Path(self.status()['path'])/'项目说明.md';f.write_text('外部手动修改',encoding='utf-8')
        self.assertEqual(self.status()['state'],'conflict')
        changed=workspace();changed['projects'][0]['goal']='网页更新'
        self.save(changed,1)
        self.assertEqual(f.read_text(encoding='utf-8'),'外部手动修改')
        self.assertEqual(self.status()['state'],'conflict')
        # Restoring the expected previous export allows retry; DB remains authoritative.
        f.unlink()
        response=self.client.post('/pm/projects/p1/files/sync')
        self.assertEqual(response.json()['state'],'synced')
        self.assertIn('网页更新',f.read_text(encoding='utf-8'))

    def test_file_failure_does_not_undo_database_commit_and_retry_recovers(self):
        with patch.object(self.files,'_write',side_effect=OSError('disk full')):
            self.save()
        self.assertEqual(self.store.read()['revision'],1)
        self.assertNotEqual(self.status()['state'],'synced')
        self.assertEqual(self.client.post('/pm/projects/p1/files/sync').json()['state'],'synced')

    def test_backfill_and_old_snapshot_are_preserved(self):
        old=self.root/'projects/p1/README.md';old.parent.mkdir(parents=True);old.write_text('old snapshot')
        self.store.commit(commit());self.files.sync(self.store)
        self.assertEqual(old.read_text(),'old snapshot')
        self.assertEqual(self.status()['state'],'synced')
        self.assertTrue(Path(self.status()['path']).is_dir())

    def test_symlink_escape_is_refused(self):
        if not hasattr(Path,'symlink_to'):self.skipTest('symlink unsupported')
        outside=self.root/'outside';outside.mkdir()
        self.root.joinpath('projects').mkdir()
        try:self.root.joinpath('projects/p1').symlink_to(outside,target_is_directory=True)
        except OSError:self.skipTest('symlink privilege unavailable')
        self.save()
        self.assertNotEqual(self.status()['state'],'synced')
        self.assertEqual(list(outside.iterdir()),[])

    def test_same_operation_retry_never_exports_an_old_revision(self):
        req=commit();self.assertEqual(self.client.put('/pm/workspace',json=req).status_code,200)
        newer=workspace();newer['projects'][0]['name']='latest';self.save(newer,1)
        self.assertEqual(self.client.put('/pm/workspace',json=req).status_code,200)
        self.assertIn('latest',(Path(self.status()['path'])/'项目说明.md').read_text(encoding='utf-8'))

    def test_foreign_origin_and_unknown_project_cannot_write(self):
        self.save()
        self.assertEqual(self.client.post('/pm/projects/p1/files/sync',headers={'origin':'https://evil.test'}).status_code,403)
        self.assertEqual(self.client.post('/pm/projects/unknown/files/sync').status_code,404)

    def test_removed_documents_are_archived_not_deleted(self):
        w=workspace();w['projects'][0]['tasks']=[dict(id='t1',title='任务甲',goal='目标',stage=0,status='todo',sourceIds=[],skillId='')]
        self.save(w);folder=Path(self.status()['path'])
        w['projects'][0]['tasks']=[];self.save(w,1)
        self.assertTrue(any('任务甲' in f.read_text(encoding='utf-8') for f in (folder/'历史移除').rglob('*.md')))

    def test_manifest_failure_recovers_after_another_revision_and_restart(self):
        self.save()
        changed=workspace();changed['projects'][0]['name']='intermediate'
        write=self.files._write
        def fail_manifest(path,content):
            if path.name=='files.json':raise OSError('disk full')
            return write(path,content)
        with patch.object(self.files,'_write',side_effect=fail_manifest):self.save(changed,1)
        changed['projects'][0]['name']='latest'
        self.store.commit(commit(changed,2))
        restarted=ProjectFiles(self.files.root);restarted.sync(self.store)
        self.assertEqual(restarted.status(self.store,'p1')['state'],'synced')
        self.assertIn('latest',(restarted.folder('p1')/'项目说明.md').read_text(encoding='utf-8'))

    def test_ids_are_distinct_on_case_insensitive_filesystems(self):
        self.assertNotEqual(key('p1').lower(),key('P1').lower())
        self.assertNotEqual(key('P1').lower(),key(key('P1')).lower())
        w=workspace();second=copy.deepcopy(w['projects'][0]);second.update(id='P1',name='uppercase project')
        w['projects'].append(second);self.save(w)
        for pid in ('p1','P1'):self.assertEqual(self.files.status(self.store,pid)['state'],'synced')
        self.assertNotIn('uppercase project',(self.files.folder('p1')/'项目说明.md').read_text(encoding='utf-8'))

    def test_invalid_metadata_does_not_break_saving_or_startup(self):
        self.save()
        for filename,body in [('project.json','[]'),('pending.json','[]'),('pending.json','{"projectId":"p1","hashes":{"x":[[]]}}')]:
            f=self.files.folder('p1')/'.pm'/filename;previous=f.read_text(encoding='utf-8');f.write_text(body,encoding='utf-8')
            self.save(base=self.store.read()['revision'])
            restarted=ProjectFiles(self.files.root);restarted.sync(self.store)
            self.assertNotEqual(restarted.status(self.store,'p1')['state'],'synced')
            self.assertEqual(f.read_text(encoding='utf-8'),body)
            f.write_text(previous,encoding='utf-8');self.files.sync(self.store)

    def test_folder_name_is_readable_and_same_names_are_separate(self):
        w=workspace();second=copy.deepcopy(w['projects'][0]);second['id']='p2';w['projects'].append(second)
        self.save(w)
        for pid in ('p1','p2'):
            self.assertEqual(self.files.folder(pid).parent.name,'模拟项目__'+pid)
        self.assertNotEqual(self.files.folder('p1'),self.files.folder('p2'))

    def test_legacy_folder_moves_with_external_files_and_snapshot_preserved(self):
        w=workspace();self.store.commit(commit(w))
        legacy=self.root/'projects/p1/网页同步';legacy.mkdir(parents=True)
        (legacy/'.pm').mkdir();(legacy/'.pm/project.json').write_text(__import__('json').dumps(w['projects'][0]),encoding='utf-8')
        (legacy/'私人笔记.md').write_text('保留笔记',encoding='utf-8')
        snapshot=legacy.parent/'README.md';snapshot.write_text('旧快照',encoding='utf-8')
        self.files.sync(self.store)
        target=self.files.folder('p1')
        self.assertEqual(target.parent.name,'模拟项目__p1')
        self.assertEqual((target/'私人笔记.md').read_text(encoding='utf-8'),'保留笔记')
        self.assertEqual(snapshot.read_text(encoding='utf-8'),'旧快照')
        self.assertFalse(legacy.exists())

    def test_project_names_cannot_escape_root(self):
        w=workspace();w['projects'][0]['name']='../../CON:<测试>\\目录'
        self.save(w);folder=self.files.folder('p1')
        self.assertTrue(folder.resolve().is_relative_to(self.files.root.resolve()))
        self.assertEqual(folder.parent.parent,self.files.root)
        self.assertEqual(self.status()['state'],'synced')
