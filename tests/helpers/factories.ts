/**
 * Factories Tipadas para Dados de Teste
 *
 * Cada factory cria uma entidade completa com valores default sensatos.
 * Aceita overrides parciais para customização.
 *
 * - IDs únicos via crypto.randomUUID()
 * - Phones em E.164 (formato brasileiro)
 * - Enums com defaults realistas (DRAFT, OPT_IN, etc.)
 *
 * @example
 * ```ts
 * const campaign = buildCampaign({ name: 'Black Friday' })
 * const contacts = Array.from({ length: 10 }, () => buildContact())
 * ```
 */

import type {
  Campaign,
  Contact,
  Template,
  InboxConversation,
  InboxMessage,
  AIAgent,
  LeadForm,
  CampaignFolder,
  CampaignTag,
  AppSettings,
  CampaignStatus,
  ContactStatus,
  TemplateCategory,
  TemplateStatus,
} from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let phoneCounter = 0

function uniqueId(): string {
  return crypto.randomUUID()
}

/** Gera um telefone E.164 brasileiro único */
function uniquePhone(): string {
  phoneCounter++
  const num = String(phoneCounter).padStart(8, '0')
  return `+5511${num}`
}

function isoNow(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function buildCampaign(overrides?: Partial<Campaign>): Campaign {
  const now = isoNow()
  return {
    id: uniqueId(),
    name: `Campanha de Teste ${Date.now()}`,
    status: 'Rascunho' as CampaignStatus,
    recipients: 100,
    sent: 0,
    delivered: 0,
    read: 0,
    skipped: 0,
    failed: 0,
    createdAt: now,
    templateName: 'hello_world',
    ...overrides,
  }
}

export function buildContact(overrides?: Partial<Contact>): Contact {
  const now = isoNow()
  return {
    id: uniqueId(),
    name: `Contato ${Date.now()}`,
    phone: uniquePhone(),
    email: null,
    status: 'Opt-in' as ContactStatus,
    tags: [],
    lastActive: now,
    createdAt: now,
    updatedAt: now,
    custom_fields: {},
    ...overrides,
  }
}

export function buildTemplate(overrides?: Partial<Template>): Template {
  const now = isoNow()
  return {
    id: uniqueId(),
    name: `template_${Date.now()}`,
    category: 'MARKETING' as TemplateCategory,
    language: 'pt_BR',
    status: 'APPROVED' as TemplateStatus,
    content: 'Olá {{1}}, temos uma novidade para você!',
    preview: 'Olá {{1}}, temos uma novidade para você!',
    lastUpdated: now,
    components: [
      { type: 'BODY', text: 'Olá {{1}}, temos uma novidade para você!' },
    ],
    ...overrides,
  }
}

export function buildInboxConversation(
  overrides?: Partial<InboxConversation>
): InboxConversation {
  const now = isoNow()
  return {
    id: uniqueId(),
    contact_id: uniqueId(),
    ai_agent_id: null,
    phone: uniquePhone(),
    status: 'open',
    mode: 'bot',
    priority: 'normal',
    unread_count: 0,
    total_messages: 0,
    last_message_at: now,
    last_message_preview: null,
    automation_paused_until: null,
    automation_paused_by: null,
    handoff_summary: null,
    human_mode_expires_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

export function buildInboxMessage(overrides?: Partial<InboxMessage>): InboxMessage {
  const now = isoNow()
  return {
    id: uniqueId(),
    conversation_id: uniqueId(),
    direction: 'inbound',
    content: 'Olá, gostaria de mais informações.',
    message_type: 'text',
    media_url: null,
    whatsapp_message_id: `wamid.${uniqueId()}`,
    delivery_status: 'delivered',
    ai_response_id: null,
    ai_sentiment: null,
    ai_sources: null,
    payload: null,
    created_at: now,
    ...overrides,
  }
}

export function buildAIAgent(overrides?: Partial<AIAgent>): AIAgent {
  const now = isoNow()
  return {
    id: uniqueId(),
    name: 'Agente de Teste',
    system_prompt: 'Você é um assistente de testes.',
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    max_tokens: 1024,
    is_active: true,
    is_default: false,
    debounce_ms: 3000,
    embedding_provider: null,
    embedding_model: null,
    embedding_dimensions: null,
    rerank_enabled: null,
    rerank_provider: null,
    rerank_model: null,
    rerank_top_k: null,
    rag_similarity_threshold: null,
    rag_max_results: null,
    handoff_enabled: false,
    handoff_instructions: null,
    booking_tool_enabled: false,
    allow_reactions: true,
    allow_quotes: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

export function buildLeadForm(overrides?: Partial<LeadForm>): LeadForm {
  const now = isoNow()
  const slug = `form-${Date.now()}`
  return {
    id: uniqueId(),
    name: 'Formulário de Teste',
    slug,
    tag: 'teste',
    isActive: true,
    collectEmail: true,
    successMessage: 'Obrigado pelo cadastro!',
    webhookToken: null,
    fields: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function buildCampaignFolder(overrides?: Partial<CampaignFolder>): CampaignFolder {
  const now = isoNow()
  return {
    id: uniqueId(),
    name: `Pasta ${Date.now()}`,
    color: '#6B7280',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function buildCampaignTag(overrides?: Partial<CampaignTag>): CampaignTag {
  const now = isoNow()
  return {
    id: uniqueId(),
    name: `Tag ${Date.now()}`,
    color: '#10B981',
    createdAt: now,
    ...overrides,
  }
}

export function buildAppSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    phoneNumberId: '123456789',
    businessAccountId: '987654321',
    accessToken: 'test-access-token-mock',
    isConnected: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Reset (para garantir unicidade entre suítes)
// ---------------------------------------------------------------------------

/**
 * Reseta o contador de telefones. Use no `beforeEach` se precisar
 * de determinismo nos números gerados.
 */
export function resetFactoryCounters() {
  phoneCounter = 0
}
