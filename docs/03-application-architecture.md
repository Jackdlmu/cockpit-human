# YonCockpit 应用架构说明

更新时间：2026-05-29

本文关注“用户看到什么、如何操作、应用内各模块如何协同”，偏产品实现层，而不是底层代码细节。

## 1. 应用整体结构

当前应用可以理解为一个由四个核心面组成的单页应用：

1. 驾驶舱列表/欢迎入口
2. 驾驶舱详情工作台
3. 设置面板
4. 模板管理后台

技术上是一个 React 单页应用，但业务上可拆成两个主要区域：

- 用户主工作区
- 管理与集成配置区

## 2. 页面与视图层次

## 2.1 根入口

根入口位于：

- [src/main.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/main.tsx:1)
- [src/App.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/App.tsx:38)

根层负责：

- 路由容器
- 主题
- 错误边界
- 全局 toast
- 工作区布局模式切换
- 事件流消费

## 2.2 主路由

当前实际生效的主路由很少：

- `/`：主应用
- `/admin/templates`：模板管理页

其余业务切换主要不是 URL 驱动，而是由本地状态驱动：

- 当前选中的 workspace
- 当前布局模式
- 当前打开的 tabs

## 3. 主应用结构

## 3.1 驾驶舱列表层

核心组件：

- [src/components/WorkspaceView.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/WorkspaceView.tsx:1)
- [src/components/layout/EmptyWelcome.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/layout/EmptyWelcome.tsx:1)

职责：

- 展示全部驾驶舱
- 提供“新建驾驶舱”入口
- 提供删除入口
- 提供设置入口
- 在空状态下给出引导

用户行为：

- 选择某个驾驶舱进入详情
- 打开创建弹窗
- 打开设置面板

## 3.2 驾驶舱详情层

核心组件：

- [src/components/WorkspaceDetail.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/WorkspaceDetail.tsx:1)
- [src/components/CanvasGrid.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/CanvasGrid.tsx:1)
- [src/components/WidgetLibraryPanel.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/WidgetLibraryPanel.tsx:1)
- [src/components/WidgetDetailDrawer.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/WidgetDetailDrawer.tsx:1)

详情页同时包含五个子区域：

1. 顶部标题与驾驶舱元信息
2. 编排状态与智能体展示
3. 组件画布
4. 编辑与组件库入口
5. 底部聊天区

详情页是当前应用最重要的工作台。

### 3.2.1 顶部信息区

展示：

- 驾驶舱图标
- 名称和描述
- Agent mode 标签
- 健康状态
- 智能体头像
- 删除/刷新/编辑入口

### 3.2.2 组件画布区

画布区承担“核心业务可视化”职责：

- 根据 widget 列表渲染网格
- 支持拖拽和调整布局
- 支持新增/删除组件
- 支持不同 widget 类型的专用展示

### 3.2.3 对话区

对话区承担“智能操作”职责：

- 与 `CockpitAgent` 聊天
- 失败时回退到 workspace adapter chat
- 显示流式文本
- 保存本地聊天历史

## 3.3 设置面板

核心组件：

- [src/components/SettingsPanel.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/SettingsPanel.tsx:13)

设置面板在用户主应用内以 `Sheet` 形式打开，不离开当前页面。

包含五个标签页：

- 连接管理
- 能力配置
- 外观
- 事件流
- 关于

### 3.3.1 连接管理

核心组件：

- [src/components/ConnectionList.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/ConnectionList.tsx:1)
- [src/components/ConnectionForm.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/ConnectionForm.tsx:1)
- [src/components/ConnectionCard.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/ConnectionCard.tsx:1)

职责：

- 新增/编辑/删除连接
- 连接测试
- 连接/断开
- 查看能力与状态

### 3.3.2 外观

核心组件：

- [src/components/LayoutSettings.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/LayoutSettings.tsx:1)
- [src/components/ThemeSettings.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/ThemeSettings.tsx:1)

职责：

- 选择布局模式
- 调整主题外观

### 3.3.3 事件流

职责：

- 展示 WebSocket 实时事件
- 帮助用户观察系统内部动作和平台响应

## 3.4 模板管理页

核心组件：

- [src/pages/TemplateManager.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/pages/TemplateManager.tsx:48)

这是一个单独的后台视图，用于管理员操作模板。

主要能力：

- 列表查看
- 新建模板
- 编辑模板
- 删除模板
- 复制模板
- 直接从模板创建驾驶舱

## 4. 布局模式架构

布局模式由 [src/hooks/useLayoutSettings.ts](/Users/jiang/Documents/GitHub/cockpit-human/src/hooks/useLayoutSettings.ts:1) 管理，当前支持三种模式。

### 4.1 `cards`

特点：

- 默认更像“首页 + 列表 + 单详情”
- 先看卡片列表，再进入某一个详情

适合：

- 演示模式
- 初次进入
- 少量驾驶舱

### 4.2 `sidebar`

特点：

- 左侧导航，右侧详情
- 切换更快

适合：

- 高频在多个驾驶舱间跳转
- 更像工作台

### 4.3 `tabs`

特点：

- 所有驾驶舱自动平铺为 tab
- 更像浏览器多页签

适合：

- 同时观察多个驾驶舱
- 对比式工作流

## 5. 关键业务流程

## 5.1 从主页打开驾驶舱

1. 加载 workspace 列表
2. 渲染对应布局
3. 用户点击某一驾驶舱
4. 详情页拉取 workspace 数据
5. 渲染组件画布与聊天区

## 5.2 从模板创建驾驶舱

1. 用户打开“新建驾驶舱”
2. 前端加载模板列表
3. 用户选择模板并输入名称/初始化提示
4. 后端创建 workspace
5. 若模板带初始化提示，后台触发 LLM 初始化
6. 前端通过事件流收到创建/初始化反馈
7. 自动打开新驾驶舱

## 5.3 通过自然语言创建驾驶舱

1. 用户在创建弹窗中输入自然语言目标
2. `CockpitAgent` 识别意图
3. 规划任务
4. 创建 workspace
5. 返回结果并打开新驾驶舱

## 5.4 在详情页编辑驾驶舱

1. 打开编辑开关
2. 拖拽/增删组件
3. 前端本地更新 widget 列表
4. 通过防抖调用 `updateWorkspace`
5. 服务端持久化

## 5.5 在详情页聊天

1. 用户输入问题或命令
2. 优先调用 `/api/agent/chat`
3. 若失败则回退到 `/api/workspaces/:id/chat`
4. 流式更新聊天内容
5. 将最终消息落到本地聊天历史

## 6. 状态层划分

应用内状态大致分四类：

### 6.1 全局 UI 状态

- 当前布局模式
- sidebar 是否折叠
- 已打开 tabs
- 当前激活 tab

### 6.2 页面级状态

- 当前选中的 workspace
- 创建弹窗是否打开
- 设置面板是否打开
- 删除确认弹窗状态

### 6.3 详情页局部状态

- 聊天消息和流式回复
- 编辑状态
- 当前选中的 agent
- 当前 local widgets
- 详情抽屉状态
- drill-down 状态

### 6.4 实时状态

- WebSocket 事件列表
- 连接状态
- workspace orchestration 状态

## 7. 当前应用架构特征

### 优点

- 产品面足够完整，已形成独立应用
- 以 workspace 为中心的交互模型清晰
- 同时具备“页面式操作”和“对话式操作”
- 连接、模板、事件、编排已经形成闭环雏形

### 当前结构性弱点

- `WorkspaceDetail` 过于集中，承担了过多职责
- 部分状态仍依赖 remount hack 刷新
- 事件流是可见的，但尚未完全成为统一状态源
- 模板管理和主应用之间仍存在鉴权与状态同步割裂

## 8. 从零重建时的应用层拆分建议

如果重建，建议按下面的视图边界拆：

1. `AppShell`
2. `WorkspaceListPage`
3. `WorkspaceDetailPage`
4. `SettingsSheet`
5. `TemplateAdminPage`

并把 `WorkspaceDetailPage` 再进一步拆成：

1. `WorkspaceHeader`
2. `WorkspaceAgentsBar`
3. `WorkspaceCanvas`
4. `WorkspaceChatPanel`
5. `WorkspaceWidgetDrawer`

这样最容易保持体验一致，同时降低后续维护复杂度。
