// ─── 适配器工厂 ───
// 根据环境变量创建对应的适配器实例

import type { AgentPlatformAdapter } from './types';
import { MockAdapter } from './mock';
import { HttpAdapter } from './http';
import { YonClawAdapter } from './yonclaw';

export type AdapterType = 'mock' | 'http' | 'yonclaw';

export function createAdapter(type?: AdapterType): AgentPlatformAdapter {
  const adapterType = type || (process.env.ADAPTER_TYPE as AdapterType) || 'mock';

  switch (adapterType) {
    case 'http': {
      const url = process.env.AGENT_PLATFORM_URL;
      const key = process.env.AGENT_PLATFORM_API_KEY || '';
      if (!url) {
        console.warn('[Adapter] AGENT_PLATFORM_URL not set, falling back to mock');
        return new MockAdapter();
      }
      console.log(`[Adapter] Using HTTP adapter: ${url}`);
      return new HttpAdapter(url, key);
    }
    case 'yonclaw': {
      const url = process.env.AGENT_PLATFORM_URL;
      const key = process.env.AGENT_PLATFORM_API_KEY || '';
      if (!url) {
        console.warn('[Adapter] AGENT_PLATFORM_URL not set, falling back to mock');
        return new MockAdapter();
      }
      console.log(`[Adapter] Using YonClaw adapter: ${url}`);
      return new YonClawAdapter(url, key);
    }
    case 'mock':
    default:
      console.log('[Adapter] Using Mock adapter (static data)');
      return new MockAdapter();
  }
}

export * from './types';
export { MockAdapter, HttpAdapter, YonClawAdapter };
