# YonClaw 外部执行结果回写协议

更新时间：2026-05-30

本文定义 YonClaw / OpenClaw 等外部智能体平台在“外部主控驾驶舱”场景下，推荐返回给智能驾驶舱的标准结果协议。

目标：

- 让外部平台成为真正主控方
- 让智能驾驶舱稳定承接组件与数据结果
- 减少“平台已执行，但本地未显示”的不确定性

## 1. 适用场景

适用于以下两类调用：

- `cockpit_create`
- `cockpit_execute`

尤其适用于：

- YonClaw 已完成真实取数
- YonClaw 已完成分析、汇总、组件匹配
- 驾驶舱本地只需要承接结果并完成渲染

## 2. 推荐原则

外部主控模式下，推荐遵循以下原则：

1. 由 YonClaw 负责目标理解、任务拆解、技能调用、真实取数、分析加工
2. 由 YonClaw 决定要创建哪些组件、每个组件承载什么数据
3. 驾驶舱本地不再重复发起同一轮取数
4. 驾驶舱本地只负责：
   - 保存工作区
   - 同步组件结构
   - 同步组件数据
   - 渲染展示
   - 在外部不可用时提供兜底能力

## 3. 标准回写协议

推荐外部平台返回如下结构：

```json
{
  "message": "已完成财务分析并刷新驾驶舱",
  "sync": {
    "summary": "已获取真实公司财务数据并完成分析",
    "widgets": [
      {
        "id": "w-123",
        "title": "净利润（2025全年）",
        "type": "metric",
        "data": {
          "value": "8,599万元",
          "label": "净利率 28%",
          "change": "同比 +14%",
          "trend": "up"
        }
      },
      {
        "title": "营收趋势",
        "type": "chart",
        "data": {
          "labels": ["Q1", "Q2", "Q3", "Q4"],
          "values": [120, 136, 149, 172]
        }
      }
    ],
    "appendWidgets": [
      {
        "title": "经营摘要",
        "type": "report",
        "position": { "x": 0, "y": 8, "w": 8, "h": 4 },
        "data": {
          "summary": "公司营收持续增长，利润率稳中有升。",
          "highlights": [
            { "label": "增长驱动", "value": "高毛利产品提升" }
          ]
        }
      }
    ],
    "workspacePatch": {
      "description": "基于 YonClaw 真实取数生成的 CFO 经营分析驾驶舱",
      "useDemoDataFallback": false
    }
  }
}
```

## 4. 字段说明

### 4.1 顶层字段

- `message`
  - 可选
  - 面向用户或日志的简要说明

- `sync`
  - 推荐必传
  - 表示本次执行结果中，哪些内容需要同步到本地驾驶舱

### 4.2 `sync.summary`

- 可选
- 用于描述本次取数或分析结果摘要
- 当前主要用于日志与未来扩展，不直接参与组件写回

### 4.3 `sync.widgets`

- 推荐必传
- 表示对现有组件的更新
- 匹配顺序：
  1. 优先按 `id`
  2. 找不到时按 `title`

建议：

- 如果 YonClaw 已知本地组件 ID，优先传 `id`
- 如果 ID 不稳定，至少保证 `title` 稳定

### 4.4 `sync.appendWidgets`

- 可选
- 表示新增组件
- 适用于：
  - 原驾驶舱没有该组件
  - YonClaw 认为应补充新组件来承载新分析结果

建议：

- 传完整组件定义
- 至少包含 `title`、`type`、`data`
- 最好带 `position`

### 4.5 `sync.workspacePatch`

- 可选
- 表示对工作区级字段的增量更新

当前建议只使用以下字段：

- `name`
- `description`
- `icon`
- `color`
- `status`
- `useDemoDataFallback`
- `agentIds`
- `primaryAgentId`
- `agentMode`
- `executionOwner`
- `externalProvider`
- `externalWorkspaceId`
- `externalConnectionId`

不建议通过这里传：

- `widgets`
- 任意未知结构化大对象

## 5. 组件数据要求

最重要的一条：

- 组件数据请优先写入 `widget.data`

例如指标卡：

```json
{
  "title": "净利润（2025全年）",
  "type": "metric",
  "data": {
    "value": "8,599万元",
    "change": "同比 +14%",
    "trend": "up"
  }
}
```

不要优先使用这种旧方式：

```json
{
  "title": "净利润（2025全年）",
  "type": "metric",
  "value": "8,599万元"
}
```

说明：

- 当前系统已对旧格式做兼容归并
- 但正式协议应以 `data` 为唯一推荐写法

## 6. 兼容策略

当前智能驾驶舱已兼容以下旧格式：

- 顶层 `widgets`
- `data.widgets`
- 顶层 widget 字段误写为 `value / rows / labels / summary` 等，系统会尝试归并进 `data`

但这些都只是兼容逻辑，不建议作为正式协议长期依赖。

## 7. 推荐创建方式

### 7.1 外部主控创建

YonClaw 调用 `cockpit_create` 时，建议传入：

- `executionOwner: "external"`
- `provider: "yonclaw"`
- `connectionId`
- `externalWorkspaceId`
- `widgets`
- `useDemoDataFallback: false`

这样本地创建后，不会默认再触发同一轮本地初始化抢管流程。

### 7.2 外部主控执行

YonClaw 调用 `cockpit_execute` 后，建议返回：

- `sync.widgets`
- 必要时补 `sync.appendWidgets`
- 必要时补 `sync.workspacePatch`

这样本地会自动同步更新。

## 8. 当前系统行为

当前代码已支持：

1. `external` 主控工作区优先回路由到 YonClaw/OpenClaw
2. 优先识别正式 `sync` 协议
3. 兼容旧的 `widgets` / `data.widgets` 返回结构
4. 自动同步组件更新并发布 `workspace.updated`

## 9. 推荐给 YonClaw 的对接结论

可以把这句话作为对接约定的核心：

- YonClaw 负责执行和生成结果，智能驾驶舱负责承接和呈现结果；二者通过 `sync` 协议完成稳定回写，而不是由驾驶舱本地再次重复取数。
