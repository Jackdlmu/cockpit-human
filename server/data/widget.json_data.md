# Widget 组件库数据结构说明

> 文件：`/server/data/widget.json`
> 说明：本文件是驾驶舱组件库的元数据定义文件，采用 JSON 数组格式存储。每个数组元素代表一种内置 Widget 组件的完整定义，包含组件信息、数据结构规范、布局建议、模板示例及 Agent 选型指引。

---

## 1. 顶层结构

| 类型 | 说明 |
|------|------|
| `Array<WidgetDefinition>` | 组件定义数组，每个元素为一种组件类型的元数据 |

> 当前定义了 **21 种** 内置组件。

---

## 2. WidgetDefinition（组件定义对象）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 组件定义唯一标识符（`builtin-{type}` 格式） |
| `name` | `string` | ✅ | 组件显示名称（中文） |
| `type` | `string` | ✅ | 组件类型标识 |
| `category` | `string` | ✅ | 所属分类 |
| `icon` | `string` | ✅ | Lucide 图标组件名 |
| `color` | `string` | ✅ | 主题色，HEX 格式 |
| `description` | `string` | ✅ | 组件用途描述（面向用户） |
| `agentDescription` | `string` | ✅ | Agent 选型指引（面向 AI，说明何时优先选择该组件） |
| `useCases` | `string[]` | ✅ | 典型使用场景示例 |
| `tags` | `string[]` | ✅ | 能力标签，用于检索匹配 |
| `schemaHint` | `SchemaHint` | ✅ | 数据结构规范与布局建议 |
| `template` | `Template` | ✅ | 组件模板示例（包含默认 position 和 data） |
| `isBuiltin` | `boolean` | ✅ | 是否为系统内置组件 |

---

## 3. SchemaHint（数据结构规范）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `recommendedDataShape` | `Record<string, string>` | ✅ | 推荐的数据字段及类型说明（key-value 形式，value 为类型描述字符串） |
| `layoutAdvice` | `string` | ✅ | 布局建议，包含推荐的宽高及摆放位置 |
| `styleConfig` | `Record<string, unknown>` | ❌ | 样式配置建议（可选，chart 和 business 类型通常有） |

---

## 4. Template（组件模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 组件类型（与外层 type 一致） |
| `title` | `string` | 默认标题 |
| `position` | `Position` | 默认布局位置 |
| `data` | `Record<string, unknown>` | 默认数据结构 |

**Position：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `x` | `number` | 横向起始网格坐标 |
| `y` | `number` | 纵向起始网格坐标 |
| `w` | `number` | 占据网格列数 |
| `h` | `number` | 占据网格行数 |

---

## 5. 组件分类与清单

### 5.1 指标类（Category: 指标）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-metric` | 指标卡 | `metric` | 展示核心单值指标、趋势、变化率 | w: 3-4, h: 2-3 |
| `builtin-progress` | 进度条 | `progress` | 展示目标完成率、预算使用率 | w: 3-4, h: 2 |
| `builtin-gauge` | 仪表盘 | `gauge` | 展示目标达成率、健康分、完成度 | w: 4, h: 3 |
| `builtin-bullet` | 子弹图 | `bullet` | 紧凑表达实际值、目标值与阈值区间 | w: 5-6, h: 2 |

### 5.2 图表类（Category: 图表）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-chart` | 趋势图表 | `chart` | 时间趋势、分类对比、结构占比 | w: 4-6, h: 3-4 |
| `builtin-funnel` | 漏斗图 | `funnel` | 流程转化、阶段流失 | w: 5-6, h: 4 |
| `builtin-radar` | 雷达图 | `radar` | 多维能力、综合评分 | w: 5, h: 4 |
| `builtin-heatmap` | 热力图 | `heatmap` | 二维矩阵密度、时段分布 | w: 6, h: 4 |
| `builtin-map` | 地图 | `map` | 地理位置、区域分布 | w: 6, h: 4 |

### 5.3 明细类（Category: 明细）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-table` | 数据表格 | `table` | 结构化明细、排行、清单 | w: 4-6, h: 3-5 |
| `builtin-list` | 列表 | `list` | 简洁事项列表、要点清单 | w: 3-5, h: 3-4 |

### 5.4 流程类（Category: 流程）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-kanban` | 状态看板 | `kanban` | 流程阶段、状态分布 | w: 5-6, h: 4 |
| `builtin-timeline` | 时间线 | `timeline` | 时间顺序、阶段进展、里程碑 | w: 5-6, h: 4 |

### 5.5 分析类（Category: 分析）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-report` | 报告摘要 | `report` | 摘要性结论、分析说明、重点洞察 | w: 5-8, h: 3-4 |
| `builtin-html` | HTML 报告 | `html` | 富文本、HTML 结构化分析结果 | w: 6-8, h: 4+ |

### 5.6 监控类（Category: 监控）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-status` | 状态面板 | `status` | 多对象运行状态、健康度 | w: 4-5, h: 3 |
| `builtin-alert` | 告警列表 | `alert` | 带级别的事件、异常、告警日志 | w: 4-5, h: 3 |

### 5.7 通用类（Category: 通用）

| ID | 名称 | Type | 用途 | 推荐尺寸 |
|----|------|------|------|----------|
| `builtin-universal` | 通用容器 | `universal` | 兜底容器，承载复杂混合数据 | w: 4-6, h: 3-5 |
| `builtin-adaptive` | 智能自适应容器 | `adaptive` | 混合 headline、sections、metrics、list、table | w: 5-6, h: 4-6 |

### 5.8 业务组件类（Category: 业务组件）

| ID | 名称 | Type | 业务子类型 | 用途 | 推荐尺寸 |
|----|------|------|-----------|------|----------|
| `builtin-business-message-center` | 消息中心 | `business` | `message-center` | 审批、待办、通知、预警 | w: 6, h: 5 |
| `builtin-business-calendar` | 智能日程 | `business` | `calendar` | 日程聚合、会议、截止提醒 | w: 5-6, h: 5 |
| `builtin-business-insight-hub` | 洞察中心 | `business` | `insight-hub` | 跨上下文洞察、风险、建议 | w: 6, h: 5 |

---

## 6. 各组件数据结构规范

### 6.1 `metric` — 指标卡

```json
{
  "value": "string | number",
  "unit": "可选，string，例如 %、万元、天",
  "change": "string",
  "trend": "up | down | flat",
  "target": "可选，string | number",
  "compareLabel": "可选，string，例如 同比、环比、预算、上期",
  "compareValue": "可选，string | number",
  "description": "可选，string",
  "items": "可选，多指标时使用数组"
}
```

### 6.2 `chart` — 趋势图表

```json
{
  "labels": "string[]",
  "values": "number[]",
  "series": "可选，多序列图表使用"
}
```

**styleConfig 建议：**
```json
{
  "variant": "auto | bar | donut",
  "baseline": "zero",
  "mode": "standard | diverging",
  "donut": { "innerRatio": 0.58, "legendRatio": 0.42, "maxSlices": 5 }
}
```

> 含正负值、差额、盈亏、预算偏差时必须使用 `bar + zero baseline + diverging`；2-5 个全非负分类占比可用 `donut`；超过 5 个分类优先 `bar/table`。

### 6.3 `table` — 数据表格

```json
{
  "columns": "string[] | { key, label }[]",
  "rows": "string[][] | Record<string, unknown>[]"
}
```

### 6.4 `list` — 列表

```json
{
  "items": "string[] | Record<string, unknown>[]"
}
```

### 6.5 `kanban` — 状态看板

```json
{
  "stages": "string[] | Record<string, unknown>[]",
  "columns": "可选，与 stages 二选一"
}
```

### 6.6 `timeline` — 时间线

```json
{
  "steps": "string[] | Record<string, unknown>[]"
}
```

### 6.7 `report` — 报告摘要

```json
{
  "summary": "string",
  "highlights": "可选，string[]"
}
```

### 6.8 `progress` — 进度条

```json
{
  "value": "number",
  "target": "可选，number",
  "label": "可选，string"
}
```

### 6.9 `status` — 状态面板

```json
{
  "items": "Array<{ name, status, value? }>"
}
```

### 6.10 `html` — HTML 报告

```json
{
  "html": "string",
  "content": "可选，string"
}
```

### 6.11 `gauge` — 仪表盘

```json
{
  "value": "number",
  "min": "number",
  "max": "number"
}
```

### 6.12 `funnel` — 漏斗图

```json
{
  "stages": "Array<{ label, value }>"
}
```

### 6.13 `radar` — 雷达图

```json
{
  "labels": "string[]",
  "values": "number[]"
}
```

### 6.14 `heatmap` — 热力图

```json
{
  "rows": "string[] | Record<string, unknown>[]",
  "cells": "可选，二维数值矩阵"
}
```

### 6.15 `bullet` — 子弹图

```json
{
  "value": "number",
  "target": "number",
  "thresholds": "可选，数组"
}
```

### 6.16 `alert` — 告警列表

```json
{
  "alerts": "Array<{ level, message, time? }>"
}
```

### 6.17 `map` — 地图

```json
{
  "points": "Array<{ name, lat, lng, value? }>",
  "locations": "可选，区域列表"
}
```

### 6.18 `universal` — 通用容器

```json
{
  "content": "markdown | rich text",
  "sections": "可选，复杂内容可拆分段落"
}
```

### 6.19 `adaptive` — 智能自适应容器

```json
{
  "headline": "title/subtitle/status",
  "sections": "metrics | list | text | table | highlights[]"
}
```

### 6.20 `business` — 业务组件（消息中心）

```json
{
  "businessType": "message-center",
  "messages": "Array<{ id, type, priority, status, title, summary, source, dueAt, intelligence, actions }>"
}
```

**Template 中 business 配置：**
```json
{
  "business": {
    "category": "business",
    "businessType": "message-center",
    "dataContract": "message-center.v1",
    "actionContract": "message-actions.v1",
    "connectorPolicy": { "preferred": "yonclaw", "fallback": ["openapi", "local"] },
    "permissions": ["approval.read", "approval.action"],
    "interactionMode": "actionable"
  }
}
```

### 6.21 `business` — 业务组件（智能日程）

```json
{
  "businessType": "calendar",
  "events": "Array<{ id, title, type, start, end, location, participants, source, status, actions }>"
}
```

### 6.22 `business` — 业务组件（洞察中心）

```json
{
  "businessType": "insight-hub",
  "insights": "Array<{ id, title, type, severity, summary, evidence, recommendation, confidence, actions }>"
}
```

---

## 7. Business 组件通用配置说明

三种 `business` 类型的组件在 `template` 中都包含 `business` 配置对象，其通用字段如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | `string` | 固定为 `"business"` |
| `businessType` | `string` | 业务子类型：`message-center` \| `calendar` \| `insight-hub` |
| `dataContract` | `string` | 数据契约版本（如 `message-center.v1`） |
| `actionContract` | `string` | 动作契约版本（如 `message-actions.v1`） |
| `connectorPolicy` | `object` | 连接器策略：`{ preferred: string, fallback: string[] }` |
| `permissions` | `string[]` | 所需权限列表 |
| `interactionMode` | `string` | 交互模式：`actionable` \| `agent-assisted` |

**连接器策略（connectorPolicy）：**
| 优先级 | 来源 | 说明 |
|--------|------|------|
| `yonclaw` | YonClaw Skill | 优先通过 YonClaw 获取数据 |
| `openapi` | OpenAPI | 通过开放 API 获取 |
| `cli` | CLI | 通过命令行工具获取 |
| `local` | 本地 | 本地数据源 |

---

## 8. Agent 选型指引汇总

| 场景特征 | 推荐组件 |
|----------|----------|
| 少量核心指标 + 趋势变化 | `metric` |
| 时间序列 / 分类对比 / 占比 | `chart` |
| 多行明细 / 排行 / 结构化列表 | `table` |
| 简洁事项 / 要点清单 | `list` |
| 多阶段 / 状态列 / 流程节点 | `kanban` |
| 时间轴 / 里程碑 / 步骤进展 | `timeline` |
| 文字摘要 / 分析结论 / 洞察 | `report` |
| 0-100 完成率 / 进度 | `progress` |
| 多对象状态 / 健康度 | `status` |
| HTML / 富文本 / 复杂排版 | `html` |
| 单值在目标区间位置 | `gauge` |
| 多阶段转化 / 逐层收敛 | `funnel` |
| 多维度评分 / 能力对比 | `radar` |
| 二维矩阵 / 热点分布 | `heatmap` |
| 实际值 vs 目标值 + 阈值 | `bullet` |
| 异常 / 事件 / 风险清单 | `alert` |
| 地理维度 / 区域分布 | `map` |
| 复杂混合 / 无法标准映射 | `universal` |
| 摘要 + 指标 + 列表 + 表格混合 | `adaptive` |
| 审批 / 待办 / 通知 / 预警 | `business` (message-center) |
| 日程 / 会议 / 截止提醒 | `business` (calendar) |
| 跨上下文洞察 / 风险建议 | `business` (insight-hub) |
