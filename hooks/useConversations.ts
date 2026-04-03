/**
 * T028: useConversations - List conversations with filters
 * Provides conversation list with filtering, search, and real-time updates
 */

import { useMemo, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRealtimeQuery } from './useRealtimeQuery'
import {
  inboxService,
  type ConversationListParams,
  type ConversationListResult,
} from '@/services/inboxService'
import type { InboxConversation, ConversationStatus, ConversationMode } from '@/types'
import { CACHE, REALTIME } from '@/lib/constants'
import { getConversationQueryKey } from './useConversation'

// Default timeout: 0 = nunca expira (can be overridden by passing timeoutMs to switchMode)
const DEFAULT_HUMAN_MODE_TIMEOUT_MS = 0 // 0 = nunca expira

const CONVERSATIONS_KEY = 'inbox-conversations'
const CONVERSATIONS_LIST_KEY = [CONVERSATIONS_KEY, 'list']

// Query key builder
export const getConversationsQueryKey = (params: ConversationListParams) => [
  ...CONVERSATIONS_LIST_KEY,
  params,
]

// =============================================================================
// Main Hook
// =============================================================================

export interface UseConversationsParams {
  page?: number
  limit?: number
  status?: ConversationStatus
  mode?: ConversationMode
  labelId?: string
  search?: string
  initialData?: InboxConversation[]
}

export function useConversations(params: UseConversationsParams = {}) {
  const queryClient = useQueryClient()
  const { page = 1, limit = 20, status, mode, labelId, search, initialData } = params

  const queryParams: ConversationListParams = useMemo(
    () => ({ page, limit, status, mode, labelId, search }),
    [page, limit, status, mode, labelId, search]
  )

  const queryKey = getConversationsQueryKey(queryParams)

  // Se temos initialData e estamos na página 1 sem filtros, usamos como dados iniciais
  const isFirstPageNoFilters = page === 1 && !status && !mode && !labelId && !search
  const queryInitialData = isFirstPageNoFilters && initialData
    ? {
        conversations: initialData,
        total: initialData.length,
        page: 1,
        limit,
        totalPages: 1
      }
    : undefined

  // Query with real-time subscription
  const query = useRealtimeQuery<ConversationListResult>({
    queryKey,
    queryFn: () => inboxService.listConversations(queryParams),
    initialData: queryInitialData,
    staleTime: CACHE.inbox, // 30s - user-facing list with realtime updates
    refetchOnWindowFocus: false,
    // Real-time configuration
    table: 'inbox_conversations',
    events: ['INSERT', 'UPDATE', 'DELETE'],
    debounceMs: REALTIME.debounceDefault,
  })

  // Computed values
  const conversations = query.data?.conversations ?? []
  const total = query.data?.total ?? 0
  const totalPages = query.data?.totalPages ?? 1
  const hasNextPage = page < totalPages
  const hasPreviousPage = page > 1

  // Total unread count across all conversations
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),
    [conversations]
  )

  // Invalidation helper
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
  }, [queryClient])

  return {
    // Data
    conversations,
    total,
    totalPages,
    totalUnread,

    // Pagination
    page,
    hasNextPage,
    hasPreviousPage,

    // Query state
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,

    // Actions
    invalidate,
    refetch: query.refetch,
  }
}

// =============================================================================
// Mutations Hook
// =============================================================================

export function useConversationMutations() {
  const queryClient = useQueryClient()

  // Update conversation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...params }: { id: string } & Parameters<typeof inboxService.updateConversation>[1]) =>
      inboxService.updateConversation(id, params),
    onSuccess: (updated) => {
      // Update in list cache
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            ),
          }
        }
      )
      // Atualiza cache individual usando a chave correta (singular: 'inbox-conversation')
      queryClient.setQueryData(getConversationQueryKey(updated.id), updated)
    },
  })

  // Mark as read
  const markAsReadMutation = useMutation({
    mutationFn: inboxService.markAsRead,
    onMutate: async (conversationId) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })

      // Salva snapshot para rollback
      const previousData = queryClient.getQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY }
      )

      // Optimistic update
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === conversationId ? { ...c, unread_count: 0 } : c
            ),
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _conversationId, context) => {
      // Rollback do update otimista em caso de erro
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  // Close conversation
  const closeMutation = useMutation({
    mutationFn: (id: string) => inboxService.updateConversation(id, { status: 'closed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  // Reopen conversation
  const reopenMutation = useMutation({
    mutationFn: (id: string) => inboxService.updateConversation(id, { status: 'open' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  // Switch mode (with auto-expiration for human mode)
  // timeoutMs: pass from useInboxSettings.humanModeTimeoutHours * 60 * 60 * 1000
  // If timeoutMs is 0, human mode never expires
  const switchModeMutation = useMutation({
    mutationFn: ({ id, mode, timeoutMs }: { id: string; mode: ConversationMode; timeoutMs?: number }) => {
      const effectiveTimeout = timeoutMs ?? DEFAULT_HUMAN_MODE_TIMEOUT_MS

      // When switching to human mode, set expiration (unless timeout is 0 = never expires)
      // When switching to bot mode, clear expiration
      const human_mode_expires_at = mode === 'human' && effectiveTimeout > 0
        ? new Date(Date.now() + effectiveTimeout).toISOString()
        : null

      return inboxService.updateConversation(id, { mode, human_mode_expires_at })
    },
    onMutate: async ({ id, mode, timeoutMs }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      await queryClient.cancelQueries({ queryKey: getConversationQueryKey(id) })

      const effectiveTimeout = timeoutMs ?? DEFAULT_HUMAN_MODE_TIMEOUT_MS

      // Calculate expiration for optimistic update
      const human_mode_expires_at = mode === 'human' && effectiveTimeout > 0
        ? new Date(Date.now() + effectiveTimeout).toISOString()
        : null

      // Optimistic update - Lista de conversas
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, mode, human_mode_expires_at } : c
            ),
          }
        }
      )

      // Optimistic update - Conversa individual (para o ConversationHeader)
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(id),
        (old) => (old ? { ...old, mode, human_mode_expires_at } : old)
      )
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(id) })
    },
  })

  // T050: Handoff to human
  const handoffMutation = useMutation({
    mutationFn: ({ id, ...params }: { id: string; reason?: string; summary?: string; pauseMinutes?: number }) =>
      inboxService.handoffToHuman(id, params),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      await queryClient.cancelQueries({ queryKey: getConversationQueryKey(id) })

      // Optimistic update - Lista de conversas
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, mode: 'human' as ConversationMode } : c
            ),
          }
        }
      )

      // Optimistic update - Conversa individual
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(id),
        (old) => (old ? { ...old, mode: 'human' as ConversationMode } : old)
      )
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(id) })
    },
  })

  // T050: Return to bot
  const returnToBotMutation = useMutation({
    mutationFn: (id: string) => inboxService.returnToBot(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      await queryClient.cancelQueries({ queryKey: getConversationQueryKey(id) })

      // Optimistic update - Lista de conversas
      queryClient.setQueriesData<ConversationListResult>(
        { queryKey: CONVERSATIONS_LIST_KEY },
        (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, mode: 'bot' as ConversationMode } : c
            ),
          }
        }
      )

      // Optimistic update - Conversa individual
      queryClient.setQueryData<InboxConversation | null>(
        getConversationQueryKey(id),
        (old) => (old ? { ...old, mode: 'bot' as ConversationMode } : old)
      )
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
      queryClient.invalidateQueries({ queryKey: getConversationQueryKey(id) })
    },
  })

  // Delete conversation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => inboxService.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_LIST_KEY })
    },
  })

  return {
    update: updateMutation.mutateAsync,
    markAsRead: markAsReadMutation.mutateAsync,
    close: closeMutation.mutateAsync,
    reopen: reopenMutation.mutateAsync,
    switchMode: switchModeMutation.mutateAsync,
    handoff: handoffMutation.mutateAsync,
    returnToBot: returnToBotMutation.mutateAsync,
    deleteConversation: deleteMutation.mutateAsync,

    isUpdating: updateMutation.isPending,
    isMarkingAsRead: markAsReadMutation.isPending,
    isClosing: closeMutation.isPending,
    isReopening: reopenMutation.isPending,
    isSwitchingMode: switchModeMutation.isPending,
    isHandingOff: handoffMutation.isPending,
    isReturningToBot: returnToBotMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
