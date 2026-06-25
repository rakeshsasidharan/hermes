import { WebSocketManager, type WsNewMessageEvent } from '@/lib/ws';

// ── WebSocket mock ────────────────────────────────────────────────────────────

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateError() {
    this.onerror?.();
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  Object.defineProperty(globalThis, 'WebSocket', {
    writable: true,
    value: MockWebSocket,
  });
});

beforeEach(() => {
  MockWebSocket.reset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebSocketManager', () => {
  const WS_URL = 'wss://example.execute-api.us-east-1.amazonaws.com/prod';
  const TOKEN = 'test-token-123';

  function makeManager(
    onMessage = jest.fn(),
    getToken: () => string | Promise<string> = () => TOKEN,
  ) {
    return new WebSocketManager(WS_URL, getToken, onMessage);
  }

  describe('connect', () => {
    test('opens WebSocket with token as query parameter', () => {
      const manager = makeManager();
      manager.connect();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe(
        `${WS_URL}?token=${encodeURIComponent(TOKEN)}`,
      );
    });

    test('calls getToken on every connect so a refreshed token is used on reconnect', () => {
      let currentToken = 'token-v1';
      const manager = makeManager(jest.fn(), () => currentToken);
      manager.connect();
      expect(MockWebSocket.instances[0].url).toContain('token-v1');

      MockWebSocket.instances[0].simulateClose();
      currentToken = 'token-v2';
      jest.advanceTimersByTime(1_000);

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(MockWebSocket.instances[1].url).toContain('token-v2');
    });

    test('accepts an async getToken and opens socket after the promise resolves', async () => {
      const manager = makeManager(jest.fn(), () => Promise.resolve('async-token'));
      manager.connect();

      // Socket not created synchronously — token is still resolving
      expect(MockWebSocket.instances).toHaveLength(0);

      await Promise.resolve(); // flush microtask queue
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toContain('async-token');
    });

    test('async getToken: reconnect uses a fresh token each time', async () => {
      let currentToken = 'token-v1';
      const manager = makeManager(jest.fn(), () => Promise.resolve(currentToken));
      manager.connect();
      await Promise.resolve();
      expect(MockWebSocket.instances[0].url).toContain('token-v1');

      MockWebSocket.instances[0].simulateClose();
      currentToken = 'token-v2';
      jest.advanceTimersByTime(1_000);
      await Promise.resolve(); // flush async getToken

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(MockWebSocket.instances[1].url).toContain('token-v2');
    });

    test('async getToken: schedules reconnect if token resolves to empty string', async () => {
      const manager = makeManager(jest.fn(), () => Promise.resolve(''));
      manager.connect();
      await Promise.resolve();

      expect(MockWebSocket.instances).toHaveLength(0);
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
      // Still retrying — each attempt returns empty string
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    test('async getToken: schedules reconnect if token fetch rejects', async () => {
      const manager = makeManager(
        jest.fn(),
        () => Promise.reject(new Error('network error')),
      );
      manager.connect();
      await Promise.resolve();

      jest.advanceTimersByTime(1_000);
      // No socket created; it retried
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    test('does not open a second socket if already OPEN', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();

      manager.connect();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    test('does not open a second socket if CONNECTING', () => {
      const manager = makeManager();
      manager.connect();
      // readyState is CONNECTING by default

      manager.connect();
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    test('resets reconnect delay to 1000ms on successful open', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateClose();

      jest.advanceTimersByTime(1_000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });

  describe('message handling', () => {
    test('calls onMessage for new_message events', () => {
      const onMessage = jest.fn();
      const manager = makeManager(onMessage);
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();

      const event: WsNewMessageEvent = {
        type: 'new_message',
        address: 'inbox@example.com',
        messageId: 'msg-1',
      };
      MockWebSocket.instances[0].simulateMessage(event);

      expect(onMessage).toHaveBeenCalledWith(event);
    });

    test('ignores events with unknown type', () => {
      const onMessage = jest.fn();
      const manager = makeManager(onMessage);
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();

      MockWebSocket.instances[0].simulateMessage({ type: 'ping' });
      expect(onMessage).not.toHaveBeenCalled();
    });

    test('silently ignores malformed JSON frames', () => {
      const onMessage = jest.fn();
      const manager = makeManager(onMessage);
      manager.connect();

      expect(() => {
        MockWebSocket.instances[0].onmessage?.({
          data: 'not-json!!!',
        } as MessageEvent);
      }).not.toThrow();
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    test('reconnects after close with initial 1000ms delay', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateClose();

      expect(MockWebSocket.instances).toHaveLength(1);
      jest.advanceTimersByTime(1_000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    test('doubles delay on each reconnect attempt (exponential backoff)', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateClose(); // delay = 1000

      jest.advanceTimersByTime(1_000);
      MockWebSocket.instances[1].simulateClose(); // delay = 2000

      jest.advanceTimersByTime(1_999);
      expect(MockWebSocket.instances).toHaveLength(2);

      jest.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    test('caps reconnect delay at 30 seconds', () => {
      const manager = makeManager();
      manager.connect();

      let delay = 1_000;
      while (delay < 30_000) {
        MockWebSocket.instances.at(-1)!.simulateClose();
        jest.advanceTimersByTime(delay);
        delay = Math.min(delay * 2, 30_000);
      }

      // Now at 30s cap — close again
      const countBefore = MockWebSocket.instances.length;
      MockWebSocket.instances.at(-1)!.simulateClose();
      jest.advanceTimersByTime(30_000);
      expect(MockWebSocket.instances).toHaveLength(countBefore + 1);
    });
  });

  describe('disconnect', () => {
    test('closes the socket', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();

      manager.disconnect();
      expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.CLOSED);
    });

    test('does not reconnect after disconnect', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateOpen();

      manager.disconnect();
      jest.advanceTimersByTime(60_000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    test('cancels a pending reconnect timer', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateClose();

      manager.disconnect();
      jest.advanceTimersByTime(60_000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    test('closes socket on error (triggers reconnect flow)', () => {
      const manager = makeManager();
      manager.connect();
      MockWebSocket.instances[0].simulateError();

      // The onerror handler calls close() which triggers onclose
      jest.advanceTimersByTime(1_000);
      expect(MockWebSocket.instances).toHaveLength(2);
    });
  });
});
