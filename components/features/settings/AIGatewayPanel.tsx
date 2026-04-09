'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Eye, EyeOff, Check, X, Loader2, ChevronDown, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { AIModelInfo } from '@/app/api/ai/models/route';

/**
 * AIGatewayPanel — Configuração de IA (Google Gemini)
 *
 * Cada cliente usa sua própria chave de API, paga diretamente ao Google.
 */

// =============================================================================
// TIPOS
// =============================================================================

type AiProvider = 'google';

type KeyStatus = 'idle' | 'saving' | 'valid' | 'invalid';

interface ProviderState {
  isConfigured: boolean;
  tokenPreview: string | null;
  keyStatus: KeyStatus;
  keyDraft: string;
  showKey: boolean;
  models: AIModelInfo[];
  modelsLoading: boolean;
  modelSearch: string;
  showModelList: boolean;
}

// =============================================================================
// CONFIGURAÇÃO DO PROVIDER
// =============================================================================

const PROVIDERS: { id: AiProvider; label: string; icon: string; color: string; placeholder: string }[] = [
  {
    id: 'google',
    label: 'Google Gemini',
    icon: '💎',
    color: 'blue',
    placeholder: 'AIza...',
  },
];

const COLOR_MAP: Record<string, string> = {
  blue: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
};

const ACTIVE_COLOR: Record<string, string> = {
  blue: 'border-blue-500/50 bg-blue-500/20 ring-1 ring-blue-500/30',
};

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function AIGatewayPanel() {
  const [loading, setLoading] = useState(true);
  const [activeModel, setActiveModel] = useState('');
  const [saving, setSaving] = useState(false);

  const [providerState, setProviderState] = useState<Record<AiProvider, ProviderState>>({
    google: {
      isConfigured: false, tokenPreview: null, keyStatus: 'idle',
      keyDraft: '', showKey: false, models: [], modelsLoading: false,
      modelSearch: '', showModelList: false,
    },
  });

  const updateProvider = (id: AiProvider, patch: Partial<ProviderState>) => {
    setProviderState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  // =============================================================================
  // LOAD CONFIG
  // =============================================================================

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings/ai');
      const data = await res.json();

      if (data.model) setActiveModel(data.model);

      if (data.keys?.google) {
        updateProvider('google', {
          isConfigured: data.keys.google.isConfigured,
          tokenPreview: data.keys.google.tokenPreview,
        });
      }
    } catch (error) {
      console.error('[AIGatewayPanel] load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  // =============================================================================
  // FETCH MODELS (lazy)
  // =============================================================================

  const fetchModels = async (id: AiProvider) => {
    updateProvider(id, { modelsLoading: true });
    try {
      const res = await fetch(`/api/ai/models?provider=${id}`);
      const data = await res.json();
      updateProvider(id, { models: data.models ?? [], modelsLoading: false });
    } catch {
      updateProvider(id, { models: [], modelsLoading: false });
    }
  };

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleSaveKey = async (id: AiProvider) => {
    const key = providerState[id].keyDraft.trim();
    if (!key) { toast.error('Informe a chave'); return; }

    updateProvider(id, { keyStatus: 'saving' });
    try {
      const body = { google_api_key: key };
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar');

      updateProvider(id, { keyStatus: 'valid', keyDraft: '', isConfigured: true });
      toast.success('Chave Google salva');
      await loadConfig();
      // Carrega modelos com a nova chave
      void fetchModels(id);
    } catch (error) {
      updateProvider(id, { keyStatus: 'invalid' });
      const message = error instanceof Error ? error.message : 'Erro ao salvar chave';
      toast.error(message);
    }
  };

  const handleRemoveKey = async (id: AiProvider) => {
    try {
      const res = await fetch(`/api/settings/ai?provider=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao remover chave');
      updateProvider(id, { isConfigured: false, tokenPreview: null, models: [], keyStatus: 'idle' });
      toast.success('Chave Google removida');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao remover chave';
      toast.error(message);
    }
  };

  const handleSelectModel = async (modelId: string, providerId: AiProvider) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sempre envia provider + model para garantir consistência no backend
        body: JSON.stringify({ model: modelId, provider: providerId }),
      });
      if (!res.ok) throw new Error('Erro ao salvar modelo');
      setActiveModel(modelId);
      updateProvider(providerId, { showModelList: false, modelSearch: '' });
      toast.success('Modelo atualizado');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar modelo';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleModelList = (id: AiProvider) => {
    const ps = providerState[id];
    const next = !ps.showModelList;
    updateProvider(id, { showModelList: next });
    if (next && ps.models.length === 0 && ps.isConfigured) {
      void fetchModels(id);
    }
  };

  // =============================================================================
  // RENDER
  // =============================================================================

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
    <section className="glass-panel rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-text-primary)]">
          <Cpu className="size-4 text-emerald-400" />
          Google Gemini
        </div>
        <p className="text-sm text-[var(--ds-text-secondary)]">
          Configure sua chave de API do Google. Você paga diretamente ao Google.
        </p>
      </div>

      {/* Provider cards */}
      <div className="space-y-4">
        {PROVIDERS.map(({ id, label, icon, color, placeholder }) => {
          const ps = providerState[id];
          const filteredModels = ps.modelSearch
            ? ps.models.filter(
                (m) =>
                  m.name.toLowerCase().includes(ps.modelSearch.toLowerCase()) ||
                  m.id.toLowerCase().includes(ps.modelSearch.toLowerCase())
              )
            : ps.models;

          return (
            <div
              key={id}
              className={`rounded-xl border p-4 transition ${ACTIVE_COLOR[color]}`}
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{icon}</span>
                  <span className="text-sm font-medium text-[var(--ds-text-primary)]">{label}</span>
                  {ps.isConfigured && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                      Configurado
                    </span>
                  )}
                </div>

                {ps.isConfigured && (
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${COLOR_MAP[color]}`}>
                    Ativo
                  </span>
                )}
              </div>

              {/* API Key section */}
              <div className="mt-3 space-y-2">
                {ps.isConfigured && ps.tokenPreview ? (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-surface)] px-3 py-2">
                    <code className="text-xs text-[var(--ds-text-secondary)]">{ps.tokenPreview}</code>
                    <button
                      type="button"
                      onClick={() => handleRemoveKey(id)}
                      className="text-[var(--ds-text-muted)] transition hover:text-red-400"
                      aria-label="Remover chave"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={ps.showKey ? 'text' : 'password'}
                        value={ps.keyDraft}
                        onChange={(e) => updateProvider(id, { keyDraft: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveKey(id); }}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-1.5 pr-9 text-xs text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => updateProvider(id, { showKey: !ps.showKey })}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)] hover:text-[var(--ds-text-secondary)]"
                        aria-label={ps.showKey ? 'Ocultar chave' : 'Mostrar chave'}
                      >
                        {ps.showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={ps.keyStatus === 'saving' || !ps.keyDraft.trim()}
                      onClick={() => void handleSaveKey(id)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {ps.keyStatus === 'saving' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Salvar
                    </button>
                  </div>
                )}

                {ps.keyStatus === 'invalid' && (
                  <p className="text-[11px] text-red-400">Chave inválida — verifique e tente novamente.</p>
                )}
              </div>

              {/* Model selector — só aparece se configurado */}
              {ps.isConfigured && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => toggleModelList(id)}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2"
                  >
                    <div className="text-left">
                      <div className="text-[11px] text-[var(--ds-text-muted)]">Modelo ativo</div>
                      <div className="text-xs font-medium text-[var(--ds-text-primary)]">
                        {activeModel
                          ? (ps.models.find((m) => m.id === activeModel)?.name ?? activeModel)
                          : 'Selecionar modelo'}
                      </div>
                    </div>
                    <ChevronDown
                      className={`size-4 text-[var(--ds-text-muted)] transition-transform ${ps.showModelList ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {ps.showModelList && (
                    <div className="mt-2 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] p-2 space-y-2">
                      {/* Search */}
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                        <input
                          type="text"
                          placeholder="Buscar modelo..."
                          value={ps.modelSearch}
                          onChange={(e) => updateProvider(id, { modelSearch: e.target.value })}
                          className="w-full rounded-md border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-muted)] focus:outline-none"
                        />
                      </div>

                      {/* Model list */}
                      {ps.modelsLoading ? (
                        <div className="flex items-center justify-center gap-2 py-4 text-[var(--ds-text-muted)]">
                          <Loader2 size={13} className="animate-spin" />
                          <span className="text-xs">Carregando modelos...</span>
                        </div>
                      ) : filteredModels.length === 0 ? (
                        <p className="py-3 text-center text-xs text-[var(--ds-text-muted)]">
                          Nenhum modelo encontrado
                        </p>
                      ) : (
                        <>
                          {/* Aliases (auto-atualizados) */}
                          {filteredModels.some((m) => m.isAlias) && (
                            <div>
                              <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                                Sempre atualizado
                              </div>
                              <div className="space-y-0.5">
                                {filteredModels.filter((m) => m.isAlias).map((m) => (
                                  <ModelRow
                                    key={m.id}
                                    model={m}
                                    isSelected={activeModel === m.id}
                                    disabled={saving}
                                    onSelect={(modelId) => handleSelectModel(modelId, id)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Versões fixas */}
                          {filteredModels.some((m) => !m.isAlias) && (
                            <div>
                              <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                                Versões fixas
                              </div>
                              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-0.5">
                                {filteredModels.filter((m) => !m.isAlias).map((m) => (
                                  <ModelRow
                                    key={m.id}
                                    model={m}
                                    isSelected={activeModel === m.id}
                                    disabled={saving}
                                    onSelect={(modelId) => handleSelectModel(modelId, id)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// =============================================================================
// SUB-COMPONENTE: linha de modelo
// =============================================================================

function ModelRow({
  model,
  isSelected,
  disabled,
  onSelect,
}: {
  model: AIModelInfo;
  isSelected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(model.id)}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 transition ${
        isSelected
          ? 'bg-emerald-500/10 text-emerald-300'
          : 'text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="text-xs">{model.name}</span>
      <code className="shrink-0 rounded bg-[var(--ds-bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--ds-text-muted)]">
        {model.id}
      </code>
    </button>
  );
}
