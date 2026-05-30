// ─── Web Search Tool ───
// 网页搜索工具：优先使用配置的搜索 API；未配置时回退到公开搜索结果抓取

import type { ToolExecutor, ToolResult } from '../types';

function decodeBingRedirect(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const encoded = parsed.searchParams.get('u');
    if (encoded && encoded.startsWith('a1')) {
      return Buffer.from(encoded.slice(2), 'base64').toString('utf-8');
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

async function publicBingSearch(query: string): Promise<unknown> {
  const url = new URL('https://www.bing.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('setlang', 'zh-cn');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'Mozilla/5.0',
    },
  });
  if (!res.ok) {
    throw new Error(`Bing search error: ${res.status}`);
  }

  const html = await res.text();
  const regex = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  const results: Array<{ title: string; snippet: string; url: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) && results.length < 5) {
    const rawUrl = match[1];
    const finalUrl = decodeBingRedirect(rawUrl);
    if (!/^https?:\/\//i.test(finalUrl)) continue;
    results.push({
      title: stripHtml(match[2]),
      snippet: stripHtml(match[3]),
      url: finalUrl,
    });
  }

  if (results.length === 0) {
    throw new Error('No public search results parsed');
  }

  return {
    query,
    results,
    _note: '当前使用公开搜索结果抓取（未配置专用搜索 API）',
  };
}

// 真实搜索（使用 SerpAPI 或类似服务）
async function realWebSearch(query: string): Promise<unknown> {
  const apiKey = process.env.WEB_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('WEB_SEARCH_API_KEY not configured');
  }

  // 使用 SerpAPI 进行 Google 搜索
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('num', '5');
  url.searchParams.set('hl', 'zh-CN');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`Search API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    query,
    results: (data.organic_results || []).slice(0, 5).map((r: any) => ({
      title: r.title,
      snippet: r.snippet,
      url: r.link,
    })),
  };
}

export const webSearchTool: ToolExecutor = {
  name: 'web_search',
  definition: {
    name: 'web_search',
    description: '搜索互联网上的公开信息。用于获取最新的行业数据、新闻、统计报告等。当用户要求获取真实数据、最新信息或互联网公开数据时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，应该具体且明确。例如："2024年中国汽车行业市场规模"、"北京今日天气"',
        },
      },
      required: ['query'],
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query || '');
    if (!query.trim()) {
      return { success: false, data: null, error: '搜索关键词不能为空' };
    }

    try {
      // 优先尝试真实搜索
      if (process.env.WEB_SEARCH_API_KEY) {
        const data = await realWebSearch(query);
        return { success: true, data };
      }
      const data = await publicBingSearch(query);
      return { success: true, data };
    } catch (err: any) {
      console.error('[Tool:web_search] Error:', err.message);
      return { success: false, data: null, error: err.message || '网页搜索失败' };
    }
  },
};
