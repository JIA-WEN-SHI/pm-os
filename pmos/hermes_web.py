"""A narrow adapter to the installed Hermes web extraction tool, not its CLI agent."""
import asyncio
import ipaddress
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl
from .process_job import ProcessJob


class HermesWebError(ValueError):
    pass


def validate_public_url(url):
    if not isinstance(url, str) or not url or len(url) > 2000 or any(ord(c) < 33 for c in url) or '\\' in url:
        raise HermesWebError('请使用完整的公开网页链接')
    parsed = urlsplit(url)
    host = (parsed.hostname or '').rstrip('.').lower()
    if parsed.scheme not in ('https', 'http') or not host or parsed.username or parsed.password or parsed.port not in (None,80,443):
        raise HermesWebError('仅支持无登录凭据的公开 HTTP/HTTPS 网页')
    if host in ('localhost', 'localhost.localdomain') or host.endswith(('.localhost','.local','.internal')) or '.' not in host:
        raise HermesWebError('不读取本机或内网地址')
    try:
        ip = ipaddress.ip_address(host)
    except ValueError: ip = None
    if ip and not ip.is_global: raise HermesWebError('不读取本机或内网地址')
    for key, _ in parse_qsl(parsed.query):
        if re.search(r'token|secret|password|signature|credential|api.?key|authorization',key,re.I):
            raise HermesWebError('链接含凭据参数，请改用不需要登录的公开页面')
    return url


def child_environment(home, inherited=None):
    inherited = os.environ if inherited is None else inherited
    env = {k:v for k,v in inherited.items() if k.upper() in ('SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT')}
    env.update(HERMES_HOME=str(home), USERPROFILE=str(home), APPDATA=str(home), LOCALAPPDATA=str(home),
               TEMP=str(home), TMP=str(home), PYTHONIOENCODING='utf-8', PYTHONUTF8='1',
               HERMES_TELEMETRY='false', DO_NOT_TRACK='1')
    return env


def parse_hermes_result(value, url):
    results = value.get('results') if isinstance(value, dict) else None
    if not isinstance(value,dict) or value.get('success') is False or not isinstance(results, list) or len(results) != 1:
        raise HermesWebError('Hermes 未取得网页正文，网站或网页读取服务暂不可用。')
    page = results[0]
    if not isinstance(page, dict) or page.get('error') or not isinstance(page.get('content'),str) or not page['content'].strip():
        raise HermesWebError('Hermes 未取得网页正文，可能需要登录、限制访问或链接无效。')
    content = page['content']
    truncated = '[TRUNCATED]' in content or len(content) > 100000
    # Hermes cache paths belong to the isolated worker, not to user documents.
    content = re.sub(r'^Full text saved to:.*$|^To read the omitted middle:.*$', '', content, flags=re.M)
    if len(content) > 100000: content = content[:100000]
    if truncated: content += '\n\n[读取内容有截断，请对照原网页补充，不能视为完整原文。]'
    return dict(url=url, title=str(page.get('title') or url)[:500], content=content, truncated=truncated)


class HermesWebAdapter:
    def __init__(self, work_root, hermes_root=None):
        self.work_root = Path(work_root)
        self.root = Path(hermes_root or os.getenv('PMOS_HERMES_ROOT') or Path(os.environ.get('LOCALAPPDATA',''))/'hermes'/'hermes-agent')
        self.python = self.root/'venv'/'Scripts'/'python.exe'

    async def read(self, url, attempt):
        validate_public_url(url)
        if not re.fullmatch(r'[a-f0-9-]{36}',attempt): raise HermesWebError('执行标识无效')
        if not self.python.is_file() or not (self.root/'tools'/'web_tools.py').is_file():
            raise HermesWebError('未找到本机 Hermes，请检查安装位置。')
        home = (self.work_root/attempt).resolve()
        home.mkdir(parents=True,exist_ok=False)
        (home/'config.yaml').write_text('web:\n  extract_backend: parallel\n  keyless_fallback: true\n',encoding='utf-8')
        (home/'.env').write_text('',encoding='utf-8')
        job=ProcessJob(); process=None
        try:
            process = await asyncio.create_subprocess_exec(str(self.python), '-I', str(Path(__file__).with_name('hermes_web_worker.py')),
                str(self.root.resolve()), url, cwd=home, env=child_environment(home),
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                **({'creationflags':job.creationflags} if os.name=='nt' else {}))
            job.attach(process.pid)
            stdout, _ = await process.communicate()
            if process.returncode != 0: raise HermesWebError('Hermes 网页读取进程未正常完成，请查看链接是否公开可访问。')
            if len(stdout)>1500000: raise HermesWebError('网页返回内容过大，请选择更具体的页面')
            try: value = json.loads(stdout.decode('utf-8'))
            except (ValueError,UnicodeError): raise HermesWebError('Hermes 返回内容无法解析') from None
            result = parse_hermes_result(value,url)
            (home/'result.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
            return result
        finally:
            job.close()
            if process is not None and process.returncode is None:
                process.kill()
                await process.wait()


def hermes_workflow_runner(adapter, db=None):
    async def run(request, attempt):
        from agno.workflow import Workflow, Step
        from agno.workflow.types import StepOutput
        page = None
        async def read_selected_page(step_input):
            nonlocal page
            page = await adapter.read(request['webRead']['url'],attempt)
            return StepOutput(content=page['content'])
        workflow = Workflow(id='pm-hermes-web',name='Hermes 指定网页读取',db=db,telemetry=False,
                            steps=[Step(name='Hermes web_extract',executor=read_selected_page,max_retries=0,skip_on_failure=False)])
        stream=workflow.arun(input=request,session_id=request['sessionId'],run_id=attempt,stream=True,stream_events=True)
        try:
            async for event in stream:
                if event.event=='WorkflowCompleted' and page is None:
                    raise HermesWebError('网页步骤没有返回结果')
                yield {'event':event.event,'run_id':event.run_id,'content':getattr(event,'content',None),
                       **({'tool':'web_extract'} if event.event in ('StepStarted','StepCompleted','StepError') else {})}
        finally: await stream.aclose()
    return run
