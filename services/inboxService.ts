/**
 * Inbox Service - API client for inbox operations
 * T028-T031: Service layer for conversations, messages, labels, quick replies
 */

import type {
  InboxConversation,
  InboxMessage,
  InboxLabel,
  InboxQuickReply,
  ConversationStatus,
  ConversationMode,
  ConversationPriority,
} from '@/types'
import { api } from '@/lib/api'

// =============================================================================
// Types
// =============================================================================

export interface ConversationListParams {
  page?: number
  limit?: number
  status?: ConversationStatus
  mode?: ConversationMode
  labelId?: string
  search?: string
}

export interface ConversationListResult {
  conversations: InboxConversation[]
  total: number
  page: number
  totalPages: number
}

export interface MessageListParams {
  before?: string
  limit?: number
}

export interface MessageListResult {
  messages: InboxMessage[]
  hasMore: boolean
}

export interface SendMessageParams {
  content: string
  message_type?: 'text' | 'template'
  template_name?: string
  template_params?: Record<string, string[]>
}

export interface UpdateConversationParams {
  status?: ConversationStatus
  mode?: ConversationMode
  priority?: ConversationPriority
  ai_agent_id?: string
  labels?: string[]
  /** When human mode should auto-expire (ISO string). Set when switching to human mode. */
  human_mode_expires_at?: string | null
}

export interface CreateLabelParams {
  name: string
  color?: string
}

export interface CreateQuickReplyParams {
  title: string
  content: string
  shortcut?: string
}

export interface HandoffParams {
  reason?: string
  summary?: string
  pauseMinutes?: number
}

export interface HandoffResult {
  success: boolean
  conversation: InboxConversation
  message: string
}

export interface PauseResult {
  success: boolean
  conversation: InboxConversation
  paused_until: string
  duration_minutes: number
}

export interface ResumeResult {
  success: boolean
  conversation: InboxConversation
  message: string
}

// =============================================================================
// Export Service
// =============================================================================

export const inboxService = {
  // Conversations
  listConversations: (params: ConversationListParams = {}): Promise<ConversationListResult> => {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', String(params.page))
    if (params.limit) searchParams.set('limit', String(params.limit))
    if (params.status) searchParams.set('status', params.status)
    if (params.mode) searchParams.set('mode', params.mode)
    if (params.labelId) searchParams.set('label_id', params.labelId)
    if (params.search) searchParams.set('search', params.search)
    return api.get<ConversationListResult>(`/api/inbox/conversations?${searchParams.toString()}`)
  },

  getConversation: (id: string): Promise<InboxConversation> =>
    api.get<InboxConversation>(`/api/inbox/conversations/${id}`),

  updateConversation: (id: string, params: UpdateConversationParams): Promise<InboxConversation> =>
    api.patch<InboxConversation>(`/api/inbox/conversations/${id}`, params),

  deleteConversation: (id: string): Promise<void> =>
    api.del(`/api/inbox/conversations/${id}`),

  markAsRead: (conversationId: string): Promise<void> =>
    api.post(`/api/inbox/conversations/${conversationId}/read`),

  // Messages
  listMessages: (conversationId: string, params: MessageListParams = {}): Promise<MessageListResult> => {
    const searchParams = new URLSearchParams()
    if (params.before) searchParams.set('before', params.before)
    if (params.limit) searchParams.set('limit', String(params.limit))
    return api.get<MessageListResult>(
      `/api/inbox/conversations/${conversationId}/messages?${searchParams.toString()}`
    )
  },

  sendMessage: (conversationId: string, params: SendMessageParams): Promise<InboxMessage> =>
    api.post<InboxMessage>(`/api/inbox/conversations/${conversationId}/messages`, params),

  // Labels
  listLabels: (): Promise<InboxLabel[]> =>
    api.get<InboxLabel[]>('/api/inbox/labels'),

  createLabel: (params: CreateLabelParams): Promise<InboxLabel> =>
    api.post<InboxLabel>('/api/inbox/labels', params),

  deleteLabel: (id: string): Promise<void> =>
    api.del(`/api/inbox/labels/${id}`),

  // Quick Replies
  listQuickReplies: (): Promise<InboxQuickReply[]> =>
    api.get<InboxQuickReply[]>('/api/inbox/quick-replies'),

  createQuickReply: (params: CreateQuickReplyParams): Promise<InboxQuickReply> =>
    api.post<InboxQuickReply>('/api/inbox/quick-replies', params),

  updateQuickReply: (id: string, params: Partial<CreateQuickReplyParams>): Promise<InboxQuickReply> =>
    api.patch<InboxQuickReply>(`/api/inbox/quick-replies/${id}`, params),

  deleteQuickReply: (id: string): Promise<void> =>
    api.del(`/api/inbox/quick-replies/${id}`),

  // Handoff (T050)
  handoffToHuman: (conversationId: string, params: HandoffParams = {}): Promise<HandoffResult> =>
    api.post<HandoffResult>(`/api/inbox/conversations/${conversationId}/handoff`, params),

  returnToBot: async (conversationId: string): Promise<HandoffResult> => {
    const response = await fetch(`/api/inbox/conversations/${conversationId}/handoff`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to return to bot' }))
      throw new Error(error.error || 'Failed to return to bot')
    }
    return response.json()
  },

  // Pause/Resume Automation (T068)
  pauseAutomation: (
    conversationId: string,
    durationMinutes: number,
    reason?: string
  ): Promise<PauseResult> =>
    api.post<PauseResult>(`/api/inbox/conversations/${conversationId}/pause`, {
      duration_minutes: durationMinutes,
      reason,
    }),

  resumeAutomation: (conversationId: string): Promise<ResumeResult> =>
    api.post<ResumeResult>(`/api/inbox/conversations/${conversationId}/resume`),
}
