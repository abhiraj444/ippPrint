import { DurableObject } from 'cloudflare:workers';
import { Buffer } from 'node:buffer';

export class TunnelDO extends DurableObject {
  private agentSocket: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (res: Response) => void;
    reject: (err: Error) => void;
    timeout: number;
  }>();

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.ctx.getWebSockets('agent').forEach(ws => {
      this.agentSocket = ws;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    
    // Handle WebSocket upgrade from agent
    if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
      
      this.ctx.acceptWebSocket(server, ['agent']);
      this.agentSocket = server;
      
      console.log('Agent connected');
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // Handle regular HTTP requests to be tunneled
    if (!this.agentSocket) {
      return new Response('Bad Gateway: No agent connected', { status: 502 });
    }

    const requestId = crypto.randomUUID();
    const headers = Object.fromEntries(request.headers.entries());
    const arrayBuffer = await request.arrayBuffer();
    const base64Body = this.arrayBufferToBase64(arrayBuffer);

    const message = {
      type: 'request',
      requestId,
      method: request.method,
      path: new URL(request.url).pathname + new URL(request.url).search,
      headers,
      body: base64Body,
      contentType: request.headers.get('content-type')
    };

    const promise = new Promise<Response>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Gateway Timeout'));
      }, 180000) as unknown as number; // 3 minutes timeout for large multi-page print documents
      
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
    });

    try {
      this.agentSocket.send(JSON.stringify(message));
      return await promise;
    } catch (err: any) {
      if (err.message === 'Gateway Timeout') {
        return new Response('Gateway Timeout', { status: 504 });
      }
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return;
    
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'register') {
        console.log('Agent registered', data);
      } else if (data.type === 'response') {
        const pending = this.pendingRequests.get(data.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(data.requestId);
          
          let bodyData: Uint8Array | null = null;
          if (data.body) {
            bodyData = this.base64ToArrayBuffer(data.body);
          }
          
          const response = new Response(bodyData, {
            status: data.status || 200,
            headers: data.headers || {}
          });
          
          pending.resolve(response);
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message', err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    if (this.agentSocket === ws) {
      this.agentSocket = null;
      console.log('Agent disconnected');
      
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests.entries()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Agent disconnected'));
      }
      this.pendingRequests.clear();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('WebSocket error', error);
    this.webSocketClose(ws, 1006, 'Error', false);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString('base64');
  }

  private base64ToArrayBuffer(base64: string): Uint8Array {
    return Buffer.from(base64, 'base64');
  }
}
