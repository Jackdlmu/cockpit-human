# YonCockpit 稳定性与持久化评估

更新时间：2026-05-30

本文聚焦两个目标：

- 评估当前系统的稳定性与持久化机制是否足以支撑后续演进
- 为后续集成到 YonClaw、进入商业分发阶段提供架构准备建议

## 1. 结论摘要

当前系统已经具备较好的本地演示、单机开发和小范围内部试用能力，但还不适合直接进入面向外部客户的商业分发阶段。

原因不是“功能不可用”，而是底层仍然偏向单机 MVP：

- 持久化以本地 JSON 文件为主
- 运行态状态大量保存在进程内存
- 初始化任务没有持久化队列与崩溃恢复
- 管理能力缺少真正的鉴权、审计和租户隔离

因此，当前架构更适合：

- 本地开发
- 产品验证
- 单节点内部试点

还不适合直接承担：

- 多租户商业化分发
- 多实例部署
- 高可靠 SaaS
- 与 YonClaw 深度一体化后的企业级运营场景

## 2. 当前持久化机制现状

### 2.1 Workspace 存储

当前工作区持久化在 [server/src/data/workspaceStore.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/data/workspaceStore.ts:1)。

优点：

- 使用内存缓存 `storeCache`
- 使用串行写队列 `writeQueue`
- 写入采用临时文件 + 原子重命名
- 有 `workspaces.json.bak` 备份恢复机制

这说明 `workspaceStore` 已经具备“单机文件存储中的较成熟实现”，在当前所有 JSON 存储里是最稳的一层。

但它的边界也很明确：

- 仍然是单文件存储
- 仍然默认单进程访问
- 不适合多实例并发写入
- 不具备数据库级别的事务、索引和查询能力

### 2.2 Template 存储

模板存储位于 [server/src/services/template-store.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/template-store.ts:1)。

当前机制：

- 内置模板：`server/data/builtin-templates.json`
- 自定义模板：`server/data/templates.json`
- 内存缓存 + 临时文件写入 + 原子重命名

主要问题：

- 没有写队列，存在并发覆盖风险
- 没有备份恢复机制
- 没有版本化或迁移机制
- 缓存和注册表重载依赖调用方显式触发，容易出现状态漂移

### 2.3 Connection 存储

连接存储位于 [server/src/connection/store.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/connection/store.ts:1)。

当前机制：

- 本地 JSON 文件 `server/data/connections.json`
- 内存缓存 + 临时文件写入

主要问题：

- 没有写队列
- 没有备份恢复
- 没有密钥加密
- 连接配置和密钥混存在同一持久化对象里

这是当前最敏感的一层，因为它直接关联平台连接、LLM Key、外部智能体接入和后续商业化安全合规。

### 2.4 Widget Catalog 存储

组件目录存储位于 [server/src/services/widget-catalog-store.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/widget-catalog-store.ts:1)。

当前机制同样是：

- 内置组件定义在代码中
- 自定义组件落本地 JSON
- 使用简单缓存和原子写入

问题与模板存储类似：

- 缺乏并发保护
- 缺乏恢复机制
- 缺乏版本演进策略
- 更适合作为开发期目录，不适合作为正式的组件平台底座

### 2.5 运行态状态

除了文件存储外，还有大量关键状态只存在内存中：

- `CockpitAgent.sessionCache` 位于 [server/src/agent/cockpit-agent.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/agent/cockpit-agent.ts:26)
- `EventBus.history` 位于 [server/src/services/event-bus.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/event-bus.ts:20)
- `ConnectionManager` 中的连接器实例和订阅关系位于连接管理层

这类状态的共同问题是：

- 服务重启即丢失
- 无法跨实例共享
- 无法做可靠恢复
- 难以满足企业级审计与追踪需求

## 3. 当前稳定性评估

## 3.1 已经具备的稳定性基础

从当前实现看，系统已经不是“纯前端 Demo”，而是一个具备后端生命周期、事件流和初始化机制的真实应用。

已经具备的正向基础包括：

- 工作区有相对稳健的文件持久化实现
- 创建驾驶舱后会触发统一的初始化生命周期
- 模板、组件、连接已经抽象成独立领域对象
- 事件流、连接器、AgentRouter、Orchestrator 已形成基本架构骨架

这说明当前代码非常适合继续演进，而不是推倒重来。

## 3.2 当前稳定性上限

当前架构的稳定性上限，大致可以定义为：

- 单节点
- 单环境
- 低并发
- 弱权限边界
- 可接受人工介入恢复

换句话说，当前更像“产品化的 PoC / 内部试点版”，还不是“可商业分发的正式后端平台”。

## 3.3 创建与初始化链路的稳定性短板

工作区初始化入口位于 [server/src/services/workspace-initializer.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/workspace-initializer.ts:656)。

当前模式是：

- API 或 Agent 创建工作区
- 立即写入 Workspace
- 通过 `startWorkspaceInitialization()` 异步启动初始化
- 初始化过程通过事件通知前端

这条链路的问题在于：

- 初始化任务没有持久化 job 记录
- 没有正式的重试策略
- 没有服务重启后的任务恢复
- 没有幂等保障与状态机约束

因此，一旦进程在初始化中途退出，系统可能出现：

- 工作区已经创建
- 组件尚未填充
- 数据状态未知
- 前端只能看到半成品结果

对于商业场景，这会直接影响用户对“智能驾驶舱是否可靠”的判断。

## 4. 面向商业分发的关键风险

以下风险中，前 4 项建议按“阻断级”处理。

### 4.1 明文密钥存储

当前 `server/data/connections.json` 中存在明文 API Key。

这是最高优先级风险，因为它同时涉及：

- 安全泄露
- 商业化合规
- 客户信任
- Git 仓库误提交风险

这类问题在进入 YonClaw 集成或客户环境前必须立即处理，至少应完成：

- 现有密钥立刻轮换
- 停止将真实密钥保存在本地 JSON 明文中
- 改为密钥引用、环境变量或密钥管理服务

### 4.2 管理接口缺少真正鉴权

模板和组件管理路由中的 `adminGuard` 当前是空实现，位于：

- [server/src/routes/templates.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/routes/templates.ts:13)
- [server/src/routes/widget-catalog.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/routes/widget-catalog.ts:11)

当前效果等同于：

- 任何可访问服务的人都可能修改模板
- 任何可访问服务的人都可能修改组件目录

这在本地开发阶段可以接受，但在商业分发中不可接受。

### 4.3 缺乏租户隔离

当前系统还没有真正的租户模型。

表现为：

- Workspace 没有正式的 tenant / organization / project 作用域
- 模板、组件、连接是全局共享概念
- 路由层没有按租户边界隔离读写

这意味着当前系统不适合直接做：

- 多客户分发
- SaaS 托管
- 多部门共享部署
- YonClaw 平台内多组织接入

### 4.4 初始化与执行状态不持久

驾驶舱创建后的初始化、数据获取、组件填充，本质上已经属于后台作业。

但当前没有：

- `jobs` 表或等价持久化结构
- 状态机
- 重试与死信
- 补偿逻辑
- 重启恢复

这会成为后续稳定性的核心瓶颈。

### 4.5 单机文件存储不适合多实例部署

当前 JSON 存储的默认前提是：

- 同一台机器
- 同一个进程主写

一旦进入商业部署，常见形态会变成：

- 多实例部署
- 滚动发布
- 容器重建
- 挂载卷或云原生存储

这时基于本地 JSON + 内存缓存的方案会非常脆弱。

### 4.6 读写路径存在潜在“双数据源”风险

`/api/workspaces` 列表和详情读取当前经由 `req.adapter.getWorkspaces/getWorkspace`，而更新和删除走 `workspaceStore`，位于 [server/src/routes/workspaces.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/routes/workspaces.ts:19)。

这意味着：

- 读路径和写路径不完全统一
- 如果 adapter 行为与 `workspaceStore` 脱节，就可能出现状态不一致

对于商业版，工作区必须只有一个权威数据源。

### 4.7 事件与会话缓存不可恢复

当前事件总线历史只保存在内存，最多 500 条，位于 [server/src/services/event-bus.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/event-bus.ts:20)。

同时，会话级 planning 缓存也只保存在内存。

这会导致：

- 重启后无法追踪最近事件
- 无法回溯初始化过程
- 无法支持更可靠的跨端状态恢复

### 4.8 启动流程是“尽力而为”模式

当前启动入口位于 [server/src/index.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/index.ts:1)。

现状是：

- HTTP 服务开始监听
- 连接初始化、模板加载、ContextBuilder、Orchestrator 等继续异步初始化

这会造成一个窗口期：

- 服务端口可访问
- 但部分后台能力可能还没准备好

在本地问题不大，在生产环境会带来偶发“刚启动就失败”的问题。

## 5. 对 YonClaw 集成的影响

你后续希望将智能驾驶舱深度集成进 YonClaw，这意味着它将不再只是一个独立工具，而更像一个平台内能力模块。

在这个目标下，当前系统至少需要满足四类要求：

### 5.1 身份与租户继承

驾驶舱应能继承 YonClaw 提供的：

- 用户身份
- 组织信息
- 权限角色
- 可访问智能体范围

当前这部分几乎还没有正式落地。

### 5.2 连接与密钥治理

未来更理想的模式不是“驾驶舱自己保管所有密钥”，而是：

- YonClaw 或平台侧统一管理密钥
- 驾驶舱只保留连接引用和能力声明
- 敏感信息通过安全通道注入

### 5.3 事件与任务协同

驾驶舱创建、组件填充、数据刷新，本质上都是任务。

如果 YonClaw 已经具备更成熟的任务编排和事件能力，驾驶舱应该优先对接这些平台能力，而不是继续依赖纯内存事件和本地异步流程。

### 5.4 分发与升级能力

商业分发要求：

- 可迁移
- 可升级
- 可回滚
- 可审计

本地 JSON 存储可以作为“嵌入版”方案保留，但不应继续作为“商业服务版”的主存储底座。

## 6. 建议的目标架构

建议将后续架构明确拆成两条产品线思路。

### 6.1 嵌入版 / 轻量版

适用场景：

- 本地部署
- 单租户
- 内部试点
- 与 YonClaw 一体化部署但不追求多实例

建议方案：

- `workspace/template/widget` 可保留文件存储或升级到 SQLite
- 连接密钥不落盘明文
- 初始化任务至少持久化到本地 DB
- 管理接口加上最基本权限控制

### 6.2 商业服务版

适用场景：

- 多客户分发
- SaaS
- 企业正式环境
- 多实例部署

建议方案：

- 主数据存储迁移到 PostgreSQL
- 事件/缓存/任务协调使用 Redis
- 密钥使用 Secret Manager 或平台密钥中心
- 对象型大文件或附件使用对象存储
- 通过数据库迁移机制管理模板、组件、工作区结构演进

## 7. 建议的数据域拆分

为了后续演进稳定，建议把数据从“按文件分散存储”升级为“按领域建模”：

### 7.1 基础主数据

- `tenants`
- `users`
- `roles`
- `projects` 或 `organizations`

### 7.2 驾驶舱主数据

- `workspaces`
- `workspace_widgets`
- `workspace_agent_bindings`
- `workspace_filters`

### 7.3 模板与组件知识库

- `templates`
- `template_widgets`
- `components`
- `component_versions`
- `template_component_refs`

### 7.4 连接与密钥

- `connections`
- `connection_capabilities`
- `secret_refs`

注意：

- `secret_refs` 只保存密钥引用，不保存真实明文

### 7.5 运行态与审计

- `workspace_jobs`
- `job_attempts`
- `event_logs`
- `operation_audits`

这部分是后续“可恢复、可追踪、可审计”的基础。

## 8. 分阶段改造路线图

## 8.1 P0：立即加固

目标：先把明显不安全、不稳定的问题压下去，但不破坏当前可用性。

建议优先处理：

1. 立即轮换并移除本地明文 API Key
2. 为模板管理和组件管理补上真实鉴权
3. 统一 `.gitignore` 与运行态文件管理，避免敏感数据误提交
4. 给连接、模板、组件存储补齐最基础的备份恢复与串行写保护
5. 给启动流程增加 readiness 概念，避免未初始化完成就对外服务

## 8.2 P1：单节点生产可用版

目标：支撑单租户、单节点、正式内部分发。

建议处理：

1. 引入统一存储抽象，减少各处直接读写 JSON
2. 将初始化任务持久化，建立基本 job 状态机
3. 为初始化失败加入重试与恢复入口
4. 统一工作区读写数据源，去掉潜在双数据源路径
5. 建立结构化日志和关键审计日志

这一阶段可以优先考虑 SQLite，而不是一步到位上 PostgreSQL。

## 8.3 P2：商业分发版

目标：为多租户、客户交付、YonClaw 平台集成做好基础设施准备。

建议处理：

1. 引入正式 tenant / organization / user / role 模型
2. 将主存储迁移到 PostgreSQL
3. 将事件、任务协同迁移到 Redis 或平台任务系统
4. 将密钥迁移到 Secret Manager
5. 增加版本迁移、备份恢复、回滚机制
6. 增加操作审计、模板/组件变更审计

## 8.4 P3：YonClaw 深度集成版

目标：让智能驾驶舱成为 YonClaw 的一体化能力，而不是外接小工具。

建议处理：

1. 继承 YonClaw 的身份、组织和权限体系
2. 复用 YonClaw 的智能体注册、发现和调用协议
3. 复用 YonClaw 的任务编排与事件分发能力
4. 将驾驶舱的创建、调整、刷新抽象成平台级能力接口
5. 驾驶舱只负责领域建模、布局渲染和状态组织，不重复建设平台通用底座

## 9. 推荐判断

如果以“是否可以立即商业化分发”为标准，当前答案是：

- 不建议直接进入商业分发

如果以“是否值得继续在当前代码基础上演进”为标准，当前答案是：

- 很值得，且不需要推翻重做

更准确地说，当前系统已经有了不错的产品与架构骨架，但现在最需要的不是继续堆功能，而是完成一次“底座加固”。

## 10. 建议的近期执行顺序

如果你接下来希望边保持当前系统可用，边为 YonClaw 商业集成做准备，我建议按这个顺序推进：

1. 先处理安全问题：明文密钥、管理鉴权、运行态文件治理
2. 再处理稳定性问题：初始化任务持久化、统一工作区读写、启动 readiness
3. 然后处理商业化底座：租户模型、审计、密钥治理、数据库迁移
4. 最后处理 YonClaw 深度集成：身份继承、事件协同、平台级能力抽象

这样推进的好处是：

- 不会打断当前已基本可用的系统
- 能逐步降低未来重构成本
- 能为商业分发建立真正可靠的后端底座
