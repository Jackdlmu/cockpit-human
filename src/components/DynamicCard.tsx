import type { CardData, TableColumn, WorkflowStep } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Clock,
  Circle,
  BarChart3,
  FileText,
  AlertCircle,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { getTrendSemanticClasses } from '@/lib/visual-adapters';

interface DynamicCardProps {
  card: CardData;
}

export function DynamicCard({ card }: DynamicCardProps) {
  switch (card.type) {
    case 'data':
      return <DataCard card={card} />;
    case 'table':
      return <TableCard card={card} />;
    case 'form':
      return <FormCard card={card} />;
    case 'chart':
      return <ChartCard card={card} />;
    case 'workflow':
      return <WorkflowCard card={card} />;
    case 'approval':
      return <ApprovalCard card={card} />;
    case 'insight':
      return <InsightCard card={card} />;
    default:
      return null;
  }
}

function trendFromChangeType(changeType?: string) {
  return changeType === 'positive' ? 'up' : changeType === 'negative' ? 'down' : 'flat';
}

function CardShell({
  card,
  children,
}: {
  card: CardData;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border border-app-border-subtle/70 bg-app-surface-subtle/30 overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-500">
      <div className="px-5 py-3.5 border-b border-app-border-subtle/50 bg-app-surface-subtle/20">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-app-text">{card.title}</h3>
            {card.subtitle && (
              <p className="text-xs text-app-text-subtle mt-0.5">{card.subtitle}</p>
            )}
          </div>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
      {card.actions && card.actions.length > 0 && (
        <div className="px-5 py-3 border-t border-app-border-subtle/50 bg-app-surface-subtle/10 flex flex-wrap gap-2">
          {card.actions.map((action, i) => (
            <Button
              key={i}
              variant={
                action.variant === 'primary'
                  ? 'default'
                  : action.variant === 'danger'
                    ? 'destructive'
                    : action.variant === 'ghost'
                      ? 'ghost'
                      : 'outline'
              }
              size="sm"
              className={`text-xs h-8 ${
                action.variant === 'primary'
                  ? 'bg-primary hover:bg-primary/90 border-0 text-primary-foreground'
                  : action.variant === 'secondary'
                    ? 'bg-app-surface-subtle/50 hover:bg-app-surface-subtle/80 border-app-border-subtle/70 text-app-text-subtle'
                    : action.variant === 'danger'
                      ? ''
                      : 'text-app-text-muted hover:text-app-text-subtle hover:bg-app-surface-subtle/40'
              }`}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Data Card ─── */
function DataCard({ card }: { card: CardData }) {
  const maxVal = Math.max(...(card.chartData?.map((d) => d.value) || [1]));
  const metricTrendTone = getTrendSemanticClasses(trendFromChangeType(card.metric?.changeType));
  const metricTrendClass = card.metric?.changeType && card.metric.changeType !== 'neutral'
    ? `${metricTrendTone.text} ${metricTrendTone.border} ${metricTrendTone.bg}`
    : 'text-app-text-muted border-app-border-subtle/50';

  return (
    <CardShell card={card}>
      {card.metric && (
        <div className="flex items-end gap-3 mb-5">
          <div>
            <div className="text-3xl font-bold text-app-text tracking-tight">
              {card.metric.value}
            </div>
            <div className="text-xs text-app-text-subtle mt-0.5">{card.metric.label}</div>
          </div>
          {card.metric.change && (
            <Badge
              variant="outline"
              className={`mb-1 text-xs ${metricTrendClass}`}
            >
              {card.metric.changeType === 'positive' && (
                <TrendingUp className="w-3 h-3 mr-1" />
              )}
              {card.metric.changeType === 'negative' && (
                <TrendingDown className="w-3 h-3 mr-1" />
              )}
              {card.metric.changeType === 'neutral' && (
                <Minus className="w-3 h-3 mr-1" />
              )}
              {card.metric.change}
            </Badge>
          )}
        </div>
      )}

      {card.chartData && (
        <div className="space-y-3">
          {card.chartData.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-app-text-subtle w-10 text-right shrink-0">
                {item.label}
              </span>
              <div className="flex-1 h-8 bg-app-surface-subtle/30 rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md transition-all duration-700 ease-out"
                  style={{
                    width: `${(item.value / maxVal) * 100}%`,
                    background: `linear-gradient(90deg, #6366f1 ${100 - i * 20}%, #818cf8)`,
                    animationDelay: `${i * 150}ms`,
                  }}
                />
              </div>
              <span className="text-xs font-medium text-app-text-muted w-16 text-right shrink-0">
                ¥{item.value}万
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

/* ─── Table Card ─── */
function TableCard({ card }: { card: CardData }) {
  const cols = card.columns || [];
  const rows = card.rows || [];

  return (
    <CardShell card={card}>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-app-border-subtle/60">
              {cols.map((col: TableColumn) => (
                <th
                  key={col.key}
                  className="text-left py-2 px-2 font-medium text-app-text-subtle whitespace-nowrap"
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-app-border-subtle/30 hover:bg-app-surface-subtle/30 transition-colors cursor-pointer"
              >
                {cols.map((col: TableColumn) => (
                  <td key={col.key} className="py-2.5 px-2 text-app-text-muted whitespace-nowrap">
                    {col.key === 'rank' && typeof row[col.key] === 'number' && (row[col.key] as number) <= 3 ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 font-bold text-[10px]">
                        {row[col.key]}
                      </span>
                    ) : col.key === 'status' ? (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          row[col.key] === '已签约'
                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                            : row[col.key] === '谈判中'
                              ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                              : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                        }`}
                      >
                        {row[col.key]}
                      </Badge>
                    ) : (
                      row[col.key]
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}

/* ─── Form Card ─── */
function FormCard({ card }: { card: CardData }) {
  return (
    <CardShell card={card}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {card.fields?.map((field, i) => (
          <div key={i} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <Label className="text-xs font-medium text-app-text-muted mb-1.5 block">
              {field.label}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </Label>
            {field.type === 'select' ? (
              <Select defaultValue={field.value}>
                <SelectTrigger className="h-9 text-xs bg-app-surface-subtle/30 border-app-border-subtle/70 text-app-text-subtle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-app-surface-elevated border-app-border-subtle/70">
                  {field.options?.map((opt) => (
                    <SelectItem key={opt} value={opt} className="text-xs text-app-text-subtle">
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === 'textarea' ? (
              <Textarea
                defaultValue={field.value}
                placeholder={field.placeholder}
                className="text-xs min-h-[80px] resize-none bg-app-surface-subtle/30 border-app-border-subtle/70 text-app-text-subtle placeholder:text-app-text-muted"
              />
            ) : field.type === 'date' ? (
              <Input
                type="date"
                defaultValue={field.value}
                className="h-9 text-xs bg-app-surface-subtle/30 border-app-border-subtle/70 text-app-text-subtle"
              />
            ) : (
              <Input
                type={field.type}
                defaultValue={field.value}
                placeholder={field.placeholder}
                className="h-9 text-xs bg-app-surface-subtle/30 border-app-border-subtle/70 text-app-text-subtle placeholder:text-app-text-muted"
              />
            )}
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ─── Chart Card ─── */
function ChartCard({ card }: { card: CardData }) {
  const data = card.chartData || [];
  const maxVal = Math.max(...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const metricTrendTone = getTrendSemanticClasses('up');

  return (
    <CardShell card={card}>
      {card.metric && (
        <div className="flex items-end gap-3 mb-4">
          <div>
            <div className="text-3xl font-bold text-app-text tracking-tight">
              {card.metric.value}
            </div>
            <div className="text-xs text-app-text-subtle mt-0.5">{card.metric.label}</div>
          </div>
          {card.metric.change && (
            <Badge
              variant="outline"
              className={`mb-1 text-xs ${metricTrendTone.text} ${metricTrendTone.border} ${metricTrendTone.bg}`}
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              {card.metric.change}
            </Badge>
          )}
        </div>
      )}

      <div className="space-y-2">
        {data.map((item, i) => {
          const pct = ((item.value / maxVal) * 100).toFixed(0);
          const conversion = i > 0 ? ((item.value / data[i - 1].value) * 100).toFixed(0) : null;
          return (
            <div key={i} className="relative">
              <div className="flex items-center gap-3">
                <span className="text-xs text-app-text-subtle w-16 text-right shrink-0">
                  {item.label}
                </span>
                <div className="flex-1 h-7 bg-app-surface-subtle/30 rounded-md overflow-hidden relative">
                  <div
                    className="h-full rounded-md transition-all duration-700 ease-out flex items-center px-2"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, #4f46e5, #818cf8)`,
                    }}
                  >
                    <span className="text-[10px] text-app-text font-medium">
                      ¥{item.value}万
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-app-text-muted w-12 shrink-0">
                  {((item.value / total) * 100).toFixed(1)}%
                </span>
              </div>
              {conversion && (
                <div className="flex items-center ml-[88px] mt-0.5">
                  <ArrowRight className="w-3 h-3 text-app-text-muted rotate-90" />
                  <span className="text-[10px] text-app-text-muted">
                    转化率 {conversion}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

/* ─── Workflow Card ─── */
function WorkflowCard({ card }: { card: CardData }) {
  const steps = card.steps || [];

  return (
    <CardShell card={card}>
      <div className="space-y-0">
        {steps.map((step: WorkflowStep, i) => (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  step.status === 'completed'
                    ? 'bg-emerald-500 text-app-text'
                    : step.status === 'active'
                      ? 'bg-primary text-app-text ring-4 ring-primary/10'
                      : 'bg-app-surface-subtle/50 text-app-text-muted'
                }`}
              >
                {step.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : step.status === 'active' ? (
                  <Clock className="w-4 h-4" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`w-0.5 flex-1 my-1 ${
                    step.status === 'completed' ? 'bg-emerald-500/30' : 'bg-app-surface-subtle/40'
                  }`}
                />
              )}
            </div>
            <div className="pb-5 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    step.status === 'pending' ? 'text-app-text-subtle' : 'text-app-text-secondary'
                  }`}
                >
                  {step.label}
                </span>
                {step.status === 'active' && (
                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    进行中
                  </Badge>
                )}
              </div>
              {step.description && (
                <p
                  className={`text-xs mt-0.5 ${
                    step.status === 'pending' ? 'text-app-text-subtle' : 'text-app-text-subtle'
                  }`}
                >
                  {step.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

/* ─── Approval Card ─── */
function ApprovalCard({ card }: { card: CardData }) {
  const data = card.data as Record<string, string> | undefined;

  return (
    <CardShell card={card}>
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
        <div className="text-xs text-amber-300/70">
          此申请已通过系统自动审核，所有票据合规，建议尽快处理。
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="p-3 rounded-lg bg-app-surface-subtle/20 border border-app-border-subtle/40">
              <div className="text-[10px] text-app-text-subtle uppercase tracking-wider mb-1">
                {key === 'amount'
                  ? '金额'
                  : key === 'category'
                    ? '费用类型'
                    : key === 'trip'
                      ? '行程'
                      : key === 'receipts'
                        ? '票据'
                        : key === 'policy'
                          ? '政策合规'
                          : key}
              </div>
              <div
                className={`text-sm font-semibold ${
                  key === 'amount' ? 'text-app-text text-lg' : 'text-app-text-muted'
                }`}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-app-border-subtle/40 flex items-center gap-2 text-xs text-app-text-subtle">
        <FileText className="w-3.5 h-3.5" />
        <span>附件：6张票据PDF</span>
        <span className="text-app-text-muted">|</span>
        <span>申请时间：2025-11-20</span>
      </div>
    </CardShell>
  );
}

/* ─── Insight Card ─── */
function InsightCard({ card }: { card: CardData }) {
  const data = card.data as Record<string, string> | undefined;

  return (
    <CardShell card={card}>
      <div className="space-y-2">
        {data &&
          Object.entries(data).map(([key, value]) => (
            <div
              key={key}
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-app-surface-subtle/30 transition-colors cursor-pointer group"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm text-app-text-muted">{value}</span>
              <ExternalLink className="w-3.5 h-3.5 text-app-text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
      </div>
    </CardShell>
  );
}
