import { TunnelDO } from './tunnel-do';

export { TunnelDO };

export interface Env {
  TUNNEL_DO: DurableObjectNamespace;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    // Health check
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Default device ID for PoC
    const deviceId = 'default';

    // WebSocket upgrade for laptop agent
    if (url.pathname.startsWith('/connect/')) {
      const parts = url.pathname.split('/');
      const id = parts[2] || deviceId;
      const doId = env.TUNNEL_DO.idFromName(id);
      const stub = env.TUNNEL_DO.get(doId);
      return stub.fetch(request);
    }

    // Forward /printers/* and /api/* to the Durable Object
    if (url.pathname.startsWith('/printers') || url.pathname.startsWith('/api/')) {
      const doId = env.TUNNEL_DO.idFromName(deviceId);
      const stub = env.TUNNEL_DO.get(doId);
      const response = await stub.fetch(request);
      
      // Clone response and attach CORS headers
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
