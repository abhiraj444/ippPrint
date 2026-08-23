import WebSocket from 'ws';

export interface TunnelRequest {
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  bodyBase64: string;
  contentType: string;
}

export class TunnelClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private readonly maxRetryDelay = 30000;

  constructor(
    private relayUrl: string,
    private deviceId: string,
    private onRequest: (req: TunnelRequest) => Promise<void>
  ) {
    this.connect();
  }

  private connect() {
    const wsUrl = `${this.relayUrl}/connect/${this.deviceId}`;
    console.log(`[tunnel] Connecting to ${wsUrl}...`);
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log(`[tunnel] Connected successfully to relay`);
      this.retryCount = 0;
      this.ws?.send(JSON.stringify({ type: 'register', deviceId: this.deviceId }));
      
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30000);
    });

    this.ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'request') {
          console.log(`[tunnel] Received request ${msg.requestId}: ${msg.method} ${msg.path}`);
          await this.onRequest({
            requestId: msg.requestId,
            method: msg.method,
            path: msg.path,
            headers: msg.headers || {},
            bodyBase64: msg.body || '',
            contentType: msg.contentType || ''
          });
        }
      } catch (err) {
        console.error(`[tunnel] Error parsing message:`, err);
      }
    });

    this.ws.on('close', () => {
      console.log(`[tunnel] Disconnected from relay`);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[tunnel] WebSocket error:`, err.message);
      this.ws?.close();
    });
  }

  private scheduleReconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    const delay = Math.min(1000 * Math.pow(2, this.retryCount), this.maxRetryDelay);
    this.retryCount++;
    console.log(`[tunnel] Reconnecting in ${delay}ms...`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public sendResponse(requestId: string, status: number, headers: Record<string, string>, bodyBase64: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'response',
        requestId,
        status,
        headers,
        body: bodyBase64
      }));
    } else {
      console.error(`[tunnel] Cannot send response, socket not open`);
    }
  }
}
