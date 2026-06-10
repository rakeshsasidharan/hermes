import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export type TagType = 'Message' | 'Draft' | 'Folder' | 'Thread';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Message', 'Draft', 'Folder', 'Thread'] satisfies TagType[],
  endpoints: () => ({}),
});
