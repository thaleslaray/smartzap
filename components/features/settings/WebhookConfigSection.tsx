'use client';

import React, { useState } from 'react';
import { Webhook, RefreshCw, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PhoneNumber } from '../../../hooks/useSettings';
import { Container } from '@/components/ui/container';
import { SectionHeader } from '@/components/ui/section-header';
import { useDevMode } from '@/components/providers/DevModeProvider';

import {
  WebhookUrlConfig,
  PhoneNumbersList,
  WebhookLevelsExplanation,
  WebhookStats,
  DomainOption,
  WebhookSubscription,
} from './webhook';
import { WebhookStatusIndicator } from './webhook/WebhookStatusIndicator';

export interface WebhookConfigSectionProps {
  webhookUrl?: string;
  webhookToken?: string;
  webhookStats?: WebhookStats | null;
  webhookPath?: string;
  webhookSubscription?: WebhookSubscription | null;
  webhookSubscriptionLoading?: boolean;
  webhookSubscriptionMutating?: boolean;
  onRefreshWebhookSubscription?: () => void;
  onSubscribeWebhookMessages?: (callbackUrl?: string) => Promise<void>;
  onUnsubscribeWebhookMessages?: () => Promise<void>;
  phoneNumbers?: PhoneNumber[];
  phoneNumbersLoading?: boolean;
  onRefreshPhoneNumbers?: () => void;
  onSetWebhookOverride?: (phoneNumberId: string, callbackUrl: string) => Promise<boolean>;
  onRemoveWebhookOverride?: (phoneNumberId: string) => Promise<boolean>;
  availableDomains?: DomainOption[];
}

export function WebhookConfigSection({
  webhookUrl,
  webhookToken,
  webhookStats,
  webhookPath,
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
}: WebhookConfigSectionProps) {
  const { isDevMode } = useDevMode();

  // Local states
  const [selectedDomainUrl, setSelectedDomainUrl] = useState<string>('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);

  // Computed webhook URL based on domain selection
  const defaultPath = '/api/webhook';
  const computedWebhookUrl = selectedDomainUrl
    ? selectedDomainUrl + (webhookPath || defaultPath)
    : webhookUrl;

  // Handlers
  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Copiado!');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  const handleSetZapflowWebhook = async (phoneNumberId: string) => {
    const urlToSet = computedWebhookUrl;
    if (!urlToSet) return;

    setIsSavingOverride(true);
    try {
      await onSetWebhookOverride?.(phoneNumberId, urlToSet);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleRemoveOverride = async (phoneNumberId: string) => {
    setIsSavingOverride(true);
    try {
      await onRemoveWebhookOverride?.(phoneNumberId);
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleSetCustomOverride = async (phoneNumberId: string, url: string) => {
    if (!url.trim()) {
      toast.error('Digite a URL do webhook');
      return;
    }

    if (!url.startsWith('https://')) {
      toast.error('A URL deve começar com https://');
      return;
    }

    const success = await onSetWebhookOverride?.(phoneNumberId, url.trim());
    return success;
  };

  const handleTestUrl = async () => {
    if (!computedWebhookUrl || !webhookToken) {
      toast.error('Webhook URL ou token ausente');
      return;
    }
    setIsTestingUrl(true);
    try {
      const res = await fetch('/api/debug/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: computedWebhookUrl, token: webhookToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast.success('Webhook OK!', { description: 'A URL respondeu corretamente.' });
        return;
      }
      const status = data?.status ? `status ${data.status}` : 'Falha';
      const hint = data?.message || data?.error || 'Resposta inválida';
      toast.error(`Webhook não respondeu (${status})`, { description: hint });
    } catch {
      toast.error('Erro ao testar URL do webhook');
    } finally {
      setIsTestingUrl(false);
    }
  };

  // Handler para ativar WABA - passa a URL computada (ex: URL de túnel em dev)
  const handleActivateWaba = async () => {
    if (!computedWebhookUrl) {
      toast.error('URL do webhook não configurada');
      return;
    }
    await onSubscribeWebhookMessages?.(computedWebhookUrl);
    // Refresh phone numbers para atualizar o funil com os novos dados
    onRefreshPhoneNumbers?.();
    onRefreshWebhookSubscription?.();
  };

  // Handler para desativar WABA
  const handleDeactivateWaba = async () => {
    await onUnsubscribeWebhookMessages?.();
    // Refresh phone numbers para atualizar o funil
    onRefreshPhoneNumbers?.();
    onRefreshWebhookSubscription?.();
  };

  return (
    <Container variant="glass" padding="lg">
      {/* Header */}
      <SectionHeader
        title="Webhooks"
        icon={Webhook}
        color="info"
        showIndicator={true}
        actions={
          isDevMode && phoneNumbers && phoneNumbers.length > 0 ? (
            <button
              onClick={onRefreshPhoneNumbers}
              disabled={phoneNumbersLoading}
              className="p-2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw size={16} className={phoneNumbersLoading ? 'animate-spin' : ''} />
            </button>
          ) : undefined
        }
      />

      {/* Indicador de Status */}
      <div className="mt-4">
        <WebhookStatusIndicator
          webhookSubscription={webhookSubscription}
          isLoading={webhookSubscriptionLoading}
          onRefresh={onRefreshWebhookSubscription}
        />
      </div>

      {/* Explicação curta */}
      <p className="mt-4 mb-6 text-sm text-[var(--ds-text-secondary)]">
        O webhook conecta a Meta ao SmartZap. Por ele você recebe respostas dos contatos e confirmações de entrega/leitura.
      </p>

      {/* URL e Token para copiar */}
      <div className="bg-[var(--ds-bg-subtle)] border border-[var(--ds-border-default)] rounded-xl p-5 space-y-4">
        {/* URL do Webhook */}
        <div>
          <label className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wider mb-2 block">
            URL do Webhook
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-[var(--ds-bg-elevated)] rounded-lg text-sm font-mono text-[var(--ds-text-primary)] truncate">
              {computedWebhookUrl || 'Carregando...'}
            </code>
            <button
              onClick={() => computedWebhookUrl && handleCopy(computedWebhookUrl, 'url')}
              className="p-2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
              title="Copiar URL"
            >
              {copiedField === 'url' ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        {/* Verificar token */}
        <div>
          <label className="text-xs font-medium text-[var(--ds-text-muted)] uppercase tracking-wider mb-2 block">
            Verificar token
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-[var(--ds-bg-elevated)] rounded-lg text-sm font-mono text-[var(--ds-text-primary)]">
              {webhookToken || '••••••••'}
            </code>
            <button
              onClick={() => webhookToken && handleCopy(webhookToken, 'token')}
              className="p-2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
              title="Copiar Token"
            >
              {copiedField === 'token' ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
            </button>
          </div>
        </div>

        {/* Instruções de configuração - Colapsável */}
        <details className="pt-3 border-t border-[var(--ds-border-subtle)] group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[var(--ds-text-primary)] hover:text-primary-400 transition-colors list-none">
            <svg
              className="w-4 h-4 transition-transform group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Como configurar passo a passo
          </summary>

          <div className="mt-4 space-y-4 text-sm text-[var(--ds-text-secondary)]">
            {/* Passo 1 */}
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-[var(--ds-text-primary)]">Acesse seu App na Meta</p>
                <p className="mt-1">
                  Vá para{' '}
                  <a
                    href="https://developers.facebook.com/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-400 hover:text-primary-300 underline"
                  >
                    developers.facebook.com/apps
                  </a>
                  {' '}e selecione o App que você usa para o WhatsApp.
                </p>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-[var(--ds-text-primary)]">Vá para WhatsApp → Configuração</p>
                <p className="mt-1">No menu lateral, clique em <strong>WhatsApp</strong> e depois em <strong>Configuração</strong>.</p>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-[var(--ds-text-primary)]">Configure o Webhook</p>
                <p className="mt-1">Na seção <strong>Webhook</strong>, clique em <strong>Editar</strong> e preencha:</p>
                <ul className="mt-2 ml-4 space-y-1">
                  <li>• <strong>URL de callback:</strong> Cole a URL copiada acima</li>
                  <li>• <strong>Verificar token:</strong> Cole o Token copiado acima</li>
                </ul>
              </div>
            </div>

            {/* Passo 4 */}
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary-500/20 text-primary-400 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <div>
                <p className="font-medium text-[var(--ds-text-primary)]">Ative o campo do Webhook</p>
                <p className="mt-1">Ainda na seção Webhook, clique em <strong>Gerenciar</strong> e ative:</p>
                <ul className="mt-2 ml-4 space-y-1">
                  <li>• <strong>messages</strong> — para receber respostas e confirmações de entrega/leitura</li>
                </ul>
              </div>
            </div>

            {/* Passo 5 */}
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center text-xs font-bold">✓</span>
              <div>
                <p className="font-medium text-[var(--ds-text-primary)]">Pronto!</p>
                <p className="mt-1">Após salvar, o SmartZap começará a receber as notificações automaticamente.</p>
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* ====== SEÇÃO AVANÇADA - Apenas em Dev Mode ====== */}
      {isDevMode && (
        <div className="mt-8 pt-6 border-t border-[var(--ds-border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--ds-text-primary)] mb-4 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-medium rounded">DEV</span>
            Configuração Avançada
          </h3>

          {/* SmartZap Webhook URL Config (versão avançada com seletor de domínio) */}
          <WebhookUrlConfig
            webhookUrl={computedWebhookUrl}
            webhookToken={webhookToken}
            webhookStats={webhookStats}
            availableDomains={availableDomains}
            selectedDomainUrl={selectedDomainUrl}
            onDomainChange={setSelectedDomainUrl}
            copiedField={copiedField}
            onCopy={handleCopy}
            onTestUrl={handleTestUrl}
            isTestingUrl={isTestingUrl}
            showTestUrl={true}
          />

          {/* Phone Numbers List with inline funnel actions */}
          {phoneNumbers && phoneNumbers.length > 0 && (
            <PhoneNumbersList
              phoneNumbers={phoneNumbers}
              phoneNumbersLoading={phoneNumbersLoading}
              computedWebhookUrl={computedWebhookUrl}
              isSavingOverride={isSavingOverride}
              onSetZapflowWebhook={handleSetZapflowWebhook}
              onRemoveOverride={handleRemoveOverride}
              onSetCustomOverride={handleSetCustomOverride}
              onActivateWaba={handleActivateWaba}
              onDeactivateWaba={handleDeactivateWaba}
              isWabaBusy={webhookSubscriptionMutating}
            />
          )}

          {/* Webhook Levels Explanation */}
          <WebhookLevelsExplanation />
        </div>
      )}
    </Container>
  );
}
