# Workspaces 数据结构说明

> 文件：`/server/data/workspaces.json`
> 说明：本文件存储所有已创建的驾驶舱工作区（Workspace）实例数据，采用 JSON 对象格式，顶层包含 `workspaces` 数组。

---

## 1. 顶层结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `workspaces` | `Workspace[]` | 工作区数组，每个元素为一个独立的驾驶舱实例 |

---

## 2. Workspace（工作区对象）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 工作区唯一标识符（`ws-{timestamp}-{random}` 格式） |
| `name` | `string` | ✅ | 工作区显示名称 |
| `description` | `string` | ✅ | 工作区描述说明 |
| `icon` | `string` | ✅ | 图标标识（Lucide 图标名或 Emoji） |
| `color` | `string` | ✅ | 主题色，HEX 格式 |
| `status` | `string` | ✅ | 运行状态：`running` \| `active` \| 其他 |
| `createdAt` | `string` | ✅ | 创建日期，`YYYY-MM-DD` 格式 |
| `updatedAt` | `string` | ✅ | 更新日期，`YYYY-MM-DD` 格式 |
| `agentIds` | `string[]` | ✅ | 绑定的 Agent ID 列表（通常为空数组） |
| `primaryAgentId` | `string` | ✅ | 主 Agent ID（通常为空字符串） |
| `agentMode` | `string` | ✅ | Agent 运行模式：`single` \| `llm-only` \| 其他 |
| `agentBindings` | `Array` | ✅ | Agent 绑定配置（通常为空数组） |
| `widgets` | `Widget[]` | ✅ | 工作区包含的组件列表 |
| `useDemoDataFallback` | `boolean` | ✅ | 是否使用演示数据作为后备 |
| `executionOwner` | `string` | ✅ | 执行主体：`external` \| `cockpit` \| 其他 |
| `externalProvider` | `string` | ❌ | 外部数据提供商标识（如 `yonclaw`），可选 |
| `context` | `Context` | ✅ | 运行时上下文对象 |
| `orchestration` | `Orchestration` | ✅ | 智能体编排状态对象 |
| `initializing` | `boolean` | ❌ | 是否正在初始化（可选） |
| `initializationMode` | `string` | ❌ | 初始化模式：`llm` \| 其他（可选） |
| `initializationJobId` | `string` | ❌ | 初始化任务 ID（可选） |
| `initializedAt` | `string` | ❌ | 初始化完成时间，ISO 8601 格式（可选） |

---

## 3. Widget（组件对象）

工作区的 Widget 比模板（templates）中的结构更复杂，支持更多数据形态。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 组件唯一标识符（`w-{timestamp}-{random}-{seq}` 格式） |
| `title` | `string` | ✅ | 组件标题 |
| `type` | `WidgetType` | ✅ | 组件类型 |
| `position` | `Position` | ✅ | 网格布局位置与尺寸 |
| `data` | `WidgetData` | ✅ | 组件数据内容（根据 type 不同结构不同） |

---

## 4. WidgetType（组件类型枚举）

| 类型 | 说明 | 典型用途 |
|------|------|----------|
| `metric` | 指标卡片 | 展示核心 KPI 数值、变化趋势 |
| `chart` | 趋势图表 | 柱状图、折线图、饼图、雷达图等 |
| `report` | 分析报告 | 文本摘要、高亮指标、HTML 报告、深度分析 |
| `list` | 列表 | 结构化列表数据（如天气详情） |

---

## 5. Position（布局对象）

| 字段 | 类型 | 说明 |
|------|------|------|
| `x` | `number` | 横向起始网格坐标（0-based） |
| `y` | `number` | 纵向起始网格坐标（0-based） |
| `w` | `number` | 占据网格列数（宽度，通常 12 列系统） |
| `h` | `number` | 占据网格行数（高度） |

---

## 6. WidgetData（组件数据）

### 6.1 `metric` — 指标卡片

```json
{
  "value": "91.82亿",              // 当前值（字符串，可含单位）
  "label": "同比 +0.3% · 增速企稳回正", // 辅助说明标签
  "change": "Q4单季35.97亿 (+5.4%)",    // 变化描述
  "trend": "up",                        // 趋势方向："up" | "down" | "flat" | "neutral"
  "details": "毛利率49.6% (+2.1pct)",   // 详细补充信息（可选）
  "secondary": "全球第一 | 连续10年+"   // 次要信息（可选）
}
```

### 6.2 `chart` — 图表

支持多种图表形态，数据结构灵活。

**基础形态（单系列）：**
```json
{
  "chartType": "bar",              // 图表类型：bar | line | pie | stacked_bar | radar
  "labels": ["Q1", "Q2", "Q3", "Q4"],
  "values": [3200, 3560, 3850, 4200],
  "unit": "万元",
  "description": "说明文字",
  "styleConfig": {                 // 样式配置
    "variant": "bar",              // 显示变体：bar | donut
    "donut": {
      "innerRatio": 0.58,
      "legendRatio": 0.42,
      "maxSlices": 5
    },
    "baseline": "zero",
    "mode": "grouped"
  }
}
```

**多系列形态（对比图）：**
```json
{
  "chartType": "bar",
  "labels": ["大型企业", "中型企业", "小微企业"],
  "datasets": [
    {
      "label": "2025营收（亿元）",
      "values": [59.9, 11, 11],
      "color": "#0050B3"
    },
    {
      "label": "同比增速",
      "values": [7.4, 12.7, 12.9],
      "color": "#FF7A45"
    }
  ]
}
```

**饼图/环形图（含对比数据）：**
```json
{
  "chartType": "pie",
  "labels": ["云收入", "软件许可", "软件支持", "服务"],
  "values": [5962, 116, 2469, 1007],
  "labels_compare": ["云收入", "软件许可", "软件支持", "服务"],
  "values_compare": [4993, 183, 2761, 1075],
  "series": [
    { "name": "Q1 2026 (€M)", "data": [5962, 116, 2469, 1007] },
    { "name": "Q1 2025 (€M)", "data": [4993, 183, 2761, 1075] }
  ]
}
```

**雷达图：**
```json
{
  "chartType": "radar",
  "labels": ["人才吸引力", "员工敬业度", "多元包容", "领导力梯队", "学习发展", "薪酬竞争力"],
  "values": [85, 78, 82, 75, 80, 72],
  "max": 100,
  "fill": true
}
```

### 6.3 `report` — 分析报告

报告组件是最复杂的类型，支持多种数据形态。

**基础报告（摘要 + 高亮）：**
```json
{
  "summary": "文本摘要内容",
  "highlights": [
    {
      "label": "维度名称",
      "value": "维度值"
    }
  ],
  "sections": [                    // 报告章节（可选）
    {
      "title": "章节标题",
      "summary": "章节摘要"
    }
  ]
}
```

**指标型报告（含 metrics 数组）：**
```json
{
  "metrics": [
    {
      "label": "营业收入（2025）",
      "value": "329.75万",
      "change": "—",
      "trend": "neutral"
    }
  ],
  "highlights": [
    { "label": "营业收入（2025）", "value": "329.75万" }
  ],
  "指标": [                        // 中文别名形式（兼容字段）
    { "name": "营业收入（2025）", "value": "329.75万" }
  ]
}
```

**HTML 深度报告（含完整 HTML 内容）：**
```json
{
  "summary": "报告摘要",
  "highlights": [...],
  "detailHtml": "<html>...</html>",   // 完整 HTML 报告内容
  "html": "<html>...</html>",         // 同上（别名）
  "htmlContent": "<html>...</html>",  // 同上（别名）
  "detailAnchor": "s1",               // 锚点定位标识
  "detail": {                         // 结构化详情对象
    "content": "<html>...</html>",
    "contentType": "html"
  },
  "detailUrl": "file:///...",         // 外部报告文件路径
  "reportUrl": "file:///..."          // 同上（别名）
}
```

### 6.4 `list` — 列表

```json
{
  "items": [
    { "label": "日期", "value": "6月1日 周一" },
    { "label": "天气", "value": "晴" },
    { "label": "最高气温", "value": "19°C" }
  ]
}
```

> 注：`list` 类型也支持字符串数组形式（见 templates.json 中的定义）。

---

## 7. Context（运行时上下文）

每个工作区维护一份运行时上下文，用于记录当前状态、Agent 信息、组件概览等。

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `number` | 上下文版本号（递增） |
| `summary` | `ContextSummary` | 工作区摘要信息 |
| `agents` | `ContextAgents` | Agent 状态信息 |
| `widgets` | `ContextWidgets` | 组件统计与亮点摘要 |
| `recentActions` | `Array` | 近期操作记录（通常为空数组） |

### 7.1 ContextSummary

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 工作区名称 |
| `description` | `string` | 工作区描述 |
| `purpose` | `string` | 用途说明（如：财务审批与预算管理） |
| `keyMetrics` | `string[]` | 关键指标列表 |
| `lastUpdated` | `string` | 最后更新时间，ISO 8601 格式 |

### 7.2 ContextAgents

| 字段 | 类型 | 说明 |
|------|------|------|
| `primary` | `AgentInfo` | 主 Agent 信息 |
| `collaborators` | `AgentInfo[]` | 协作 Agent 列表 |
| `orchestrationMode` | `string` | 编排模式：`cockpit-led` \| `llm-direct` |
| `healthStatus` | `string` | 健康状态：`healthy` \| 其他 |

**AgentInfo：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Agent ID |
| `name` | `string` | Agent 名称 |
| `role` | `string` | 角色：`primary` \| `collaborator` |
| `status` | `string` | 状态：`active` \| 其他 |
| `capabilities` | `string[]` | 能力列表 |
| `recentContributions` | `Array` | 近期贡献 |
| `sourceType` | `string` | 来源类型：`internal` \| 其他 |

### 7.3 ContextWidgets

| 字段 | 类型 | 说明 |
|------|------|------|
| `count` | `number` | 组件总数 |
| `types` | `Record<string, number>` | 各类型组件数量统计 |
| `highlights` | `string[]` | 组件亮点摘要文本列表 |

---

## 8. Orchestration（编排状态）

记录工作区的智能体编排运行时状态。

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `string` | 当前编排模式：`cockpit-led` \| `llm-direct` |
| `health` | `string` | 健康状态：`healthy` \| 其他 |
| `primaryAgent` | `OrchestrationAgent` | 主 Agent 信息 |
| `activeAgents` | `OrchestrationAgent[]` | 活跃 Agent 列表 |
| `cockpitAgentActive` | `boolean` | 驾驶舱智能体是否活跃 |
| `reason` | `string` | 状态说明文字 |
| `timestamp` | `string` | 状态更新时间，ISO 8601 格式 |

**OrchestrationAgent：**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | Agent ID |
| `name` | `string` | Agent 名称 |
| `status` | `string` | 状态：`active` \| 其他 |
| `sourceType` | `string` | 来源类型：`internal` \| 其他 |

---

## 9. 现有工作区清单

| ID | 名称 | 组件数 | Agent 模式 | 执行主体 |
|----|------|--------|-----------|----------|
| `ws-1780150194480-ab199` | 云领集团综合经营驾驶舱 | 8 | `single` | `external` (yonclaw) |
| `ws-1780220453843-5a0fa` | 用友网络2025/2026经营综合分析驾驶舱 | 14 | `single` | `external` (yonclaw) |
| `ws-1780228679217-c8bb9` | SAP SE 整体经营与财务分析驾驶舱 | 9 | `single` | `external` (yonclaw) |
| `ws-1780229941372-12164` | 金蝶国际CFO经营分析驾驶舱 | 11 | `single` | `external` (yonclaw) |
| `ws-1780275395726-ef3fc` | 联想集团CEO经营全景驾驶舱 | 13 | `single` | `external` (yonclaw) |
| `ws-1780276421725-cf842` | 云领集团CEO智能驾驶舱 | 9 | `single` | `external` (yonclaw) |
| `ws-1780294706399-43cf4` | 北京7天天气驾驶舱 | 4 | `llm-only` | `cockpit` |

---

## 10. 与 Templates 的核心差异

| 维度 | Templates（模板） | Workspaces（工作区） |
|------|-------------------|---------------------|
| **定位** | 静态模板定义 | 动态运行实例 |
| **数据丰富度** | 基础演示数据 | 真实业务数据 / 完整分析报告 |
| **Widget 类型** | 8 种（含 status、progress、kanban、timeline） | 4 种（report、chart、metric、list） |
| **Widget 结构** | 较简单 | 更复杂，支持 HTML 报告、多系列图表 |
| **运行时状态** | 无 | 有 context + orchestration |
| **Agent 绑定** | 有明确的 agentIds / primaryAgentId | 通常为空，由运行时动态分配 |
| **执行主体** | 无 | `external` / `cockpit` |
| **HTML 报告** | 不支持 | 支持（detailHtml / html / detail） |
| `styleConfig` | 无 | 有（图表样式配置） |
