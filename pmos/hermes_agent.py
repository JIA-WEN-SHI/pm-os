"""Hermes Agent runs with explicit PM OS context and an isolated, web-only profile."""
import asyncio
import json
import os
import re
from pathlib import Path
from .hermes_web import child_environment
from .process_job import ProcessJob


def isolated_paths(root, project_id, attempt, session_id):
    if not re.fullmatch(r'[a-zA-Z0-9-]{1,100}', project_id):
        raise ValueError('Invalid project')
    if not re.fullmatch(r'[a-f0-9-]{36}', attempt):
        raise ValueError('Invalid attempt')
    # The execution store has already checked the full run-bound session ID.
    if session_id != f'pm-{project_id}' and not re.fullmatch(re.escape(f'pm-{project_id}-')+r'[a-f0-9-]{36}',session_id):
        raise ValueError('Session belongs to another project')
    return Path(root).resolve() / project_id / attempt


def final_content(result, *, structured=False):
    if not isinstance(result,dict) or result.get('completed') is not True or any(result.get(k) for k in ('failed','interrupted','partial','error')):
        raise ValueError('Hermes did not complete')
    content=result.get('final_response')
    if not isinstance(content,str) or not content.strip():
        raise ValueError('Hermes returned no final answer')
    if structured:
        def reject_constant(value):
            raise ValueError('Invalid JSON constant')
        value=json.loads(content,parse_constant=reject_constant)
        if not isinstance(value,dict):
            raise ValueError('Hermes returned no stage object')
        # Blank optional follow-up rows carry no content. Keep all actual text,
        # required fields and evidence unchanged for the existing adoption checks.
        questions=value.get('questions')
        if isinstance(questions,list) and any(isinstance(q,str) and not q.strip() for q in questions):
            value['questions']=[q for q in questions if not (isinstance(q,str) and not q.strip())]
            content=json.dumps(value,ensure_ascii=False)
    return content


class HermesAgentAdapter:
    def __init__(self, work_root, hermes_root=None):
        self.work_root=Path(work_root)
        self.root=Path(hermes_root or os.getenv('PMOS_HERMES_ROOT') or Path(os.environ.get('LOCALAPPDATA',''))/'hermes'/'hermes-agent')
        self.python=self.root/'venv'/'Scripts'/'python.exe'

    async def run(self, request, attempt, project_id, history):
        if not self.python.is_file() or not (self.root/'run_agent.py').is_file():
            raise ValueError('Hermes installation unavailable')
        home=isolated_paths(self.work_root,project_id,attempt,request['sessionId'])
        home.mkdir(parents=True,exist_ok=False)
        (home/'config.yaml').write_text('web:\n  keyless_fallback: true\n',encoding='utf-8')
        (home/'.env').write_text('',encoding='utf-8')
        # Credentials travel only over the private stdin pipe, never via argv, logs or saved inputs.
        payload=dict(message=request['message'],session_id=request['sessionId'],history=history,
                     structured=isinstance(request.get('stagePreparation'),dict),
                     model=os.getenv('OPENAI_MODEL','gpt-4.1-mini'),base_url=os.getenv('OPENAI_BASE_URL') or 'https://api.openai.com/v1',
                     api_key=os.getenv('OPENAI_API_KEY',''))
        job=ProcessJob();process=None
        try:
            process=await asyncio.create_subprocess_exec(str(self.python),'-I',str(Path(__file__).with_name('hermes_agent_worker.py')),
                str(self.root.resolve()),cwd=home,env=child_environment(home),stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL,limit=2_100_000,
                **({'creationflags':job.creationflags} if os.name=='nt' else {}))
            job.attach(process.pid)
            process.stdin.write(json.dumps(payload,ensure_ascii=False).encode('utf-8'))
            await process.stdin.drain();process.stdin.close()
            completed=None
            while line:=await process.stdout.readline():
                event=json.loads(line.decode('utf-8'))
                name=event.get('event')
                if name=='RunCompleted':
                    completed=final_content(event['result'],structured=payload['structured'])
                elif name=='RunError':
                    raise ValueError('Hermes agent failed')
                elif name in ('RunStarted','ModelRequestStarted','ModelRequestCompleted','ToolCallStarted','ToolCallCompleted'):
                    tool=event.get('tool')
                    yield {'event':name,'run_id':attempt,**({'tool':tool} if tool in ('web_search','web_extract') else {})}
            code=await process.wait()
            if code!=0 or completed is None:raise ValueError('Hermes worker did not finish cleanly')
            yield {'event':'RunCompleted','run_id':attempt,'content':completed}
        finally:
            job.close()
            if process is not None and process.returncode is None:
                process.kill()
                await process.wait()
