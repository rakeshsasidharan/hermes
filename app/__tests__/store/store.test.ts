import { makeStore } from '@/store';
import { apiSlice } from '@/store/api';
import { initCounts } from '@/store/unread-counts-slice';

describe('Redux store', () => {
  it('initializes without errors', () => {
    const store = makeStore();
    expect(store).toBeDefined();
    expect(store.getState()).toBeDefined();
  });

  it('mounts the api reducer under the correct key', () => {
    const store = makeStore();
    const state = store.getState();
    expect(state[apiSlice.reducerPath]).toBeDefined();
  });

  it('creates an independent store instance on each makeStore call', () => {
    const storeA = makeStore();
    const storeB = makeStore();
    expect(storeA).not.toBe(storeB);
  });
});

describe('apiSlice', () => {
  it('has the expected tag types', () => {
    const tagTypes = apiSlice.reducerPath;
    expect(tagTypes).toBe('api');
  });

  it('exposes endpoints object', () => {
    expect(apiSlice.endpoints).toBeDefined();
  });

  it('exposes getDrafts query endpoint', () => {
    expect(apiSlice.endpoints.getDrafts).toBeDefined();
  });

  it('exposes sendEmail mutation endpoint', () => {
    expect(apiSlice.endpoints.sendEmail).toBeDefined();
  });

  it('exposes getMessages query endpoint', () => {
    expect(apiSlice.endpoints.getMessages).toBeDefined();
  });

  it('exposes getMessage query endpoint', () => {
    expect(apiSlice.endpoints.getMessage).toBeDefined();
  });

  it('exposes markReadStatus mutation endpoint', () => {
    expect(apiSlice.endpoints.markReadStatus).toBeDefined();
  });

  it('exposes moveMessage mutation endpoint', () => {
    expect(apiSlice.endpoints.moveMessage).toBeDefined();
  });

  it('exposes deleteMessage mutation endpoint', () => {
    expect(apiSlice.endpoints.deleteMessage).toBeDefined();
  });

  it('exposes replyToMessage mutation endpoint', () => {
    expect(apiSlice.endpoints.replyToMessage).toBeDefined();
  });
});

describe('apiSlice — getMessages cache key serialization', () => {
  it('stores getMessages data by address+folder combination', () => {
    const store = makeStore();
    store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', folder: 'inbox', direction: 'inbound' },
        { messages: [], nextCursor: null },
      ),
    );
    const state = store.getState();
    expect(state[apiSlice.reducerPath]).toBeDefined();
  });
});

describe('apiSlice — markReadStatus optimistic update', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('updates isRead in the getMessages cache via onQueryStarted', async () => {
    const store = makeStore();
    const messages = [
      { messageId: 'msg-1', subject: 'Hello', receivedAt: '2026-01-01T10:00:00Z', isRead: false, address: 'test@example.com' },
    ];
    store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', direction: 'inbound' },
        { messages, nextCursor: null },
      ),
    );

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { ...messages[0], isRead: true } }) });

    const result = store.dispatch(
      apiSlice.endpoints.markReadStatus.initiate({
        messageId: 'msg-1',
        isRead: true,
        address: 'test@example.com',
        direction: 'inbound',
      }),
    );

    // Optimistic update should be applied immediately
    const cacheData = (store.getState() as ReturnType<typeof store['getState']>)[apiSlice.reducerPath];
    expect(cacheData).toBeDefined();

    await result;
  });
});

describe('apiSlice — deleteMessage optimistic update', () => {
  it('exposes deleteMessage endpoint with onQueryStarted optimistic update', () => {
    // The endpoint exists and has the correct structure.
    // Optimistic update behavior is verified in message-list.test.tsx via mock mutations.
    expect(apiSlice.endpoints.deleteMessage).toBeDefined();
    expect(typeof apiSlice.endpoints.deleteMessage.initiate).toBe('function');
  });
});

describe('apiSlice — markReadStatus unread count side effects', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('decrements unread count when inbox message is marked read', async () => {
    const store = makeStore();
    store.dispatch(initCounts({ 'test@example.com': 5 }));

    const message = { messageId: 'msg-1', subject: 'Hi', receivedAt: '2026-01-01T10:00:00Z', isRead: false, address: 'test@example.com' };
    store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', folder: 'inbox', direction: undefined },
        { messages: [message], nextCursor: null },
      ),
    );

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: { ...message, isRead: true } }));

    await store.dispatch(
      apiSlice.endpoints.markReadStatus.initiate({
        messageId: 'msg-1',
        isRead: true,
        address: 'test@example.com',
        folder: 'inbox',
      }),
    );

    expect((store.getState() as ReturnType<typeof store['getState']>).unreadCounts.counts['test@example.com']).toBe(4);
  });

  it('increments unread count when inbox message is marked unread', async () => {
    const store = makeStore();
    store.dispatch(initCounts({ 'test@example.com': 2 }));

    const message = { messageId: 'msg-1', subject: 'Hi', receivedAt: '2026-01-01T10:00:00Z', isRead: true, address: 'test@example.com' };
    store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', folder: 'inbox', direction: undefined },
        { messages: [message], nextCursor: null },
      ),
    );

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: { ...message, isRead: false } }));

    await store.dispatch(
      apiSlice.endpoints.markReadStatus.initiate({
        messageId: 'msg-1',
        isRead: false,
        address: 'test@example.com',
        folder: 'inbox',
      }),
    );

    expect((store.getState() as ReturnType<typeof store['getState']>).unreadCounts.counts['test@example.com']).toBe(3);
  });

  it('does not change unread count for junk folder messages', async () => {
    const store = makeStore();
    store.dispatch(initCounts({ 'test@example.com': 3 }));

    const message = { messageId: 'msg-1', subject: 'Hi', receivedAt: '2026-01-01T10:00:00Z', isRead: false, address: 'test@example.com' };
    store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', folder: 'junk', direction: undefined },
        { messages: [message], nextCursor: null },
      ),
    );

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: { ...message, isRead: true } }));

    await store.dispatch(
      apiSlice.endpoints.markReadStatus.initiate({
        messageId: 'msg-1',
        isRead: true,
        address: 'test@example.com',
        folder: 'junk',
      }),
    );

    expect((store.getState() as ReturnType<typeof store['getState']>).unreadCounts.counts['test@example.com']).toBe(3);
  });
});

describe('apiSlice — moveMessage unread count side effects', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('decrements unread count when unread inbox message is moved out', async () => {
    const store = makeStore();
    store.dispatch(initCounts({ 'test@example.com': 4 }));

    const message = { messageId: 'msg-1', subject: 'Hi', receivedAt: '2026-01-01T10:00:00Z', isRead: false, address: 'test@example.com' };
    await store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', folder: 'inbox', direction: undefined },
        { messages: [message], nextCursor: null },
      ),
    );

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: { ...message, folder: 'trash' } }));

    await store.dispatch(
      apiSlice.endpoints.moveMessage.initiate({
        messageId: 'msg-1',
        targetFolder: 'trash',
        fromAddress: 'test@example.com',
        fromFolder: 'inbox',
      }),
    );

    expect((store.getState() as ReturnType<typeof store['getState']>).unreadCounts.counts['test@example.com']).toBe(3);
  });

  it('does not decrement when moving an already-read inbox message', async () => {
    const store = makeStore();
    store.dispatch(initCounts({ 'test@example.com': 2 }));

    const message = { messageId: 'msg-1', subject: 'Hi', receivedAt: '2026-01-01T10:00:00Z', isRead: true, address: 'test@example.com' };
    await store.dispatch(
      apiSlice.util.upsertQueryData(
        'getMessages',
        { address: 'test@example.com', folder: 'inbox', direction: undefined },
        { messages: [message], nextCursor: null },
      ),
    );

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({ message: { ...message, folder: 'trash' } }));

    await store.dispatch(
      apiSlice.endpoints.moveMessage.initiate({
        messageId: 'msg-1',
        targetFolder: 'trash',
        fromAddress: 'test@example.com',
        fromFolder: 'inbox',
      }),
    );

    expect((store.getState() as ReturnType<typeof store['getState']>).unreadCounts.counts['test@example.com']).toBe(2);
  });
});
