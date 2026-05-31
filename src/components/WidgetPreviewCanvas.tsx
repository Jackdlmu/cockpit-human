import { useMemo } from 'react';
import type { Widget, WidgetType } from '@/types';
import { getDefaultWidgetSize, normalizeWidget, normalizeWidgets } from '@/lib/widget-normalizer';
import { WidgetRenderer } from './WorkspaceDetail';

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
    <div className={`rounded-[22px] border border-app-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(246,243,241,0.72))] p-3 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${className}`}>
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
}: {
  widgets: Array<Widget | Partial<Widget>>;
  className?: string;
  rowHeight?: number;
  emptyMessage?: string;
}) {
  const normalizedWidgets = useMemo(
    () => normalizeWidgets(widgets).map(enrichWidgetForPreview).sort(sortWidgets),
    [widgets],
  );

  const maxRows = normalizedWidgets.reduce(
    (max, widget) => Math.max(max, widget.position.y + widget.position.h),
    0,
  );

  if (normalizedWidgets.length === 0) {
    return (
      <div className={`flex min-h-[260px] items-center justify-center rounded-[24px] border border-dashed border-app-border bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(246,243,241,0.6))] px-6 text-center text-sm leading-6 text-app-text-muted ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`overflow-auto rounded-[24px] border border-app-border/75 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96),rgba(248,245,244,1)_42%,rgba(242,239,236,1))] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)] ${className}`}>
      <div
        className="grid grid-cols-12 gap-3"
        style={{
          gridAutoRows: `${rowHeight}px`,
          minHeight: `${Math.max(maxRows, 8) * rowHeight}px`,
        }}
      >
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
