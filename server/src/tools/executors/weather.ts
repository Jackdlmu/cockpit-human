// ─── Weather Query Tool ───
// 天气查询工具：支持真实天气 API 和模拟数据回退

import type { ToolExecutor, ToolResult } from '../types';

// 模拟天气数据（当没有配置真实 API 时）
function generateMockWeather(city: string, days: number): unknown {
  const today = new Date();
  const forecasts = [];
  const weathers = ['晴', '多云', '阴', '小雨', '中雨', '雷阵雨'];
  const baseTemp = 15 + Math.floor(Math.random() * 15); // 15-30°C

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const tempHigh = baseTemp + Math.floor(Math.random() * 8);
    const tempLow = baseTemp - Math.floor(Math.random() * 6);
    forecasts.push({
      date: `${date.getMonth() + 1}月${date.getDate()}日`,
      dayOfWeek: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
      weather: weathers[Math.floor(Math.random() * weathers.length)],
      tempHigh: `${tempHigh}°C`,
      tempLow: `${tempLow}°C`,
      humidity: `${40 + Math.floor(Math.random() * 40)}%`,
      wind: `${['东', '南', '西', '北'][Math.floor(Math.random() * 4)]}风 ${Math.floor(Math.random() * 4) + 1}级`,
      aqi: Math.floor(Math.random() * 100) + 20,
    });
  }

  return {
    city,
    current: forecasts[0],
    forecast: forecasts,
    _note: '当前使用模拟天气数据。如需真实天气，请在 .env 中配置 WEATHER_API_KEY',
  };
}

// 真实天气查询（使用和风天气 API 或 OpenWeatherMap）
async function realWeatherQuery(city: string, days: number): Promise<unknown> {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('WEATHER_API_KEY not configured');
  }

  // 使用 OpenWeatherMap 5-day forecast
  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status}`);
  }

  const data = await res.json();
  const forecasts = (data.list || []).slice(0, days * 8).filter((_: any, i: number) => i % 8 === 0).map((item: any) => ({
    date: new Date(item.dt * 1000).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }),
    weather: item.weather?.[0]?.description || '未知',
    tempHigh: `${Math.round(item.main.temp_max)}°C`,
    tempLow: `${Math.round(item.main.temp_min)}°C`,
    humidity: `${item.main.humidity}%`,
    wind: `${item.wind.speed} m/s`,
  }));

  return {
    city: data.city?.name || city,
    current: forecasts[0],
    forecast: forecasts,
  };
}

export const weatherTool: ToolExecutor = {
  name: 'weather_query',
  definition: {
    name: 'weather_query',
  description: '查询指定城市的天气预报。用于获取实时天气、温度、湿度、空气质量等信息。当用户要求查询天气、气温、降雨等信息时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，如"北京"、"上海"、"深圳"',
        },
        days: {
          type: 'number',
          description: '预报天数，默认为 7 天',
        },
      },
      required: ['city'],
    },
  },
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const city = String(args.city || '');
    const days = Math.min(14, Math.max(1, Number(args.days || 7)));

    if (!city.trim()) {
      return { success: false, data: null, error: '城市名称不能为空' };
    }

    try {
      if (process.env.WEATHER_API_KEY) {
        const data = await realWeatherQuery(city, days);
        return { success: true, data };
      }
      console.log(`[Tool:weather_query] Using mock data for city: "${city}" (set WEATHER_API_KEY for real weather)`);
      return { success: true, data: generateMockWeather(city, days) };
    } catch (err: any) {
      console.error('[Tool:weather_query] Error:', err.message);
      return { success: true, data: generateMockWeather(city, days) };
    }
  },
};
