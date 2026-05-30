// ─── Fetch URL Tool ───
// 抓取指定 URL 的内容，用于获取网页详细信息

import type { ToolExecutor, ToolResult } from '../types';

export const fetchUrlTool: ToolExecutor = {
  name: 'fetch_url',
  definition: {
    name: 'fetch_url',
    description: '抓取指定网页的内容。用于获取网页的标题、正文摘要等信息。当搜索结果显示了相关 URL 时，可以使用此工具获取更详细的内容。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要抓取的网页 URL，必须是完整的 http:// 或 https:// 地址',
        },
      },
      required: ['url'],
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const url = String(args.url || '');
    if (!url.trim() || !(url.startsWith('http://') || url.startsWith('https://'))) {
      return { success: false, data: null, error: 'URL 格式不正确，必须以 http:// 或 https:// 开头' };
    }

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
        },
      });

      if (!res.ok) {
        return { success: false, data: null, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const contentType = res.headers.get('content-type') || '';
      let text: string;

      if (contentType.includes('application/json')) {
        const json = await res.json();
        text = JSON.stringify(json, null, 2);
      } else {
        text = await res.text();
      }

      // 简单清理 HTML 标签，提取正文
      const cleaned = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000); // 限制长度，避免超出 token 限制

      return {
        success: true,
        data: {
          url,
          title: text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '',
          content: cleaned,
          length: cleaned.length,
        },
      };
    } catch (err: any) {
      console.error('[Tool:fetch_url] Error:', err.message);
      return { success: false, data: null, error: err.message || '抓取失败' };
    }
  },
};
