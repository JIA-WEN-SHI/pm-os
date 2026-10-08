"""Recoverable, one-way Markdown projection of the saved workspace."""
import hashlib
import json
import os
import re
import threading
from pathlib import Path
from uuid import uuid4

from .workspace_store import serialized, digest

STAGES = ['调研与发现','定义与拆解','AI机会与可行性','方案与产品定义','原型与实验','评估与迭代','交付与效果跟踪','复盘与知识沉淀']


def key(value):
    value=str(value)
    if re.fullmatch(r'[a-z0-9-]{1,80}',value) and not re.fullmatch(r'(?i)(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])',value):
        return value
    # The underscore reserves a namespace that raw IDs can never occupy.
    return 'id_'+hashlib.sha256(value.encode()).hexdigest()[:24]


def text(value):
    return value if isinstance(value,str) else json.dumps(value,ensure_ascii=False,indent=2)


def document(p,kind,identity,body,version=1):
    return f'---\nproject_id: {json.dumps(p["id"])}\nobject_id: {json.dumps(identity)}\nkind: {kind}\nversion: {version}\nmode: web_to_files\n---\n\n'+body+'\n'


def render(p):
    files={}
    def add(relative,kind,identity,body,version=1):
        files[relative]=document(p,kind,identity,body,version)
    def stage(i):return f'流程/S{i+1:02d}-{STAGES[i]}'
    add('项目说明.md','project',p['id'],f'# {p["name"]}\n\n目标：{p["goal"]}\n\n目标用户：{p["audience"] or "待补充"}\n\n预期产出：{p["outputs"]}\n\n状态：'+('已归档' if p['archived'] else '进行中'))
    for i,name in enumerate(STAGES):
        w=p.get('stageWork',{}).get(str(i),{})
        add(stage(i)+'/工作方案.md','stage',f'S{i+1:02d}',f'# {name}\n\n'+('\n\n---\n\n'.join(w['inputs']) if w else '尚未填写本阶段方案。')+'\n\n## 完成标准\n\n'+('\n'.join(f'- {c["label"]}：{c["target"]}；核验：{c["method"]}' for c in w.get('criteria',[])) or '待定义')+'\n\n## 采用资料 ID\n\n'+('、'.join(w.get('sourceIds',[])) or '尚未选择')+'\n\n## 阶段记录\n\n'+p.get('stageNotes',{}).get(str(i),'暂无记录'),w.get('version',1))
        add(stage(i)+'/对话记录.md','conversation',f'S{i+1:02d}',f'# {name} · 对话记录\n\n'+('\n\n'.join(f'## {m["role"]} · {m["at"]}\n\n{m["content"]}' for m in p['messages'] if m.get('stage')==i) or '暂无对话。'))
    for s in p['sources']:
        add('资料库/资料-'+key(s['id'])+'.md','source',s['id'],f'# {s["title"]}\n\n来源：{s.get("url",s["kind"])}\n\n{s["content"]}',s.get('versions',[{'version':1}])[-1]['version'])
        for v in s.get('versions',[]):
            add(f'历史版本/资料-{key(s["id"])}/v{v["version"]}.md','source-version',s['id'],f'# {v["title"]}\n\n性质：{v["mode"]}\n\n{v["content"]}',v['version'])
    for a in p['artifacts']:
        v=a['revisions'][-1]
        refs='\n'.join(f'- {r["title"]}（{r["id"]}，v{r["version"]}）' for r in a.get('artifactRefs',[]))
        add(stage(a['stage'])+'/交付物/报告-'+key(a['id'])+'.md','artifact',a['id'],f'# {a["title"]}\n\n状态：{a["status"]}\n资料 ID：{", ".join(a["sourceIds"])}\n\n## 上游引用\n\n{refs or "无"}\n\n---\n\n{v["content"]}',v['version'])
        for v in a['revisions']:
            add(f'历史版本/报告-{key(a["id"])}/v{v["version"]}.md','artifact-version',a['id'],v['content'],v['version'])
    for t in p['tasks']:
        add(stage(t['stage'])+'/任务/任务-'+key(t['id'])+'.md','task',t['id'],f'# {t["title"]}\n\n目标：{t["goal"]}\n\n状态：{t["status"]}\n\n资料：{text(t["sourceIds"])}\n\n方法：{t["skillId"] or "未指定"}\n\n产出：{t.get("artifactId","暂无")}')
    for r in p['runs']:
        base=stage(r['stage'])+'/执行记录/'+key(r['id'])
        add(base+'/运行记录.md','run',r['id'],f'# {r["title"]}\n\n状态：{r["status"]}\n\n请求：{r.get("requestText",r["title"])}\n\n## 输出\n\n{r["output"] or r.get("error") or "尚未完成"}')
        if 'contextSnapshot' in r:
            add(base+'/输入上下文.md','run-context',r['id'],'# 本次实际提交正文\n\n不包含执行器追加的系统提示或内部推理。\n\n'+r['contextSnapshot']['request']['message'])
            files[base+'/输入快照.json']=json.dumps(r['contextSnapshot'],ensure_ascii=False,indent=2)+'\n'
    for h in p.get('handoffs',[]):
        v=h['revisions'][-1]
        add(stage(h['fromStage'])+'/交接-'+key(h['id'])+'.md','handoff',h['id'],f'# 交给 S{h["toStage"]+1:02d}\n\n'+text(v),v['version'])
    add('决策记录.md','decisions',p['id'],'# 决策记录\n\n'+('\n\n'.join(f'## {d["title"]}\n\n决定：{d["choice"]}\n\n理由：{d["reason"]}\n\n记录：{d["at"]}' for d in p['decisions']) or '暂无决定。'))
    add('项目对话.md','conversation',p['id'],'# 项目对话\n\n'+('\n\n'.join(f'## {m["role"]} · {m["at"]}\n\n{m["content"]}' for m in p['messages'] if m.get('stage') is None) or '无未归入阶段的对话；阶段对话见流程目录。'))
    files['.pm/project.json']=json.dumps(p,ensure_ascii=False,indent=2)+'\n'
    listing='\n'.join(f'- [{relative}]({relative})' for relative in files if relative.endswith('.md'))
    add('README.md','index',p['id'],f'# {p["name"]} · 本地文件\n\n这是网页保存内容的自动副本。数据库仍是当前保存来源；外部编辑不会回写网页，发生冲突时保留外部文件，并在网页提示。\n\n不要在此存放模型密钥。原始附件仍按已有上传能力处理，此功能不会凭空生成未上传的 PDF 或图片。\n\n[打开项目](http://localhost:3000/?view=overview&project={p["id"]})\n\n## 文件索引\n\n{listing}')
    return files


class ProjectFiles:
    def __init__(self, root):
        self.root=Path(root).absolute()
        self.lock=threading.RLock()
        self.errors={}

    def folder(self, project_id):
        identity=key(project_id)
        self._checked(self.root)
        matches=[p/'网页同步' for p in self.root.iterdir() if p.name.endswith('__'+identity) and (p/'网页同步').exists()] if self.root.exists() else []
        if len(matches)>1:raise ValueError('Ambiguous project directories')
        return matches[0] if matches else self.root/identity/'网页同步'

    def _prepare_folder(self,p,folder):
        # Existing readable names stay stable across project renames, preserving
        # external links. The ID and project metadata identify the current name.
        if folder.parent.name!=key(p['id']):return folder
        label=re.sub(r'[<>:"/\\|?*\x00-\x1f]','-',p['name']).strip(' .')[:40].rstrip(' .') or '未命名项目'
        target=self._checked(self.root/(label+'__'+key(p['id']))/'网页同步')
        source=self._checked(folder)
        if target.exists():raise ValueError('Destination already exists')
        if source.exists():
            # Verify both absolute paths remain inside the export root before
            # moving the subtree. Never move/delete the old hand-made snapshot.
            target.parent.mkdir(parents=True,exist_ok=True)
            os.rename(self._checked(source),self._checked(target))
            try:source.parent.rmdir()  # Empty legacy parent only, never recursive.
            except OSError:pass
        return target

    def _checked(self, path):
        path=Path(path).absolute()
        path.relative_to(self.root)
        for part in [path,*path.parents]:
            if part.is_symlink() or (hasattr(part,'is_junction') and part.is_junction()):
                raise ValueError('Linked export paths are not allowed')
            if part==self.root:break
        if not path.resolve().is_relative_to(self.root.resolve()):raise ValueError('Path outside export root')
        return path

    def _write(self,path,content):
        path=self._checked(path);path.parent.mkdir(parents=True,exist_ok=True)
        temporary=self._checked(path.with_name('.'+uuid4().hex+'.tmp'))
        try:
            with temporary.open('x',encoding='utf-8',newline='\n') as out:
                out.write(content);out.flush();os.fsync(out.fileno())
            os.replace(temporary,self._checked(path))
        finally:
            if temporary.exists():temporary.unlink()

    def _read(self,path):
        path=self._checked(path)
        return path.read_text(encoding='utf-8') if path.exists() else None

    def _manifest(self,folder):
        raw=self._read(folder/'.pm/files.json')
        value=json.loads(raw) if raw else {'hashes':{}}
        if not isinstance(value,dict) or not isinstance(value.get('hashes'),dict):raise ValueError('Invalid manifest')
        return value

    def _sync_project(self,p,revision):
        folder=self._checked(self.folder(p['id']));desired=render(p)
        old=self._manifest(folder);hashes=dict(old['hashes']);conflicts=[]
        owner=self._read(folder/'.pm/project.json')
        if owner:
            owner=json.loads(owner)
            if not isinstance(owner,dict) or owner.get('id')!=p['id']:raise ValueError('Invalid directory owner')
        folder=self._prepare_folder(p,folder)
        pending_raw=self._read(folder/'.pm/pending.json')
        pending=json.loads(pending_raw) if pending_raw else {}
        if not isinstance(pending,dict):raise ValueError('Invalid journal')
        if pending and pending.get('projectId')!=p['id']:raise ValueError('Different project owns journal')
        journal_hashes=pending.get('hashes',{})
        if not isinstance(journal_hashes,dict) or any(not isinstance(r,str) or not isinstance(values,list) or any(not isinstance(v,str) for v in values) for r,values in journal_hashes.items()):raise ValueError('Invalid journal hashes')
        allowed={r:set(values) for r,values in journal_hashes.items()}
        for relative,value in hashes.items():allowed.setdefault(relative,set()).add(value)
        for relative,values in allowed.items():
            if relative not in hashes:
                current=self._read(folder/relative)
                if current is not None and digest(current) in values:hashes[relative]=digest(current)
        writes={}
        for relative,content in desired.items():
            current=self._read(folder/relative)
            if current is not None and current!=content and digest(current) not in allowed.get(relative,set()):
                conflicts.append(relative);continue
            if current!=content:writes[relative]=content
            allowed.setdefault(relative,set()).add(digest(content))
            hashes[relative]=digest(content)
        # Persist intended hashes before touching content. A restart can distinguish
        # our partially completed writes from genuine external edits.
        self._write(folder/'.pm/pending.json',json.dumps({'projectId':p['id'],'hashes':{r:sorted(v) for r,v in allowed.items()}},ensure_ascii=False))
        for relative,content in writes.items():self._write(folder/relative,content)
        for relative in list(hashes):
            if relative in desired:continue
            source=self._checked(folder/relative);current=self._read(source)
            if current is not None:
                if digest(current) not in allowed.get(relative,set()):conflicts.append(relative);continue
                target=self._checked(folder/'历史移除'/str(revision)/relative)
                target.parent.mkdir(parents=True,exist_ok=True)
                os.replace(source,self._checked(target))
            hashes.pop(relative,None)
        self._write(folder/'.pm/files.json',json.dumps({'projectId':p['id'],'hashes':hashes,'projectHash':digest(serialized(p)),'revision':revision,'conflicts':conflicts},ensure_ascii=False,indent=2))
        self._write(folder/'.pm/pending.json','{}')

    def sync(self,store,project_id=None):
        with self.lock:
            # Read latest after acquiring lock; retrying an old commit cannot roll files back.
            envelope=store.read()
            if not envelope:return
            for p in envelope['workspace']['projects']:
                if project_id is not None and p['id']!=project_id:continue
                try:
                    self._sync_project(p,envelope['revision']);self.errors.pop(p['id'],None)
                except (OSError,ValueError,TypeError,KeyError):
                    self.errors[p['id']]='数据库已保存，本地文件尚未同步；请检查目录或磁盘后重试。'

    def status(self,store,project_id):
        with self.lock:
            envelope=store.read()
            p=next((p for p in (envelope or {}).get('workspace',{}).get('projects',[]) if p['id']==project_id),None)
            if p is None:raise KeyError(project_id)
            result={'path':'','state':'pending','conflicts':[],'message':'本地文件尚未同步','mode':'web_to_files'}
            try:
                folder=self.folder(project_id);result['path']=str(folder)
                old=self._manifest(folder);conflicts=[];missing=False
                for relative,expected in old['hashes'].items():
                    current=self._read(folder/relative)
                    if current is None:missing=True
                    elif digest(current)!=expected:conflicts.append(relative)
                conflicts=sorted(set(conflicts+old.get('conflicts',[])))
                if conflicts:result.update(state='conflict',conflicts=conflicts,message='存在外部修改，已保留原文件；这些修改尚未回写网页。')
                elif project_id in self.errors:result.update(state='failed',message=self.errors[project_id])
                elif not missing and old.get('projectHash')==digest(serialized(p)):
                    result.update(state='synced',message='已同步到本地 Markdown',revision=old.get('revision'))
            except (OSError,ValueError,TypeError,KeyError):
                result.update(state='failed',message='无法读取本地文件状态；数据库内容仍保留。')
            return result
