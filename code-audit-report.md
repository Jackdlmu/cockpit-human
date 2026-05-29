# YonCockpit 系统质量审核报告

> 审核日期：2026-05-27
> 审核范围：前端 (Vite + React + TypeScript) + 后端 (Express + TypeScript)
> 审核角色：代码审核专家 / 测试专家 / 用户体验专家
> 当前系统状态：可用，核心流程正确

---

## 一、执行摘要

| 维度 | 评分 (1-10) | 风险等级 |
|------|------------|---------|
| 代码架构 | 5.5 | 🟡 中 |
| 代码质量 | 4.0 | 🔴 高 |
| 类型安全 | 3.5 | 🔴 高 |
| 测试覆盖 | 1.0 | 🔴 极高 |
| 健壮性/容错 | 5.0 | 🟡 中 |
| 用户体验 | 7.0 | 🟢 低 |
| 美观度 | 7.5 | 🟢 低 |
| 性能 | 6.0 | 🟡 中 |

**总体评分：5.0 / 10** — 系统可用，但距离生产发布标准有显著差距。

**最关键的5个阻塞项（必须修复后才能发布）：**
1. **SSRF + 任意代码执行** — 代理路由可访问内网，`new Function` 执行用户输入代码
2. **零测试覆盖** — 无任何单元/集成/E2E测试，每次改动都是"盲改"
3. **类型安全崩溃** — 435个 `any` 类型 + 6个 Hook 依赖警告，编译器形同虚设
4. **零错误边界** — 单个 Widget 数据异常即可导致整站白屏
5. **硬编码管理员密钥** — `ADMIN_KEY` 默认值为 `'yoncockpit-admin'`，未设置环境变量时任何人可访问管理API

---

## 二、代码审核专家 — 发现与建议

### 🔴 CRITICAL（阻塞发布）

#### CR-1: 单文件巨兽 `WorkspaceDetail.tsx` — 1,480 行
- **位置**：`src/components/WorkspaceDetail.tsx`
- **问题**：一个组件同时管理：聊天状态、localStorage持久化、智能体选择、标题编辑、画布编辑、Widget库、布局保存、编排UI，以及内联定义了 `WidgetRenderer`、`WidgetContent`、`EmptyWidgetState`、`extractHtmlPreview`、`findEmptyPosition` 等6个函数/组件。
- **风险**：任何一处改动都可能影响其他功能；代码审查几乎不可能；新人上手成本极高。
- **建议**：
  - 提取 `WidgetRenderer.tsx` / `WidgetContent.tsx`
  - 提取 `useWorkspaceChat.ts` Hook
  - 提取 `AgentPicker.tsx` / `EditableTitle.tsx`
  - **目标**：单文件 < 300 行

#### CR-2: 嵌套函数阴影 Bug (`getAgentRole`)
- **位置**：`src/components/WorkspaceDetail.tsx:384–403`
- **问题**：
  ```tsx
  const getAgentRole = () => {
    if (!workspace.orchestration) {
      const getAgentRole = () => { ... }; // 阴影！外层函数被遮蔽
      return getAgentRole();
    }
    ...
  };
  ```
- **风险**：逻辑极度晦涩，每次渲染重复定义函数，闭包陷阱。
- **建议**：提取为模块级纯函数：
  ```tsx
  function getAgentRole(agentId: string, workspace: Workspace): 'primary' | 'collaborator' { ... }
  ```

#### CR-3: 全局 `any` 污染 — 435 处
- **位置**：遍布 `src/` 和 `server/src/`
- **问题**：`npm run lint` 报告 **441 个问题**（435 errors + 6 warnings）。其中 `any` 类型占据绝大多数，集中在：
  - `TemplateManager.tsx` — 30+ 处
  - `WorkspaceDetail.tsx` — 大量内联函数参数
  - `widget-type-inferer.ts` — 8 处
  - `main.tsx` — 1 处
  - 后端路由参数 `(req: any)` — 多处
- **风险**：类型系统完全失效；重构极其危险；运行时错误无法在编译期捕获。
- **建议**：
  - 短期：将最危险的 `any`（API 响应、路由参数、状态更新）替换为具体类型
  - 中期：启用 `strict` 模式（当前 `tsconfig` 未启用 `strict: true`）
  - 长期：建立类型检查 CI 门禁，禁止新增 `any`

#### CR-4: 后端数据持久化 — 无并发锁 + 静默数据丢失
- **位置**：`server/src/data/workspaceStore.ts`
- **问题**：
  1. `writeStore` 是同步的，但 `createWorkspace` / `updateWorkspace` / `deleteWorkspace` 标记为 `async`。虽然有内存缓存 `storeCache`，但**没有文件锁或事务机制**。两个并发请求同时修改 workspace 时，后写入的请求会覆盖前一个，导致数据丢失。
  2. **`JSON.parse` 失败时永久丢弃数据**：`ensureStore` 中 `JSON.parse` 失败后返回 `{ workspaces: [] }`，用户的所有数据被静默清空。
  3. **Workspace ID 使用 `Math.random()`**：`id: \`ws-${Date.now()}-${Math.random().toString(36).slice(2, 5)}\`` 不是密码学安全的，高负载下有碰撞风险。
- **建议**：
  - 添加写入队列（单文件串行化写入）或文件级锁
  - JSON parse 失败时读取 `.bak` 备份文件，而非返回空数据
  - 使用 `crypto.randomUUID()` 生成 ID

#### CR-5: SSRF 漏洞 — 代理路由可访问内网
- **位置**：`server/src/routes/connections.ts:129–171`
- **问题**：`/:id/proxy` 路由将任意 HTTP 请求转发到外部端点，**没有 URL 校验、没有方法白名单、没有 IP 过滤**。攻击者可利用此路由访问 `localhost`、`169.254.x.x`（云元数据端点）、`10.x.x.x`（内网）等。
- **风险**：内网扫描、访问云实例元数据（获取 IAM 凭证）、攻击内部服务。
- **建议**：
  - 禁止访问私有 IP 段（127.0.0.0/8、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、169.254.0.0/16）
  - 禁止 `file://` 协议
  - 仅允许白名单内的目标主机

#### CR-6: 任意代码执行 — `new Function()` 执行用户输入
- **位置**：`server/src/services/transform.ts:41–67`
- **问题**：`evalArrowFunction` 使用 `new Function()` 执行用户提供的 transform 字符串。尽管有正则检查，但可通过 Unicode 转义、原型污染等方式绕过。
- **风险**：攻击者可在服务器上执行任意 JavaScript 代码，获取文件系统访问权限、环境变量、网络请求能力。
- **建议**：**立即移除 `new Function()`**。改用沙箱表达式解析器（如 `jexl`、`jsonata`）或受限 AST 执行器。

#### CR-7: 硬编码管理员密钥
- **位置**：`server/src/routes/templates.ts:12`
- **问题**：`ADMIN_KEY = process.env.ADMIN_KEY || 'yoncockpit-admin'`。如果环境变量未设置，任何人使用 header `X-Admin-Key: yoncockpit-admin` 即可访问所有管理员 API。
- **建议**：移除默认值；如果环境变量未设置，启动时直接报错退出。

#### CR-8: AbortController 实例属性被并发请求覆盖
- **位置**：`server/src/connection/connectors/base.ts:25–53`
- **问题**：`fetchJson` 将 `AbortController` 存储在 `this.abortController` 实例属性中。如果同一个 connector 实例上并发两个请求，第二个请求会**覆盖第一个请求的 controller**，导致：
  1. 第一个请求无法被取消
  2. 第一个请求的 timeout `setTimeout` 泄漏（永远不会被清理）
- **建议**：使用局部变量传递 `AbortController`，不要作为实例属性存储。

### 🟠 HIGH（强烈建议修复）

#### HI-1: 零 Error Boundary
- **位置**：整个前端
- **问题**：任何 Widget 渲染异常（如 `displayData` 结构不符合预期）会直接 unmount 整个 React 树，用户看到白屏。
- **建议**：
  - 顶层 `AppErrorBoundary`
  - CanvasGrid 中每个 Widget 包裹 `ErrorBoundary`，单个 Widget 崩溃不影响其他

#### HI-2: `WorkspaceDetail.tsx` 中的 `dangerouslySetInnerHTML` 未消毒
- **位置**：`src/components/WorkspaceDetail.tsx:1206`
- **问题**：
  ```tsx
  const bolded = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return <p dangerouslySetInnerHTML={{ __html: bolded }} />;
  ```
- **风险**：如果 LLM 返回的内容中包含 `<script>` 或其他恶意 HTML，将导致 XSS。
- **建议**：使用 `DOMPurify` 消毒，或改用 `react-markdown`。

#### HI-3: 前端没有 ARIA 标签
- **位置**：`WorkspaceDetail.tsx`、`CanvasGrid.tsx`、`TabBar.tsx` 等
- **问题**：数十个纯图标按钮没有 `aria-label`，屏幕阅读器用户无法理解功能。
- **建议**：为所有 `button` 添加 `aria-label`。

#### HI-4: Agent Picker 不可键盘操作
- **位置**：`src/components/WorkspaceDetail.tsx:643–725`
- **问题**：自定义下拉菜单不支持 Enter/Space 打开、Esc 关闭、方向键导航、焦点陷阱。
- **建议**：使用已有的 `@radix-ui/react-select`（已在 `ui/select.tsx` 中）替换手写的 dropdown。

#### HI-5: `saveTimeoutRef` 内存泄漏 + 静默失败
- **位置**：`src/components/WorkspaceDetail.tsx:124–129`
- **问题**：
  1. 组件卸载时未清理 `saveTimeoutRef` 的定时器
  2. `.catch(() => {})` 静默吞掉网络错误
- **建议**：
  ```tsx
  useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);
  // 将 .catch(() => {}) 改为 .catch(() => toast.error('自动保存失败'))
  ```

#### HI-6: `App.tsx` — `workspaces` 被 `deleteConfirmName` 提前引用
- **位置**：`src/App.tsx:51`
- **问题**：`const deleteConfirmName = workspaces.find(...)` 在 `workspaces` 声明之前使用（已通过将 `deleteConfirmName` 移到 `useWorkspaces` 之后修复）。
- **风险**：类似问题可能在其他临时变量中出现，需要建立 `const` 声明顺序规范。

#### HI-7: 后端 `express.json()` 无请求体大小限制
- **位置**：`server/src/index.ts:77`
- **问题**：`app.use(express.json())` 没有设置 `limit`，恶意大请求可导致内存耗尽。
- **建议**：`app.use(express.json({ limit: '1mb' }))`

#### HI-8a: `fetchJson` header merge bug — 自定义 headers 会覆盖 Content-Type
- **位置**：`src/api/client.ts:6–16`
- **问题**：
  ```ts
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  ```
  `...options` 在 `headers` 之后展开，调用者传入的 `options.headers` 会**完全覆盖**默认的 `Content-Type`。
- **建议**：显式合并 headers：
  ```ts
  headers: { 'Content-Type': 'application/json', ...options?.headers }
  ```

#### HI-8b: 前端无请求取消机制
- **位置**：`src/api/client.ts:103–164`
- **问题**：`cockpitAgentChatStream` 和 `workspaceCommandStream` 发起的 `fetch` 调用**无法被取消**。如果用户导航离开或关闭弹窗，stream 仍会继续读取并调用回调，对已卸载的组件进行状态更新。
- **建议**：接受 `AbortSignal` 参数并传给 `fetch()`。消费者创建 `AbortController`，在 cleanup 时 abort。

#### HI-8c: 重复 WebSocket 连接
- **位置**：`src/App.tsx:55`、`src/components/SettingsPanel.tsx:29`
- **问题**：`useEventStream()` 在 `App.tsx` 和 `SettingsPanel.tsx` 中各调用一次，打开**两条独立的 WebSocket 连接**到 `/api/events`。
- **建议**：创建单一的 `EventStreamProvider`，在 App 根组件提供，子组件通过 Context 消费。

#### HI-8d: `detailRefreshKey` 强制 remount Hack
- **位置**：`src/App.tsx:46`、`src/App.tsx:330`
- **问题**：通过递增 `detailRefreshKey` 强制 `WorkspaceDetail` 重新挂载，而不是使用正确的数据失效机制。这销毁并重建了整个组件树，导致聊天状态、滚动位置等全部丢失。
- **建议**：暴露 `useWorkspaceDetail` 的 `refresh()` 方法，在匹配当前 workspace 的事件到达时直接调用。

#### HI-8e: `main.tsx` 全局错误监听器永久覆盖 DOM
- **位置**：`src/main.tsx:13–28`
- **问题**：`window.addEventListener('error', ...)` 和 `unhandledrejection` 被注册后永不清理。发生错误时直接覆盖 `rootEl.innerHTML`，销毁整个 React 树，使 HMR/调试极其痛苦。
- **建议**：改为渲染 Error Boundary 组件，而非直接操作 innerHTML。

#### HI-9: 后端全局变量污染 `(globalThis as any)`
- **位置**：`server/src/index.ts:47`、`server/src/routes/workspaces.ts:11`
- **问题**： orchestrator 通过 `globalThis` 暴露，类型为 `any`。
- **建议**：使用依赖注入或请求上下文（`req.orchestrator`）传递。

#### HI-10: 后端错误处理过于粗糙
- **位置**：`server/src/index.ts:105–108`
- **问题**：所有错误统一返回 `500 Internal server error`，不包含具体错误信息或错误码。
- **建议**：区分错误类型（ValidationError / NotFoundError / AuthError），返回结构化错误响应：
  ```json
  { "error": "Workspace not found", "code": "NOT_FOUND", "status": 404 }
  ```

#### HI-11: SSE 流客户端断开后继续执行
- **位置**：`server/src/routes/agent.ts:52`
- **问题**：SSE stream 的 `for await` 循环没有处理 `req.closed` 或 `req.on('close')`。如果客户端断开连接，generator 仍会继续执行，浪费资源。
- **建议**：在 `req.on('close', ...)` 中取消 generator。

#### HI-12: WebSocket / SSE stream reader 泄漏
- **位置**：`server/src/connection/connectors/openclaw.ts:230–277`、`server/src/connection/connectors/yonclaw.ts:218–278`
- **问题**：SSE reader loop 在连接断开后调用 `reader.cancel()`，但 `reader.releaseLock()` 未正确处理，可能导致 ReadableStream 锁泄漏。
- **建议**：使用 `finally` 块确保 reader 和 stream 被正确清理。

#### HI-13: OpenClaw connector 定时器泄漏
- **位置**：`server/src/connection/connectors/openclaw.ts:65–77`
- **问题**：`connectWS()` 创建 `setInterval(check, 100)`，如果连接通过 `confirmTimer` 成功建立，该 interval 永远不会被清除。
- **建议**：在 `confirmTimer` callback 和 `onerror` 中清除 interval。

#### HI-14: Hermes connector 僵尸重连循环
- **位置**：`server/src/connection/connectors/hermes.ts:68–72`
- **问题**：`ws.onclose` 调用 `scheduleReconnect()` 但不检查是否是主动调用 `disconnect()` 导致的关闭。主动断开后仍会自动重连。
- **建议**：添加 `shouldReconnect` flag，在 `disconnect()` 时设为 false。

#### HI-15: 34 个 shadcn/ui 组件未使用
- **位置**：`src/components/ui/`
- **问题**：通过 `npx shadcn add` 批量安装了整套组件库，但只使用了约 5 个（alert-dialog, sheet, sonner, switch 等）。
- **风险**：打包体积膨胀、依赖混乱、升级困难。
- **建议**：删除未使用的 UI 组件及其对应的 npm 依赖。

#### HI-16: `useApiData` hooks 返回不稳定对象引用
- **位置**：`src/hooks/useApiData.ts`
- **问题**：每个 hook 返回 `{ agents, loading, error, refresh }` 但没有 `useMemo`。每次重新渲染都创建新对象引用，导致消费组件不必要的重渲染。
- **建议**：用 `useMemo` 包装返回对象。

#### HI-17: `ADMIN_KEY` 在模块加载时只读一次
- **位置**：`src/api/client.ts:181`
- **问题**：`const ADMIN_KEY = localStorage.getItem('adminKey') || '';` 在模块加载时执行。如果用户在同一会话中 later 设置 admin key，`adminFetch` 仍使用空字符串。
- **建议**：在 `adminFetch` 调用时读取 localStorage。

### 🟡 MEDIUM（建议优化）

#### MD-1: Widget ID 使用 `Date.now()` 可能冲突
- **位置**：`src/components/WorkspaceDetail.tsx:157`
- **问题**：快速连续添加 Widget 时 `Date.now()` 可能相同。
- **建议**：使用 `crypto.randomUUID()`。

#### MD-2: 聊天消息使用 `key={i}`（数组索引）
- **位置**：`src/components/WorkspaceDetail.tsx:579`
- **问题**：消息插入/删除时 React 无法正确复用 DOM。
- **建议**：使用 `msg.timestamp + i` 或添加唯一 message ID。

#### MD-3: 重复的任意 Tailwind shadow 值
- **位置**：多个组件
- **问题**：`shadow-[0_1px_3px_rgba(0,0,0,0.18)]` 等被复制粘贴十余次。
- **建议**：在 `tailwind.config.js` 中定义为 `shadow-card`、`shadow-card-hover`。

#### MD-4: 注释语言不统一
- **位置**：多个文件
- **问题**： section header 用英文 (`// Agent selector`)，业务逻辑用中文 (`// 从 workspace 同步 widgets`)。
- **建议**：统一使用中文（项目默认）或英文。

#### MD-5: `useWorkspaces` 在 `WidgetLibraryPanel` 中被调用
- **位置**：`src/components/WidgetLibraryPanel.tsx:43`
- **问题**：UI 面板直接触发数据获取，耦合度过高。
- **建议**：通过 props 传入 `templates`。

#### MD-6: WebSocket 广播异常隔离不足
- **位置**：`server/src/services/ws-server.ts:126–155`
- **问题**：`broadcast` 遍历客户端发送消息，如果一个客户端的 `ws.send` 抛异常（虽然概率低），当前实现没有捕获。
- **建议**：每个 `ws.send` 包裹 try-catch。

#### MD-7: EventBus 历史事件内存占用
- **位置**：`server/src/services/event-bus.ts`
- **问题**：`maxHistory = 500`，每个事件包含完整 payload，在事件频繁时内存持续增长。
- **建议**：根据事件类型设置不同的保留策略，或限制单条 payload 大小。

### 🟢 LOW（可延后）

#### LO-1: `AgentAvatar.tsx` 未使用导入 `Cpu`, `BrainCircuit`
- **建议**：删除未使用导入。

#### LO-2: `role` prop 与 ARIA `role` 属性冲突
- **建议**：重命名为 `agentRole`。

#### LO-3: iframe `title` 无 fallback
- **建议**：`title={title || 'Widget detail content'}`

---

## 三、测试专家 — 白盒 + 黑盒测试

### 3.1 白盒测试结果

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 单元测试 | ❌ 无 | 0 个测试文件 |
| 集成测试 | ❌ 无 | API 路由无自动化测试 |
| E2E 测试 | ❌ 无 | 无 Playwright / Cypress |
| 类型检查 | ⚠️ 部分 | `tsc --noEmit` 通过（因为 `strict: false`），但 lint 441 个问题 |
| Lint 检查 | ❌ 失败 | `npm run lint` = 441 个问题 |

**关键发现：**
- `useCallback` 依赖缺失警告（`react-hooks/exhaustive-deps`）可能导致闭包过期 bug
- 大量 `any` 类型意味着编译器无法捕获类型错误
- 没有测试意味着每次重构都需要手工回归全部功能

### 3.2 黑盒测试（API 健壮性）

| 测试场景 | 结果 | 风险 |
|----------|------|------|
| 正常 GET /api/workspaces | ✅ 正常 | — |
| GET /api/workspaces/不存在的ID | ⚠️ 未实测 | 可能 500 而非 404 |
| POST /api/workspaces 超大 body | ⚠️ 危险 | `express.json()` 无 limit |
| 并发创建 workspace | ⚠️ 危险 | 文件写入无锁 |
| WebSocket 断线重连 | ✅ 正常 | 客户端有 5 次重连机制 |
| 组件卸载后 WS 重连 | ❌ 风险 | `useEventStream` 的 `onclose` 重连在卸载后仍可能触发 |
| LLM connector 超时 | ⚠️ 部分 | `BaseConnector` 有 timeout，但 SSE 流式响应超时未测试 |

### 3.3 性能测试

| 指标 | 观察值 | 评估 |
|------|--------|------|
| 前端包体积 | 未测量 | `recharts` + 大量 shadcn 组件可能导致首屏 > 1MB |
| 后端内存 | 稳定 | 内存缓存 + WebSocket 连接，5 workspace 约 < 50MB |
| API 响应 | < 100ms | 本地文件读写，无数据库，响应极快 |
| WS 广播 | 即时 | EventBus 同步分发，无队列缓冲 |
| 前端 re-render | ⚠️ 风险 | `WorkspaceDetail.tsx` 1,480 行，任何状态变化触发全量重渲染 |

### 3.4 稳定性测试

| 场景 | 评估 |
|------|------|
| Node.js 进程崩溃 | 数据丢失风险（文件写入是同步的，但崩溃时 `writeStore` 可能只完成了一半） |
| 客户端断网 | WS 重连 5 次后停止，刷新页面可恢复 |
| 后端重启 | 前端需要刷新才能重新建立 WS 连接（无自动重连提示） |
| LLM 服务不可用 | CockpitAgent fallback 到传统模式，但用户无感知提示 |

---

## 四、用户体验专家 — 核心场景操作模拟

### 4.1 场景一：首次进入系统

| 检查项 | 结果 | 问题 |
|--------|------|------|
| 加载速度 | ✅ 快 | Vite HMR，本地 < 500ms |
| 首屏理解 | ✅ 良好 | "智能驾驶舱"标题 + 描述清晰 |
| 空状态引导 | ⚠️ 一般 | 空列表时缺少"创建第一个驾驶舱"的明显引导 |
| 布局模式切换 | ✅ 良好 | sidebar/tabs/cards 三种模式直观 |

### 4.2 场景二：创建驾驶舱

| 检查项 | 结果 | 问题 |
|--------|------|------|
| 模板选择 | ✅ 良好 | 弹窗展示模板列表，有图标和颜色 |
| 创建反馈 | ✅ 良好 | toast 提示 + 自动选中 |
| 创建后列表刷新 | ✅ 已修复 | 最近修复了刷新问题 |
| 创建失败处理 | ⚠️ 一般 | 错误 toast 显示，但没有重试机制 |

### 4.3 场景三：驾驶舱内操作

| 检查项 | 结果 | 问题 |
|--------|------|------|
| Widget 拖拽布局 | ✅ 良好 | react-grid-layout 支持拖拽和调整大小 |
| Widget 数据展示 | ✅ 良好 | 多种类型（metric/chart/table/list 等） |
| 聊天交互 | ⚠️ 一般 | 输入框智能体切换不够明显；历史消息折叠后不够直观 |
| 编辑模式 | ✅ 良好 | Switch 切换编辑，inline 编辑名称和描述 |
| 多智能体显示 | ✅ 已优化 | 最近优化了主智能体/协作智能体的显示逻辑 |

### 4.4 场景四：删除驾驶舱

| 检查项 | 结果 | 问题 |
|--------|------|------|
| 删除确认 | ✅ 良好 | AlertDialog 统一确认弹窗 |
| 删除后状态清理 | ⚠️ 风险 | 删除当前查看的 workspace 后，`selectedWorkspaceId` 未被清理 |
| tabs 模式同步 | ✅ 良好 | 删除后 tab 自动关闭 |

### 4.5 美观度评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 色彩一致性 | 8/10 | Tailwind 自定义主题色，整体协调 |
| 间距/排版 | 7/10 | 整体不错，但部分区域（如聊天消息）间距可以更大 |
| 动画过渡 | 6/10 | 基本过渡有，但缺少加载骨架屏 |
| 暗色模式 | 6/10 | 有 `next-themes` 支持，但部分组件暗色适配不完整 |
| 响应式 | 5/10 | 桌面端优先，小屏幕体验差（驾驶舱卡片网格未适配） |

---

## 五、风险矩阵与优先级

### 5.1 阻塞发布项（P0 — 必须修复）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| P0-1 | **SSRF + 任意代码执行** | 内网渗透、服务器被完全控制 | 2小时 |
| P0-2 | **硬编码管理员密钥** | 任何人可访问管理API | 5分钟 |
| P0-3 | 零测试覆盖 | 每次改动都需全量手工回归 | 2-3天搭建框架 + 持续补充 |
| P0-4 | 435个 `any` 类型 | 类型系统失效，重构极危险 | 1-2天修复核心路径 |
| P0-5 | 零 Error Boundary | 单个 Widget 崩溃 = 整站白屏 | 2小时 |
| P0-6 | 数据持久化无并发锁 + 静默数据丢失 | 并发写覆盖、JSON损坏后数据全丢 | 4小时 |

### 5.2 高优先级（P1 — 强烈建议发布前修复）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| P1-1 | `WorkspaceDetail.tsx` 1,480 行 | 维护成本极高，bug 温床 | 1天拆分 |
| P1-2 | `dangerouslySetInnerHTML` 未消毒 | XSS 风险 | 30分钟 |
| P1-3 | 数据持久化无并发锁 | 并发写导致数据丢失 | 2小时 |
| P1-4 | 后端错误处理粗糙 | 用户无法获知真实错误原因 | 3小时 |
| P1-5 | `express.json()` 无大小限制 | DoS 风险 | 5分钟 |
| P1-6 | 34 个未使用 UI 组件 | 包体积膨胀、依赖混乱 | 1小时清理 |
| P1-7 | ARIA 标签缺失 | 无障碍访问不达标 | 2小时 |

### 5.3 中优先级（P2 — 建议 1-2 周内修复）

| # | 问题 | 工作量 |
|---|------|--------|
| P2-1 | Agent Picker 改用 Radix Select | 2小时 |
| P2-2 | 提取 `useWorkspaceChat` Hook | 3小时 |
| P2-3 | 添加写入队列/文件锁 | 4小时 |
| P2-4 | 统一注释语言（中文） | 1小时 |
| P2-5 | 提取 Tailwind shadow 命名常量 | 30分钟 |
| P2-6 | 删除未使用依赖 | 1小时 |

### 5.4 低优先级（P3 — 可延后）

- 响应式适配移动端
- 加载骨架屏
- iframe title fallback
- `role` prop 重命名

---

## 六、安全发布路线图

### Phase 1: 安全基线（1-2 天，必须完成）

```
□ [CRITICAL] 移除 services/transform.ts 中的 new Function()，改用 jexl/jsonata
□ [CRITICAL] 为 connections proxy 路由添加 SSRF 过滤器（禁止私有IP）
□ [CRITICAL] 删除 ADMIN_KEY 默认值，启动时强制要求环境变量
□ [CRITICAL] 修复 base.ts AbortController 实例属性覆盖（改为局部变量）
□ [CRITICAL] workspaceStore JSON parse 失败时读取 .bak 备份而非返回空数据
□ [CRITICAL] 用 crypto.randomUUID() 替代 Math.random() 生成 workspace ID
□ 添加顶层 ErrorBoundary（App.tsx）
□ 添加 CanvasGrid 单 Widget ErrorBoundary
□ 修复 dangerouslySetInnerHTML XSS（DOMPurify）
□ express.json() 添加 limit: '1mb'
□ 删除 34 个未使用 UI 组件
□ 修复 getAgentRole 嵌套阴影 bug
□ 添加 saveTimeoutRef 卸载清理
□ 修复 fetchJson header merge bug
□ 添加请求取消（AbortController）
□ 移除 main.tsx 中覆盖 innerHTML 的全局错误监听器
```

### Phase 2: 类型安全 + 稳定性（2-3 天）

```
□ 修复核心路径的 any 类型（client.ts, useApiData.ts, routes/*）
□ 修复 6 个 react-hooks/exhaustive-deps 警告
□ 后端路由参数添加类型定义（req: Request<{id: string}>, res: Response）
□ 统一错误响应类型
□ 数据持久化添加写入队列或文件锁
□ 修复 OpenClaw/Hermes/YonClaw connector 的定时器/重连泄漏
□ SSE 流添加 req.on('close') 处理
□ 修复 useApiData hooks 返回不稳定对象引用
```

### Phase 3: 测试框架（2-3 天）

```
□ 安装 Vitest + @testing-library/react + msw
□ 为 useApiData hooks 编写测试
□ 为 workspaceStore CRUD 编写测试
□ 为 API routes 编写 supertest 集成测试
□ 安装 Playwright，编写 3-5 条核心场景 E2E 测试
```

### Phase 4: 架构优化（3-5 天）

```
□ 拆分 WorkspaceDetail.tsx（WidgetRenderer, useWorkspaceChat, AgentPicker）
□ 拆分 App.tsx（布局模式提取）
□ 数据持久化改为 SQLite 或添加写入队列
□ 全局变量改为依赖注入
□ 添加请求日志和性能监控
```

### Phase 5: 体验打磨（持续）

```
□ 添加加载骨架屏
□ 移动端响应式适配
□ 暗色模式完整性检查
□ ARIA 全面审计
```

---

## 七、结论

YonCockpit 是一个**功能完整、架构方向正确、用户体验良好**的智能驾驶舱系统。核心流程（workspace CRUD、widget 渲染、agent 聊天、多布局模式）均已跑通。

但当前代码状态距离**生产发布**仍有显著差距，主要集中在：

1. **质量债务**：1,480 行的巨兽组件、435 个 `any` 类型、零测试
2. **安全债务**：XSS 风险、DoS 风险、数据丢失风险
3. **健壮性债务**：零错误边界、粗糙的错误处理

**建议发布策略**：
- 如果目标是**内部演示/MVP**：当前系统可用，修复 P0 和 P1-1~P1-3 即可
- 如果目标是**小规模生产试用**：需完成 Phase 1 + Phase 2 + Phase 3
- 如果目标是**正式对外发布**：需完成全部 5 个 Phase

> **补充说明（来自自动化扫描）：**
> - 前端 `src/components/ui/` 目录下 34 个组件未被业务代码引用
> - `npm run lint` 报告 441 个问题（435 errors + 6 warnings）
> - 后端 `workspaceStore.ts`、`connection/store.ts`、`template-store.ts` 三个文件存在相同的 JSON 持久化反模式
> - `cockpitAgentChatStream` / `workspaceCommandStream` 的 SSE 解析错误被静默吞掉，无日志
> - 后端 `sessionCache`（Map）无 TTL，长期运行会导致内存泄漏
> - `eventBus` history 使用 `slice(-500)` 每次溢出都创建新数组，高事件量时 O(n)

> 审核人：AI Code Review System（代码审核专家 / 测试专家 / 用户体验专家）
> 审核完成时间：2026-05-27
