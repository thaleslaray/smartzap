import { AppSettings, CalendarBookingConfig, WorkflowExecutionConfig } from '../../../types';
import { AccountLimits } from '../../../lib/meta-limits';
import { PhoneNumber } from '../../../hooks/useSettings';
import type { AiPromptsConfig, AiRoutesConfig } from '../../../lib/ai/ai-center-defaults';

// ============================================================================
// Shared Types
// ============================================================================

export interface WebhookStats {
  lastEventAt?: string | null;
  todayDelivered?: number;
  todayRead?: number;
  todayFailed?: number;
}

export interface DomainOption {
  url: string;
  source: string;
  recommended: boolean;
}

export interface WebhookSubscription {
  ok: boolean;
  wabaId?: string;
  messagesSubscribed?: boolean;
  subscribedFields?: string[];
  apps?: Array<{ id?: string; name?: string; subscribed_fields?: string[] }>;
  error?: string;
  details?: unknown;
}

export interface AISettingsInfo {
  isConfigured: boolean;
  source: 'database' | 'env' | 'none';
  tokenPreview?: string | null;
  provider?: 'google';
  model?: string;
  providers?: {
    google: { isConfigured: boolean; source: 'database' | 'env' | 'none'; tokenPreview?: string | null };
  };
}

export interface MetaAppInfo {
  source: 'db' | 'env' | 'none';
  appId: string | null;
  hasAppSecret: boolean;
  isConfigured: boolean;
}

export interface WhatsAppThrottleInfo {
  ok: boolean;
  source?: 'db' | 'env';
  phoneNumberId?: string | null;
  config?: {
    enabled: boolean;
    sendConcurrency?: number;
    batchSize?: number;
    startMps: number;
    maxMps: number;
    minMps: number;
    cooldownSec: number;
    minIncreaseGapSec: number;
    sendFloorDelayMs: number;
  };
  state?: {
    targetMps: number;
    cooldownUntil?: string | null;
    lastIncreaseAt?: string | null;
    lastDecreaseAt?: string | null;
    updatedAt?: string | null;
  } | null;
}

export interface AutoSuppressionInfo {
  ok: boolean;
  source?: 'db' | 'default';
  config?: {
    enabled: boolean;
    undeliverable131026: {
      enabled: boolean;
      windowDays: number;
      threshold: number;
      ttlBaseDays: number;
      ttl2Days: number;
      ttl3Days: number;
    };
  };
}

export interface CalendarBookingInfo {
  ok: boolean;
  source?: 'db' | 'default';
  config?: CalendarBookingConfig;
}

export interface WorkflowExecutionInfo {
  ok: boolean;
  source: 'db' | 'env';
  config: WorkflowExecutionConfig;
}

// ============================================================================
// Save Function Types
// ============================================================================

export type SaveAIConfigFn = (data: {
  apiKey?: string;
  apiKeyProvider?: string;
  provider?: string;
  model?: string;
  routes?: AiRoutesConfig;
  prompts?: AiPromptsConfig;
}) => Promise<void>;

export type SaveWhatsAppThrottleFn = (data: {
  enabled?: boolean;
  sendConcurrency?: number;
  batchSize?: number;
  startMps?: number;
  maxMps?: number;
  minMps?: number;
  cooldownSec?: number;
  minIncreaseGapSec?: number;
  sendFloorDelayMs?: number;
  resetState?: boolean;
}) => Promise<void>;

export type SaveAutoSuppressionFn = (data: {
  enabled?: boolean;
  undeliverable131026?: {
    enabled?: boolean;
    windowDays?: number;
    threshold?: number;
    ttlBaseDays?: number;
    ttl2Days?: number;
    ttl3Days?: number;
  };
}) => Promise<void>;

// ============================================================================
// SettingsView Props
// ============================================================================

export interface SettingsViewProps {
  // Core settings
  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;
  isLoading: boolean;
  isSaving: boolean;
  onSave: () => void;
  onSaveSettings: (settings: AppSettings) => void;
  onDisconnect: () => void;

  // Account limits
  accountLimits?: AccountLimits | null;
  tierName?: string | null;
  limitsError?: boolean;
  limitsErrorMessage?: string | null;
  limitsLoading?: boolean;
  onRefreshLimits?: () => void;

  // Webhook
  webhookUrl?: string;
  webhookToken?: string;
  webhookStats?: WebhookStats | null;
  webhookSubscription?: WebhookSubscription;
  webhookSubscriptionLoading?: boolean;
  webhookSubscriptionMutating?: boolean;
  onRefreshWebhookSubscription?: () => void;
  onSubscribeWebhookMessages?: (callbackUrl?: string) => Promise<void>;
  onUnsubscribeWebhookMessages?: () => Promise<void>;

  // Phone numbers for webhook override
  phoneNumbers?: PhoneNumber[];
  phoneNumbersLoading?: boolean;
  onRefreshPhoneNumbers?: () => void;
  onSetWebhookOverride?: (phoneNumberId: string, callbackUrl: string) => Promise<boolean>;
  onRemoveWebhookOverride?: (phoneNumberId: string) => Promise<boolean>;

  // Domain selection
  availableDomains?: DomainOption[];
  webhookPath?: string;

  // UI options
  hideHeader?: boolean;

  // Test connection
  onTestConnection?: () => void;
  isTestingConnection?: boolean;

  // Meta App
  metaApp?: MetaAppInfo | null;
  metaAppLoading?: boolean;
  refreshMetaApp?: () => void;

  // Test Contact
  testContact?: { name?: string; phone: string } | null;
  saveTestContact?: (contact: { name?: string; phone: string }) => Promise<void>;
  removeTestContact?: () => Promise<void>;
  isSavingTestContact?: boolean;

  // WhatsApp Turbo (Adaptive Throttle)
  whatsappThrottle?: WhatsAppThrottleInfo | null;
  whatsappThrottleLoading?: boolean;
  saveWhatsAppThrottle?: SaveWhatsAppThrottleFn;
  isSavingWhatsAppThrottle?: boolean;

  // Auto-suppression
  autoSuppression?: AutoSuppressionInfo | null;
  autoSuppressionLoading?: boolean;
  saveAutoSuppression?: SaveAutoSuppressionFn;
  isSavingAutoSuppression?: boolean;

  // Calendar Booking
  calendarBooking?: CalendarBookingInfo | null;
  calendarBookingLoading?: boolean;
  saveCalendarBooking?: (data: Partial<CalendarBookingConfig>) => Promise<void>;
  isSavingCalendarBooking?: boolean;

  // Workflow Execution
  workflowExecution?: WorkflowExecutionInfo | null;
  workflowExecutionLoading?: boolean;
  saveWorkflowExecution?: (data: Partial<WorkflowExecutionConfig>) => Promise<WorkflowExecutionConfig | void>;
  isSavingWorkflowExecution?: boolean;

  // Upstash Config (métricas QStash)
  upstashConfig?: { email: string; hasApiKey: boolean; configured: boolean } | null;
  upstashConfigLoading?: boolean;
  saveUpstashConfig?: (config: { email: string; apiKey: string }) => Promise<void>;
  removeUpstashConfig?: () => Promise<void>;
  isSavingUpstashConfig?: boolean;
}
