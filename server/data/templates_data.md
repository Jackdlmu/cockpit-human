# Templates 数据结构说明

> 文件：`/server/data/templates.json`
> 说明：本文件是驾驶舱模板的核心数据源，采用 JSON 数组格式存储，每个数组元素代表一个完整的驾驶舱模板。

---

## 1. 顶层结构

| 类型 | 说明 |
|------|------|
| `Array<Template>` | 模板数组，每个元素为一个完整的驾驶舱模板定义 |

---

## 2. Template（模板对象）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 模板唯一标识符（kebab-case） |
| `name` | `string` | ✅ | 模板显示名称 |
| `domain` | `string` | ✅ | 所属业务领域（如：研发、人力资源、战略管理） |
| `keywords` | `string[]` | ✅ | 搜索关键词列表，用于模板检索匹配 |
| `icon` | `string` | ✅ | 图标名称（对应 Lucide 图标组件名，如 `Code2`、`Users`、`Target`） |
| `color` | `string` | ✅ | 主题色，HEX 格式（如 `#0891b2`） |
| `agentIds` | `string[]` | ✅ | 绑定的 Agent ID 列表 |
| `primaryAgentId` | `string` | ✅ | 主 Agent ID，负责该模板的交互与数据初始化 |
| `description` | `string` | ✅ | 模板描述说明，支持 `{{name}}` 变量占位符 |
| `useDemoDataFallback` | `boolean` | ✅ | 是否使用演示数据作为后备 |
| `widgets` | `Widget[]` | ✅ | 模板包含的组件列表 |
| `initPrompt` | `string` | ✅ | 初始化提示词，用于引导 AI Agent 生成初始数据 |
| `isBuiltin` | `boolean` | ✅ | 是否为系统内置模板 |
| `_custom` | `boolean` | ✅ | 是否为自定义模板（用户创建） |
| `createdAt` | `string` | ✅ | 创建时间，ISO 8601 格式 |
| `updatedAt` | `string` | ❌ | 更新时间，ISO 8601 格式（可选） |

---

## 3. Widget（组件对象）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | ✅ | 组件唯一标识符（模板内唯一） |
| `type` | `WidgetType` | ✅ | 组件类型，见下方枚举 |
| `title` | `string` | ✅ | 组件标题 |
| `position` | `Position` | ✅ | 网格布局位置与尺寸 |
| `data` | `WidgetData` | ✅ | 组件数据内容（根据 type 不同结构不同） |
| `link` | `LinkConfig` | ❌ | 交互链接配置（可选，用于下钻跳转） |

---

## 4. WidgetType（组件类型枚举）

| 类型 | 说明 | 典型用途 |
|------|------|----------|
| `metric` | 指标卡片 | 展示核心 KPI 数值、环比/同比变化 |
| `status` | 状态面板 | 多维度状态评估（红绿灯形式） |
| `chart` | 趋势图表 | 折线图、柱状图等时间序列数据 |
| `table` | 数据表格 | 结构化数据展示（如九宫格、评分表） |
| `progress` | 进度条 | 目标完成度、覆盖率等百分比指标 |
| `list` | 列表 | 清单类数据（如预警列表、导航列表） |
| `kanban` | 看板/漏斗 | 流程阶段展示（如招聘漏斗、风险看板） |
| `timeline` | 时间轴 | 里程碑、项目进度等时序节点 |

---

## 5. Position（布局对象）

基于网格系统的绝对定位（类似 react-grid-layout）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `x` | `number` | 横向起始网格坐标（0-based） |
| `y` | `number` | 纵向起始网格坐标（0-based） |
| `w` | `number` | 占据网格列数（宽度） |
| `h` | `number` | 占据网格行数（高度） |

> **网格系统说明**：通常采用 12 列网格。例如 `w: 3` 表示占据 1/4 宽度，`w: 6` 表示占据 1/2 宽度。

---

## 6. WidgetData（组件数据）

组件数据为动态结构，根据 `type` 不同而变化：

### 6.1 `metric` — 指标卡片

```json
{
  "value": "12次/周",      // 当前值（字符串，可含单位）
  "change": "+3次 环比",   // 变化描述
  "trend": "up"            // 趋势方向："up" | "down" | "neutral"
}
```

### 6.2 `status` — 状态面板

```json
{
  "items": [
    {
      "label": "部署频率",      // 维度名称
      "status": "green",        // 状态："green" | "yellow" | "red"
      "value": "高效能 >1次/天" // 状态描述
    }
  ]
}
```

### 6.3 `chart` — 趋势图表

```json
{
  "labels": ["W1", "W2", "W3", "W4"],  // X 轴标签
  "values": [8, 10, 11, 12]               // Y 轴数值
}
```

### 6.4 `table` — 数据表格

```json
{
  "rows": [
    ["核心服务", "A", "覆盖率 85%", "债务 12h"],  // 每行是一个字符串数组
    ["支付网关", "A", "覆盖率 78%", "债务 8h"]
  ]
}
```

### 6.5 `progress` — 进度条

```json
{
  "value": 72,           // 当前值
  "max": 100,            // 最大值
  "label": "72%",        // 显示标签
  "color": "emerald",    // 颜色主题："emerald" | "amber" | "indigo" 等
  "caption": "目标 80%"  // 辅助说明文字
}
```

### 6.6 `list` — 列表

```json
{
  "items": [
    "用户中心：遗留认证模块待重构",
    "数据分析：查询性能优化（慢查询>3s）"
  ]
}
```

### 6.7 `kanban` — 看板/漏斗

```json
{
  "stages": [
    "简历 1,200",
    "初筛 360 (30%)",
    "面试 108 (30%)",
    "Offer 32 (30%)",
    "入职 25 (78%)"
  ]
}
```

### 6.8 `timeline` — 时间轴

```json
{
  "steps": [
    "✓ Q1 完成组织架构调整",      // ✓ 表示已完成
    "→ Q2 拓展华东市场（进行中）",  // → 表示进行中
    "Q3 完成B轮融资"              // 无标记表示待开始
  ]
}
```

---

## 7. LinkConfig（链接配置）

用于组件的下钻跳转交互。

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | 链接类型，如 `"workspace"` |
| `targetTemplate` | `string` | 目标模板 ID |
| `title` | `string` | 链接显示标题 |

---

## 8. 现有模板清单

| ID | 名称 | 领域 | 组件数 | 主 Agent |
|----|------|------|--------|----------|
| `rd-effectiveness` | CTO研发效能驾驶舱 | 研发 | 12 | `tech-agent` |
| `human-capital` | HRD人力资本驾驶舱 | 人力资源 | 12 | `hr-agent` |
| `strategic-overview` | CEO战略总览驾驶舱 | 战略管理 | 11 | `ceo-agent` |

---

## 9. 数据示例（片段）

```json
{
  "id": "rd-effectiveness",
  "name": "CTO研发效能驾驶舱",
  "domain": "研发",
  "icon": "Code2",
  "color": "#0891b2",
  "agentIds": ["tech-agent"],
  "primaryAgentId": "tech-agent",
  "widgets": [
    {
      "id": "w-deploy-freq",
      "type": "metric",
      "title": "部署频率",
      "position": { "x": 0, "y": 0, "w": 3, "h": 2 },
      "data": {
        "value": "12次/周",
        "change": "+3次 环比",
        "trend": "up"
      }
    }
  ]
}
```
