# PM OS · AI 产品工作台

这是基于 Agno / AgentOS 的个人 AI 产品工作台。前端从官方 Agent UI 扩展，保留原聊天页，并提供项目、资料、任务、报告、方法和知识库的操作界面。

## 前端第一版

- 四个全局入口：项目、方法库、知识库、设置。
- 每个项目包括概览、流程与任务、资料库、交付物、决策记录、运行记录、项目配置。
- 八阶段覆盖调研、问题定义、AI 可行性、方案设计、原型实验、评估迭代、交付跟踪、复盘沉淀；可以记录阶段状态、备注与跳过原因。
- 导入 TXT / Markdown / CSV / JSON（单文件不超过 500KB）、粘贴正文、保存来源链接。选择资料与工作方法后，可调用当前 Agno Agent 生成真实报告。
- 报告支持 Markdown 编辑、新版本、版本确认、历史对照、来源追溯、导出与沉淀为知识。项目对话可并排打开，回复可保存为交付物。
- 个人方法支持导入和编辑。当前以方法文本加入模型上下文，不执行 Skill 内的代码或脚本。

**保存位置：**迁移后，项目、资料正文、报告版本、阶段约定、方法和知识保存于 `data/pmos.db`。首次请从之前使用的 `http://localhost:3000` 打开，下载旧备份并点击“迁移并继续”；旧 localStorage 原件不删除。其他浏览器打开同一个本机服务后读取相同工作区。设置 → 储存与备份可导出 JSON，恢复会创建独立副本。`data/agentos.db` 另存 Agno 会话，不混用业务表。

保存提示出现后应先“重试原提交”，不要重复创建对象。若提示另一窗口更新，导出未保存内容，再点击“保留恢复副本并重新加载”；可在设置中将导出资料恢复为独立副本。未确认提交暂存于当前标签页的 sessionStorage；若浏览器拒绝写缓存则不发出新提交，页面仍提供导出。关闭标签页前务必处理未保存提示，不能把浏览器缓存当作永久备份。本版为工作区级版本锁，不同项目同时编辑也可能冲突。

**当前边界：**后端仍为单个 Agno Assist，不是自动运行的 Agent Team。项目业务数据尚未迁移到服务端；网页自动采集、PDF / Word 解析、任务级多模型切换、自动工作流编排与自动评估未接入。模型配置沿用根目录 `.env`，前端仅显示安全摘要。示例项目有明确标记，新建项目从空白开始。

建议首次体验：新建项目 → 资料库粘贴正文 → 流程与任务创建任务 → 运行生成报告 → 人工核对并确认版本 → 沉淀知识。模型运行期间保持页面打开；重新加载后请先核对原聊天页的运行记录再重试。

## 打开与启停

- 项目工作台：<http://localhost:3000>
- 原聊天界面：<http://localhost:3000/chat?db_id=pm-local-db&agent=agno-assist>
- 后端接口文档：<http://127.0.0.1:7777/docs>
- 健康检查：<http://127.0.0.1:7777/health>
- 双击 `start.cmd` 启动，`stop.cmd` 停止，`restart.cmd` 重启。
- 状态：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\manage.ps1 status`

服务在后台运行，仅监听本机地址。启动脚本不会设置开机自启，也不会停止其他占用端口的程序。关闭浏览器不会停止服务；重启电脑后请再运行 `start.cmd`。

## 接入模型（开始聊天前需要完成）

用编辑器打开根目录 `.env`，填写：

```dotenv
OPENAI_API_KEY=你的模型服务API密钥
OPENAI_BASE_URL=服务商提供的OpenAI兼容接口地址
OPENAI_MODEL=服务商提供的模型ID
AGNO_TELEMETRY=false
```

当前模板地址为 `https://api.openai.com/v1`，模型为 `gpt-4.1-mini`，**密钥留空**。如果你使用其他服务商，请同时修改上述三项。当前配置使用 Chat Completions 接口。

保存后双击 `restart.cmd`。新工作台通过本机同源代理连接 Agno；原聊天页左侧 Endpoint 使用 `http://localhost:7777`，选择 **Agno Assist**。没有配置 API Key 时，服务和界面仍可启动，但模型对话不能成功。费用统计目前不在新界面中提供。

密钥只填在根目录 `.env` 中，不要填到前端代码或提交到 Git。项目已忽略 `.env`、数据库及日志。

## 已部署的组件

| 组件 | 配置 |
| --- | --- |
| Agno | 3.0.10，依赖版本锁定于 `uv.lock` |
| AgentOS | FastAPI 运行服务，本机 7777 端口 |
| Agent | 官方入门模式的 Agno Assist；保留对话历史 |
| 数据库 | SQLite：`data/agentos.db`，保存会话及运行追踪 |
| Tracing | 已启用数据库追踪；需要真实运行才会产生模型追踪数据 |
| PM OS UI | 基于官方 Agent UI 扩展的 Next.js 工作台，生产构建，本机 3000 端口 |

Agent UI 源仓库：<https://github.com/agno-agi/agent-ui>

上游基础提交：`6dad9593fca6756e1813e4f4b3b2620be6377691`。本地 PM OS 改动位于 `codex/pmos-frontend` 分支工作区；重新克隆上游不会包含这些改动，应另外备份 `agent-ui/src/features/pm` 及相应路由和配置，或在设置 Git 身份后提交本地版本。
它位于 `agent-ui/`，保留独立 Git 仓库，主仓库忽略该目录。

原 Agent UI 聊天页仍保留。完整的 AgentOS 管理界面可使用官方 <https://os.agno.com>，但需要登录并另行配置受信任来源/连接；本部署默认只允许本地聊天界面跨域访问。

## 文件与数据

- `agno_app.py`：后端入口，按官方示例配置 Agent、数据库及 AgentOS。
- `.env`：本地模型配置；`.env.example` 为无密钥模板。
- `data/agentos.db`：Agno 会话与运行数据。
- `data/pmos.db`：带历史版本和幂等记录的 PM OS 工作区。备份时先停止服务，再复制整个 `data/`。
- `data/backups/<迁移标识>/`：首次迁移的浏览器原始 JSON、数量/哈希清单、AgentOS 一致性备份；源库不存在时清单记为 absent。
- `pmos/`：本机工作区 API、结构校验、事务与迁移备份。
- `logs/backend.err.log`、`logs/backend.out.log`：后端日志。
- `logs/ui.err.log`、`logs/ui.out.log`：前端日志。
- `.run/`：启动脚本记录的进程标识。

## 重新安装基础依赖

下面的克隆命令只恢复官方聊天基础项目。重装本地 PM OS 时，请先恢复自己备份或提交的完整 `agent-ui/` 源码，再安装依赖和构建。

需要 Windows、Python 3.13、uv、Node.js、Git。在项目目录运行：

```powershell
uv sync --locked
Copy-Item .env.example .env  # 仅首次运行；已有配置不要覆盖
git clone https://github.com/agno-agi/agent-ui.git agent-ui
git -C agent-ui checkout 6dad9593fca6756e1813e4f4b3b2620be6377691
Set-Location agent-ui
npx.cmd --yes pnpm@10.11.0 install --frozen-lockfile
$env:NEXT_TELEMETRY_DISABLED = '1'
npm.cmd run build
Set-Location ..
.\start.cmd
```

已安装的前端无需再次 clone。Python 下载并发限制为 4，以适配本机网络；安装仍使用官方 PyPI，前端依赖使用 npm 官方源。PM OS 使用系统字体，构建无需下载 Google 字体。前端检查命令为 `npm.cmd test`、`npx.cmd tsc --noEmit`、`npm.cmd run lint`、`npm.cmd run build`；测试使用 Node.js 24 的内置 TypeScript 支持。

## 与分享记录的对应关系

已具备 **Agno 运行底座 + PM OS 前端工作台 + 可靠工作区保存**，以及资料版本/证据定位、报告局部问答与改写建议、固定输入快照、阶段交接卡和后台运行记录。资料库可通过 Agno Workflow 调用本机 Hermes 的指定公开网页读取工具：读取结果需人工核对并采纳为资料新版本，保留原文与运行来源；此步骤不调用模型。测试步骤见 [Hermes 网页读取用户验收](docs/testing/PMOS_Hermes_网页读取_用户验收.md)。项目对话、阶段方案和报告问答现可配置为由真实 Hermes Agent 执行，沿用现有模型，允许公开网页搜索和读取，按项目隔离上下文；配置与限制见 [Hermes 项目对话](docs/configuration/Hermes-项目对话.md)。项目模型目前仍采用兼容快照保存；原始文件资产、完整方法与模板注册、Hermes 个人技能和其他工具接入仍需后续开发。保存成功不等于研究或阶段验收通过。

新发起的任务和对话使用后台执行记录：先保存输入，再按项目与运行 ID 派发给 Agno，结果独立保存在 `pmos.db`。刷新或关闭网页不会主动取消任务，重新打开项目会查询并收录结果；查询不会重新派发。运行详情可停止本次执行，并查看实际事件。后端重启会保留片段并标记中断，不自动重跑。默认本机执行时间上限 240 秒；停止本机执行不代表远端模型计费一定停止。旧运行保持原有记录。

后台终态保存暂时失败时保留内存中的待保存结果，查询时重试落盘；如果磁盘不可写且进程同时退出，只能保留此前已写入的片段，重启后明确标记中断。JSON 项目导出仅包含已收录成果；完整运行日志随 `pmos.db` 备份保存。当前支持单进程本地服务，不支持多 worker 共享调度。

当前使用官方支持的 SQLite 单机配置，未安装 Docker、PostgreSQL、Supabase 或 Langfuse。需要多人使用、云端部署或扩展项目业务层时，再配置 PostgreSQL，并迁移已有数据；直接换数据库连接不会自动迁移 SQLite 数据。

官方参考：<https://docs.agno.com/agent-os/run-your-os>、<https://docs.agno.com/agent-os/tracing/overview>。
