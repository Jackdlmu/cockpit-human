import { useMemo } from 'react';
import type { BusinessWidgetType, Widget } from '@/types';
import {
  AlertTriangle,
  Bell,
  Clock3,
  FileCheck2,
  Lightbulb,
  Plus,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

type GridSize = { w: number; h: number };

interface BusinessWidgetRendererProps {
  widget: Widget;
  data: Record<string, unknown>;
  gridSize: GridSize;
}

interface BusinessAction {
  id: string;
  label: string;
  type?: string;
  tone?: 'primary' | 'neutral' | 'danger';
}

interface BusinessMessage {
  id: string;
  type: 'approval' | 'todo' | 'notification' | 'alert';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'processing' | 'done' | 'rejected' | 'expired';
  title: string;
  summary: string;
  source: string;
  createdAt: string;
  dueAt?: string;
  owner?: string;
  intelligence?: {
    riskLevel?: 'high' | 'medium' | 'low';
    recommendation?: string;
    reason?: string;
    confidence?: number;
  };
  actions?: BusinessAction[];
}

interface CalendarEvent {
  id: string;
  title: string;
  type: 'meeting' | 'deadline' | 'approval' | 'risk' | 'reminder' | 'milestone';
  start: string;
  end?: string;
  location?: string;
  participants?: string[];
  source: string;
  status?: 'scheduled' | 'done' | 'cancelled' | 'conflict';
  actions?: BusinessAction[];
}

interface InsightItem {
  id: string;
  title: string;
  type: 'risk' | 'opportunity' | 'anomaly' | 'recommendation' | 'summary';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  evidence?: Array<{ label: string; value: string; source?: string }>;
  recommendation?: string;
  confidence?: number;
  actions?: BusinessAction[];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toString(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeActions(value: unknown): BusinessAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = toRecord(item);
      if (!record) return null;
      const action: BusinessAction = {
        id: toString(record.id, `action-${index}`),
        label: toString(record.label || record.name, '处理'),
        type: toString(record.type),
        tone: toString(record.tone || record.variant) as BusinessAction['tone'],
      };
      return action;
    })
    .filter((item): item is BusinessAction => item !== null);
}

function normalizeMessages(data: Record<string, unknown>): BusinessMessage[] {
  const source = data.messages || data.items || data.approvals || [];
  if (!Array.isArray(source)) return [];
  return source
    .map((item, index) => {
      const record = toRecord(item);
      if (!record) return null;
      const intelligence = toRecord(record.intelligence);
      const normalizedIntelligence: BusinessMessage['intelligence'] | undefined = intelligence
        ? {
            riskLevel: toString(intelligence.riskLevel || intelligence.risk, 'medium') as NonNullable<BusinessMessage['intelligence']>['riskLevel'],
            recommendation: toString(intelligence.recommendation || intelligence.suggestion, ''),
            reason: toString(intelligence.reason, ''),
            confidence: Number(intelligence.confidence ?? 0),
          }
        : undefined;
      const message: BusinessMessage = {
        id: toString(record.id, `message-${index}`),
        type: toString(record.type, 'approval') as BusinessMessage['type'],
        priority: toString(record.priority, 'medium') as BusinessMessage['priority'],
        status: toString(record.status, 'pending') as BusinessMessage['status'],
        title: toString(record.title || record.name, '待处理事项'),
        summary: toString(record.summary || record.description || record.content, ''),
        source: toString(record.source || record.system, '业务系统'),
        createdAt: toString(record.createdAt || record.time, ''),
        dueAt: toString(record.dueAt || record.deadline, ''),
        owner: toString(record.owner || record.assignee, ''),
        intelligence: normalizedIntelligence,
        actions: normalizeActions(record.actions),
      };
      return message;
    })
    .filter((item): item is BusinessMessage => item !== null);
}

function normalizeEvents(data: Record<string, unknown>): CalendarEvent[] {
  const source = data.events || data.items || data.schedules || [];
  if (!Array.isArray(source)) return [];
  return source
    .map((item, index) => {
      const record = toRecord(item);
      if (!record) return null;
      const participants = Array.isArray(record.participants) ? record.participants.map(String) : [];
      const event: CalendarEvent = {
        id: toString(record.id, `event-${index}`),
        title: toString(record.title || record.name, '日程事项'),
        type: toString(record.type, 'meeting') as CalendarEvent['type'],
        start: toString(record.start || record.startAt || record.time, ''),
        end: toString(record.end || record.endAt, ''),
        location: toString(record.location, ''),
        participants,
        source: toString(record.source || record.calendar, '日程系统'),
        status: toString(record.status, 'scheduled') as CalendarEvent['status'],
        actions: normalizeActions(record.actions),
      };
      return event;
    })
    .filter((item): item is CalendarEvent => item !== null);
}

function normalizeInsights(data: Record<string, unknown>): InsightItem[] {
  const source = data.insights || data.items || data.reports || [];
  if (!Array.isArray(source)) return [];
  return source
    .map((item, index) => {
      const record = toRecord(item);
      if (!record) return null;
      const evidence: NonNullable<InsightItem['evidence']> = Array.isArray(record.evidence)
        ? record.evidence
            .map((entry) => {
              const evidenceRecord = toRecord(entry);
              if (!evidenceRecord) return null;
              return {
                label: toString(evidenceRecord.label || evidenceRecord.name, '证据'),
                value: toString(evidenceRecord.value || evidenceRecord.summary, '—'),
                source: toString(evidenceRecord.source, ''),
              };
            })
            .filter((entry): entry is { label: string; value: string; source: string } => entry !== null)
        : [];
      const insight: InsightItem = {
        id: toString(record.id, `insight-${index}`),
        title: toString(record.title || record.name, '业务洞察'),
        type: toString(record.type, 'summary') as InsightItem['type'],
        severity: toString(record.severity || record.priority, 'medium') as InsightItem['severity'],
        summary: toString(record.summary || record.description || record.content, ''),
        evidence,
        recommendation: toString(record.recommendation || record.suggestion, ''),
        confidence: Number(record.confidence ?? 0),
        actions: normalizeActions(record.actions),
      };
      return insight;
    })
    .filter((item): item is InsightItem => item !== null);
}

function priorityClasses(priority?: string) {
  switch (priority) {
    case 'critical':
      return { dot: 'bg-red-500', bg: 'bg-red-500/8', text: 'text-red-500', border: 'border-red-500/20' };
    case 'high':
      return { dot: 'bg-orange-500', bg: 'bg-orange-500/8', text: 'text-orange-500', border: 'border-orange-500/20' };
    case 'low':
      return { dot: 'bg-sky-500', bg: 'bg-sky-500/8', text: 'text-sky-500', border: 'border-sky-500/20' };
    default:
      return { dot: 'bg-amber-500', bg: 'bg-amber-500/8', text: 'text-amber-500', border: 'border-amber-500/20' };
  }
}

function actionClass(action: BusinessAction) {
  if (action.tone === 'danger' || action.type === 'reject') {
    return 'border-red-500/20 bg-red-500/8 text-red-500 hover:bg-red-500/12';
  }
  if (action.tone === 'primary' || action.type === 'approve' || action.type === 'create') {
    return 'border-primary/20 bg-primary/8 text-primary hover:bg-primary/12';
  }
  return 'border-app-border-subtle bg-app-surface-subtle text-app-text-muted hover:text-app-text-secondary';
}

function BusinessEmptyState({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-app-text-subtle">
      <Sparkles className="h-5 w-5" />
      <div className="text-[13px] font-medium">暂无业务数据</div>
      <div className="text-[11px] text-app-text-muted">{title}</div>
    </div>
  );
}

function ActionButtons({ actions, compact = false }: { actions?: BusinessAction[]; compact?: boolean }) {
  const visible = (actions || []).slice(0, compact ? 2 : 3);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={(event) => event.stopPropagation()}
          className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${actionClass(action)}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function MessageCenter({ widget, data, gridSize }: BusinessWidgetRendererProps) {
  const messages = normalizeMessages(data);
  const visible = messages.slice(0, gridSize.h <= 3 ? 3 : 5);
  const pendingApprovals = messages.filter((item) => item.type === 'approval' && item.status === 'pending').length;
  const alerts = messages.filter((item) => item.type === 'alert' || item.priority === 'critical' || item.priority === 'high').length;
  const overdue = messages.filter((item) => item.status === 'expired').length;
  const hasData = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <BusinessStat label="待审批" value={pendingApprovals} tone="primary" icon={FileCheck2} />
        <BusinessStat label="预警" value={alerts} tone="warning" icon={ShieldAlert} />
        <BusinessStat label="超时" value={overdue} tone="danger" icon={Clock3} />
      </div>

      {!hasData && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-app-border-subtle bg-app-surface-subtle/30 px-4 py-6 text-center">
          <FileCheck2 className="h-5 w-5 text-app-text-subtle" />
          <div className="text-[13px] font-medium text-app-text-secondary">暂无待处理事项</div>
          <div className="text-[11px] text-app-text-muted">当前没有审批、预警或待办消息</div>
          {gridSize.h >= 4 && (
            <div className="mt-1 text-[11px] text-app-text-subtle">
              系统会定时拉取最新业务数据，有新消息时将自动显示
            </div>
          )}
        </div>
      )}

      {hasData && (
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sidebar-scroll">
        {visible.map((message) => {
          const cfg = priorityClasses(message.priority);
          const risk = message.intelligence?.riskLevel ? priorityClasses(message.intelligence.riskLevel === 'high' ? 'high' : message.intelligence.riskLevel) : null;
          return (
            <div key={message.id} className={`rounded-lg border ${cfg.border} bg-app-surface/80 px-3 py-2.5 transition-colors hover:bg-app-surface-hover`}>
              <div className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-app-text-secondary">{message.title}</span>
                    {message.type === 'approval' && (
                      <span className="shrink-0 rounded-full border border-primary/15 bg-primary/8 px-1.5 py-0.5 text-[10px] text-primary">审批</span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-app-text-muted">{message.summary}</p>
                  {message.intelligence?.recommendation && gridSize.h >= 4 && (
                    <div className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-5 ${risk?.bg || 'bg-app-surface-subtle'} ${risk?.border || 'border-app-border-subtle'} ${risk?.text || 'text-app-text-muted'}`}>
                      {message.intelligence.recommendation}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[10px] text-app-text-subtle">{message.source}{message.dueAt ? ` · 截止 ${message.dueAt}` : ''}</span>
                    <ActionButtons actions={message.actions} compact />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function BusinessStat({ label, value, tone, icon: Icon }: { label: string; value: number | string; tone: 'primary' | 'warning' | 'danger' | 'info'; icon: typeof Bell }) {
  const classes = {
    primary: 'border-primary/15 bg-primary/8 text-primary',
    warning: 'border-amber-500/15 bg-amber-500/8 text-amber-500',
    danger: 'border-red-500/15 bg-red-500/8 text-red-500',
    info: 'border-sky-500/15 bg-sky-500/8 text-sky-500',
  }[tone];

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${classes}`}>
      <div className="flex items-center gap-1.5 text-[10px]">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function CalendarWidget({ widget, data, gridSize }: BusinessWidgetRendererProps) {
  const events = normalizeEvents(data);
  const visible = events.slice(0, gridSize.h <= 3 ? 4 : 7);
  const todayCount = events.filter((event) => event.start.includes('今天') || event.start.includes('09:') || event.start.includes('14:')).length;
  const conflicts = events.filter((event) => event.status === 'conflict').length;
  const hasData = events.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border border-app-border-subtle bg-app-surface-subtle/50 px-3 py-2.5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-app-text-muted">今日日程</div>
          <div className="mt-0.5 text-xl font-semibold text-app-text">{todayCount || events.length}</div>
        </div>
        <div className="flex items-center gap-2">
          {conflicts > 0 && <span className="rounded-full border border-red-500/15 bg-red-500/8 px-2 py-1 text-[10px] text-red-500">{conflicts} 个冲突</span>}
          <button type="button" className="rounded-md border border-primary/15 bg-primary/8 p-1.5 text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!hasData && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-app-border-subtle bg-app-surface-subtle/30 px-4 py-6 text-center">
          <Clock3 className="h-5 w-5 text-app-text-subtle" />
          <div className="text-[13px] font-medium text-app-text-secondary">暂无日程安排</div>
          <div className="text-[11px] text-app-text-muted">当前没有会议、审批截止或风险提醒</div>
          {gridSize.h >= 4 && (
            <div className="mt-1 text-[11px] text-app-text-subtle">
              点击右上角 + 可手动添加日程，或等待系统自动同步企业日历
            </div>
          )}
        </div>
      )}

      {hasData && (
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 sidebar-scroll">
        <div className="relative space-y-2 pl-5 before:absolute before:left-1.5 before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-app-border-subtle">
          {visible.map((event) => {
            const cfg = event.status === 'conflict'
              ? priorityClasses('critical')
              : event.type === 'approval' || event.type === 'deadline'
                ? priorityClasses('high')
                : priorityClasses('low');
            return (
              <div key={event.id} className="relative rounded-lg border border-app-border-subtle bg-app-surface/80 px-3 py-2.5">
                <span className={`absolute -left-[18px] top-3 h-3 w-3 rounded-full border-2 border-widget-bg ${cfg.dot}`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-app-text-secondary">{event.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-app-text-muted">
                      <span>{event.start}{event.end ? ` - ${event.end}` : ''}</span>
                      {event.location && <span>· {event.location}</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${cfg.bg} ${cfg.border} ${cfg.text}`}>{event.type === 'approval' ? '审批' : event.type === 'risk' ? '风险' : '日程'}</span>
                </div>
                {event.participants && event.participants.length > 0 && gridSize.h >= 4 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-app-text-subtle">
                    <Users className="h-3 w-3" />
                    <span className="truncate">{event.participants.slice(0, 3).join('、')}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] text-app-text-subtle">{event.source}</span>
                  <ActionButtons actions={event.actions} compact />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

function InsightHub({ widget, data, gridSize }: BusinessWidgetRendererProps) {
  const insights = normalizeInsights(data);
  const visible = insights.slice(0, gridSize.h <= 3 ? 3 : 5);
  const highRisk = insights.filter((item) => item.severity === 'critical' || item.severity === 'high').length;
  const opportunity = insights.filter((item) => item.type === 'opportunity' || item.type === 'recommendation').length;
  const avgConfidence = insights.length > 0
    ? Math.round(insights.reduce((sum, item) => sum + (item.confidence || 0), 0) / insights.length)
    : 0;

  if (insights.length === 0) return <BusinessEmptyState title={widget.title} />;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <BusinessStat label="高风险" value={highRisk} tone="danger" icon={AlertTriangle} />
        <BusinessStat label="机会" value={opportunity} tone="primary" icon={TrendingUp} />
        <BusinessStat label="可信度" value={`${avgConfidence}%`} tone="info" icon={Sparkles} />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sidebar-scroll">
        {visible.map((insight) => {
          const cfg = priorityClasses(insight.severity);
          return (
            <div key={insight.id} className={`rounded-lg border ${cfg.border} bg-app-surface/80 px-3 py-2.5`}>
              <div className="flex items-start gap-2.5">
                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${cfg.bg} ${cfg.text}`}>
                  {insight.type === 'opportunity' ? <TrendingUp className="h-3.5 w-3.5" /> : insight.type === 'recommendation' ? <Lightbulb className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-app-text-secondary">{insight.title}</span>
                    {insight.confidence ? <span className="shrink-0 text-[10px] text-app-text-subtle">{insight.confidence}%</span> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-app-text-muted">{insight.summary}</p>
                  {insight.evidence && insight.evidence.length > 0 && gridSize.h >= 4 && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {insight.evidence.slice(0, 2).map((item, index) => (
                        <div key={`${item.label}-${index}`} className="rounded-md border border-app-border-subtle bg-app-surface-subtle/55 px-2 py-1.5">
                          <div className="truncate text-[10px] text-app-text-subtle">{item.label}</div>
                          <div className="mt-0.5 truncate text-[12px] font-semibold text-app-text-secondary">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {insight.recommendation && (
                    <div className="mt-2 rounded-md border border-primary/15 bg-primary/8 px-2 py-1.5 text-[11px] leading-5 text-primary">
                      {insight.recommendation}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-app-text-subtle">基于驾驶舱上下文生成</span>
                    <ActionButtons actions={insight.actions} compact />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BusinessWidgetRenderer(props: BusinessWidgetRendererProps) {
  const businessType = useMemo(() => {
    const configured = props.widget.business?.businessType || props.data.businessType || props.data.kind;
    return toString(configured, 'message-center') as BusinessWidgetType;
  }, [props.widget.business?.businessType, props.data.businessType, props.data.kind]);

  if (businessType === 'calendar') return <CalendarWidget {...props} />;
  if (businessType === 'insight-hub') return <InsightHub {...props} />;
  return <MessageCenter {...props} />;
}

export function createDefaultBusinessData(type: BusinessWidgetType): Record<string, unknown> {
  if (type === 'calendar') {
    return {
      businessType: 'calendar',
      events: [
        { id: 'cal-1', title: '经营例会：现金流与回款复盘', type: 'meeting', start: '今天 09:30', end: '10:30', location: '线上会议', participants: ['CFO', '销售总监', '财务BP'], source: '企业日历', actions: [{ id: 'join', label: '加入', type: 'open' }] },
        { id: 'cal-2', title: '采购合同审批截止', type: 'approval', start: '今天 14:00', source: '审批中心', status: 'conflict', actions: [{ id: 'view', label: '查看审批', type: 'open' }] },
        { id: 'cal-3', title: '华东区逾期风险跟进', type: 'risk', start: '明天 11:00', participants: ['区域经理'], source: '洞察中心', actions: [{ id: 'todo', label: '创建待办', type: 'create' }] },
      ],
    };
  }

  if (type === 'insight-hub') {
    return {
      businessType: 'insight-hub',
      insights: [
        {
          id: 'insight-1',
          title: '华东回款风险需要提前干预',
          type: 'risk',
          severity: 'high',
          summary: '审批流中有 2 笔大额折扣申请与逾期客户重叠，可能影响本周现金流目标。',
          confidence: 86,
          evidence: [{ label: '逾期金额', value: '860万' }, { label: '关联审批', value: '2 单' }],
          recommendation: '建议要求区域负责人补充回款承诺，并将审批升级为 CFO 复核。',
          actions: [{ id: 'report', label: '生成报告', type: 'create', tone: 'primary' }, { id: 'schedule', label: '加入日程', type: 'create' }],
        },
        {
          id: 'insight-2',
          title: '费用率改善存在结构性机会',
          type: 'opportunity',
          severity: 'medium',
          summary: '研发费用率保持稳定，销售费用率环比下降 1.2 个百分点，可进一步复用高效区域打法。',
          confidence: 78,
          evidence: [{ label: '销售费用率', value: '-1.2pp' }, { label: '高效区域', value: '华南' }],
          actions: [{ id: 'brief', label: '形成摘要', type: 'create' }],
        },
      ],
    };
  }

  return {
    businessType: 'message-center',
    messages: [
      {
        id: 'msg-1',
        type: 'approval',
        priority: 'critical',
        status: 'pending',
        title: '大额采购合同审批',
        summary: '供应商年度框架合同金额 1,280 万，超过预算阈值，需要 CFO 审批。',
        source: 'YonClaw 审批技能',
        dueAt: '今天 18:00',
        intelligence: { riskLevel: 'high', recommendation: '建议核对预算占用与供应商历史履约评分后再审批。', confidence: 88 },
        actions: [{ id: 'approve', label: '同意', type: 'approve', tone: 'primary' }, { id: 'reject', label: '驳回', type: 'reject', tone: 'danger' }, { id: 'transfer', label: '转交', type: 'transfer' }],
      },
      {
        id: 'msg-2',
        type: 'alert',
        priority: 'high',
        status: 'pending',
        title: '现金流预警',
        summary: '本周预计回款低于目标 12%，其中华东区偏差最大。',
        source: '洞察中心',
        actions: [{ id: 'detail', label: '查看', type: 'open' }],
      },
      {
        id: 'msg-3',
        type: 'todo',
        priority: 'medium',
        status: 'processing',
        title: '补充预算调整说明',
        summary: '费用结构分析组件提示管理费用偏差，需要补充调整原因。',
        source: '驾驶舱智能体',
        actions: [{ id: 'comment', label: '补充说明', type: 'comment' }],
      },
    ],
  };
}
