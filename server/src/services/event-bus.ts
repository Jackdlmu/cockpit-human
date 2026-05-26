// ─── EventBus ───
// 内部事件总线：Connector 产生的事件 → 分发给所有订阅者（WebSocket、日志、处理逻辑）

import type { PlatformEvent } from '../connection/types';

export type EventFilter = {
  source?: string;        // 连接 ID
  sourceType?: string;    // yonclaw | openclaw | hermes
  type?: string;          // 事件类型
};

export type EventHandler = (event: PlatformEvent) => void;

interface Subscription {
  id: string;
  handler: EventHandler;
  filter?: EventFilter;
}

export class EventBus {
  private subscriptions = new Map<string, Subscription>();
  private history: PlatformEvent[] = [];
  private maxHistory = 500;

  /** 订阅事件 */
  subscribe(handler: EventHandler, filter?: EventFilter): () => void {
    const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.subscriptions.set(id, { id, handler, filter });
    return () => this.subscriptions.delete(id);
  }

  /** 发布事件 */
  publish(event: PlatformEvent): void {
    // 保存历史
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // 分发给匹配的订阅者
    for (const sub of this.subscriptions.values()) {
      if (this.matchesFilter(event, sub.filter)) {
        try {
          sub.handler(event);
        } catch (err) {
          console.error('[EventBus] Handler error:', err);
        }
      }
    }
  }

  /** 获取历史事件 */
  getHistory(filter?: EventFilter): PlatformEvent[] {
    if (!filter) return [...this.history];
    return this.history.filter((e) => this.matchesFilter(e, filter));
  }

  /** 清除历史 */
  clearHistory(): void {
    this.history = [];
  }

  /** 订阅者数量 */
  getSubscriberCount(): number {
    return this.subscriptions.size;
  }

  private matchesFilter(event: PlatformEvent, filter?: EventFilter): boolean {
    if (!filter) return true;
    if (filter.source && event.source !== filter.source) return false;
    if (filter.sourceType && event.sourceType !== filter.sourceType) return false;
    if (filter.type && event.type !== filter.type) return false;
    return true;
  }
}

// 全局单例
export const eventBus = new EventBus();
