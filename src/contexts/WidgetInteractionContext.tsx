// ─── WidgetInteractionContext ───
// 跨组件联动上下文：管理全局过滤状态，一个 widget 的交互可驱动其他 widget 刷新

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface WidgetInteractionState {
  /** 当前激活的全局过滤条件 */
  activeFilters: Record<string, unknown>;
  /** 设置/更新某个过滤条件 */
  setFilter: (key: string, value: unknown) => void;
  /** 清除某个过滤条件 */
  clearFilter: (key: string) => void;
  /** 清除全部过滤条件 */
  clearAllFilters: () => void;
  /** 是否有活跃过滤 */
  hasFilters: boolean;
}

const WidgetInteractionContext = createContext<WidgetInteractionState | null>(null);

export function WidgetInteractionProvider({ children }: { children: React.ReactNode }) {
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});

  const setFilter = useCallback((key: string, value: unknown) => {
    setActiveFilters((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  const clearFilter = useCallback((key: string) => {
    setActiveFilters((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters({});
  }, []);

  const hasFilters = Object.keys(activeFilters).length > 0;

  const value = useMemo(
    () => ({ activeFilters, setFilter, clearFilter, clearAllFilters, hasFilters }),
    [activeFilters, setFilter, clearFilter, clearAllFilters, hasFilters]
  );

  return (
    <WidgetInteractionContext.Provider value={value}>
      {children}
    </WidgetInteractionContext.Provider>
  );
}

export function useWidgetInteraction(): WidgetInteractionState {
  const ctx = useContext(WidgetInteractionContext);
  if (!ctx) {
    // 如果不在 Provider 内，返回一个空实现（兼容独立使用）
    return {
      activeFilters: {},
      setFilter: () => {},
      clearFilter: () => {},
      clearAllFilters: () => {},
      hasFilters: false,
    };
  }
  return ctx;
}
