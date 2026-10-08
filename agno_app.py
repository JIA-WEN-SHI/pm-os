"""Local deployment of the official AgentOS + SQLite quickstart pattern."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
os.environ.setdefault("AGNO_TELEMETRY", "false")

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from pmos.model_config import configured_model
from agno.os import AgentOS

(ROOT / "data").mkdir(exist_ok=True)
db = SqliteDb(id="pm-local-db", db_file=str(ROOT / "data" / "agentos.db"))

agent = Agent(
    id="agno-assist",
    name="Agno Assist",
    model=configured_model(),
    db=db,
    add_history_to_context=True,
    markdown=True,
)

agent_os = AgentOS(
    id="pm-agentos",
    name="PM AgentOS",
    agents=[agent],
    db=db,
    tracing=True,
    cors_allowed_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
)
app = agent_os.get_app()

from pmos.workspace_api import create_workspace_router
from pmos.workspace_store import WorkspaceStore
from pmos.project_files import ProjectFiles
from pmos.execution import ExecutionStore, ExecutionService, agno_runner
from pmos.execution_api import create_execution_router
from pmos.hermes_web import HermesWebAdapter, hermes_workflow_runner
from pmos.hermes_agent import HermesAgentAdapter
from contextlib import asynccontextmanager

workspace_store = WorkspaceStore(ROOT / 'data' / 'pmos.db')
project_files = ProjectFiles(ROOT / 'projects')
app.include_router(create_workspace_router(
    workspace_store, ROOT / 'data' / 'backups', project_files
))
chat_executor=os.getenv('PMOS_CHAT_EXECUTOR','agno-assist')
execution_store = ExecutionStore(workspace_store,chat_executor=chat_executor)
text_runner = agno_runner(agent)
web_runner = hermes_workflow_runner(HermesWebAdapter(ROOT/'data'/'hermes-runs'),db)


def dispatch_run(request, attempt):
    return (web_runner if request.get('webRead') else text_runner)(request,attempt)


hermes_agent=HermesAgentAdapter(ROOT/'data'/'hermes-projects')
execution_service = ExecutionService(execution_store, dispatch_run,hermes_runner=hermes_agent.run)
app.include_router(create_execution_router(execution_service))

@app.get('/pm/assistant')
async def assistant_status():
    return dict(agent='Hermes' if chat_executor=='hermes-agent' else 'Agno Assist',
                executor=chat_executor,model=agent.model.id,
                tools=['web_search','web_extract'] if chat_executor=='hermes-agent' else [])
original_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(app):
    execution_store.recover_interrupted()
    from starlette.concurrency import run_in_threadpool
    await run_in_threadpool(project_files.sync, workspace_store)
    async with original_lifespan(app) as state:
        try:
            yield state
        finally:
            await execution_service.close()


app.router.lifespan_context = lifespan

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=7777)
