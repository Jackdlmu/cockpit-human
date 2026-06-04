export type AgentMode = 'single' | 'multi-coordinator' | 'multi-parallel' | 'llm-only';

export interface AgentBinding {
  agentId: string;
  connectionId?: string;
  status: 'active' | 'unavailable' | 'pending';
  lastUsed?: string;
}

/** 智能体上下文摘要 */
export interface AgentContextRef {
  id: string;
  name: string;
  role: 'primary' | 'collaborator' | 'observer';
  status: string;
  capabilities: string[];
  recentContributions?: string[];
}

/** 驾驶舱智能上下文 */
export interface CockpitContext {
  version: number;
  summary: {
    name: string;
    description: string;
    purpose: string;
    keyMetrics: string[];
    lastUpdated: string;
  };
  agents: {
    primary: AgentContextRef | null;
    collaborators: AgentContextRef[];
    orchestrationMode: string;
    healthStatus: string;
  };
  widgets: {
    count: number;
    types: Record<string, number>;
    highlights: string[];
  };
  recentActions: Array<{
    action: string;
    agent: string;
    result: string;
    timestamp: string;
  }>;
}

/** 协作调度状态 */
export interface OrchestrationState {
  mode: 'platform-led' | 'cockpit-led' | 'llm-direct';
  health: 'healthy' | 'degraded' | 'unavailable';
  primaryAgent: { id: string; name: string; sourceType?: string } | null;
  activeAgents: { id: string; name: string; status: string }[];
  cockpitAgentActive: boolean;
  reason: string;
  timestamp: string;
}

export interface WorkspaceGrouping {
  enabled: boolean;
  groups?: Array<{
    id: string;
    name: string;
    widgetIds: string[];
  }>;
}

export interface WorkspaceData {
  id: string; name: string; description: string; icon: string; color: string;
  status: 'running' | 'stopped' | 'error';
  createdAt: string; updatedAt: string;
  agentIds: string[]; primaryAgentId: string;
  /** 多智能体模式 */
  agentMode?: AgentMode;
  /** 运行时智能体绑定状态 */
  agentBindings?: AgentBinding[];
  /** 智能体友好的上下文存储 */
  context?: CockpitContext;
  /** 当前协作调度状态 */
  orchestration?: OrchestrationState;
  widgets: any[];
  /** 数据获取失败时是否回退到 demo 示例数据 */
  useDemoDataFallback?: boolean;
  initializing?: boolean;
  initializationMode?: 'llm' | 'real-data';
  initializationJobId?: string;
  initializationError?: string;
  initializedAt?: string;
  /** 创建与运行主导方：外部平台主导时，本地智能体仅做兜底 */
  executionOwner?: 'cockpit' | 'external';
  /** 外部平台来源信息 */
  externalProvider?: 'yonclaw' | 'openclaw' | 'generic-llm' | 'other';
  externalWorkspaceId?: string;
  externalConnectionId?: string;
  /** 组件分组配置 */
  grouping?: WorkspaceGrouping;
}

export const workspacesData: WorkspaceData[] = [
  {
    id: 'ws-sales-dashboard', name: '销售业绩驾驶舱', color: '#6366f1', icon: 'BarChart3', status: 'running',
    description: '实时展示华东区销售数据、业绩趋势和客户排行，由销售助手+营销智脑联合驱动',
    createdAt: '2025-11-01', updatedAt: '2025-11-22', agentIds: ['sales-agent','marketing-agent'], primaryAgentId: 'sales-agent',
    widgets: [
      { id:'w1', type:'metric', title:'本月销售额', position:{x:0,y:0,w:3,h:2}, data:{value:'¥2,847万',change:'+23%',trend:'up'} },
      { id:'w2', type:'chart', title:'业绩趋势', position:{x:3,y:0,w:6,h:4}, data:{labels:['7月','8月','9月','10月','11月'],values:[820,956,1071,1250,980]} },
      { id:'w3', type:'table', title:'Top 5 客户', position:{x:0,y:2,w:3,h:4}, data:{rows:[['华为','¥580万'],['阿里','¥420万'],['腾讯','¥365万'],['比亚迪','¥310万'],['小米','¥285万']]} },
      { id:'w4', type:'metric', title:'订单转化率', position:{x:9,y:0,w:3,h:2}, data:{value:'68.5%',change:'+5.2%',trend:'up'} },
      { id:'w5', type:'kanban', title:'商机漏斗', position:{x:9,y:2,w:3,h:4}, data:{stages:['线索 3200','接触 1850','确认 1200','谈判 780']} },
    ],
  },
  {
    id: 'ws-hr-onboarding', name: '入职管理台', color: '#10b981', icon: 'UserPlus', status: 'running',
    description: '新员工入职全流程跟踪，HR助手+IT运维助手联合协作',
    createdAt: '2025-10-15', updatedAt: '2025-11-21', agentIds: ['hr-agent','it-agent'], primaryAgentId: 'hr-agent',
    widgets: [
      { id:'w1', type:'metric', title:'本月入职人数', position:{x:0,y:0,w:3,h:2}, data:{value:'12人',change:'+3',trend:'up'} },
      { id:'w2', type:'timeline', title:'入职进度', position:{x:3,y:0,w:9,h:4}, data:{steps:['信息录入✓','IT开通✓','经理确认→','工位分配','培训安排','权限开通']} },
      { id:'w3', type:'table', title:'待办入职', position:{x:0,y:2,w:6,h:4}, data:{rows:[['王小明','技术部','12/01','待确认'],['李红','市场部','12/03','信息录入'],['张伟','销售部','12/05','IT开通']]} },
      { id:'w4', type:'metric', title:'平均入职周期', position:{x:6,y:2,w:3,h:2}, data:{value:'3.2天',change:'-0.5',trend:'up'} },
    ],
  },
  {
    id: 'ws-finance-approval', name: '财务审批中心', color: '#f59e0b', icon: 'CheckCircle', status: 'running',
    description: '集中处理各类财务审批，财务管家+法务合规官联合审核',
    createdAt: '2025-09-20', updatedAt: '2025-11-22', agentIds: ['finance-agent','legal-agent'], primaryAgentId: 'finance-agent',
    widgets: [
      { id:'w1', type:'metric', title:'待审批', position:{x:0,y:0,w:3,h:2}, data:{value:'8笔',change:'-2',trend:'up'} },
      { id:'w2', type:'metric', title:'今日已审', position:{x:3,y:0,w:3,h:2}, data:{value:'15笔',change:'+5',trend:'up'} },
      { id:'w3', type:'table', title:'待审批列表', position:{x:0,y:2,w:6,h:4}, data:{rows:[['张明','差旅费','¥4,580','紧急'],['李娜','采购申请','¥12,000',''],['王强','加班补贴','¥2,400','']]} },
      { id:'w4', type:'chart', title:'审批趋势', position:{x:6,y:0,w:6,h:6}, data:{labels:['周一','周二','周三','周四','周五'],values:[8,12,15,10,18]} },
    ],
  },
  {
    id: 'ws-it-monitor', name: '系统监控大屏', color: '#ef4444', icon: 'Monitor', status: 'error',
    description: '实时监控系统运行状态，IT运维助手+客服小助手联合保障',
    createdAt: '2025-08-01', updatedAt: '2025-11-22', agentIds: ['it-agent','customer-service-agent'], primaryAgentId: 'it-agent',
    widgets: [
      { id:'w1', type:'metric', title:'系统可用性', position:{x:0,y:0,w:3,h:2}, data:{value:'99.2%',change:'-0.3%',trend:'down'} },
      { id:'w2', type:'metric', title:'活跃告警', position:{x:3,y:0,w:3,h:2}, data:{value:'3个',change:'+1',trend:'down'} },
      { id:'w3', type:'list', title:'告警列表', position:{x:0,y:2,w:6,h:4}, data:{items:['【严重】订单服务响应超时 > 5s','【警告】数据库连接池使用率 85%','【警告】CDN节点延迟增加']} },
      { id:'w4', type:'chart', title:'CPU/内存趋势', position:{x:6,y:0,w:6,h:6}, data:{labels:['00:00','04:00','08:00','12:00','16:00','20:00'],values:[45,38,62,78,85,72]} },
    ],
  },
  {
    id: 'ws-marketing-analysis', name: '营销分析驾驶舱', color: '#ec4899', icon: 'Target', status: 'running',
    description: '整合多渠道营销数据，营销智脑+销售助手联合分析ROI',
    createdAt: '2025-10-05', updatedAt: '2025-11-20', agentIds: ['marketing-agent','sales-agent'], primaryAgentId: 'marketing-agent',
    widgets: [
      { id:'w1', type:'metric', title:'本月ROI', position:{x:0,y:0,w:3,h:2}, data:{value:'4.8x',change:'+0.6',trend:'up'} },
      { id:'w2', type:'chart', title:'渠道转化漏斗', position:{x:3,y:0,w:6,h:4}, data:{labels:['曝光','点击','留资','试用','付费'],values:[50000,8500,3200,890,245]} },
      { id:'w3', type:'table', title:'渠道表现', position:{x:0,y:2,w:3,h:4}, data:{rows:[['百度搜索','¥45万','5.2x'],['信息流','¥32万','3.8x'],['抖音','¥28万','4.1x']]} },
      { id:'w4', type:'metric', title:'获客成本', position:{x:9,y:0,w:3,h:2}, data:{value:'¥185',change:'-12%',trend:'up'} },
    ],
  }
];
