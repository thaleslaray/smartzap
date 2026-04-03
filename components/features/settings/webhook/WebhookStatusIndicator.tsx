'use client';

import React from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Info } from 'lucide-react';

interface WebhookHierarchy {
  phoneNumberOverride: string | null;
  wabaOverride: string | null;
  appWebhook: string | null;
}

interface WebhookSubscription {
  ok: boolean;
  hierarchy?: WebhookHierarchy | null;
  smartzapWebhookUrl?: string;
  error?: string;
}

interface WebhookStatusIndicatorProps {
  webhookSubscription?: WebhookSubscription | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

/**
 * Compara se duas URLs são equivalentes (ignora trailing slash e protocolo http/https)
 */
function urlsMatch(url1: string | null | undefined, url2: string | null | undefined): boolean {
  if (!url1 || !url2) return false;

  // Normaliza: remove trailing slash, lowercase
  const normalize = (u: string) => u.replace(/\/$/, '').toLowerCase();
  return normalize(url1) === normalize(url2);
}

/**
 * Encontra qual nível da hierarquia está configurado
 */
function findActiveLevel(
  hierarchy: WebhookHierarchy | null | undefined,
  expectedUrl: string | null | undefined
): {
  level: '#1 Número' | '#2 WABA' | '#3 APP' | null;
  url: string | null;
  isSmartZap: boolean;
} {
  if (!hierarchy) return { level: null, url: null, isSmartZap: false };

  // Prioridade: #1 Phone > #2 WABA > #3 APP
  if (hierarchy.phoneNumberOverride) {
    return {
      level: '#1 Número',
      url: hierarchy.phoneNumberOverride,
      isSmartZap: urlsMatch(hierarchy.phoneNumberOverride, expectedUrl),
    };
  }
  if (hierarchy.wabaOverride) {
    return {
      level: '#2 WABA',
      url: hierarchy.wabaOverride,
      isSmartZap: urlsMatch(hierarchy.wabaOverride, expectedUrl),
    };
  }
  if (hierarchy.appWebhook) {
    return {
      level: '#3 APP',
      url: hierarchy.appWebhook,
      isSmartZap: urlsMatch(hierarchy.appWebhook, expectedUrl),
    };
  }

  return { level: null, url: null, isSmartZap: false };
}

/**
 * Indicador de status do webhook com diagnóstico completo.
 * Verifica toda a hierarquia: Phone (#1) > WABA (#2) > APP (#3)
 */
export function WebhookStatusIndicator({
  webhookSubscription,
  isLoading,
  onRefresh,
}: WebhookStatusIndicatorProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg">
        <Loader2 size={16} className="animate-spin text-zinc-400" />
        <span className="text-sm text-zinc-400">Verificando webhook...</span>
      </div>
    );
  }

  // Erro na API
  if (!webhookSubscription?.ok) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle size={18} className="text-red-500" />
            <span className="text-sm font-medium text-red-400">
              Erro ao verificar webhook
            </span>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
              title="Tentar novamente"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        {webhookSubscription?.error && (
          <p className="mt-2 text-xs text-red-400/70">{webhookSubscription.error}</p>
        )}
      </div>
    );
  }

  // Analisa hierarquia completa
  const expectedUrl = webhookSubscription.smartzapWebhookUrl;
  const active = findActiveLevel(webhookSubscription.hierarchy, expectedUrl);

  // URL do SmartZap configurada = sucesso
  if (active.isSmartZap) {
    return (
      <div className="px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-emerald-400">
                Webhook configurado
              </span>
              <span className="text-xs text-emerald-400/70">
                Nível {active.level} ativo
              </span>
            </div>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 text-emerald-400/60 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
              title="Verificar novamente"
            >
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        {/* Nota informativa */}
        <div className="flex items-start gap-2 pt-2 border-t border-emerald-500/20">
          <Info size={14} className="text-emerald-400/60 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-400/70">
            Certifique-se de que o campo &quot;messages&quot; está ativo no Dashboard da Meta.
          </p>
        </div>
      </div>
    );
  }

  // Problema - URL não é do SmartZap ou não existe
  return (
    <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <XCircle size={18} className="text-red-500" />
          <span className="text-sm font-medium text-red-400">
            Webhook não configurado
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Verificar novamente"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* URLs */}
      <div className="space-y-1.5 text-xs">
        {active.url && (
          <div className="break-all">
            <span className="text-zinc-500">URL atual: </span>
            <code className="text-red-400">{active.url}</code>
          </div>
        )}
        {expectedUrl && (
          <div className="break-all">
            <span className="text-zinc-500">URL esperada: </span>
            <code className="text-emerald-400">{expectedUrl}</code>
          </div>
        )}
      </div>
    </div>
  );
}

