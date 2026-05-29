// ─── useLayoutSettings ───
// 智能驾驶舱布局模式配置：sidebar / tabs / cards
// 持久化到 localStorage，支持状态迁移

import { useState, useEffect, useCallback } from 'react';

export type LayoutMode = 'cards' | 'sidebar' | 'tabs';

interface LayoutState {
  mode: LayoutMode;
  sidebarCollapsed: boolean;
  openTabs: string[];
  activeTabId: string | null;
}

const STORAGE_KEY = 'yoncockpit-layout-v2';

const DEFAULT_STATE: LayoutState = {
  mode: 'cards',
  sidebarCollapsed: false,
  openTabs: [],
  activeTabId: null,
};

function readState(): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    // 基础校验
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
    const mode: LayoutMode = ['cards', 'sidebar', 'tabs'].includes(parsed.mode)
      ? parsed.mode
      : 'cards';
    return {
      mode,
      sidebarCollapsed: !!parsed.sidebarCollapsed,
      openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [],
      activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(state: LayoutState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useLayoutSettings() {
  const [state, setState] = useState<LayoutState>(readState);

  // 持久化
  useEffect(() => {
    writeState(state);
  }, [state]);

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setState((prev) => {
      // 状态迁移：切换模式时保留有意义的上下文
      if (mode === 'tabs' && prev.mode !== 'tabs') {
        return { ...prev, mode };
      }
      if (mode === 'sidebar' && prev.mode !== 'sidebar') {
        return { ...prev, mode, activeTabId: null };
      }
      if (mode === 'cards' && prev.mode !== 'cards') {
        return { ...prev, mode };
      }
      return { ...prev, mode };
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  }, []);

  const openTab = useCallback((workspaceId: string) => {
    setState((prev) => {
      if (prev.openTabs.includes(workspaceId)) {
        return { ...prev, activeTabId: workspaceId };
      }
      return {
        ...prev,
        openTabs: [...prev.openTabs, workspaceId],
        activeTabId: workspaceId,
      };
    });
  }, []);

  const closeTab = useCallback((workspaceId: string) => {
    setState((prev) => {
      const newTabs = prev.openTabs.filter((id) => id !== workspaceId);
      let newActive = prev.activeTabId;
      if (prev.activeTabId === workspaceId) {
        // 关闭当前页签，激活前一个或后一个
        const idx = prev.openTabs.indexOf(workspaceId);
        newActive = newTabs[idx] ?? newTabs[idx - 1] ?? null;
      }
      return { ...prev, openTabs: newTabs, activeTabId: newActive };
    });
  }, []);

  const setActiveTab = useCallback((workspaceId: string | null) => {
    setState((prev) => ({ ...prev, activeTabId: workspaceId }));
  }, []);

  const closeAllTabs = useCallback(() => {
    setState((prev) => ({ ...prev, openTabs: [], activeTabId: null }));
  }, []);

  /** 直接设置 openTabs（用于批量同步） */
  const setOpenTabs = useCallback((tabs: string[], activeId?: string | null) => {
    setState((prev) => ({
      ...prev,
      openTabs: tabs,
      activeTabId: activeId !== undefined ? activeId : prev.activeTabId,
    }));
  }, []);

  /** 根据当前存在的 workspace ID 清理无效页签 */
  const syncTabs = useCallback((validIds: Set<string>) => {
    setState((prev) => {
      const newTabs = prev.openTabs.filter((id) => validIds.has(id));
      let newActive = prev.activeTabId;
      if (newActive && !validIds.has(newActive)) {
        const idx = prev.openTabs.indexOf(newActive);
        newActive = newTabs[idx] ?? newTabs[idx - 1] ?? null;
      }
      return { ...prev, openTabs: newTabs, activeTabId: newActive };
    });
  }, []);

  return {
    mode: state.mode,
    sidebarCollapsed: state.sidebarCollapsed,
    openTabs: state.openTabs,
    activeTabId: state.activeTabId,
    setLayoutMode,
    toggleSidebar,
    openTab,
    closeTab,
    setActiveTab,
    closeAllTabs,
    setOpenTabs,
    syncTabs,
  };
}
