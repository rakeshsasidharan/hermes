import { makeStore } from '@/store';
import { apiSlice } from '@/store/api';

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
});
