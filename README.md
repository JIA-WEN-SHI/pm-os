# PM OS · AI 产品工作台

师嘉文 · AI 产品作品集项目

让分散的对话、资料和阶段产出，回到同一个项目。

**先查看：** [直接演示](https://jia-wen-shi.github.io/demos/pmos/) · [项目案例](https://jia-wen-shi.github.io/#case-pmos) · [作品集首页](https://jia-wen-shi.github.io/)

无需登录 GitHub 即可浏览公开源码。案例页和公共原型不需要安装环境或填写模型密钥。

## 项目背景与职责

围绕 AI 辅助产品工作的资料、任务、报告与阶段交接，设计八阶段工作台。当前资料中已有报告版本、证据引用、本地保存和后台运行等能力。

我的职责：产品规划、交互设计与实现。

## 当前范围

已具备可展示的本地工作台与部分运行验证材料。尚未完成真实用户案例验证，也不宣称完整自动 Agent 团队或自动评估。

公开演示可直接操作现有前端：示例项目 · 浏览器保存 · 资料、报告编辑与版本审阅 · 助手为预设回复。演示使用合成数据，不代表真实业务或实时模型效果。完整后端仍需本地服务与自己的配置。

## 源码结构

`agent-ui/ · pmos/ · tests/ · agno_app.py`

这是当前工作区源码的发布快照，未附带旧 Git 历史。真实密钥、数据库、浏览器会话、日志、客户原始金融材料和依赖缓存不在仓库内。

## 无后台演示

```bash
cd agent-ui/demo
npm ci
npm run dev
npm run build
```

静态产物在 `agent-ui/demo/dist/`。复用原 PM 工作台，示例保存到浏览器独立空间；可用“重置演示”恢复。未连接 Agno、Hermes 或模型。

## 本地运行

需要 Python 3.13、uv、Node.js 24 和 pnpm 10。

```bash
uv sync --locked
# 将 .env.example 复制为 .env，按需填写自己的模型配置
cd agent-ui
npx pnpm@10.11.0 install --frozen-lockfile
npm run build
cd ..
```

Windows 下运行 `start.cmd`；前端为 3000，后端为 7777。也可在两个终端分别运行 `uv run python agno_app.py` 和 `cd agent-ui && npm run dev`。

`agent-ui/` 已包括本地 PM OS 改动，请不要重新克隆上游覆盖它。上游来源和许可证见 [THIRD_PARTY.md](THIRD_PARTY.md)。数据库从本地空工作区开始，不附带个人资料。Hermes 功能需要额外的本机 Hermes 配置。

## 待补充的案例材料

- 最初使用 AI 工作时的一个具体困难
- 当前最常使用的一条流程与一份真实个人产出
- 最新运行界面或短演示，以及能力范围确认
- 项目时间线；与法律推演案例的关联说明

## 说明

这里展示产品探索与当前实现阶段，不宣称真实用户业务效果。商业素材和合作案例会在材料与展示范围确认后补充。
