'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Route, Info, Loader2, Check, ChevronDown, Search, Key, ExternalLink } from 'lucide-react';
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

// Nomes de exibição por provider
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  mistral: 'Mistral',
  xai: 'xAI',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  meta: 'Meta',
  perplexity: 'Perplexity',
};

// Cores inativas dos pills de provider
const PROVIDER_PILL_INACTIVE: Record<string, string> = {
  anthropic: 'border-amber-500/20 bg-amber-500/5 text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-300',
  google:    'border-blue-500/20 bg-blue-500/5 text-blue-400/70 hover:bg-blue-500/15 hover:text-blue-300',
  openai:    'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/70 hover:bg-emerald-500/15 hover:text-emerald-300',
};

// Cores ativas dos pills de provider
const PROVIDER_PILL_ACTIVE: Record<string, string> = {
  anthropic: 'border-amber-500/50 bg-amber-500/20 text-amber-200',
  google:    'border-blue-500/50 bg-blue-500/20 text-blue-200',
  openai:    'border-emerald-500/50 bg-emerald-500/20 text-emerald-200',
};

// Cores dos dots nos chips de fallback
const PROVIDER_DOT: Record<string, string> = {
  anthropic: 'bg-amber-400',
  google:    'bg-blue-400',
  openai:    'bg-emerald-400',
};

function providerDisplayName(p: string): string {
  return PROVIDER_NAMES[p.toLowerCase()] ?? (p.charAt(0).toUpperCase() + p.slice(1));
}

function providerPillStyle(provider: string, active: boolean): string {
  const p = provider.toLowerCase();
  if (provider === 'all') {
    return active
      ? 'border-violet-500/50 bg-violet-500/20 text-violet-200'
      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)]';
  }
  return active
    ? (PROVIDER_PILL_ACTIVE[p] ?? 'border-zinc-500/50 bg-zinc-500/20 text-zinc-200')
    : (PROVIDER_PILL_INACTIVE[p] ?? 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] text-[var(--ds-text-secondary)] hover:bg-[var(--ds-bg-hover)]');
}

function providerDotColor(provider: string): string {
  return PROVIDER_DOT[provider.toLowerCase()] ?? 'bg-zinc-400';
}

export function AIGatewayPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AiGatewayConfig>(DEFAULT_AI_GATEWAY);
  const [showPrimaryConfig, setShowPrimaryConfig] = useState(false);
  const [showFallbackConfig, setShowFallbackConfig] = useState(false);
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [primarySearch, setPrimarySearch] = useState('');
  const [selectedPrimaryProvider, setSelectedPrimaryProvider] = useState('all');

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/ai');
      const data = await res.json();
      if (data.gateway) setConfig(data.gateway);
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
    if ((!showPrimaryConfig && !showFallbackConfig) || models.length > 0) return;
    setModelsLoading(true);
    fetch('/api/ai/gateway-models')
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [showPrimaryConfig, showFallbackConfig, models.length]);

  // Providers únicos extraídos dos modelos (para pills)
  const providers = useMemo(() => {
    const unique = [...new Set(models.map((m) => m.provider))].sort();
    return unique;
  }, [models]);

  // Modelos filtrados para o seletor primário
  const filteredPrimary = useMemo(() => {
    let list = selectedPrimaryProvider === 'all'
      ? models
      : models.filter((m) => m.provider === selectedPrimaryProvider);
    if (primarySearch) {
      const q = primarySearch.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
    }
    return list;
  }, [models, selectedPrimaryProvider, primarySearch]);

  // Modelos filtrados para fallback
  const filteredFallback = useMemo(() => {
    const selected = new Set(config.fallbackModels ?? []);
    const q = modelSearch.toLowerCase();
    const filtered = q
      ? models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
      : models;
    // Não-selecionados primeiro, selecionados esmaecidos no final
    return [...filtered].sort((a, b) => (selected.has(a.id) ? 1 : 0) - (selected.has(b.id) ? 1 : 0));
  }, [models, modelSearch, config.fallbackModels]);

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
        {/* ── Primary Model Selector ── */}
        <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
          <button
            type="button"
            onClick={() => { setShowPrimaryConfig(!showPrimaryConfig); setPrimarySearch(''); }}
            className="flex w-full items-center justify-between"
          >
            <div>
              <div className="text-sm font-medium text-[var(--ds-text-primary)] text-left">Modelo Principal</div>
              <div className="text-xs text-[var(--ds-text-muted)] mt-0.5 text-left">
                {config.primaryModel
                  ? (models.find((m) => m.id === config.primaryModel)?.name ?? config.primaryModel.split('/').pop() ?? config.primaryModel)
                  : 'Nenhum selecionado'}
              </div>
            </div>
            <ChevronDown
              className={`size-4 text-[var(--ds-text-muted)] transition-transform ${showPrimaryConfig ? 'rotate-180' : ''}`}
            />
          </button>

          {showPrimaryConfig && (
            <div className="mt-4 border-t border-[var(--ds-border-subtle)] pt-4 space-y-3">
              {modelsLoading ? (
                <div className="flex items-center gap-2 py-3 text-[var(--ds-text-muted)]">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs">Carregando modelos...</span>
                </div>
              ) : (
                <>
                  {/* Provider pills */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {['all', ...providers].map((p) => {
                      const active = selectedPrimaryProvider === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => { setSelectedPrimaryProvider(p); setPrimarySearch(''); }}
                          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${providerPillStyle(p, active)}`}
                        >
                          {p === 'all' ? 'Todos' : providerDisplayName(p)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                    <input
                      type="text"
                      placeholder={selectedPrimaryProvider === 'all' ? 'Buscar entre todos os modelos...' : `Buscar em ${providerDisplayName(selectedPrimaryProvider)}...`}
                      value={primarySearch}
                      onChange={(e) => setPrimarySearch(e.target.value)}
                      className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                    />
                  </div>

                  {/* Model list */}
                  <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                    {filteredPrimary.length === 0 ? (
                      <p className="py-3 text-center text-xs text-[var(--ds-text-muted)]">Nenhum modelo encontrado</p>
                    ) : (
                      filteredPrimary.map((model) => {
                        const isSelected = model.id === config.primaryModel;
                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => { handleSaveConfig({ primaryModel: model.id }); setShowPrimaryConfig(false); }}
                            disabled={saving}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition ${
                              isSelected
                                ? 'border-violet-500/40 bg-violet-500/10'
                                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]'
                            } ${saving ? 'cursor-not-allowed' : ''}`}
                          >
                            <div className="flex items-center gap-2.5">
                              {/* Radio indicator */}
                              <div
                                className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition ${
                                  isSelected ? 'border-violet-500 bg-violet-500' : 'border-[var(--ds-border-default)]'
                                }`}
                              >
                                {isSelected && <div className="size-2 rounded-full bg-white" />}
                              </div>
                              <div className="text-left">
                                <div className="text-xs font-medium text-[var(--ds-text-primary)]">{model.name}</div>
                                {selectedPrimaryProvider === 'all' && (
                                  <div className="text-[10px] text-[var(--ds-text-muted)]">{providerDisplayName(model.provider)}</div>
                                )}
                              </div>
                            </div>
                            <code className="shrink-0 rounded bg-[var(--ds-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--ds-text-muted)]">
                              {model.id}
                            </code>
                          </button>
                        );
                      })
                    )}
                    {primarySearch && (
                      <p className="pt-1 text-center text-[10px] text-[var(--ds-text-muted)]">
                        {filteredPrimary.length} de {selectedPrimaryProvider === 'all' ? models.length : models.filter(m => m.provider === selectedPrimaryProvider).length} modelos
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── BYOK Toggle ── */}
        <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Key size={15} className="shrink-0 text-[var(--ds-text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--ds-text-primary)]">Usar suas chaves de API (BYOK)</div>
                <div className="text-xs text-[var(--ds-text-muted)] mt-0.5">
                  Passa suas chaves diretamente ao Gateway — sem markup de custo
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.useBYOK}
              aria-label="Usar BYOK"
              disabled={saving}
              onClick={() => handleSaveConfig({ useBYOK: !config.useBYOK })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
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

          {/* Link ao dashboard BYOK quando ativo */}
          {config.useBYOK && (
            <div className="mt-3 border-t border-[var(--ds-border-subtle)] pt-3">
              <p className="text-[11px] text-[var(--ds-text-secondary)]">
                Adicione suas chaves de API diretamente no{' '}
                <a
                  href={`https://vercel.com/${process.env.NEXT_PUBLIC_VERCEL_TEAM ?? 'dashboard'}/${process.env.NEXT_PUBLIC_VERCEL_PROJECT ?? 'project'}/ai-gateway/byok`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 underline hover:text-emerald-300"
                >
                  Vercel AI Gateway → BYOK
                  <ExternalLink size={10} />
                </a>
                . O SmartZap as usa automaticamente.
              </p>
            </div>
          )}
        </div>

        {/* ── Fallback Models ── */}
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
                className={`size-4 text-[var(--ds-text-muted)] transition-transform ${showFallbackConfig ? 'rotate-180' : ''}`}
              />
            </button>

            {showFallbackConfig && (
              <div className="mt-4 border-t border-[var(--ds-border-subtle)] pt-4 space-y-3">
                {/* Chips selecionados com badge de provider */}
                {(config.fallbackModels?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(config.fallbackModels ?? []).map((id) => {
                      const model = models.find((m) => m.id === id);
                      const label = model?.name ?? id.split('/').pop() ?? id;
                      const provider = model?.provider ?? id.split('/')[0] ?? '';
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300"
                        >
                          <span className={`size-1.5 shrink-0 rounded-full ${providerDotColor(provider)}`} />
                          {label}
                          <button
                            type="button"
                            onClick={() => handleToggleFallbackModel(id)}
                            disabled={saving}
                            aria-label={`Remover ${label}`}
                            className="text-violet-400 hover:text-white disabled:opacity-50 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Busca */}
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                  <input
                    type="text"
                    placeholder="Buscar modelos para adicionar..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] py-1.5 pl-8 pr-3 text-xs text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                  />
                </div>

                {modelsLoading ? (
                  <div className="flex items-center gap-2 py-3 text-[var(--ds-text-muted)]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-xs">Carregando modelos...</span>
                  </div>
                ) : (
                  <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                    {filteredFallback.map((model) => {
                      const isSelected = (config.fallbackModels ?? []).includes(model.id);
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => handleToggleFallbackModel(model.id)}
                          disabled={saving}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 transition ${
                            isSelected
                              ? 'border-violet-500/20 bg-violet-500/5 opacity-50'
                              : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] hover:bg-[var(--ds-bg-hover)]'
                          } ${saving ? 'cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex size-4 shrink-0 items-center justify-center rounded border transition ${
                                isSelected ? 'border-violet-500 bg-violet-500' : 'border-[var(--ds-border-default)]'
                              }`}
                            >
                              {isSelected && <Check size={10} className="text-white" />}
                            </div>
                            <div className="flex items-center gap-2 text-left">
                              <span className={`size-1.5 shrink-0 rounded-full ${providerDotColor(model.provider)}`} />
                              <div>
                                <div className="text-xs font-medium text-[var(--ds-text-primary)]">{model.name}</div>
                                <div className="text-[10px] text-[var(--ds-text-muted)]">{providerDisplayName(model.provider)}</div>
                              </div>
                            </div>
                          </div>
                          <code className="shrink-0 rounded bg-[var(--ds-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--ds-text-muted)]">
                            {model.id}
                          </code>
                        </button>
                      );
                    })}
                    {modelSearch && (
                      <p className="pt-1 text-center text-[10px] text-[var(--ds-text-muted)]">
                        {filteredFallback.length} de {models.length} modelos
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
