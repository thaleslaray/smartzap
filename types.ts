import React from 'react';

// =============================================================================
// CAMPAIGN & CONTACT TYPES (Existing)
// =============================================================================

export enum CampaignStatus {
  DRAFT = 'Rascunho',
  SCHEDULED = 'Agendado',
  SENDING = 'Enviando',
  COMPLETED = 'Concluído',
  PAUSED = 'Pausado',
  FAILED = 'Falhou',
  CANCELLED = 'Cancelado'
}

export enum ContactStatus {
  OPT_IN = 'Opt-in',
  OPT_OUT = 'Opt-out',
  UNKNOWN = 'Desconhecido',
  SUPPRESSED = 'Suprimido'
}

export enum MessageStatus {
  PENDING = 'Pendente',
  SENT = 'Enviado',
  DELIVERED = 'Entregue',
  READ = 'Lido',
  SKIPPED = 'Ignorado',
  FAILED = 'Falhou'
}

export type TemplateCategory = 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO';
export type TemplateStatus = 'DRAFT' | 'APPROVED' | 'PENDING' | 'REJECTED';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  content: string;
  preview: string;
  lastUpdated: string;
  parameterFormat?: 'positional' | 'named';
  specHash?: string | null;
  fetchedAt?: string | null;
  headerMediaId?: string | null;
  headerMediaHash?: string | null;
  headerMediaPreviewUrl?: string | null;
  headerMediaPreviewExpiresAt?: string | null;
  components?: TemplateComponent[]; // Full components from Meta API
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | 'LIMITED_TIME_OFFER';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'GIF' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  buttons?: TemplateButton[];
  example?: any;
  limited_time_offer?: {
    text: string;
    has_expiration?: boolean;
  };
}

export interface TemplateButton {
  type:
    | 'QUICK_REPLY'
    | 'URL'
    | 'PHONE_NUMBER'
    | 'COPY_CODE'
    | 'OTP'
    | 'FLOW';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[] | string;
  otp_type?: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP';
  flow_id?: string;
  action?: Record<string, unknown>;
  payload?: string | Record<string, unknown>;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  recipients: number;
  sent: number;
  delivered: number;
  read: number;
  skipped: number;
  failed: number;
  createdAt: string;
  templateName: string;
  templateVariables?: { header: string[], body: string[], buttons?: Record<string, string> };  // Meta API structure: arrays por componente
  // Template snapshot (fonte operacional por campanha)
  templateSnapshot?: any;
  templateSpecHash?: string | null;
  templateParameterFormat?: 'positional' | 'named' | null;
  templateFetchedAt?: string | null;
  // Scheduling
  scheduledAt?: string | null;  // ISO timestamp for scheduled campaigns
  // QStash scheduling (one-shot)
  qstashScheduleMessageId?: string | null;
  qstashScheduleEnqueuedAt?: string | null;
  startedAt?: string | null;    // When campaign actually started sending
  firstDispatchAt?: string | null; // When the first contact started dispatching (claim/sending) (dispatch-only)
  lastSentAt?: string | null;   // When the last contact was marked as "sent" (dispatch-only)
  completedAt?: string | null;  // When campaign finished
  cancelledAt?: string | null;  // When campaign was cancelled by user
  pausedAt?: string | null;     // When campaign was paused
  // Contacts (for resume functionality and optimistic UI)
  selectedContactIds?: string[];
  pendingContacts?: { name: string; phone: string }[];  // For immediate "Pending" display
  // Flow/MiniApp (para campanhas que usam Flow)
  flowId?: string | null;
  flowName?: string | null;
  // Computed field (somente no detalhe da campanha)
  submissionsCount?: number;
  // Organization (Folders & Tags)
  folderId?: string | null;
  folder?: CampaignFolder | null;
  tags?: CampaignTag[];
}

export interface Contact {
  id: string;
  name?: string;
  phone: string;
  email?: string | null;
  status: ContactStatus;
  originalStatus?: ContactStatus; // Status real do banco (antes de calcular supressão)
  tags: string[];
  lastActive: string;
  createdAt?: string;
  updatedAt?: string;
  custom_fields?: Record<string, any>;
  suppressionReason?: string | null;
  suppressionSource?: string | null;
  suppressionExpiresAt?: string | null;
}

// =============================================================================
// LEAD FORMS (Captação de contatos)
// =============================================================================

export interface LeadForm {
  id: string;
  name: string;
  slug: string;
  tag: string;
  isActive: boolean;
  collectEmail?: boolean; // quando false, o formulário público não mostra/coleta email
  successMessage?: string | null;
  webhookToken?: string | null;
  fields?: LeadFormField[];
  createdAt?: string;
  updatedAt?: string | null;
}

export type LeadFormFieldType = 'text' | 'number' | 'date' | 'select'

export interface LeadFormField {
  key: string;            // ex: "curso" (vai para contact.custom_fields.curso)
  label: string;          // ex: "Qual seu curso?"
  type: LeadFormFieldType;
  required?: boolean;
  options?: string[];     // para select
  order?: number;
}

export interface CreateLeadFormDTO {
  name: string;
  slug: string;
  tag: string;
  isActive?: boolean;
  collectEmail?: boolean;
  successMessage?: string | null;
  fields?: LeadFormField[];
}

export interface UpdateLeadFormDTO extends Partial<CreateLeadFormDTO> {}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  entity_type: 'contact' | 'deal';
  created_at?: string;
}

export interface Message {
  id: string;
  campaignId: string;
  contactId?: string;
  contactName: string;
  contactPhone: string;
  status: MessageStatus;
  messageId?: string;      // WhatsApp message ID
  sentAt: string;
  deliveredAt?: string;    // Quando foi entregue
  readAt?: string;         // Quando foi lido
  error?: string;
}

export interface AppSettings {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  isConnected: boolean;
  displayPhoneNumber?: string;
  qualityRating?: string;
  verifiedName?: string;
  testContact?: TestContact;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface TimeSlot {
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface WorkingHoursDay {
  day: Weekday;
  enabled: boolean;
  start: string;  // Mantido para compatibilidade
  end: string;    // Mantido para compatibilidade
  slots?: TimeSlot[]; // Múltiplos períodos por dia (opcional)
}

export interface CalendarBookingConfig {
  timezone: string;
  slotDurationMinutes: number;
  slotBufferMinutes: number;
  workingHours: WorkingHoursDay[];
  // Novas opções
  minAdvanceHours?: number;      // Tempo mínimo de antecedência (horas)
  maxAdvanceDays?: number;       // Distância máxima permitida (dias)
  allowSimultaneous?: boolean;   // Permitir agendamentos simultâneos
  externalWebhookUrl?: string;   // Webhook externo para enviar submissões
}

export interface WorkflowExecutionConfig {
  retryCount: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export interface TestContact {
  name?: string;
  phone: string;
}

export interface StatCardProps {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  icon: React.ReactNode;
}

// Template Workspace Types
export type WorkspaceStatus = 'draft' | 'active' | 'archived';
export type WorkspaceTemplateStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TemplateWorkspace {
  id: string;
  name: string;
  description?: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  // Computed fields (from API)
  templateCount?: number;
  statusSummary?: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
}

export interface WorkspaceTemplate {
  id: string;
  workspaceId: string;
  name: string;
  content: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  status: WorkspaceTemplateStatus;
  metaId?: string;
  metaStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectedReason?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt?: string;
  // Optional components from AI generator
  components?: {
    header?: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string };
    footer?: { text: string };
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  };
}

// =============================================================================
// BATCH SUBMISSION TYPES (Factory)
// =============================================================================

export interface BatchSubmission {
  id: string;
  name: string; // e.g. "Aviso Aula 10/12"
  createdAt: string;
  status: 'processing' | 'completed' | 'partial_error';
  // Stats snapshot
  stats: {
    total: number;
    utility: number;
    marketing: number;
    poll_utility: number; // For "polling" check status
    rejected: number;
    pending: number;
  };
  templates: GeneratedTemplateWithStatus[];
}

export interface GeneratedTemplateWithStatus {
  id: string;
  name: string;
  content: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; // Current status
  originalCategory: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; // Intended status
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  metaStatus?: string; // Raw meta status
  rejectionReason?: string;
  generatedAt: string;
  language: string;
  // Components for preview
  header?: { format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'; text?: string };
  footer?: { text: string };
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

// =============================================================================
// SUPABASE REALTIME TYPES
// =============================================================================

/**
 * Tables that have Realtime enabled
 */
export type RealtimeTable =
  | 'campaigns'
  | 'campaign_contacts'
  | 'contacts'
  | 'custom_field_definitions'
  | 'account_alerts'
  | 'template_projects'
  | 'template_project_items'
  | 'flow_submissions'
  | 'inbox_conversations'
  | 'inbox_messages'
  | 'ai_agents'
  | 'ai_agent_logs';

/**
 * Event types for Realtime subscriptions
 */
export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * Payload received from Supabase Realtime
 */
export interface RealtimePayload<T = Record<string, unknown>> {
  schema: 'public';
  table: RealtimeTable;
  commit_timestamp: string;
  eventType: RealtimeEventType;
  new: T | null;
  old: T | null;
  errors: string[] | null;
}

/**
 * Channel connection status
 */
export type ChannelStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

/**
 * Subscription configuration
 */
export interface RealtimeSubscriptionConfig {
  table: RealtimeTable;
  event?: RealtimeEventType;
  filter?: string; // e.g., 'id=eq.123'
}

/**
 * Realtime connection state
 */
export interface RealtimeState {
  isConnected: boolean;
  status: ChannelStatus | null;
  error?: string;
}

// =============================================================================
// SUPABASE REALTIME BROADCAST (EPHEMERAL)
// =============================================================================

export type CampaignProgressBroadcastPhase =
  | 'batch_start'
  | 'batch_end'
  | 'cancelled'
  | 'complete'

export interface CampaignProgressBroadcastDelta {
  sent: number
  failed: number
  skipped: number
}

/**
 * Evento efêmero (não persistido) para sensação de tempo real.
 * - Nunca deve conter PII (telefone, nome, conteúdo de mensagem).
 * - Não é fonte da verdade: UI deve reconciliar com DB periodicamente.
 */
export interface CampaignProgressBroadcastPayload {
  campaignId: string
  traceId: string
  batchIndex: number
  seq: number
  ts: number
  delta?: CampaignProgressBroadcastDelta
  phase?: CampaignProgressBroadcastPhase
}

// =============================================================================
// REALTIME LATENCY TELEMETRY (DEBUG)
// =============================================================================

export interface RealtimeLatencyTelemetryBroadcast {
  traceId: string
  seq: number
  serverTs: number
  receivedAt: number
  paintedAt: number
  serverToClientMs: number
  handlerToPaintMs: number
  serverToPaintMs: number
}

export interface RealtimeLatencyTelemetryDbChange {
  table: string
  eventType: string
  commitTimestamp: string
  commitTs: number
  receivedAt: number
  paintedAt: number
  commitToClientMs: number
  handlerToPaintMs: number
  commitToPaintMs: number
}

export interface RealtimeLatencyTelemetryRefetch {
  startedAt: number
  finishedAt?: number
  durationMs?: number
  reason: 'debounced_refetch'
}

export interface RealtimeLatencyTelemetry {
  broadcast?: RealtimeLatencyTelemetryBroadcast
  dbChange?: RealtimeLatencyTelemetryDbChange
  refetch?: RealtimeLatencyTelemetryRefetch
}

export type ProjectStatus = 'draft' | 'submitted' | 'completed';

// Estratégia de geração de templates
export type AIStrategy = 'marketing' | 'utility' | 'bypass';

export interface TemplateProject {
  id: string;
  title: string;
  prompt: string;
  status: ProjectStatus;
  source?: 'ai' | 'manual' | string;
  strategy?: AIStrategy;  // Estratégia usada na criação: marketing, utility, bypass
  template_count: number;
  approved_count: number;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TemplateProjectItem {
  id: string;
  project_id: string;
  name: string;
  content: string;
  meta_id?: string;
  meta_status?: string;
  header?: any;
  footer?: any;
  buttons?: any;
  category?: string;
  language: string;
  // Variáveis para estratégia BYPASS
  sample_variables?: Record<string, string>;  // Valores comportados para enviar à Meta
  marketing_variables?: Record<string, string>;  // Valores promocionais para envio real
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateProjectDTO {
  title: string;
  prompt: string;
  status?: string;
  strategy?: AIStrategy;  // Estratégia usada: marketing, utility, bypass
  items: Omit<TemplateProjectItem, 'id' | 'project_id' | 'created_at' | 'updated_at'>[];
}

// =============================================================================
// INBOX & AI AGENTS TYPES
// =============================================================================

// T001: Type definitions for Inbox
export type ConversationStatus = 'open' | 'closed';
export type ConversationMode = 'bot' | 'human';
export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type MessageDirection = 'inbound' | 'outbound';
export type InboxMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'template' | 'interactive' | 'internal_note';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

// T002: InboxConversation interface
export interface InboxConversation {
  id: string;
  contact_id: string | null;
  ai_agent_id: string | null;
  phone: string;
  status: ConversationStatus;
  mode: ConversationMode;
  priority: ConversationPriority;
  unread_count: number;
  total_messages: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  automation_paused_until: string | null;
  automation_paused_by: string | null;
  handoff_summary: string | null;
  /** When human mode should auto-expire back to bot mode. NULL = never expires. */
  human_mode_expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  contact?: Contact;
  labels?: InboxLabel[];
  ai_agent?: AIAgent;
}

// T003: InboxMessage interface
export interface InboxMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  content: string;
  message_type: InboxMessageType;
  media_url: string | null;
  whatsapp_message_id: string | null;
  delivery_status: DeliveryStatus;
  ai_response_id: string | null;
  ai_sentiment: Sentiment | null;
  ai_sources: Array<{ title: string; content: string }> | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// T004: AIAgent interface
export type EmbeddingProvider = 'google' | 'openai' | 'voyage' | 'cohere';
export type RerankProvider = 'cohere' | 'together';

export interface AIAgent {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  is_default: boolean;
  debounce_ms: number;
  // RAG: Embedding config
  embedding_provider: EmbeddingProvider | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  // RAG: Reranking config (opcional)
  rerank_enabled: boolean | null;
  rerank_provider: RerankProvider | null;
  rerank_model: string | null;
  rerank_top_k: number | null;
  // RAG: Search config
  rag_similarity_threshold: number | null;
  rag_max_results: number | null;
  // Handoff config
  handoff_enabled: boolean;
  handoff_instructions: string | null;
  // Booking tool config
  booking_tool_enabled: boolean;
  // Tool permissions
  allow_reactions: boolean;
  allow_quotes: boolean;
  created_at: string;
  updated_at: string;
}

// T005: AIAgentLog interface
export interface AIAgentLog {
  id: string;
  ai_agent_id: string;
  conversation_id: string | null;
  input_message: string;
  output_message: string | null;
  response_time_ms: number | null;
  model_used: string | null;
  tokens_used: number | null;
  sources_used: Array<{ title: string; content: string }> | null;
  error_message: string | null;
  metadata: {
    messageIds?: string[];
    sentiment?: string;
    confidence?: number;
    shouldHandoff?: boolean;
    handoffReason?: string;
    toolCalls?: Array<{ name: string; args: unknown; result: unknown }>;
  } | null;
  created_at: string;
}

// T057: AIKnowledgeFile interface
export type KnowledgeFileIndexingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'local_only';

export interface AIKnowledgeFile {
  id: string;
  agent_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  content: string | null;
  external_file_id: string | null; // DEPRECATED: Era usado para Google File Search
  external_file_uri: string | null; // DEPRECATED: Era usado para Google File Search
  indexing_status: KnowledgeFileIndexingStatus;
  chunks_count: number; // Número de chunks indexados no pgvector
  created_at: string;
  updated_at: string;
}

// T058: AIEmbedding interface (para referência - dados ficam no pgvector)
export interface AIEmbedding {
  id: string;
  agent_id: string;
  file_id: string | null;
  content: string;
  dimensions: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// T006: InboxLabel interface
export interface InboxLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

// T007: InboxQuickReply interface
export interface InboxQuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  created_at: string;
}

// DTO types for API operations
export interface CreateInboxConversationDTO {
  phone: string;
  contact_id?: string;
  ai_agent_id?: string;
  mode?: ConversationMode;
}

export interface UpdateInboxConversationDTO {
  status?: ConversationStatus;
  mode?: ConversationMode;
  priority?: ConversationPriority;
  ai_agent_id?: string;
  labels?: string[]; // label IDs
}

export interface CreateInboxMessageDTO {
  conversation_id: string;
  direction: MessageDirection;
  content: string;
  message_type?: InboxMessageType;
  media_url?: string | null;
  whatsapp_message_id?: string | null;
  delivery_status?: DeliveryStatus;
  ai_response_id?: string | null;
  ai_sentiment?: Sentiment | null;
  ai_sources?: Array<{ title: string; content: string }> | null;
  payload?: Record<string, unknown>;
}

export interface CreateAIAgentDTO {
  name: string;
  system_prompt: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean;
  debounce_ms?: number;
}

export interface UpdateAIAgentDTO extends Partial<CreateAIAgentDTO> {}

export interface CreateInboxLabelDTO {
  name: string;
  color?: string;
}

export interface CreateInboxQuickReplyDTO {
  title: string;
  content: string;
  shortcut?: string;
}

// AI Response Schema (from chat-agent)
export interface AIAgentResponse {
  text: string;
  sentiment: Sentiment;
  suggestedTags?: string[];
  sources?: Array<{ title: string; content: string }>;
}

// Handoff request (when AI decides to handoff)
export interface HandoffRequest {
  reason: string;
  summary: string;
  priority: ConversationPriority;
}

// Knowledge base file status
export type KnowledgeFileStatus = 'pending' | 'indexing' | 'indexed' | 'failed';

export interface KnowledgeFile {
  id: string;
  name: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: KnowledgeFileStatus;
  error: string | null;
  indexed_at: string | null;
  created_at: string;
}

// =============================================================================
// CAMPAIGN ORGANIZATION (Folders & Tags)
// =============================================================================

export interface CampaignFolder {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  campaignCount?: number; // Computed
}

export interface CampaignTag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface CreateCampaignFolderDTO {
  name: string;
  color?: string;
}

export interface UpdateCampaignFolderDTO {
  name?: string;
  color?: string;
}

export interface CreateCampaignTagDTO {
  name: string;
  color?: string;
}

// =============================================================================
// ATTENDANT TOKENS (Web Monitor Access)
// =============================================================================

export interface AttendantPermissions {
  canView: boolean;      // Pode ver conversas
  canReply: boolean;     // Pode responder mensagens
  canHandoff: boolean;   // Pode fazer handoff/transferir
}

export interface AttendantToken {
  id: string;
  name: string;                      // Nome do atendente
  token: string;                     // Token para URL
  permissions: AttendantPermissions;
  is_active: boolean;
  last_used_at: string | null;
  access_count: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAttendantTokenDTO {
  name: string;
  permissions?: Partial<AttendantPermissions>;
  expires_at?: string | null;
}

export interface UpdateAttendantTokenDTO {
  name?: string;
  permissions?: Partial<AttendantPermissions>;
  is_active?: boolean;
  expires_at?: string | null;
}
