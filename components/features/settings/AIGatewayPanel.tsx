'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Route, Info, Loader2, Check, ChevronDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_AI_GATEWAY, type AiGatewayConfig } from '@/lib/ai/ai-center-defaults';
import type { GatewayModel } from '@/app/api/ai/gateway-models/route';

/**
 * AIGatewayPanel - Configuração do Vercel AI Gateway
 *
 * O AI Gateway usa autenticação OIDC automática - não requer API key manual.
 * - Em produção (Vercel): token é injetado automaticamente
 * - Local: requer `vercel dev` ou `vercel env pull`
 */
export function AIGatewayPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AiGatewayConfig>(DEFAULT_AI_GATEWAY);
  const [showFallbackConfig, setShowFallbackConfig] = useState(false);
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState('');

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/ai');
      const data = await res.json();

      if (data.gateway) {
        setConfig(data.gateway);
      }
    } catch (error) {
      console.error('Error fetching AI Gateway config:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!showFallbackConfig || models.length > 0) return;
    setModelsLoading(true);
    fetch('/api/ai/gateway-models')
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [showFallbackConfig, models.length]);

  const handleSaveConfig = async (updates: Partial<AiGatewayConfig>) => {
    setSaving(true);
    try {
      const newConfig = { ...config, ...updates };

      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: newConfig }),
      });

      const data = await res.json();

      if (data.success) {
        setConfig(newConfig);
        toast.success('Configuração salva!');
        return true;
      } else {
        toast.error(data.error || 'Erro ao salvar');
        return false;
      }
    } catch (error) {
      console.error('Error saving AI Gateway config:', error);
      toast.error('Erro ao salvar configuração');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    // Se habilitando o Gateway, desativa o Helicone automaticamente
    if (enabled) {
      try {
        await fetch('/api/settings/helicone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
      } catch (error) {
        console.error('Error disabling Helicone:', error);
      }
    }

    await handleSaveConfig({ enabled });
  };

  const handleToggleFallbackModel = (modelId: string) => {
    const currentModels = config.fallbackModels || [];
    const newModels = currentModels.includes(modelId)
      ? currentModels.filter((m) => m !== modelId)
      : [...currentModels, modelId];

    handleSaveConfig({ fallbackModels: newModels });
  };

  if (loading) {
    return (
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-2 text-[var(--ds-text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel rounded-2xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-text-primary)]">
            <Route className="size-4 text-violet-400" />
            AI Gateway (Vercel)
          </div>
          <p className="text-sm text-[var(--ds-text-secondary)]">
            Roteamento inteligente com fallbacks automáticos entre providers.
          </p>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-3">
          {config.enabled && (
            <span className="rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-300">
              Ativo
            </span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label="Habilitar AI Gateway"
            disabled={saving}
            onClick={() => handleToggle(!config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
              config.enabled
                ? 'border-violet-500/40 bg-violet-500/20'
                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]'
            } ${saving ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <span
              className={`inline-block size-4 rounded-full transition ${
                config.enabled ? 'translate-x-6 bg-violet-300' : 'translate-x-1 bg-[var(--ds-text-muted)]'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Config */}
      <div className="mt-5 space-y-4">
        {/* BYOK Toggle */}
        <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--ds-text-primary)]">Usar suas chaves (BYOK)</div>
              <div className="text-xs text-[var(--ds-text-muted)] mt-0.5">
                Usa as chaves dos providers já configuradas no SmartZap
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.useBYOK}
              aria-label="Usar BYOK"
              disabled={saving}
              onClick={() => handleSaveConfig({ useBYOK: !config.useBYOK })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
                config.useBYOK
                  ? 'border-emerald-500/40 bg-emerald-500/20'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]'
              } ${saving ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <span
                className={`inline-block size-4 rounded-full transition ${
                  config.useBYOK ? 'translate-x-6 bg-emerald-300' : 'translate-x-1 bg-[var(--ds-text-muted)]'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Fallback Models Configuration */}
        {config.enabled && (
          <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
            <button
              type="button"
              onClick={() => setShowFallbackConfig(!showFallbackConfig)}
              className="flex w-full items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium text-[var(--ds-text-primary)] text-left">Modelos de Fallback</div>
                <div className="text-xs text-[var(--ds-text-muted)] mt-0.5 text-left">
                  {config.fallbackModels?.length || 0} modelos selecionados
                </div>
              </div>
              <ChevronDown
                className={`size-4 text-[var(--ds-text-muted)] transition-transform ${
                  showFallbackConfig ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showFallbackConfig && (
              <div className="mt-4 border-t border-[var(--ds-border-subtle)] pt-4">
                <p className="text-xs text-[var(--ds-text-secondary)] mb-3">
                  Selecione os modelos que serão usados como fallback quando o modelo primário falhar.
                </p>

                {/* Busca */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                  <input
                    type="text"
                    placeholder="Buscar modelos..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                  />
                </div>

                {modelsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-[var(--ds-text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Carregando modelos...</span>
                  </div>
                ) : (
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {models
                      .filter((m) => {
                        const q = modelSearch.toLowerCase();
                        return (
                          !q ||
                          m.name.toLowerCase().includes(q) ||
                          m.id.toLowerCase().includes(q) ||
                          m.provider.toLowerCase().includes(q)
                        );
                      })
                      .map((model) => {
                        const isSelected = config.fallbackModels?.includes(model.id);
                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => handleToggleFallbackModel(model.id)}
                            disabled={saving}
                            className={`flex w-full items-center justify-between rounded-lg border p-2.5 transition ${
                              isSelected
                                ? 'border-violet-500/30 bg-violet-500/10'
                                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]'
                            } ${saving ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`flex size-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-violet-500 bg-violet-500'
                                    : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)]'
                                }`}
                              >
                                {isSelected && <Check size={10} className="text-white" />}
                              </div>
                              <div className="text-left">
                                <div className="text-xs font-medium text-[var(--ds-text-primary)]">{model.name}</div>
                                <div className="text-[10px] text-[var(--ds-text-muted)]">{model.provider}</div>
                              </div>
                            </div>
                            <code className="shrink-0 rounded bg-[var(--ds-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--ds-text-muted)]">
                              {model.id}
                            </code>
                          </button>
                        );
                      })}
                    {models.length > 0 && modelSearch && (
                      <p className="pt-1 text-center text-[10px] text-[var(--ds-text-muted)]">
                        {models.filter((m) => {
                          const q = modelSearch.toLowerCase();
                          return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q);
                        }).length}{' '}
                        de {models.length} modelos
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Benefits info */}
        {config.enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-tertiary)] p-3 text-xs text-[var(--ds-text-secondary)]">
            <Info className="mt-0.5 size-4 shrink-0 text-violet-300/60" />
            <div>
              <p>Com o AI Gateway ativo, você tem:</p>
              <ul className="mt-1 space-y-0.5 text-[var(--ds-text-muted)]">
                <li>• Fallbacks automáticos entre providers</li>
                <li>• Roteamento inteligente baseado em latência</li>
                <li>• Observability centralizada no dashboard Vercel</li>
                <li>• Suporte a BYOK (suas chaves existentes)</li>
              </ul>
              <p className="mt-2 text-amber-300/80">
                <strong>Nota:</strong> Gateway e Helicone são mutuamente exclusivos. Ativar um desativa o outro automaticamente.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
