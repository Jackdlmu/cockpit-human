import { useMemo } from 'react';
import type { Widget, WidgetType } from '@/types';
import { getDefaultWidgetSize, normalizeWidget, normalizeWidgets } from '@/lib/widget-normalizer';
import { WidgetRenderer } from './WorkspaceDetail';
import { createDefaultBusinessData } from './business/BusinessWidgetRenderer';

function sortWidgets(a: Widget, b: Widget) {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y;
  if (a.position.x !== b.position.x) return a.position.x - b.position.x;
  return a.title.localeCompare(b.title, 'zh-CN');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPlaceholderString(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === '' ||
    normalized === '-' ||
    normalized === '--' ||
    normalized === '—' ||
    normalized === 'n/a' ||
    normalized === 'null' ||
    normalized === 'undefined' ||
    normalized === '暂无数据' ||
    normalized === '待补充' ||
    normalized === 'loading'
  );
}

function isZeroLikeString(value: string) {
  const normalized = value.trim().replace(/,/g, '');
  return /^[-+]?0+(\.0+)?%?$/.test(normalized);
}

function isMeaningfulPreviewValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    return !isPlaceholderString(value) && !isZeroLikeString(value);
  }
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some((item) => isMeaningfulPreviewValue(item));
  if (isRecord(value)) return Object.values(value).some((item) => isMeaningfulPreviewValue(item));
  return true;
}

function mergePreviewValue(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;

  if (Array.isArray(base) && Array.isArray(override)) {
    return override.length > 0 ? override : base;
  }

  if (isRecord(base) && isRecord(override)) {
    return mergePreviewData(base, override);
  }

  if (typeof override === 'string') {
    return isMeaningfulPreviewValue(override) ? override : base;
  }

  if (typeof override === 'number') {
    return isMeaningfulPreviewValue(override) ? override : base;
  }

  if (typeof override === 'boolean') {
    return override || base === undefined ? override : base;
  }

  return override ?? base;
}

function mergePreviewData(base: Record<string, unknown>, override: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = mergePreviewValue(result[key], value);
  }
  return result;
}

function buildDefaultPreviewData(type: WidgetType, title: string): Record<string, unknown> {
  const subject = title || '业务指标';
  switch (type) {
    case 'metric':
      return {
        value: '12.8%',
        change: '+2.4%',
        trend: 'up',
        caption: `${subject}较上周持续改善`,
        compareValue: '10.4%',
        compareLabel: '上周',
        secondaryMetrics: [
          { label: '本期', value: '12.8%', change: '+2.4%', trend: 'up', tone: 'success' },
          { label: '目标', value: '13.5%', caption: '距离目标仍需跟进' },
        ],
      };
    case 'chart':
      return {
        labels: ['华北', '华东', '华南', '海外'],
        values: [92, 78, 66, 54],
      };
    case 'table':
      return {
        columns: ['项目', '当前', '目标'],
        rows: [
          { 项目: '收入达成', 当前: '82%', 目标: '80%' },
          { 项目: '回款进度', 当前: '76%', 目标: '75%' },
          { 项目: '费用率', 当前: '11.2%', 目标: '12%' },
        ],
      };
    case 'kanban':
      return {
        stages: ['目标识别', '取数分析', '组件编排', '交付验收'],
      };
    case 'timeline':
      return {
        steps: ['✓ 需求确认', '→ 数据整合', '驾驶舱生成', '经营复盘'],
      };
    case 'list':
      return {
        items: ['跟踪高风险客户回款', '复核预算偏差原因', '推进重点项目签约转化'],
      };
    case 'report':
      return {
        summary: `${subject}在最近一周期内整体平稳，核心指标延续改善趋势，但局部区域仍需继续跟进回款与费用控制。`,
        highlights: [
          { label: '经营现金流', value: '1.28亿元' },
          { label: '净利润率', value: '12.8%' },
          { label: '预算偏差', value: '-1.6%' },
        ],
      };
    case 'html':
      return {
        html: `
          <h1>${subject}摘要</h1>
          <p>当前经营质量延续改善，现金流与利润表现保持稳定。</p>
          <ul>
            <li>收入达成率 82%</li>
            <li>净利润率 12.8%</li>
            <li>重点区域回款已恢复</li>
          </ul>
        `,
      };
    case 'progress':
      return {
        value: 68,
        max: 100,
        label: '68 / 100',
        caption: `${subject}当前处于稳步推进阶段`,
      };
    case 'status':
      return {
        items: [
          { label: '预算执行', status: 'green', value: '正常' },
          { label: '回款进度', status: 'warning', value: '关注中' },
          { label: '系统数据', status: 'green', value: '已同步' },
        ],
      };
    case 'universal':
      return {
        metrics: [
          { label: '收入', value: '8,640万', change: '+6.2%', trend: 'up', tone: 'success' },
          { label: '现金流', value: '1.28亿', caption: '保持健康水位' },
        ],
        sections: [
          {
            type: 'text',
            title: '经营摘要',
            content: `${subject}已形成结构化结果，当前建议聚焦回款质量、费用效率与重点区域经营动作。`,
          },
          {
            type: 'list',
            title: '建议动作',
            items: ['继续推进重点客户回款', '复核费用波动来源', '关注区域差异化表现'],
          },
        ],
      };
    case 'adaptive':
      return {
        headline: {
          eyebrow: '智能洞察',
          title: `${subject}重点结论`,
          subtitle: '系统已根据业务目标自动补充演示数据，用于预览当前组件的最佳展现效果。',
          status: '可交付',
          tone: 'success',
        },
        sections: [
          {
            type: 'metrics',
            title: '关键指标',
            metrics: [
              { label: '收入达成', value: '82%', change: '+4.8%', trend: 'up', tone: 'success' },
              { label: '净利润率', value: '12.8%', caption: '延续改善' },
            ],
          },
          {
            type: 'list',
            title: '建议动作',
            items: ['识别异常波动原因', '跟踪重点项目交付', '同步经营复盘结论'],
          },
        ],
      };
    case 'gauge':
      return {
        value: 74,
        min: 0,
        max: 100,
        unit: '%',
      };
    case 'funnel':
      return {
        stages: [
          { name: '线索', value: 1200 },
          { name: '商机', value: 420 },
          { name: '报价', value: 168 },
          { name: '签约', value: 82 },
        ],
      };
    case 'radar':
      return {
        labels: ['盈利', '增长', '现金', '效率', '风险'],
        values: [86, 74, 68, 79, 61],
      };
    case 'heatmap':
      return {
        rows: [
          { x: '北京', y: '收入', value: 82 },
          { x: '上海', y: '收入', value: 76 },
          { x: '深圳', y: '收入', value: 69 },
          { x: '北京', y: '利润', value: 71 },
          { x: '上海', y: '利润', value: 66 },
          { x: '深圳', y: '利润', value: 58 },
        ],
      };
    case 'bullet':
      return {
        label: '回款目标',
        value: 78,
        target: 92,
        max: 100,
      };
    case 'alert':
      return {
        alerts: [
          { level: 'critical', message: '华东区两笔应收账款逾期超过 30 天', time: '5 分钟前' },
          { level: 'warning', message: '本周费用率出现轻微抬升', time: '15 分钟前' },
        ],
      };
    case 'map':
      return {
        points: [
          { name: '北京', value: 82 },
          { name: '上海', value: 76 },
          { name: '深圳', value: 68 },
          { name: '成都', value: 54 },
        ],
      };
    case 'business':
      if (subject.includes('日程')) return createDefaultBusinessData('calendar');
      if (subject.includes('洞察')) return createDefaultBusinessData('insight-hub');
      return createDefaultBusinessData('message-center');
    case 'workflow':
      return {
        steps: [
          { id: '1', label: '数据清洗与预处理', status: 'done', detail: '完成数据去重和格式标准化' },
          { id: '2', label: '特征工程与建模', status: 'running', detail: '正在训练回归模型...' },
          { id: '3', label: '结果验证与输出', status: 'pending' },
        ],
        currentStep: 1,
        summary: '整体进度正常，预计 5 分钟内完成',
      };
    case 'result':
      return {
        items: [
          { type: 'finding', content: 'Q3 营收同比增长 18.5%，超出预期目标 3.2 个百分点', evidence: ['财务报告', '区域对比'], confidence: 92 },
          { type: 'insight', content: '华东区客户留存率连续两季度下滑，建议重点跟进', evidence: ['客户调研'], confidence: 78 },
          { type: 'warning', content: '三项费用率逼近警戒线，需关注成本控制', confidence: 85 },
        ],
        generatedAt: new Date().toLocaleString('zh-CN'),
      };
    case 'actions':
      return {
        actions: [
          { id: '1', label: '生成华东区客户流失预警报告', status: 'running', type: 'report', output: '正在汇总数据...' },
          { id: '2', label: '更新费用预算审批流程', status: 'queued', type: 'task' },
          { id: '3', label: '导出 Q3 财务对比 SQL', status: 'done', type: 'sql', output: '已生成 47 行 SQL' },
        ],
      };
    case 'artifact':
      return {
        artifacts: [
          { id: '1', name: '营收分析 SQL', type: 'sql', content: "SELECT region, SUM(revenue) FROM sales WHERE quarter = 'Q3' GROUP BY region;", language: 'sql' },
          { id: '2', name: '客户留存趋势图', type: 'chart', content: '{"type": "line", "data": [...]}', language: 'json' },
        ],
      };
    default:
      return {};
  }
}

function enrichWidgetForPreview(widget: Widget): Widget {
  const templateData = isRecord(widget.data) ? widget.data : {};
  const defaultData = buildDefaultPreviewData(widget.type, widget.title);
  const previewData = isMeaningfulPreviewValue(templateData)
    ? mergePreviewData(defaultData, templateData)
    : defaultData;
  return {
    ...widget,
    data: previewData,
    dataSource: undefined,
  };
}

function buildSinglePreviewWidget(widget: Partial<Widget>): Widget {
  const fallbackType = (widget.type || 'metric') as WidgetType;
  const normalized = normalizeWidget(
    {
      id: widget.id || 'widget-preview',
      type: fallbackType,
      title: widget.title || '组件预览',
      position: widget.position || getDefaultWidgetSize(fallbackType),
      data: widget.data || {},
      dataSource: widget.dataSource,
      dataIntent: widget.dataIntent,
      detail: widget.detail,
      link: widget.link,
    },
    0,
  );

  const fallbackPosition = getDefaultWidgetSize('metric');
  const base: Widget = normalized || {
    id: 'widget-preview',
    type: 'metric',
    title: '组件预览',
    position: fallbackPosition,
    data: {},
  };

  return enrichWidgetForPreview({
    ...base,
    position: {
      x: 0,
      y: 0,
      w: clamp(base.position.w, 5, 8),
      h: clamp(base.position.h, 4, 6),
    },
  });
}

export function WidgetPreviewCard({
  widget,
  className = '',
}: {
  widget: Partial<Widget>;
  className?: string;
}) {
  const previewWidget = useMemo(() => buildSinglePreviewWidget(widget), [widget]);

  return (
    <div className={`rounded-xl border border-app-border/60 bg-app-surface p-3 shadow-sm ${className}`}>
      <div className="h-full min-h-[320px]">
        <WidgetRenderer
          workspaceId="widget-preview"
          widget={previewWidget}
          previewMode
          useDemoDataFallback={false}
        />
      </div>
    </div>
  );
}

export function TemplatePreviewCanvas({
  widgets,
  className = '',
  rowHeight = 38,
  emptyMessage = '模板中还没有组件，可先添加组件后查看布局预览。',
  showGridLines = false,
}: {
  widgets: Array<Widget | Partial<Widget>>;
  className?: string;
  rowHeight?: number;
  emptyMessage?: string;
  showGridLines?: boolean;
}) {
  const normalizedWidgets = useMemo(() => {
    const list = normalizeWidgets(widgets).map(enrichWidgetForPreview).sort(sortWidgets);
    if (list.length === 0) return list;
    // 归一化位置：消除不必要的顶部/左侧空白，保留相对布局
    const minX = Math.min(...list.map((w) => w.position.x));
    const minY = Math.min(...list.map((w) => w.position.y));
    if (minX === 0 && minY === 0) return list;
    return list.map((w) => ({
      ...w,
      position: { ...w.position, x: w.position.x - minX, y: w.position.y - minY },
    }));
  }, [widgets]);

  const maxRows = normalizedWidgets.reduce(
    (max, widget) => Math.max(max, widget.position.y + widget.position.h),
    0,
  );

  if (normalizedWidgets.length === 0) {
    return (
      <div className={`flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-app-border bg-app-surface-subtle/40 px-6 text-center text-sm leading-6 text-app-text-muted ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`relative overflow-auto rounded-xl border border-app-border/60 bg-app-surface p-4 shadow-sm ${className}`}>
      <div
        className="grid grid-cols-12 gap-3"
        style={{
          gridAutoRows: `${rowHeight}px`,
          minHeight: `${Math.max(maxRows, 8) * rowHeight}px`,
        }}
      >
        {showGridLines && (
          <div className="pointer-events-none absolute inset-4 flex gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-dashed border-app-border-subtle/30 last:border-r-0" />
            ))}
          </div>
        )}
        {normalizedWidgets.map((widget) => (
          <div
            key={widget.id}
            className="min-h-0"
            style={{
              gridColumn: `${widget.position.x + 1} / span ${widget.position.w}`,
              gridRow: `${widget.position.y + 1} / span ${widget.position.h}`,
            }}
          >
            <WidgetRenderer
              workspaceId="template-preview"
              widget={widget}
              previewMode
              useDemoDataFallback={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
