import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export type TagType = 'Message' | 'Draft' | 'Folder' | 'Thread';

export interface Draft {
  draftId: string;
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
  attachmentKeys?: string[];
  inReplyToMessageId?: string;
  updatedAt: string;
}

export interface GetDraftsResponse {
  drafts: Draft[];
}

export interface SendEmailPayload {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachmentKeys?: string[];
  draftId?: string;
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  tagTypes: ['Message', 'Draft', 'Folder', 'Thread'] satisfies TagType[],
  endpoints: (builder) => ({
    getDrafts: builder.query<GetDraftsResponse, string>({
      query: (address) => `/drafts?from=${encodeURIComponent(address)}`,
      providesTags: ['Draft'],
    }),
    sendEmail: builder.mutation<{ messageId: string }, SendEmailPayload>({
      query: (payload) => ({
        url: '/messages',
        method: 'POST',
        body: payload,
      }),
      async onQueryStarted({ draftId, from }, { dispatch, queryFulfilled }) {
        if (!draftId) return;
        const patchResult = dispatch(
          apiSlice.util.updateQueryData('getDrafts', from, (draft) => {
            draft.drafts = draft.drafts.filter((d) => d.draftId !== draftId);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchResult.undo();
        }
      },
      invalidatesTags: (_result, error) => (error ? [] : ['Draft']),
    }),
  }),
});

export const { useGetDraftsQuery, useSendEmailMutation } = apiSlice;
