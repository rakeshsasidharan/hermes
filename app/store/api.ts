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

export interface Message {
  messageId: string;
  address?: string;
  sender?: string;
  from?: string;
  to?: string;
  direction?: 'inbound' | 'outbound';
  subject: string;
  receivedAt: string;
  isRead: boolean;
  snippet?: string;
  folder?: string;
  attachments?: Array<{
    filename: string;
    s3Key?: string;
    url?: string;
    contentType?: string;
    size?: number;
  }>;
}

export interface GetMessagesResponse {
  messages: Message[];
  nextCursor: string | null;
}

export interface GetMessagesArgs {
  address: string;
  folder?: string;
  direction?: string;
  cursor?: string;
}

export interface MarkReadStatusArgs {
  messageId: string;
  isRead: boolean;
  address: string;
  folder?: string;
  direction?: string;
}

export interface MoveMessageArgs {
  messageId: string;
  targetFolder: string;
  fromAddress: string;
  fromFolder?: string;
  fromDirection?: string;
}

export interface DeleteMessageArgs {
  messageId: string;
  address: string;
  folder?: string;
  direction?: string;
}

export interface ReplyPayload {
  from: string;
  to: string;
  cc?: string;
  body: string;
  subject?: string;
  attachmentKeys?: string[];
  draftId?: string;
}

export interface ReplyToMessageArgs {
  messageId: string;
  payload: ReplyPayload;
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
      invalidatesTags: (_result, error) => (error ? [] : ['Draft']),
    }),
    getMessages: builder.query<GetMessagesResponse, GetMessagesArgs>({
      query: ({ address, folder, direction, cursor }) => {
        const params = new URLSearchParams({ address });
        if (folder) params.set('folder', folder);
        else if (direction) params.set('direction', direction);
        if (cursor) params.set('cursor', cursor);
        return `/messages?${params.toString()}`;
      },
      providesTags: (result, _err, { address, folder, direction }) => [
        { type: 'Folder' as const, id: `${address}-${folder ?? direction ?? 'all'}` },
        ...(result?.messages.map((m) => ({ type: 'Message' as const, id: m.messageId })) ?? []),
      ],
      serializeQueryArgs: ({ queryArgs: { address, folder, direction } }) =>
        JSON.stringify({ address, folder, direction }),
      merge: (currentCache, newItems, { arg }) => {
        if (arg.cursor) {
          currentCache.messages.push(...newItems.messages);
          currentCache.nextCursor = newItems.nextCursor;
        } else {
          return newItems;
        }
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        currentArg?.cursor !== previousArg?.cursor,
    }),
    getMessage: builder.query<{ message: Message }, string>({
      query: (id) => `/messages/${encodeURIComponent(id)}`,
      providesTags: (_res, _err, id) => [{ type: 'Message' as const, id }],
    }),
    markReadStatus: builder.mutation<{ message: Message }, MarkReadStatusArgs>({
      query: ({ messageId, isRead }) => ({
        url: `/messages/${encodeURIComponent(messageId)}`,
        method: 'PATCH',
        body: { isRead },
      }),
      async onQueryStarted(
        { messageId, isRead, address, folder, direction },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          apiSlice.util.updateQueryData(
            'getMessages',
            { address, folder, direction },
            (draft) => {
              const msg = draft.messages.find((m) => m.messageId === messageId);
              if (msg) msg.isRead = isRead;
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    moveMessage: builder.mutation<{ message: Message }, MoveMessageArgs>({
      query: ({ messageId, targetFolder }) => ({
        url: `/messages/${encodeURIComponent(messageId)}`,
        method: 'PATCH',
        body: { folder: targetFolder },
      }),
      async onQueryStarted(
        { messageId, fromAddress, fromFolder, fromDirection },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          apiSlice.util.updateQueryData(
            'getMessages',
            { address: fromAddress, folder: fromFolder, direction: fromDirection },
            (draft) => {
              draft.messages = draft.messages.filter((m) => m.messageId !== messageId);
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: (_result, error, { targetFolder, fromAddress }) =>
        error ? [] : [{ type: 'Folder' as const, id: `${fromAddress}-${targetFolder}` }],
    }),
    deleteMessage: builder.mutation<{ success: boolean }, DeleteMessageArgs>({
      query: ({ messageId }) => ({
        url: `/messages/${encodeURIComponent(messageId)}`,
        method: 'DELETE',
      }),
      async onQueryStarted(
        { messageId, address, folder, direction },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          apiSlice.util.updateQueryData(
            'getMessages',
            { address, folder, direction },
            (draft) => {
              draft.messages = draft.messages.filter((m) => m.messageId !== messageId);
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    replyToMessage: builder.mutation<{ messageId: string }, ReplyToMessageArgs>({
      query: ({ messageId, payload }) => ({
        url: `/messages/${encodeURIComponent(messageId)}/reply`,
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: (_result, error, { payload }) =>
        error ? [] : [{ type: 'Folder' as const, id: `${payload.from}-outbound` }],
    }),
  }),
});

export const {
  useGetDraftsQuery,
  useSendEmailMutation,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useGetMessageQuery,
  useMarkReadStatusMutation,
  useMoveMessageMutation,
  useDeleteMessageMutation,
  useReplyToMessageMutation,
} = apiSlice;
