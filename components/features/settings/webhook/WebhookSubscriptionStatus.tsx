'use client';

import React from 'react';
import {
  Building2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Zap,
  Trash2,
  Info,
} from 'lucide-react';
import { WebhookSubscription } from './types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';

interface WebhookSubscriptionStatusProps {
  webhookSubscription?: WebhookSubscription | null;
  webhookSubscriptionLoading?: boolean;
  webhookSubscriptionMutating?: boolean;
  phoneNumbersCount?: number;
  onRefresh?: () => void;
  onSubscribe?: () => Promise<void>;
  onUnsubscribe?: () => Promise<void>;
}

export function WebhookSubscriptionStatus({
  webhookSubscription,
  webhookSubscriptionLoading,
  webhookSubscriptionMutating,
  phoneNumbersCount = 0,
  onRefresh,
  onSubscribe,
  onUnsubscribe,
}: WebhookSubscriptionStatusProps) {
  const handleSubscribe = async () => {
    if (!onSubscribe) return;
    try {
      await onSubscribe();
    } catch {
      // toast handled in controller
    }
  };

  const handleUnsubscribe = async () => {
    if (!onUnsubscribe) return;
    try {
      await onUnsubscribe();
    } catch {
      // toast handled in controller
    }
  };

  const isLoading = webhookSubscriptionLoading || webhookSubscriptionMutating;
  const wabaOverride = webhookSubscription?.wabaOverride;
  const isConfigured = wabaOverride?.isConfigured ?? false;
  const isSmartZap = wabaOverride?.isSmartZap ?? false;
  const overrideUrl = wabaOverride?.url;

  // Determina o que está sendo usado atualmente
  const hierarchy = webhookSubscription?.hierarchy;
  const currentlyUsing = hierarchy?.phoneNumberOverride
    ? 'number'
    : hierarchy?.wabaOverride
      ? 'waba'
      : hierarchy?.appWebhook
        ? 'app'
        : 'unknown';

  return (
    <div className="bg-[var(--ds-bg-elevated)] border border-[var(--ds-border-default)] rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-medium text-[var(--ds-text-primary)] mb-1 flex items-center gap-2">
            <Building2 size={16} className="text-[var(--ds-status-info-text)]" />
            Webhook WABA (#2)
          </h4>
          <p className="text-xs text-[var(--ds-text-secondary)]">
            Configura o webhook para <strong>todos os números</strong> desta WABA.
            {phoneNumbersCount > 0 && (
              <span className="text-[var(--ds-text-muted)]">
                {' '}({phoneNumbersCount} número{phoneNumbersCount !== 1 ? 's' : ''} afetado{phoneNumbersCount !== 1 ? 's' : ''})
              </span>
            )}
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] rounded-lg transition-colors"
          title="Atualizar status"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* Status */}
        <div className="flex items-center gap-2 text-sm">
          {webhookSubscriptionLoading ? (
            <>
              <Loader2 size={16} className="animate-spin text-[var(--ds-text-muted)]" />
              <span className="text-[var(--ds-text-muted)]">Consultando status...</span>
            </>
          ) : webhookSubscription?.ok ? (
            isConfigured ? (
              <>
                <StatusBadge status={isSmartZap ? 'success' : 'warning'} showDot>
                  {isSmartZap ? 'SmartZap' : 'Outro sistema'}
                </StatusBadge>
                <span className="text-[var(--ds-text-muted)]">·</span>
                <span className="text-[var(--ds-text-secondary)] text-xs font-mono truncate max-w-[200px]" title={overrideUrl || ''}>
                  {overrideUrl}
                </span>
              </>
            ) : (
              <>
                <StatusBadge status="default" showDot>Não configurado</StatusBadge>
                <span className="text-[var(--ds-text-muted)]">·</span>
                <span className="text-[var(--ds-text-secondary)] text-xs">
                  Usando fallback do App (#3)
                </span>
              </>
            )
          ) : (
            <StatusBadge status="error" showDot>Erro ao consultar</StatusBadge>
          )}
        </div>

        {/* WABA ID */}
        {webhookSubscription?.wabaId && !webhookSubscriptionLoading && (
          <div className="text-[11px] text-[var(--ds-text-muted)]">
            WABA: {webhookSubscription.wabaId}
          </div>
        )}

        {/* Informação sobre prioridade */}
        {webhookSubscription?.ok && !webhookSubscriptionLoading && (
          <div className="flex items-start gap-2 p-2.5 bg-[var(--ds-bg-surface)] rounded-lg">
            <Info size={14} className="text-[var(--ds-text-muted)] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[var(--ds-text-secondary)]">
              {currentlyUsing === 'number' ? (
                <>
                  <strong className="text-[var(--ds-status-success-text)]">Override #1 (Número)</strong> tem prioridade.
                  Se remover o override do número, usará este webhook WABA.
                </>
              ) : currentlyUsing === 'waba' ? (
                <>
                  <strong className="text-[var(--ds-status-info-text)]">Este webhook (#2)</strong> está sendo usado.
                  Números sem override #1 usarão esta URL.
                </>
              ) : (
                <>
                  <strong>App (#3)</strong> está sendo usado como fallback.
                  Configure aqui para todos os números usarem o SmartZap automaticamente.
                </>
              )}
            </p>
          </div>
        )}

        {/* Erro */}
        {webhookSubscription &&
          !webhookSubscriptionLoading &&
          !webhookSubscription.ok &&
          webhookSubscription.error && (
            <Alert variant="error" className="py-2">
              <AlertDescription className="text-xs mt-0">
                {webhookSubscription.error}
              </AlertDescription>
            </Alert>
          )}

        {/* Aviso quando não foi possível consultar — provável falta de credenciais */}
        {!webhookSubscriptionLoading && webhookSubscription && !webhookSubscription.ok && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-400/90">
              Configure as credenciais do WhatsApp em <strong>Ajustes → Credenciais</strong> antes de ativar o webhook.
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-wrap gap-2 pt-1">
          {!isConfigured || !isSmartZap ? (
            <button
              onClick={handleSubscribe}
              disabled={isLoading || !onSubscribe || (webhookSubscription !== undefined && !webhookSubscription?.ok)}
              className="h-10 px-3 bg-[var(--ds-status-success)] hover:opacity-90 text-white font-medium rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={webhookSubscription && !webhookSubscription.ok ? 'Configure as credenciais antes de ativar' : 'Configurar SmartZap como webhook WABA'}
            >
              {webhookSubscriptionMutating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              Ativar SmartZap para WABA
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-[var(--ds-status-success-bg)] text-[var(--ds-status-success-text)] rounded-lg text-sm">
              <CheckCircle2 size={16} />
              SmartZap ativo
            </div>
          )}

          {isConfigured && (
            <button
              onClick={handleUnsubscribe}
              disabled={isLoading || !onUnsubscribe}
              className="h-10 px-3 bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)] border border-[var(--ds-border-default)] rounded-lg transition-colors text-sm flex items-center gap-2 disabled:opacity-50"
              title="Remover override (voltar para App #3)"
            >
              {webhookSubscriptionMutating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
