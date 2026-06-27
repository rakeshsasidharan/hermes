import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UnreadCountsState {
  counts: Record<string, number>;
}

const unreadCountsSlice = createSlice({
  name: 'unreadCounts',
  initialState: { counts: {} } as UnreadCountsState,
  reducers: {
    initCounts(_state, action: PayloadAction<Record<string, number>>) {
      return { counts: action.payload };
    },
    incrementCount(state, action: PayloadAction<string>) {
      state.counts[action.payload] = (state.counts[action.payload] ?? 0) + 1;
    },
    decrementCount(state, action: PayloadAction<string>) {
      const cur = state.counts[action.payload] ?? 0;
      state.counts[action.payload] = Math.max(0, cur - 1);
    },
  },
});

export const { initCounts, incrementCount, decrementCount } = unreadCountsSlice.actions;
export default unreadCountsSlice.reducer;
