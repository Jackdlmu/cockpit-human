# YonCockpit 智能驾驶舱

> 多智能体聚合执行的动态呈现与管理驾驶舱

## 核心能力

- **驾驶舱列表**：查看所有智能体聚合工作空间
- **驾驶舱详情**：Widget 网格展示（指标、图表、表格、看板、时间线、列表）
- **智能体协作**：查看关联智能体状态，与主智能体对话
- **指令面板**：自然语言下达指令，SSE 流式响应
- **执行日志**：实时追踪智能体操作记录

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 配置适配器（可选，默认使用 mock 数据）
# 编辑 .env 文件

# 3. 同时启动前后端
npm run dev

# 4. 访问
# 前端: http://localhost:3000
# 后端: http://localhost:3001
```

## 配置说明

编辑 `.env` 文件：

```env
# 适配器类型: mock | http | yonclaw
ADAPTER_TYPE=mock

# 当使用 http/yonclaw 时必填
# AGENT_PLATFORM_URL=http://localhost:8080
# AGENT_PLATFORM_API_KEY=your-api-key
```

| 适配器 | 说明 |
|--------|------|
| `mock` | 默认，本地静态数据，无需外部依赖 |
| `http` | 通过 REST API 对接任意智能体平台 |
| `yonclaw` | 对接 YonClaw / OpenClaw 内核（预留扩展） |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/agents` | 智能体列表 |
| GET | `/api/agents/:id` | 智能体详情 |
| GET | `/api/agents/:id/stats` | 智能体统计 |
| GET | `/api/workspaces` | 驾驶舱列表 |
| GET | `/api/workspaces/:id` | 驾驶舱详情 |
| POST | `/api/workspaces/:id/execute` | 执行指令 |
| POST | `/api/workspaces/:id/chat` | 流式对话（SSE） |

## 技能安装

参见 `skill/` 目录：
- `manifest.json` — 技能描述文件
- `config.schema.json` — 配置项定义
- `README.md` — 安装指南

## 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   浏览器     │────→│  前端(Vite)  │────→│ 后端(Express) │────→│   适配器     │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                     │
                    ┌─────────────┐     ┌─────────────┐             │
                    │  Mock(默认)  │     │  HTTP 代理   │←──────────┘
                    └─────────────┘     └─────────────┘
                    ┌─────────────┐
                    │ YonClaw(预留)│
                    └─────────────┘
```

## 项目结构

```
app/
├── src/                         # 前端源码
│   ├── api/client.ts            # API 客户端
│   ├── components/
│   │   ├── Sidebar.tsx          # 侧边导航
│   │   ├── HomeView.tsx         # 首页入口
│   │   ├── WorkspaceView.tsx    # 驾驶舱列表
│   │   ├── WorkspaceDetail.tsx  # 驾驶舱详情（含指令面板）
│   │   ├── DynamicCard.tsx      # 动态卡片渲染
│   │   └── ui/                  # shadcn/ui 组件
│   ├── hooks/useApiData.ts      # 数据获取 Hooks
│   ├── types/index.ts           # 类型定义
│   └── App.tsx                  # 根组件
├── server/src/                  # 后端源码
│   ├── index.ts                 # Express 入口
│   ├── adapters/                # 智能体平台适配器
│   │   ├── types.ts             # 适配器接口
│   │   ├── mock.ts              # 本地模拟适配器
│   │   ├── http.ts              # 通用 HTTP 适配器
│   │   ├── yonclaw.ts           # YonClaw 适配器
│   │   └── index.ts             # 适配器工厂
│   ├── routes/
│   │   ├── agents.ts            # 智能体路由
│   │   └── workspaces.ts        # 驾驶舱路由（含 execute/chat）
│   └── data/                    # 模拟数据
├── skill/                       # 技能安装文件
│   ├── manifest.json
│   ├── config.schema.json
│   └── README.md
├── .env                         # 环境变量配置
└── package.json
```
