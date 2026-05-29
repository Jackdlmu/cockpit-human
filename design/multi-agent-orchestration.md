# 智能驾驶舱多智能体协作架构设计方案

## 一、现状梳理

### 1.1 现有类型模型

```typescript
// AgentMode 已有四种模式
type AgentMode = 'single' | 'multi-coordinator' | 'multi-parallel' | 'llm-only';

// Workspace 已支持 agent 绑定
interface Workspace {
  agentIds: string[];           // 关联智能体ID列表
  primaryAgentId: string;       // 主智能体ID
  agentMode?: AgentMode;        // 协作模式
  agentBindings?: AgentBinding[]; // 平台绑定状态
}

// AgentBinding 已支持连接状态追踪
interface AgentBinding {
  agentId: string;
  connectionId?: string;        // 来源平台连接ID
  status: 'active' | 'unavailable' | 'pending';
  lastUsed?: string;
}
```

### 1.2 现有后端能力

| 模块 | 能力 | 状态 |
|------|------|------|
| `CockpitMetaAgent` | Tool Calling、Agent Invoke、外部平台注册 | ✅ 已有 |
| `ConnectionManager` | yonclaw/openclaw/hermes/generic-llm 连接管理 | ✅ 已有 |
| `cockpit-agent.ts` | 意图识别、任务规划、LLM 对话 | ✅ 已有 |
| `meta-agent.ts` | 驾驶舱增删改查工具、组件操作 | ✅ 已有 |
| 事件总线 | workspace 创建/初始化/更新事件 | ✅ 已有 |

### 1.3 现有前端能力

| 模块 | 能力 | 状态 |
|------|------|------|
| 智能体头像列表 | 右上角展示关联Agent（emoji头像） | ✅ 已有 |
| Agent Mode Tag | 显示 single/multi-coordinator/multi-parallel/llm-only | ✅ 已有 |
| 底部聊天 | workspaceCommandStream 流式对话 | ✅ 已有 |
| 事件监听 | WebSocket 实时事件推送 | ✅ 已有 |

### 1.4 当前痛点

1. **Agent 数据为硬编码 demo**（`agentsData.ts`），无法反映真实平台智能体状态
2. **缺乏自适应调度逻辑** — 外部Agent可用/不可用时的切换机制未实现
3. **前端智能体展示粗糙** — 纯 emoji 头像，无角色身份、状态详情
4. **聊天上下文孤立** — 每次对话无驾驶舱上下文预加载
5. **头像不统一** — emoji 在不同平台显示不一致，无品牌感

---

## 二、核心设计：三层协作模型

### 2.1 协作模式状态机

```
┌──────────────────────────────────────────────────────────────┐
│                    协作调度层 (Orchestrator)                   │
│  根据外部平台Agent可用性 + LLM可用性 动态决策                   │
└──────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │ 平台主导   │   │ 座舱主导   │   │ LLM直连   │
      │platform-led│   │cockpit-led│   │llm-direct │
      └───────────┘   └───────────┘   └───────────┘
              │               │               │
              └───────────────┴───────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            ┌───────────┐       ┌───────────┐
            │ 降级模式   │       │ 正常模式   │
            │degraded   │       │normal     │
            └───────────┘       └───────────┘
```

### 2.2 状态迁移规则

```typescript
interface OrchestrationState {
  mode: 'platform-led' | 'cockpit-led' | 'llm-direct';
  health: 'healthy' | 'degraded' | 'unavailable';
  primaryAgent: AgentRef | null;       // 当前主导智能体
  activeAgents: AgentRef[];            // 所有参与智能体
  cockpitAgentActive: boolean;         // 驾驶舱自身智能体是否后台运行
  reason: string;                      // 当前状态原因说明
}

// 状态决策逻辑
function decideOrchestration(
  workspace: Workspace,
  connections: Connection[],
  llmHealthy: boolean
): OrchestrationState {
  const platformAgents = workspace.agentBindings?.filter(b => b.status === 'active') || [];
  
  // 场景1: 有外部平台主Agent可用 → platform-led（驾驶舱后台化）
  if (platformAgents.length > 0 && hasPrimaryAgent(platformAgents)) {
    return {
      mode: 'platform-led',
      health: 'healthy',
      primaryAgent: findPrimaryAgent(platformAgents),
      activeAgents: platformAgents.map(toAgentRef),
      cockpitAgentActive: false,  // 后台化，仅在必要时接管
      reason: '外部平台智能体正常运行，驾驶舱智能体已后台化'
    };
  }
  
  // 场景2: 无外部Agent但LLM可用 → llm-direct（驾驶舱自身作为LLM智能体）
  if (llmHealthy && workspace.agentMode === 'llm-only') {
    return {
      mode: 'llm-direct',
      health: 'healthy',
      primaryAgent: COCKPIT_AGENT_REF,  // 驾驶舱自身
      activeAgents: [COCKPIT_AGENT_REF],
      cockpitAgentActive: true,
      reason: 'LLM直连模式，智能驾驶舱独立运行'
    };
  }
  
  // 场景3: 外部Agent不可用但LLM可用 → cockpit-led（降级，自身接管）
  if (llmHealthy) {
    return {
      mode: 'cockpit-led',
      health: 'degraded',
      primaryAgent: COCKPIT_AGENT_REF,
      activeAgents: [COCKPIT_AGENT_REF, ...platformAgents.map(toAgentRef)],
      cockpitAgentActive: true,
      reason: '外部平台智能体不可用，智能驾驶舱已接管'
    };
  }
  
  // 场景4: 完全不可用
  return {
    mode: 'cockpit-led',
    health: 'unavailable',
    primaryAgent: null,
    activeAgents: platformAgents.map(toAgentRef),
    cockpitAgentActive: false,
    reason: 'LLM连接不可用，智能体功能受限'
  };
}
```

### 2.3 自适应后台化机制

**当外部平台Agent可用时：**
- 驾驶舱自身智能体进入「后台监视」模式
- 只负责：数据聚合、UI渲染、事件转发
- 不主动参与决策，将用户指令透传给外部主Agent
- 保留「紧急接管」能力：当外部Agent超时/错误时自动切换

**当外部平台Agent不可用时：**
- 驾驶舱智能体自动「前台激活」
- 接管所有决策、规划、执行
- 通过 LLM 独立完成驾驶舱操作

---

## 三、前端交互设计方案

### 3.1 驾驶舱卡片状态展示

```
┌─────────────────────────────────────┐
│ 📊 销售驾驶舱                        │
│ 智能分析销售数据...                   │
│                                     │
│ ◉ 销售助手(主)  ● 财务管家  ● 供应链  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ 5组件 · 刚刚更新                      │
└─────────────────────────────────────┘
```

卡片底部显示：
- `◉` 主Agent（实心圆）
- `●` 活跃Agent（空心圆）
- `○` 离线Agent（虚线圆）
- 最多显示3个，超出显示 `+2`

### 3.2 详情页智能体身份展示

**当前状态（需优化）：**
- 右上角：一排圆形 emoji 头像，无身份说明
- 点击后：弹出 Agent Detail Banner

**优化后设计：**

```
┌────────────────────────────────────────────────────────┐
│ ◀ │ 📊 │ 销售驾驶舱 · 智能驾驶舱  │                    │
│    │    │ [平台主导] 由 销售助手 主控              │ 🔄 🗑 │
├────────────────────────────────────────────────────────┤
│ 协作智能体:  销售助手(主)  财务管家  供应链管家  +3    │
│            ◉李明           ●张华     ○赵强            │
├────────────────────────────────────────────────────────┤
│                                                        │
│  [画布区域]                                             │
│                                                        │
├────────────────────────────────────────────────────────┤
│ 🤖 销售助手: 本月销售额同比增长23%，需要我做什么？       │
│ [______________________________________________] [发送] │
└────────────────────────────────────────────────────────┘
```

**智能体身份卡片（hover 展开）：**
```
┌────────────────────────────────┐
│  🤖  销售助手                    │
│      主控智能体 · YonClaw平台    │
│      负责：数据分析、客户管理     │
│      最近活动：2分钟前           │
│      状态：● 运行中              │
└────────────────────────────────┘
```

### 3.3 聊天对话框优化

**当前问题：**
- 只有一个输入框，不显示当前对话的是哪个智能体
- 没有智能体上下文

**优化后：**

```
┌─────────────────────────────────────────┐
│ 💬 正在与 销售助手 对话 (YonClaw)        │
│ ─────────────────────────────────────── │
│ 🤖 销售助手 · 刚刚                        │
│ 本月销售额2,847万，同比增长23%。有什么    │
│ 需要分析的？                              │
│                                         │
│ 👤 我 · 2分钟前                          │
│ 帮我添加一个客户转化漏斗图表               │
│                                         │
│ 🤖 销售助手 · 1分钟前                     │
│ 已添加「客户转化漏斗」图表                 │
│ [查看结果]                                │
│ ───────────────────────────────────────  │
│ [智能体: 销售助手 ▼] [________________] [➤]│
└─────────────────────────────────────────┘
```

**底部输入区：**
- 左侧：智能体选择器（下拉选择当前对话对象）
- 默认：主Agent 或 驾驶舱自身智能体
- 支持 @agent 语法切换

### 3.4 智能体头像方案

**设计原则：** 使用 Lucide 图标 + 渐变色彩，替代 emoji

```typescript
const AGENT_AVATAR_MAP: Record<string, { icon: string; gradient: string }> = {
  'cockpit':       { icon: 'Sparkles',      gradient: 'from-violet-500 to-fuchsia-500' },
  'sales-agent':   { icon: 'TrendingUp',    gradient: 'from-blue-500 to-cyan-500' },
  'hr-agent':      { icon: 'Users',         gradient: 'from-emerald-500 to-teal-500' },
  'finance-agent': { icon: 'DollarSign',    gradient: 'from-amber-500 to-orange-500' },
  'supply-chain-agent': { icon: 'Truck',    gradient: 'from-orange-500 to-red-500' },
  'marketing-agent':    { icon: 'Target',   gradient: 'from-purple-500 to-pink-500' },
  'it-agent':      { icon: 'Monitor',       gradient: 'from-rose-500 to-red-500' },
  'legal-agent':   { icon: 'Scale',         gradient: 'from-slate-500 to-gray-500' },
  'customer-service-agent': { icon: 'MessageSquare', gradient: 'from-sky-500 to-blue-500' },
};

// 外部平台Agent（无预设时）按平台分配颜色
const PLATFORM_GRADIENTS: Record<string, string> = {
  'yonclaw':   'from-indigo-500 to-blue-600',
  'openclaw':  'from-emerald-500 to-green-600',
  'hermes':    'from-amber-500 to-yellow-600',
  'generic-llm': 'from-violet-500 to-purple-600',
};
```

**头像渲染组件：**
```tsx
<AgentAvatar
  agent={agent}
  size="sm" | "md" | "lg"
  showStatus={true}   // 显示在线/离线状态点
  showRole={true}     // 显示主控/协作标签
/>
```

---

## 四、上下文存储设计

### 4.1 上下文数据模型

```typescript
interface CockpitContext {
  workspaceId: string;
  version: number;
  
  // 驾驶舱摘要（用于LLM快速理解）
  summary: {
    name: string;
    description: string;
    purpose: string;           // LLM生成的用途摘要
    keyMetrics: string[];      // 关键指标列表
    lastUpdated: string;
  };
  
  // 智能体上下文
  agents: {
    primary: AgentContext;
    collaborators: AgentContext[];
    orchestrationMode: string;
    healthStatus: string;
  };
  
  // 组件上下文
  widgets: {
    count: number;
    types: Record<string, number>;  // 各类型数量
    highlights: string[];           // 关键数据亮点
  };
  
  // 最近操作记录（用于上下文恢复）
  recentActions: Array<{
    action: string;
    agent: string;
    result: string;
    timestamp: string;
  }>;
  
  // 用户偏好
  userPreferences: {
    preferredView: string;
    lastCommand: string;
    frequentlyUsedWidgets: string[];
  };
}

interface AgentContext {
  id: string;
  name: string;
  role: 'primary' | 'collaborator' | 'observer';
  status: string;
  capabilities: string[];
  recentContributions: string[];
}
```

### 4.2 上下文生成策略

**首次生成：** 驾驶舱创建/初始化时，由 LLM 生成摘要
**增量更新：** 每次 widget 变更时更新 highlights
**定时刷新：** 每5分钟重新生成 summary（如果数据有变化）

### 4.3 对话时上下文注入

```typescript
function buildChatContext(workspace: Workspace, context: CockpitContext): string {
  return `【驾驶舱上下文】
名称：${context.summary.name}
用途：${context.summary.purpose}
当前状态：${context.agents.orchestrationMode}，${context.agents.healthStatus}
主控智能体：${context.agents.primary.name}（${context.agents.primary.status}）
协作智能体：${context.agents.collaborators.map(a => a.name).join('、') || '无'}
组件概况：共${context.widgets.count}个组件，${Object.entries(context.widgets.types).map(([k,v]) => `${k}:${v}`).join('、')}
关键数据：${context.widgets.highlights.join('；')}
最近操作：${context.recentActions.slice(-3).map(a => `${a.agent} ${a.action}`).join('；')}

用户当前查看的是「${workspace.name}」驾驶舱。请基于以上上下文回答用户问题。`;
}
```

---

## 五、LLM 驾驶舱操作能力增强

### 5.1 现有能力

| 操作 | 已有工具 | 状态 |
|------|----------|------|
| 添加组件 | `cockpit_update` + `add_widget` | ✅ |
| 删除组件 | `cockpit_update` + `remove_widget` | ✅ |
| 修改组件 | `cockpit_update` + `update_widget` | ✅ |
| 修改配置 | `cockpit_update` + `update_config` | ✅ |
| 查询数据 | `cockpit_query` | ✅ |
| 列出驾驶舱 | `cockpit_list` | ✅ |

### 5.2 需增强的能力

| 操作 | 新增/增强 | 说明 |
|------|-----------|------|
| **调整布局** | 新增 `rearrange_layout` | 自动/手动调整widget位置 |
| **修改名称/描述** | 增强 `update_config` | 前端编辑态已支持，需LLM也能操作 |
| **洞察分析** | 新增 `generate_insight` | 对现有数据生成洞察报告 |
| **切换Agent模式** | 新增 `switch_agent_mode` | 切换single/multi/llm-only |
| **调用外部Agent** | 增强 `agent_invoke` | 支持指定参数调用 |
| **创建驾驶舱** | 已有 `cockpit_create` | 需增强从对话中创建 |

### 5.3 对话式操作示例

```
用户: 帮我把销售漏斗移到第一行
LLM: [调用 rearrange_layout]
→ 成功移动「销售漏斗」到 (x:0, y:0)

用户: 给这个驾驶舱改个名字叫「Q4销售战报」
LLM: [调用 update_config]
→ 已更新名称为「Q4销售战报」

用户: 分析一下为什么成交率下降了
LLM: [调用 generate_insight]
→ 生成洞察报告widget

用户: 让财务管家看一下这些数据
LLM: [调用 agent_invoke]
→ 转发请求到财务管家
```

---

## 六、实现阶段规划

### Phase 1: 基础架构（核心）
**目标：** 建立多智能体协作的基础数据流和状态管理

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 1.1 后端：AgentDiscoveryService 增强 | `server/src/services/agent-discovery.ts` | 中 |
| 1.2 后端：Orchestrator 调度器 | `server/src/services/orchestrator.ts` | 大 |
| 1.3 后端：上下文生成服务 | `server/src/services/context-builder.ts` | 中 |
| 1.4 后端：Agent状态同步API | `server/src/routes/agents.ts` | 小 |
| 1.5 前端：Agent头像组件 | `src/components/AgentAvatar.tsx` | 小 |
| 1.6 前端：Agent状态展示优化 | `src/components/WorkspaceDetail.tsx` | 中 |

### Phase 2: 前端交互（体验）
**目标：** 优化智能体展示和对话交互

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 2.1 卡片Agent状态指示器 | `src/components/WorkspaceView.tsx` | 小 |
| 2.2 Agent身份卡片（hover详情）| `src/components/AgentIdentityCard.tsx` | 中 |
| 2.3 聊天智能体选择器 | `src/components/WorkspaceDetail.tsx` | 中 |
| 2.4 聊天上下文注入 | `src/api/client.ts` + 后端 | 中 |
| 2.5 底部对话框Agent标识 | `src/components/WorkspaceDetail.tsx` | 小 |

### Phase 3: 能力增强（功能）
**目标：** 增强LLM对驾驶舱的操作能力

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 3.1 布局调整工具 | `server/src/services/meta-agent.ts` | 中 |
| 3.2 洞察生成工具 | `server/src/services/meta-agent.ts` | 中 |
| 3.3 Agent模式切换 | `server/src/services/meta-agent.ts` | 小 |
| 3.4 对话式操作指令增强 | `server/src/agent/engine/intent-fusion.ts` | 中 |

### Phase 4: 自适应调度（高级）
**目标：** 实现驾驶舱智能体的自适应后台化

| 任务 | 文件 | 工作量 |
|------|------|--------|
| 4.1 健康检查定时器 | `server/src/services/orchestrator.ts` | 中 |
| 4.2 状态迁移逻辑 | `server/src/services/orchestrator.ts` | 大 |
| 4.3 透传/接管切换 | `server/src/services/meta-agent.ts` | 大 |
| 4.4 前端状态展示 | `src/components/WorkspaceDetail.tsx` | 中 |

---

## 七、关键决策确认

### 7.1 自适应后台化策略

**问题：** 当外部平台Agent可用时，驾驶舱自身智能体完全后台化还是保留部分能力？

**方案A（完全后台化）：**
- 外部Agent可用时，驾驶舱自身完全不参与决策
- 所有用户指令直接透传给外部主Agent
- 驾驶舱只负责UI渲染和数据展示
- **优点：** 简单清晰，不会与外部Agent冲突
- **缺点：** 外部Agent故障时切换有明显延迟

**方案B（保留监控+紧急接管）：**
- 外部Agent可用时，驾驶舱自身进入「监控模式」
- 正常指令透传给外部Agent
- 外部Agent超时/错误时，驾驶舱自动接管
- **优点：** 用户体验更平滑，故障切换无感
- **缺点：** 逻辑更复杂，需要定义接管条件

**推荐：方案B**，因为用户明确提到"仅在必要时接管"

### 7.2 头像方案

**方案A（Lucide图标+渐变色）：**
- 预定义一组图标映射
- 外部Agent按平台分配颜色
- **优点：** 统一、美观、有品牌感
- **缺点：** 需要维护映射表

**方案B（首字母+随机色）：**
- 用Agent名称首字母
- HSL随机色但保持饱和度一致
- **优点：** 无需映射，自动适配
- **缺点：** 辨识度不如图标

**推荐：方案A为主，方案B为fallback**

### 7.3 上下文存储位置

**方案A（后端存储）：**
- 存储在 workspaceStore 中
- 每次对话时由后端注入上下文
- **优点：** 前后端一致，LLM始终有完整上下文
- **缺点：** 需要后端API支持

**方案B（前端本地缓存）：**
- 存储在 localStorage
- 前端构建上下文后发送给LLM
- **优点：** 实现简单
- **缺点：** 多设备不一致，数据可能过期

**推荐：方案A**，在 workspace 数据模型中增加 `context` 字段

---

## 八、需用户确认的问题

1. **Phase优先级：** 您希望按上述Phase顺序实现，还是有优先调整？
2. **后台化策略：** 确认采用"方案B（保留监控+紧急接管）"？
3. **头像方案：** 确认采用"Lucide图标+渐变色"为主方案？
4. **上下文存储：** 确认采用后端存储方案，在 workspace 中增加 `context` 字段？
5. **Agent模式切换：** 是否需要在前端提供手动切换 AgentMode 的UI（如从single切换到multi-coordinator）？
