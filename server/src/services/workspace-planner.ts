import type { ConnectionManager } from '../connection/manager';
import { extractEntities } from '../agent/intent';
import { buildDefaultCockpitSpec, sanitizeCockpitName } from '../agent/planner';
import { getTemplate, personalizeTemplate } from '../agent/templates/registry';
import type { WorkspaceCreationSpec } from './workspace-creation';

export interface WorkspacePlanningInput {
  command: string;
  name?: string;
  initPrompt?: string;
  preferredTemplateId?: string;
}

function deriveWorkspaceName(command: string, explicitName?: string): string {
  const baseName = sanitizeCockpitName(explicitName || '');
  if (baseName) {
    return baseName.endsWith('驾驶舱') ? baseName : `${baseName}驾驶舱`;
  }

  const entities = extractEntities(command);
  const inferred = sanitizeCockpitName(entities.cockpitType || '');
  if (inferred) {
    return inferred.endsWith('驾驶舱') ? inferred : `${inferred}驾驶舱`;
  }

  return '新驾驶舱';
}

function enrichWidgetsForDataFirst(spec: WorkspaceCreationSpec, command: string): WorkspaceCreationSpec {
  if (!Array.isArray(spec.widgets) || spec.widgets.length === 0) {
    return spec;
  }

  const text = command.toLowerCase();

  const widgets = spec.widgets.map((widget: any) => {
    if (!widget || typeof widget !== 'object') {
      return widget;
    }

    const title = String(widget.title || '');
    const existingIntent = widget.dataIntent && typeof widget.dataIntent === 'object'
      ? widget.dataIntent
      : {};

    if (/(cfo|财务|finance|现金流|利润|收入|资产负债|市值|估值|上市公司|股票)/i.test(text)) {
      return {
        ...widget,
        dataIntent: {
          ...existingIntent,
          domain: 'finance',
          metricKey: title,
          sourcePreference: title.includes('市值') || title.includes('估值') ? 'tool-first' : 'real-time',
          priority: ['营业收入', '毛利率', '经营现金流', '资产负债率', '净利润率'].some((keyword) => title.includes(keyword)) ? 'high' : 'medium',
          required: ['营业收入', '毛利率', '经营现金流', '资产负债率', '净利润率', '市值'].some((keyword) => title.includes(keyword)),
        },
      };
    }

    if (/(天气|气温|降雨|预报|weather|forecast)/i.test(text)) {
      return {
        ...widget,
        dataIntent: {
          ...existingIntent,
          domain: 'weather',
          metricKey: title,
          sourcePreference: 'tool-first',
          priority: ['当前', '温度', '气温', '预报', '趋势'].some((keyword) => title.includes(keyword)) ? 'high' : 'medium',
          required: true,
        },
      };
    }

    return {
      ...widget,
      dataIntent: {
        ...existingIntent,
        domain: existingIntent.domain || 'general',
        metricKey: existingIntent.metricKey || title,
        sourcePreference: existingIntent.sourcePreference || 'template-first',
        priority: existingIntent.priority || 'medium',
        required: existingIntent.required ?? false,
      },
    };
  });

  return {
    ...spec,
    widgets,
  };
}

function buildWeatherSkeleton(name: string, command: string): WorkspaceCreationSpec {
  const entities = extractEntities(command);
  const city = entities.region || entities.cockpitType?.replace(/驾驶舱$/, '') || '北京';
  const days = /(\d+)\s*(?:日|天|day|days)/i.test(command)
    ? Math.min(14, Number(command.match(/(\d+)\s*(?:日|天|day|days)/i)?.[1] || 7))
    : 7;

  return {
    name,
    description: `${city}天气数据驾驶舱，优先展示真实天气与未来趋势`,
    icon: 'Cloud',
    color: '#0f766e',
    useDemoDataFallback: false,
    agentIds: [],
    primaryAgentId: '',
    widgets: [
      {
        id: 'weather-current',
        type: 'metric',
        title: `${city}当前天气`,
        position: { x: 0, y: 0, w: 3, h: 2 },
        data: {},
        dataSource: {
          type: 'skill',
          skillId: 'weather_query',
          input: { city, days },
          fallbackToStatic: false,
        },
      },
      {
        id: 'weather-trend',
        type: 'chart',
        title: `${city}${days}日气温趋势`,
        position: { x: 3, y: 0, w: 6, h: 4 },
        data: {},
        dataSource: {
          type: 'skill',
          skillId: 'weather_query',
          input: { city, days },
          fallbackToStatic: false,
        },
      },
      {
        id: 'weather-forecast',
        type: 'list',
        title: `${city}${days}日天气预报`,
        position: { x: 9, y: 0, w: 3, h: 4 },
        data: {},
        dataSource: {
          type: 'skill',
          skillId: 'weather_query',
          input: { city, days },
          fallbackToStatic: false,
        },
      },
    ],
  };
}

export async function planWorkspaceCreation(
  input: WorkspacePlanningInput,
  _connectionManager?: ConnectionManager
): Promise<WorkspaceCreationSpec> {
  const command = input.command.trim();
  const initPrompt = input.initPrompt?.trim();
  const name = deriveWorkspaceName(command, input.name);
  const entities = extractEntities(command);
  const isWeatherScenario = /(天气|气温|降雨|预报|weather|forecast)/i.test(command);

  if (input.preferredTemplateId) {
    const preferredTemplate = getTemplate(input.preferredTemplateId);
    if (preferredTemplate) {
      return enrichWidgetsForDataFirst({
        ...personalizeTemplate(preferredTemplate, {
          name,
          rawCommand: command,
          entities,
          domain: preferredTemplate.domain,
          initPrompt,
        }),
        initPrompt,
        templateName: preferredTemplate.name,
      }, command);
    }
  }

  const spec = isWeatherScenario
    ? buildWeatherSkeleton(name, command)
    : buildDefaultCockpitSpec(name, command, entities) as WorkspaceCreationSpec;
  return enrichWidgetsForDataFirst({
    ...spec,
    name,
    initPrompt,
    templateName: spec.templateName || name,
  }, command);
}
