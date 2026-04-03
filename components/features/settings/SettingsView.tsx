import React, { useEffect, useRef, useState } from 'react';
import { TestContactPanel } from './TestContactPanel';
import { AutoSuppressionPanel } from './AutoSuppressionPanel';
import { WorkflowExecutionPanel } from './WorkflowExecutionPanel';
import { StatusCard } from './StatusCard';
import { TurboConfigSection } from './TurboConfigSection';
import { WebhookConfigSection } from './WebhookConfigSection';
import { CalendarBookingPanel } from './CalendarBookingPanel';
import { FlowEndpointPanel } from './FlowEndpointPanel';
import { CredentialsForm } from './CredentialsForm';
import { UpstashConfigPanel } from './UpstashConfigPanel';
import { ApiDocsPanel } from './ApiDocsPanel';
import { useDevMode } from '@/components/providers/DevModeProvider';
import type { SettingsViewProps } from './types';

// Re-export types for consumers
export type { SettingsViewProps } from './types';

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  setSettings,
  isLoading,
  isSaving,
  onSave,
  // onSaveSettings - reserved for future use
  onDisconnect,
  accountLimits,
  // tierName - reserved for future use
  limitsError,
  limitsErrorMessage,
  limitsLoading,
  onRefreshLimits,
  webhookUrl,
  webhookToken,
  webhookStats,
  webhookSubscription,
  webhookSubscriptionLoading,
  webhookSubscriptionMutating,
  onRefreshWebhookSubscription,
  onSubscribeWebhookMessages,
  onUnsubscribeWebhookMessages,
  phoneNumbers,
  phoneNumbersLoading,
  onRefreshPhoneNumbers,
  onSetWebhookOverride,
  onRemoveWebhookOverride,
  availableDomains,
  webhookPath,
  hideHeader,

  onTestConnection,
  isTestingConnection,

  // Meta App
  metaApp,
  metaAppLoading,
  refreshMetaApp,
  // Test Contact Props - Supabase
  testContact,
  saveTestContact,
  removeTestContact,
  isSavingTestContact,

  // Turbo
  whatsappThrottle,
  whatsappThrottleLoading,
  saveWhatsAppThrottle,
  isSavingWhatsAppThrottle,

  // Auto-supressão
  autoSuppression,
  autoSuppressionLoading,
  saveAutoSuppression,
  isSavingAutoSuppression,

  // Calendar Booking
  calendarBooking,
  calendarBookingLoading,
  saveCalendarBooking,
  isSavingCalendarBooking,

  // Workflow Execution (global)
  workflowExecution,
  workflowExecutionLoading,
  saveWorkflowExecution,
  isSavingWorkflowExecution,

  // Upstash Config (métricas QStash)
  upstashConfig,
  upstashConfigLoading,
  saveUpstashConfig,
  removeUpstashConfig,
  isSavingUpstashConfig,

}) => {
  // Dev mode hook
  const { isDevMode } = useDevMode();

  // Always start collapsed
  const [isEditing, setIsEditing] = useState(false);

  // Refs para UX: o formulário de credenciais fica bem abaixo do card.
  // Sem scroll automático, parece que o botão "Editar" não funcionou.
  const statusCardRef = useRef<HTMLDivElement | null>(null);
  const credentialsFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Quando o usuário ativa o modo edição, rolar até o formulário.
    if (!isEditing) return;

    // Aguarda o render do bloco condicional.
    const t = window.setTimeout(() => {
      credentialsFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    return () => window.clearTimeout(t);
  }, [isEditing]);

  if (isLoading) return <div className="text-[var(--ds-text-primary)]">Carregando configurações...</div>;

  return (
    <div>
      {!hideHeader && (
        <>
          <h1 className="text-3xl font-bold text-[var(--ds-text-primary)] tracking-tight mb-2">Configurações</h1>
          <p className="text-[var(--ds-text-secondary)] mb-10">Gerencie sua conexão com a WhatsApp Business API</p>
        </>
      )}

      <div className="space-y-8">
        {/* Status Card */}
        <StatusCard
          ref={statusCardRef}
          settings={settings}
          limitsLoading={limitsLoading}
          limitsError={limitsError}
          limitsErrorMessage={limitsErrorMessage}
          accountLimits={accountLimits}
          onRefreshLimits={onRefreshLimits}
          onDisconnect={onDisconnect}
          isEditing={isEditing}
          onToggleEdit={() => setIsEditing((v) => !v)}
        />

        {/* Credentials Form - Only visible if disconnected OR editing */}
        {(!settings.isConnected || isEditing) && (
          <CredentialsForm
            ref={credentialsFormRef}
            settings={settings}
            setSettings={setSettings}
            onSave={onSave}
            onClose={() => setIsEditing(false)}
            isSaving={isSaving}
            onTestConnection={onTestConnection}
            isTestingConnection={isTestingConnection}
            metaApp={metaApp}
            refreshMetaApp={refreshMetaApp}
          />
        )}

        {/* ========== ORDEM: 1. Sistema Online (acima), 2. Webhooks, 3. Contato de Teste, 4. Agendamento ========== */}

        {/* 2. Webhook Configuration Section */}
        {settings.isConnected && webhookUrl && (
          <section id="webhooks">
          <WebhookConfigSection
            webhookUrl={webhookUrl}
            webhookToken={webhookToken}
            webhookStats={webhookStats}
            webhookPath={webhookPath}
            webhookSubscription={webhookSubscription}
            webhookSubscriptionLoading={webhookSubscriptionLoading}
            webhookSubscriptionMutating={webhookSubscriptionMutating}
            onRefreshWebhookSubscription={onRefreshWebhookSubscription}
            onSubscribeWebhookMessages={onSubscribeWebhookMessages}
            onUnsubscribeWebhookMessages={onUnsubscribeWebhookMessages}
            phoneNumbers={phoneNumbers}
            phoneNumbersLoading={phoneNumbersLoading}
            onRefreshPhoneNumbers={onRefreshPhoneNumbers}
            onSetWebhookOverride={onSetWebhookOverride}
            onRemoveWebhookOverride={onRemoveWebhookOverride}
            availableDomains={availableDomains}
          />
          </section>
        )}

        {/* 3. Test Contact Section */}
        {settings.isConnected && (
          <TestContactPanel
            testContact={testContact}
            saveTestContact={saveTestContact}
            removeTestContact={removeTestContact}
            isSaving={isSavingTestContact}
          />
        )}

        {/* 4. Calendar Booking Section (Agendamento) */}
        {settings.isConnected && (
          <CalendarBookingPanel
            isConnected={settings.isConnected}
            calendarBooking={calendarBooking}
            calendarBookingLoading={calendarBookingLoading}
            saveCalendarBooking={saveCalendarBooking}
            isSavingCalendarBooking={isSavingCalendarBooking}
          />
        )}

        {/* 5. API Documentation Link */}
        {settings.isConnected && <ApiDocsPanel />}

        {/* ========== SEÇÕES DEV-ONLY ABAIXO ========== */}

        {/* Flow Endpoint (MiniApp Dinamico) - Dev only */}
        {isDevMode && settings.isConnected && <FlowEndpointPanel devBaseUrl={null} />}

        {/* WhatsApp Turbo (Adaptive Throttle) - Dev only */}
        {isDevMode && settings.isConnected && saveWhatsAppThrottle && (
          <TurboConfigSection
            whatsappThrottle={whatsappThrottle}
            whatsappThrottleLoading={whatsappThrottleLoading}
            saveWhatsAppThrottle={saveWhatsAppThrottle}
            isSaving={isSavingWhatsAppThrottle}
            settings={settings}
          />
        )}

        {/* Proteção de Qualidade (Auto-supressão) - Dev only */}
        {isDevMode && settings.isConnected && saveAutoSuppression && (
          <AutoSuppressionPanel
            autoSuppression={autoSuppression}
            autoSuppressionLoading={autoSuppressionLoading}
            saveAutoSuppression={saveAutoSuppression}
            isSaving={isSavingAutoSuppression}
          />
        )}

        {/* Execução do workflow (global) - Dev only */}
        {isDevMode && settings.isConnected && saveWorkflowExecution && (
          <WorkflowExecutionPanel
            workflowExecution={workflowExecution}
            workflowExecutionLoading={workflowExecutionLoading}
            saveWorkflowExecution={saveWorkflowExecution}
            isSaving={isSavingWorkflowExecution}
          />
        )}

        {/* Métricas do QStash (Upstash Config) - Dev only */}
        {isDevMode && settings.isConnected && saveUpstashConfig && (
          <UpstashConfigPanel
            upstashConfig={upstashConfig}
            upstashConfigLoading={upstashConfigLoading}
            saveUpstashConfig={saveUpstashConfig}
            removeUpstashConfig={removeUpstashConfig}
            isSaving={isSavingUpstashConfig}
          />
        )}
      </div>
    </div>
  );
};
