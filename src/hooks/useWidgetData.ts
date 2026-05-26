// ─── useWidgetData ───
// Phase 4: Widget 数据管道前端 Hook
// 根据 widget.dataSource 自动拉取、轮询或订阅实时数据

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Widget } from '@/types';
import * as api from '@/api/client';

interface WidgetDataState {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  source: string | null;
}

export function useWidgetData(workspaceId: string, widget: Widget, useDemoDataFallback?: boolean) {
  const [state, setState] = useState<WidgetDataState>({
    data: (widget.data ?? null) as Record<string, unknown> | null,
    loading: false,
    error: null,
    source: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!widget.dataSource) return; // 静态 widget 不需要刷新

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const result = await api.refreshWidgetData(workspaceId, widget.id);
      setState({
        data: result.data as Record<string, unknown> | null,
        loading: false,
        error: null,
        source: result.source,
      });
    } catch (err: any) {
      console.warn(`[useWidgetData] Refresh failed for "${widget.title}":`, err.message);
      // 失败时根据 useDemoDataFallback 决定回退行为
      const fallbackData = useDemoDataFallback !== false
        ? (widget.data ?? null)
        : (buildEmptyData(widget.type) as Record<string, unknown> | null);
      setState((s) => ({
        ...s,
        loading: false,
        error: err.message,
        data: fallbackData,
        source: 'fallback',
      }));
    }
  }, [workspaceId, widget.id, widget.dataSource, widget.data, widget.title, useDemoDataFallback]);

  // 初始加载 + 轮询设置
  useEffect(() => {
    // 清除旧的轮询
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 重置为静态数据（当 widget 变化时）
    setState({
      data: (widget.data ?? null) as Record<string, unknown> | null,
      loading: false,
      error: null,
      source: null,
    });

    if (!widget.dataSource) return;

    // type='event' 不走轮询，靠 WebSocket 推送（TODO: 后续集成 useEventStream）
    if (widget.dataSource.type === 'event') {
      // 目前 event 类型只显示初始静态数据
      // 后续可通过 useEventStream 监听对应事件并调用 refresh
      return;
    }

    // 立即拉取一次
    refresh();

    // 设置轮询
    const interval = widget.dataSource.refreshInterval;
    if (interval && interval > 0) {
      intervalRef.current = setInterval(refresh, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [workspaceId, widget.id, widget.dataSource?.type, widget.dataSource?.refreshInterval, useDemoDataFallback]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    source: state.source,
    refresh,
  };
}

/** 根据 widget 类型构建空数据结构 */
function buildEmptyData(widgetType: string): Record<string, unknown> {
  switch (widgetType) {
    case 'metric':
      return { value: '', change: '', trend: 'flat' };
    case 'chart':
      return { labels: [], values: [] };
    case 'table':
      return { rows: [], columns: [] };
    case 'list':
      return { items: [] };
    case 'kanban':
      return { stages: [] };
    case 'timeline':
      return { steps: [] };
    case 'report':
      return { summary: '', highlights: [] };
    default:
      return {};
  }
}
