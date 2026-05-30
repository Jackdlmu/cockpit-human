# YonCockpit 组件管理实施任务清单

更新时间：2026-05-30

本文将《组件管理完整方案》落到当前工程可执行的任务层，重点强调：

- 不破坏当前系统基本可用性
- 优先解决真实稳定性问题
- 按当前代码结构推进，而不是重写一套平行系统

## 1. 实施目标

第一阶段目标不是“做完终极组件平台”，而是把当前系统升级到以下状态：

- 组件管理能力边界真实
- 模板与组件关系可追踪
- AI 选组件和填数据更稳定
- 组件扩展首先支持配置扩展和组合扩展
- 失败时有统一兜底，不影响驾驶舱基本可用

## 2. 当前工程中的关键落点

前端重点模块：

- [src/pages/TemplateManager.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/pages/TemplateManager.tsx:1)
- [src/components/WidgetLibraryPanel.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/WidgetLibraryPanel.tsx:1)
- [src/components/WorkspaceDetail.tsx](/Users/jiang/Documents/GitHub/cockpit-human/src/components/WorkspaceDetail.tsx:1)
- [src/lib/widget-normalizer.ts](/Users/jiang/Documents/GitHub/cockpit-human/src/lib/widget-normalizer.ts:1)
- [src/types/index.ts](/Users/jiang/Documents/GitHub/cockpit-human/src/types/index.ts:171)

后端重点模块：

- [server/src/services/widget-catalog-store.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/widget-catalog-store.ts:1)
- [server/src/routes/widget-catalog.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/routes/widget-catalog.ts:1)
- [server/src/services/workspace-creation.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/workspace-creation.ts:1)
- [server/src/services/workspace-initializer.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/workspace-initializer.ts:1)
- [server/src/services/widget-data.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/services/widget-data.ts:1)
- [server/src/agent/cockpit-agent.ts](/Users/jiang/Documents/GitHub/cockpit-human/server/src/agent/cockpit-agent.ts:1)

## 3. 第一阶段任务

### 3.1 定义模型补齐

目标：

- 在不破坏现有接口的前提下，给组件补齐正式定义字段

任务：

- 为 `WidgetCatalogItem` 增加以下字段
- `level`
- `status`
- `baseWidgetType`
- `rendererId`
- `intentKeywords`
- `whenToUse`
- `whenNotToUse`
- `samplePayload`
- `version`
- `isAiSelectable`

建议：

- 第一版先允许这些字段为可选，保持向后兼容
- 存量内置组件在服务端做自动补全

### 3.2 组件管理页升级

目标：

- 让当前组件管理页能正确表达组件层级和边界

任务：

- 在组件卡片中显示层级、状态、来源、版本
- 在组件详情里新增“数据契约”“示例 payload”“AI 选用建议”
- 新建组件入口改成三类
- 基于现有组件扩展
- 新建组合组件
- 注册新组件类型

说明：

- 第一期“注册新组件类型”入口可以先只展示说明和开发流程，不必假装已支持纯配置完成

### 3.3 模板与组件依赖建立

目标：

- 模板不再只持有匿名组件快照

任务：

- 给模板中的 widget 增加 `componentId`
- 组件从目录加入模板时，写入来源组件 ID
- 模板编辑器中增加“来自哪个组件”的可见标识
- 组件详情页增加“被哪些模板引用”的列表

说明：

- 第一版可先维持 `snapshot + componentId`
- 暂不强推复杂的版本跟随逻辑

### 3.4 正式区分两种添加方式

目标：

- 分清“正式组件复用”和“实例复制”

任务：

- `WidgetLibraryPanel` 分为两类来源
- 组件库
- 从其他驾驶舱复制
- 前者写入 `componentId`
- 后者写入 `copiedFromWorkspaceId` 或实例来源标记

说明：

- 这是后续排查问题、理解组件来源的基础

### 3.5 AI 组件写入校验

目标：

- 解决“AI 有分析结果，但组件不显示或字段写错”的高频问题

任务：

- 在后端新增组件 payload 校验器
- 内置组件至少覆盖 `metric`、`chart`、`table`、`report`、`adaptive`、`universal`
- 写入前执行：
- 类型校验
- 必填字段校验
- 字段路径修正
- 修正失败则明确报错并降级

说明：

- 这项优先级非常高，直接关联 YonClaw 集成稳定性

### 3.6 统一兜底组件策略

目标：

- 确保创建失败时不是整块空白

任务：

- 明确 `adaptive` 与 `universal` 的职责分工
- 至少保留一个统一兜底组件
- 当类型推断失败或 payload 不满足约束时，自动回退

建议：

- 优先把 `universal` 定义为“极端兜底容器”
- 把 `adaptive` 定义为“结构化智能展示容器”

## 4. 第二阶段任务

### 4.1 组合组件编辑器

目标：

- 让管理员能基于现有能力组合业务组件

任务：

- 定义组合组件的数据结构
- 支持组件区块编排
- 支持区块级标题、说明、显示条件
- 支持组合组件预览

### 4.2 指标卡增强

目标：

- 解决当前 `metric` 只能舒适承载单指标的问题

任务：

- 支持主指标 + 次级指标列表
- 支持指标说明区
- 支持同比/环比/目标值
- 支持多种布局变体

说明：

- 这是最值得优先增强的高频组件

### 4.3 正式组件预览

目标：

- 让管理员和开发者能在管理台验证组件

任务：

- 为每个组件提供 demo 数据预览
- 支持切换浅色主题
- 支持不同尺寸预览
- 支持展示 schema 校验结果

## 5. 第三阶段任务

### 5.1 渲染器注册表

目标：

- 支持真正的新组件类型

任务：

- 建立 `rendererId -> renderer` 注册机制
- 组件定义与渲染器解耦
- 为未知渲染器提供统一 fallback

### 5.2 开发者扩展流程

目标：

- 让新组件类型扩展有正式工程路径

任务：

- 新增组件渲染器脚手架
- 增加开发说明
- 增加测试约束
- 增加预览校验

### 5.3 版本与发布流程

目标：

- 组件升级可控

任务：

- 支持 `major / minor / patch`
- 模板引用关系提示升级影响
- 支持废弃与替代建议

## 6. 建议的执行优先级

建议先按下面顺序推进：

1. 组件 payload 校验与写入修正
2. 模板与组件建立来源关系
3. 组件管理页补齐结构化字段
4. 区分正式组件复用与实例复制
5. 增强 `metric` / `adaptive` / `universal`
6. 组合组件编辑器
7. 真正的新组件类型扩展机制

## 7. 第一阶段验收标准

完成第一阶段后，至少应达到：

- 组件详情页能看清 AI 如何理解该组件
- 模板中每个组件都能知道来源
- YonClaw 或内置 AI 添加组件时，不再频繁因字段路径错误导致空数据显示
- 创建链路失败时能稳定回退到可显示组件
- 管理员知道哪些能力可配置、哪些必须开发扩展

## 8. 风险与控制点

### 8.1 风险：做成过度抽象平台

控制：

- 第一阶段严格围绕当前业务问题
- 不先做复杂插件市场

### 8.2 风险：影响现有驾驶舱可用性

控制：

- 所有新字段先做兼容可选
- 存量组件和模板走自动补全
- 保留统一 fallback 组件

### 8.3 风险：前后端定义不同步

控制：

- 组件 schema 由共享类型或统一约定驱动
- 新字段改动必须同步更新管理页、创建链路和运行时校验

## 9. 推荐的下一步

如果按“最小风险、最高价值”继续执行，下一步最建议直接进入下面三个开发项：

1. 为组件定义补齐 AI 契约字段和版本状态字段
2. 在 AI 写组件实例前增加 payload 校验与自动修正
3. 给模板中的组件写入正式 `componentId` 来源关系

这三项完成后，组件管理就会从“目录页”进入“可治理系统”的第一阶段。
