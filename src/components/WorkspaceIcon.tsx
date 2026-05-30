// ─── WorkspaceIcon ───
// 统一驾驶舱图标渲染：使用 Lucide 图标组件，与卡片视图保持一致

import {
  Layers, BarChart3, UserPlus, CheckCircle, Monitor, Target,
  DollarSign, TrendingUp, Code2, Users, Truck, LayoutGrid,
  PieChart, LineChart, Table2, Kanban, Clock, List, FileText,
  Sparkles, AlertTriangle, Bot, Compass, Activity, Gauge, Radar,
  Grid3X3, Map, Filter,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  Layers, BarChart3, UserPlus, CheckCircle, Monitor, Target,
  DollarSign, TrendingUp, Code2, Users, Truck, LayoutGrid,
  PieChart, LineChart, Table2, Kanban, Clock, List, FileText,
  Sparkles, AlertTriangle, Bot, Compass, Activity, Gauge, Radar,
  Grid3X3, Map, Filter,
};

interface Props {
  icon: string;
  color: string;
  className?: string;
}

export default function WorkspaceIcon({ icon, color, className = 'w-4 h-4' }: Props) {
  const Icon = iconMap[icon] || Layers;
  return <Icon className={className} style={{ color }} />;
}
