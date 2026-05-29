import { http, HttpResponse } from 'msw';

const API_BASE = 'http://localhost:3001/api';

export const handlers = [
  // ─── Health ───
  http.get(`${API_BASE}/health`, () => {
    return HttpResponse.json({ status: 'ok', timestamp: new Date().toISOString(), version: 'test' });
  }),

  // ─── Agents ───
  http.get(`${API_BASE}/agents`, () => {
    return HttpResponse.json({
      agents: [
        { id: 'agent-1', name: 'Alpha', status: 'active', type: 'assistant' },
        { id: 'agent-2', name: 'Beta', status: 'idle', type: 'analyzer' },
      ],
    });
  }),

  http.get(`${API_BASE}/agents/:id`, ({ params }) => {
    return HttpResponse.json({
      agent: { id: params.id as string, name: 'Mock Agent', status: 'active', type: 'assistant' },
    });
  }),

  http.get(`${API_BASE}/agents/:id/stats`, () => {
    return HttpResponse.json({ requests: 42, latency: 120 });
  }),

  // ─── Workspaces ───
  http.get(`${API_BASE}/workspaces`, () => {
    return HttpResponse.json({
      workspaces: [
        {
          id: 'ws-1',
          name: 'Test Cockpit',
          description: 'A test workspace',
          status: 'running',
          agentIds: [],
          widgets: [],
        },
      ],
    });
  }),

  http.get(`${API_BASE}/workspaces/:id`, ({ params }) => {
    return HttpResponse.json({
      workspace: {
        id: params.id as string,
        name: 'Test Cockpit',
        description: 'Detail view',
        status: 'running',
        agentIds: [],
        widgets: [],
      },
    });
  }),

  http.post(`${API_BASE}/workspaces`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      workspace: {
        id: 'ws-new',
        name: body.name,
        description: body.description || '',
        status: 'running',
        agentIds: body.agentIds || [],
        widgets: body.widgets || [],
      },
    });
  }),

  http.put(`${API_BASE}/workspaces/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      workspace: {
        id: params.id as string,
        name: body.name,
        description: body.description || '',
        status: 'running',
        agentIds: [],
        widgets: [],
      },
    });
  }),

  http.delete(`${API_BASE}/workspaces/:id`, () => {
    return HttpResponse.json({ success: true });
  }),

  // ─── Connections ───
  http.get(`${API_BASE}/connections`, () => {
    return HttpResponse.json({ connections: [] });
  }),
];
