export interface WsNewMessageEvent {
  type: 'new_message';
  address: string;
  messageId: string;
}

type MessageHandler = (event: WsNewMessageEvent) => void;

export class WebSocketManager {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000;
  private readonly maxDelay = 30_000;
  private shouldReconnect = true;

  constructor(
    private readonly url: string,
    private readonly getToken: () => string | Promise<string>,
    private readonly onMessage: MessageHandler,
  ) {}

  connect(): void {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const tokenOrPromise = this.getToken();
    if (typeof tokenOrPromise === 'string') {
      this.openSocket(tokenOrPromise);
    } else {
      tokenOrPromise
        .then((token) => {
          if (token) {
            this.openSocket(token);
          } else if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        })
        .catch(() => {
          if (this.shouldReconnect) {
            this.scheduleReconnect();
          }
        });
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private openSocket(token: string): void {
    const wsUrl = `${this.url}?token=${encodeURIComponent(token)}`;
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.reconnectDelay = 1_000;
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsNewMessageEvent;
        if (data.type === 'new_message') {
          this.onMessage(data);
        }
      } catch {
        // ignore malformed frames
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (!this.shouldReconnect) return;
      this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }
}
