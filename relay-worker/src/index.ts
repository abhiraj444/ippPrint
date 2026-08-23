import { TunnelDO } from './tunnel-do';

export { TunnelDO };

export interface Env {
  TUNNEL_DO: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
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

    // IPP requests from Android phone
    if (url.pathname.startsWith('/printers')) {
      const doId = env.TUNNEL_DO.idFromName(deviceId);
      const stub = env.TUNNEL_DO.get(doId);
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
