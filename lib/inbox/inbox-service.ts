/**
 * Inbox Service Layer
 * T017: Business logic for inbox operations
 */

import {
  getConversations,
  getConversationById,
  getOrCreateConversation,
  updateConversation,
  removeConversation,
  markConversationAsRead,
  getMessagesByConversation,
  createMessage,
  findMessageByWhatsAppId,
  updateMessageDeliveryStatus,
  getLabels,
  createLabel,
  deleteLabel,
  addLabelToConversation,
  removeLabelFromConversation,
  getQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  type ConversationFilters,
  type MessageFilters,
} from './inbox-db'
import { sendWhatsAppMessage } from '@/lib/whatsapp-send'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import type {
  InboxConversation,
  InboxMessage,
  InboxLabel,
  InboxQuickReply,
  UpdateInboxConversationDTO,
  CreateInboxLabelDTO,
  CreateInboxQuickReplyDTO,
  ConversationMode,
  ConversationPriority,
  Template,
} from '@/types'
import type { ResolvedTemplateValues } from '@/lib/whatsapp/template-contract'

// =============================================================================
// Conversation Service
// =============================================================================

export async function listConversations(filters: ConversationFilters = {}) {
  return getConversations(filters)
}

export async function getConversation(id: string) {
  return getConversationById(id)
}

export async function findOrCreateConversation(
  phone: string,
  contactId?: string,
  aiAgentId?: string
) {
  return getOrCreateConversation(phone, contactId, aiAgentId)
}

export async function patchConversation(
  id: string,
  updates: UpdateInboxConversationDTO
) {
  return updateConversation(id, updates)
}

export async function closeConversation(id: string) {
  return updateConversation(id, { status: 'closed' })
}

export async function reopenConversation(id: string) {
  return updateConversation(id, { status: 'open' })
}

export async function setConversationMode(id: string, mode: ConversationMode) {
  return updateConversation(id, { mode })
}

export async function setConversationPriority(
  id: string,
  priority: ConversationPriority
) {
  return updateConversation(id, { priority })
}

export async function markAsRead(conversationId: string) {
  return markConversationAsRead(conversationId)
}

export async function deleteConversation(id: string) {
  return removeConversation(id)
}

// =============================================================================
// Message Service
// =============================================================================

export async function listMessages(
  conversationId: string,
  filters: MessageFilters = {}
) {
  return getMessagesByConversation(conversationId, filters)
}

/**
 * Send a message to a conversation
 * This handles both persisting the message and sending via WhatsApp
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  messageType: 'text' | 'template' = 'text',
  templateName?: string,
  templateParams?: Record<string, string[]>
): Promise<InboxMessage> {
  // Get conversation to get phone number
  const conversation = await getConversationById(conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  // Get WhatsApp credentials
  const credentials = await getWhatsAppCredentials()
  if (!credentials) {
    throw new Error('WhatsApp credentials not configured')
  }

  // Send via WhatsApp
  let whatsappResult: { messageId?: string; error?: string }

  try {
    if (messageType === 'template' && templateName) {
      // Send template message
      whatsappResult = await sendWhatsAppMessage({
        to: conversation.phone,
        type: 'template',
        templateName,
        templateParams,
        credentials,
      })
    } else {
      // Send text message
      whatsappResult = await sendWhatsAppMessage({
        to: conversation.phone,
        type: 'text',
        text: content,
        credentials,
      })
    }
  } catch (error) {
    whatsappResult = {
      error: error instanceof Error ? error.message : 'Failed to send message',
    }
  }

  // Persist the message
  const message = await createMessage({
    conversation_id: conversationId,
    direction: 'outbound',
    content,
    message_type: messageType,
    whatsapp_message_id: whatsappResult.messageId,
  })

  // Update delivery status based on send result
  if (whatsappResult.error) {
    await updateMessageDeliveryStatus(message.id, 'failed')
  } else if (whatsappResult.messageId) {
    await updateMessageDeliveryStatus(whatsappResult.messageId, 'sent')
  }

  return message
}

/**
 * Persist an inbound message from webhook
 */
export async function persistInboundMessage(
  phone: string,
  content: string,
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' = 'text',
  whatsappMessageId?: string,
  mediaUrl?: string,
  payload?: Record<string, unknown>,
  contactId?: string
): Promise<{ conversation: InboxConversation; message: InboxMessage }> {
  // Find or create conversation
  const conversation = await findOrCreateConversation(phone, contactId)

  // Create message
  const message = await createMessage({
    conversation_id: conversation.id,
    direction: 'inbound',
    content,
    message_type: messageType,
    whatsapp_message_id: whatsappMessageId,
    media_url: mediaUrl,
    payload,
  })

  // Refresh conversation to get updated counters
  const updatedConversation = await getConversationById(conversation.id)

  return {
    conversation: updatedConversation!,
    message,
  }
}

/**
 * Handle delivery status update from webhook
 */
export async function handleDeliveryStatusUpdate(
  whatsappMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed'
) {
  return updateMessageDeliveryStatus(whatsappMessageId, status)
}

// =============================================================================
// Label Service
// =============================================================================

export async function listLabels() {
  return getLabels()
}

export async function createNewLabel(dto: CreateInboxLabelDTO) {
  return createLabel(dto)
}

export async function removeLabel(id: string) {
  return deleteLabel(id)
}

export async function assignLabel(conversationId: string, labelId: string) {
  return addLabelToConversation(conversationId, labelId)
}

export async function unassignLabel(conversationId: string, labelId: string) {
  return removeLabelFromConversation(conversationId, labelId)
}

// =============================================================================
// Quick Replies Service
// =============================================================================

export async function listQuickReplies() {
  return getQuickReplies()
}

export async function createNewQuickReply(dto: CreateInboxQuickReplyDTO) {
  return createQuickReply(dto)
}

export async function updateExistingQuickReply(
  id: string,
  dto: Partial<CreateInboxQuickReplyDTO>
) {
  return updateQuickReply(id, dto)
}

export async function removeQuickReply(id: string) {
  return deleteQuickReply(id)
}

// =============================================================================
// Automation Control
// =============================================================================

/**
 * Pause automation for a conversation
 */
export async function pauseAutomation(
  conversationId: string,
  minutes: number,
  pausedBy?: string
): Promise<InboxConversation> {
  const pauseUntil = new Date()
  pauseUntil.setMinutes(pauseUntil.getMinutes() + minutes)

  return updateConversation(conversationId, {
    mode: 'human',
    // @ts-expect-error - These fields exist but aren't in the DTO
    automation_paused_until: pauseUntil.toISOString(),
    automation_paused_by: pausedBy || 'operator',
  })
}

/**
 * Resume automation for a conversation
 */
export async function resumeAutomation(
  conversationId: string
): Promise<InboxConversation> {
  return updateConversation(conversationId, {
    mode: 'bot',
    // @ts-expect-error - These fields exist but aren't in the DTO
    automation_paused_until: null,
    automation_paused_by: null,
  })
}

/**
 * Check if automation is paused for a conversation
 */
export async function isAutomationPaused(
  conversationId: string
): Promise<boolean> {
  const conversation = await getConversationById(conversationId)
  if (!conversation) return false

  // Check if in human mode
  if (conversation.mode === 'human') return true

  // Check if pause is still active
  if (conversation.automation_paused_until) {
    const pauseUntil = new Date(conversation.automation_paused_until)
    if (pauseUntil > new Date()) {
      return true
    }

    // Pause expired, resume automation
    await resumeAutomation(conversationId)
  }

  return false
}

// =============================================================================
// Handoff Service
// =============================================================================

/**
 * Execute handoff to human operator
 */
export async function executeHandoff(
  conversationId: string,
  reason: string,
  summary: string,
  priority: ConversationPriority = 'high'
): Promise<InboxConversation> {
  return updateConversation(conversationId, {
    mode: 'human',
    priority,
    // @ts-expect-error - This field exists but isn't in the DTO
    handoff_summary: `**Motivo:** ${reason}\n\n**Resumo:** ${summary}`,
  })
}

// =============================================================================
// Campaign Template Sync
// =============================================================================

export interface SyncCampaignTemplateParams {
  phone: string
  contactId: string | null
  whatsappMessageId: string
  templateName: string
  templatePreviewText: string
  resolvedValues: ResolvedTemplateValues
  campaignId: string
  template: Template
}

/**
 * Sincroniza template enviado por campanha com o inbox.
 *
 * Cria uma entrada em inbox_messages para que:
 * 1. A IA tenha contexto do template enviado quando o cliente responder
 * 2. O operador veja o template no histórico visual do inbox
 * 3. Status updates (delivered, read) sejam sincronizados automaticamente
 *    (porque usamos o mesmo whatsapp_message_id da Meta)
 *
 * Características:
 * - Idempotente: verifica se já existe por whatsapp_message_id
 * - Best-effort: catch + log, não propaga erro para não afetar o workflow
 *
 * @returns ID da mensagem criada ou null se já existia/erro
 */
export async function syncCampaignTemplateToInbox(
  params: SyncCampaignTemplateParams
): Promise<string | null> {
  const {
    phone,
    contactId,
    whatsappMessageId,
    templateName,
    templatePreviewText,
    resolvedValues,
    campaignId,
    template,
  } = params

  try {
    // Idempotência: verifica se já existe mensagem com esse whatsapp_message_id
    const existing = await findMessageByWhatsAppId(whatsappMessageId)
    if (existing) {
      console.log(`[inbox-sync] Message already exists for ${whatsappMessageId}, skipping`)
      return existing.id
    }

    // Busca ou cria conversa para esse telefone
    const conversation = await getOrCreateConversation(
      phone,
      contactId || undefined,
      undefined // aiAgentId - usar default
    )

    // Cria a mensagem no inbox
    const message = await createMessage({
      conversation_id: conversation.id,
      direction: 'outbound',
      content: templatePreviewText,
      message_type: 'template',
      whatsapp_message_id: whatsappMessageId,
      delivery_status: 'sent',
      payload: {
        type: 'campaign_template',
        campaign_id: campaignId,
        template_name: templateName,
        template_language: template.language,
        resolved_values: resolvedValues,
        synced_at: new Date().toISOString(),
      },
    })

    console.log(`[inbox-sync] Created inbox message ${message.id} for campaign ${campaignId}`)
    return message.id
  } catch (error) {
    // Best-effort: log e retorna null, não propaga erro
    console.warn(
      `[inbox-sync] Failed to sync template to inbox for ${phone}:`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}
