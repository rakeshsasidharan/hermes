import unreadCountsReducer, {
  initCounts,
  incrementCount,
  decrementCount,
} from '@/store/unread-counts-slice';

describe('unreadCountsSlice', () => {
  const initial = { counts: {} };

  test('initCounts replaces state with the provided map', () => {
    const state = unreadCountsReducer(initial, initCounts({ 'a@example.com': 3, 'b@example.com': 0 }));
    expect(state.counts).toEqual({ 'a@example.com': 3, 'b@example.com': 0 });
  });

  test('initCounts overwrites existing counts', () => {
    const prev = unreadCountsReducer(initial, initCounts({ 'a@example.com': 5 }));
    const state = unreadCountsReducer(prev, initCounts({ 'b@example.com': 2 }));
    expect(state.counts).toEqual({ 'b@example.com': 2 });
  });

  test('incrementCount adds 1 to an existing address', () => {
    const prev = unreadCountsReducer(initial, initCounts({ 'a@example.com': 2 }));
    const state = unreadCountsReducer(prev, incrementCount('a@example.com'));
    expect(state.counts['a@example.com']).toBe(3);
  });

  test('incrementCount starts from 0 for an unknown address', () => {
    const state = unreadCountsReducer(initial, incrementCount('new@example.com'));
    expect(state.counts['new@example.com']).toBe(1);
  });

  test('decrementCount subtracts 1 from an existing address', () => {
    const prev = unreadCountsReducer(initial, initCounts({ 'a@example.com': 3 }));
    const state = unreadCountsReducer(prev, decrementCount('a@example.com'));
    expect(state.counts['a@example.com']).toBe(2);
  });

  test('decrementCount does not go below 0', () => {
    const prev = unreadCountsReducer(initial, initCounts({ 'a@example.com': 0 }));
    const state = unreadCountsReducer(prev, decrementCount('a@example.com'));
    expect(state.counts['a@example.com']).toBe(0);
  });

  test('decrementCount on unknown address stays at 0', () => {
    const state = unreadCountsReducer(initial, decrementCount('unknown@example.com'));
    expect(state.counts['unknown@example.com']).toBe(0);
  });
});
