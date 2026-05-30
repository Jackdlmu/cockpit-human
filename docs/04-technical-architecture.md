# YonCockpit 技术架构说明

更新时间：2026-05-29

本文面向工程重建与后续演进，重点说明当前系统的代码结构、运行结构、数据流和关键技术决策。

## 1. 技术总览

当前项目是一个前后端同仓的 TypeScript 工程。

### 前端

- Vite
- React 19
- TypeScript
- React Router
- Tailwind CSS
- shadcn/ui 组件子集
- Sonner toast
- react-grid-layout

### 后端

- Node.js + Express
- TypeScript
- 原生 `fetch`
- WebSocket (`ws`)
- 文件型 JSON 存储

### 测试

- Vitest
- Testing Library
- Supertest
- Playwright
- MSW

## 2. 仓库结构

关键目录：

- `src/`：前端源码
- `server/src/`：后端源码
- `server/data/`：模板、连接、工作区等持久化数据
- `e2e/`：Playwright 测试
- `skill/`：skill/插件清单
- `design/`：设计文档

### 2.1 前端结构

主要分层：

- `src/api/`：前端 API 封装
- `src/components/`：视图组件
- `src/components/layout/`：布局组件
- `src/components/ui/`：通用 UI 组件
- `src/hooks/`：数据与 UI hooks
- `src/contexts/`：上下文
- `src/lib/`：工具与推断逻辑
- `src/pages/`：模板管理独立页面
- `src/types/`：前端领域模型

### 2.2 后端结构

主要分层：

- `server/src/app.ts`：Express 组装
- `server/src/index.ts`：启动入口
- `server/src/routes/`：HTTP 路由
- `server/src/adapters/`：旧式平台适配器层
- `server/src/agent/`：CockpitAgent 相关逻辑
- `server/src/connection/`：新式连接器与连接管理层
- `server/src/services/`：编排、事件、模板存储、Widget 数据等服务
- `server/src/data/`：工作区/示例数据存储层

## 3. 启动流程

启动入口：

- [server/src/index.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/index.ts:1)

启动顺序：

1. 创建 Express app
2. 创建 HTTP server
3. 加载内置模板与自定义模板
4. 初始化 `connectionManager`
5. 启动连接健康检查
6. 初始化 `AgentRouter`
7. 启动智能体发现自动刷新
8. 初始化 `CockpitAgent`
9. 初始化 `MetaAgent`
10. 初始化 `CockpitOrchestrator`
11. 启动 orchestration 自动检查
12. 构建全部 workspace context
13. 创建 WebSocket 事件服务 `/api/events`

这说明当前系统不是“纯请求响应式 API”，而是带有运行时后台服务的应用。

## 4. 领域模型

前端模型定义位于：

- [src/types/index.ts](/Users/jiang/Documents/GitHub/cockpit-human/src/types/index.ts:1)

后端连接模型定义位于：

- [server/src/connection/types.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/connection/types.ts:1)

### 4.1 Workspace

核心字段：

- 基本信息：`id`、`name`、`description`、`icon`、`color`
- 运行状态：`status`
- 智能体信息：`agentIds`、`primaryAgentId`、`agentMode`、`agentBindings`
- 组件信息：`widgets`
- 编排状态：`orchestration`
- fallback 策略：`useDemoDataFallback`

### 4.2 Widget

核心字段：

- `id`
- `type`
- `title`
- `position`
- `data`
- `dataSource`
- `detail`
- `link`

### 4.3 Connection

连接定义包含：

- `id`
- `name`
- `type`
- `config`
- `status`
- `capabilities`
- `priority`
- `enabled`

### 4.4 Template

模板定义包含：

- 领域标识
- 匹配关键词
- 初始图标/颜色
- 预置智能体
- 预置 widgets
- 初始化提示词

## 5. 后端架构分层

## 5.1 旧适配器层

位于 `server/src/adapters/`。

职责：

- 提供 `getAgents / getWorkspaces / chat` 风格的统一访问接口
- 根据环境变量在 mock、http、yonclaw 之间切换

意义：

- 这是最早期的接口抽象，偏“平台 API 代理”

## 5.2 新连接器层

位于 `server/src/connection/`。

职责：

- 统一管理外部连接
- 声明连接能力
- 负责健康检查
- 负责连接生命周期
- 为 AgentRouter/Orchestrator/MetaAgent 提供能力基础

当前支持连接类型：

- `generic-llm`
- `yonclaw`
- `openclaw`
- `hermes`

这层是系统从“mock API”向“真实多平台集成”演进的关键。

## 5.3 Agent 层

核心：

- [server/src/agent/cockpit-agent.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/agent/cockpit-agent.ts:1)

当前职责：

- 意图识别
- 多意图融合
- 规则与 LLM 混合规划
- 子任务执行
- 对话与创建流程统一入口

### 处理链路

1. 识别用户意图
2. 构建任务计划
3. 选择执行连接或本地逻辑
4. 执行任务
5. 聚合响应
6. 以 SSE 形式返回前端

## 5.4 编排层

核心：

- [server/src/services/orchestrator.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/orchestrator.ts:1)

职责：

- 根据连接状态和 LLM 健康状态评估 workspace
- 计算 `platform-led / cockpit-led / llm-direct`
- 缓存和持久化 orchestration state
- 在状态变化时发布事件

## 5.5 数据层

当前主要是 JSON 文件型存储。

### 工作区存储

- [server/src/data/workspaceStore.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/data/workspaceStore.ts:1)

特点：

- 内存缓存
- 原子写入
- `.bak` 备份恢复
- 最多 30 个 workspace

### 模板存储

- [server/src/services/template-store.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/template-store.ts:1)

特点：

- 内置模板与自定义模板分离
- 支持自定义覆盖内置模板
- 支持删除内置模板的“标记删除”

### 连接存储

- [server/src/connection/store.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/connection/store.ts:1)

特点：

- 也是 JSON 文件型
- 支持 CRUD 和内存缓存

## 6. API 架构

入口装配：

- [server/src/app.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/app.ts:1)

主要 API 分组：

### 6.1 基础接口

- `GET /api/health`

### 6.2 驾驶舱接口

- `GET /api/workspaces`
- `GET /api/workspaces/:id`
- `POST /api/workspaces`
- `PUT /api/workspaces/:id`
- `DELETE /api/workspaces/:id`
- `GET /api/workspaces/:id/orchestration`
- `POST /api/workspaces/:id/chat`

### 6.3 智能体接口

- `GET /api/agents`
- `GET /api/agents/:id`
- `GET /api/agents/:id/stats`
- `POST /api/agent/chat`

### 6.4 连接接口

- `GET /api/connections`
- `POST /api/connections`
- `GET /api/connections/:id`
- `PUT /api/connections/:id`
- `DELETE /api/connections/:id`
- `POST /api/connections/test`
- `POST /api/connections/:id/test`
- `POST /api/connections/:id/connect`
- `POST /api/connections/:id/disconnect`

### 6.5 模板接口

- `GET /api/templates`
- `GET /api/templates/:id`
- `POST /api/templates/:id/create-cockpit`
- `POST /api/templates`
- `PUT /api/templates/:id`
- `DELETE /api/templates/:id`

### 6.6 Widget 数据接口

- `GET /api/workspaces/:id/widgets/:widgetId/data`
- `POST /api/workspaces/:id/widgets/:widgetId/data`

### 6.7 Meta-Agent 接口

- `GET /api/meta-agent`
- `GET /api/meta-agent/tools`
- `POST /api/meta-agent/invoke`
- `POST /api/meta-agent/tools/:name`

## 7. 实时通道架构

系统同时使用两种实时机制：

### 7.1 SSE

用途：

- 驾驶舱聊天
- CockpitAgent 智能对话

特点：

- 单次请求内的流式文本返回
- 适合“对话式过程输出”

### 7.2 WebSocket

用途：

- 全局事件流
- 连接和编排状态广播
- workspace 初始化事件

特点：

- 长连接
- 适合“系统事件广播”

## 8. Widget 数据管道

核心：

- [server/src/services/widget-data.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/widget-data.ts:1)
- [src/hooks/useWidgetData.ts](/Users/jiang/Documents/GitHub/cockpit-human/src/hooks/useWidgetData.ts:1)

处理策略：

- `static`：直接读本地静态数据
- `skill`：走 AgentRouter/agent invoke
- `query`：走 cockpit-execute 或 query 代理
- `event`：当前仅返回初始数据，实时更新未完全闭环

transform 机制：

- 当前仅支持简化 JSONPath
- 已移除 `new Function` 代码执行路径

## 9. 前端状态与数据流

### 数据获取 hooks

- `useAgents`
- `useAgentDetail`
- `useWorkspaces`
- `useWorkspaceDetail`
- `useConnections`
- `useWidgetData`
- `useEventStream`

### UI 状态 hooks

- `useLayoutSettings`
- `useThresholdColor`
- `WidgetInteractionContext`

### 当前数据流特征

- 大量状态仍由局部 `useState` 驱动
- 数据刷新多通过手动 `refresh()` 完成
- 事件流与 REST 仍是“并行存在”，还没有统一成单一状态源

## 10. 架构优势

1. Mock-first，本地可演示
2. 前后端边界清楚
3. 领域模型已经成型
4. 已抽象出连接器、编排器、Meta-Agent 等高价值能力
5. 驾驶舱既能本地运行，也能向外部平台暴露

## 11. 当前架构短板

1. 存储仍是文件型，适合 demo，不适合多人并发
2. 一些旧适配器层和新连接器层并存，边界尚未完全统一
3. 前端详情页职责过重
4. 鉴权、权限、租户能力基本没有真正成型
5. 部分后端类型导入和编译完整性存在缺口

## 12. 从零重建的推荐技术路线

### 第一阶段：最小可运行骨架

- React + Vite 前端壳
- Express 后端壳
- `Workspace` / `Widget` / `Template` / `Connection` 四个基础模型
- mock adapter

### 第二阶段：主业务闭环

- 驾驶舱列表页
- 驾驶舱详情页
- 组件网格
- 基础聊天
- 工作区 JSON 存储

### 第三阶段：智能化能力

- CockpitAgent
- 模板系统
- 自然语言创建
- LLM 初始化

### 第四阶段：平台化能力

- 连接管理
- AgentRouter
- Orchestrator
- EventBus + WebSocket
- Widget 数据管道
- Meta-Agent

### 第五阶段：工程化补强

- 真正的鉴权
- 更完整的测试
- 编译和 lint 门禁
- 存储升级
- 详情页模块拆分
