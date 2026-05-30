import type { ToolExecutor, ToolResult } from '../types';

type EastMoneySearchItem = {
  Code?: string;
  Name?: string;
  QuoteID?: string;
  Classify?: string;
  SecurityTypeName?: string;
  MarketType?: string;
};

function decodePrice(raw?: number): number | null {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  return raw / 100;
}

function decodePercent(raw?: number): number | null {
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
  return raw / 100;
}

async function searchCompany(keyword: string): Promise<EastMoneySearchItem[]> {
  const url = new URL('https://searchadapter.eastmoney.com/api/suggest/get');
  url.searchParams.set('input', keyword);
  url.searchParams.set('type', '14');
  url.searchParams.set('count', '10');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.eastmoney.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`公司搜索失败：HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.QuotationCodeTable?.Data || [];
}

async function fetchQuote(quoteId: string): Promise<Record<string, unknown>> {
  const url = new URL('https://push2.eastmoney.com/api/qt/stock/get');
  url.searchParams.set('secid', quoteId);
  url.searchParams.set('fields', 'f57,f58,f43,f169,f170,f116,f117,f167,f168');

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://quote.eastmoney.com/',
    },
  });
  if (!res.ok) {
    throw new Error(`行情获取失败：HTTP ${res.status}`);
  }

  const payload = await res.json();
  const info = payload?.data;
  if (!info) {
    throw new Error('未找到对应证券行情');
  }

  const price = decodePrice(info.f43);
  const changePercent = decodePercent(info.f170);
  const changeAmount = decodePrice(info.f169);
  const pe = decodePrice(info.f167);
  const pb = decodePrice(info.f168);
  const marketCap = typeof info.f116 === 'number' ? info.f116 : null;

  return {
    symbol: info.f57,
    companyName: info.f58,
    price,
    changePercent,
    changeAmount,
    marketCap,
    pe,
    pb,
    currency: String(info.f57 || '').includes('.') ? 'CNY' : undefined,
  };
}

export const financeCompanyTool: ToolExecutor = {
  name: 'finance_company_lookup',
  definition: {
    name: 'finance_company_lookup',
    description: '查询上市公司或公开证券的真实行情快照。适用于财务、CFO、投资分析类驾驶舱，输入公司名或股票代码，返回证券代码、最新价格、涨跌幅、市值、估值等公开市场数据。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '公司名称或股票代码，例如"用友网络"、"微软"、"MSFT"、"600588"',
        },
      },
      required: ['query'],
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) {
      return { success: false, data: null, error: '公司名称或股票代码不能为空' };
    }

    try {
      const matches = await searchCompany(query);
      if (!matches.length) {
        return { success: false, data: null, error: `未找到与「${query}」匹配的上市公司或证券` };
      }

      const preferred = matches.find((item) => item.QuoteID && (item.Classify === 'AStock' || item.Classify === 'UsStock' || item.Classify === 'HK'))
        || matches.find((item) => item.QuoteID)
        || matches[0];

      if (!preferred?.QuoteID) {
        return { success: false, data: null, error: `未能为「${query}」定位可查询的证券代码` };
      }

      const quote = await fetchQuote(preferred.QuoteID);
      return {
        success: true,
        data: {
          query,
          match: {
            code: preferred.Code,
            name: preferred.Name,
            quoteId: preferred.QuoteID,
            market: preferred.SecurityTypeName || preferred.Classify || preferred.MarketType,
          },
          quote,
        },
      };
    } catch (err: any) {
      console.error('[Tool:finance_company_lookup] Error:', err.message);
      return { success: false, data: null, error: err.message || '财务数据查询失败' };
    }
  },
};
