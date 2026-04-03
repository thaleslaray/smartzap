'use client'

import { useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileImage,
  FileText,
  FormInput,
  Info,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  Wrench,
  Drama,
  Target,
} from 'lucide-react'
// import { AIGatewayPanel } from '@/components/features/settings/AIGatewayPanel' // DESABILITADO (bug #11280)
import { HeliconePanel } from '@/components/features/settings/HeliconePanel'
import { Mem0Panel } from '@/components/features/settings/Mem0Panel'
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page'
import type { AIProvider } from '@/lib/ai/providers'
import type {
  AiPromptsConfig,
  AiRoutesConfig,
} from '@/lib/ai/ai-center-defaults'
import { toast } from 'sonner'
import { useSettingsAIController } from '@/hooks/useSettingsAI'

type PromptItem = {
  id: string
  valueKey: keyof AiPromptsConfig
  routeKey?: keyof AiRoutesConfig
  title: string
  description: string
  path: string
  variables: string[]
  rows?: number
  Icon: typeof FileText
}

// Modelos Gemini disponíveis para OCR
const OCR_GEMINI_MODELS = [
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    price: '$0.02/1M',
    desc: 'Mais barato, OCR básico',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    price: '$0.10/1M',
    desc: 'Recomendado - bom custo/benefício',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    price: '$1.25/1M',
    desc: 'Alta qualidade (tabelas complexas)',
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash (Preview)',
    price: '$0.50/1M',
    desc: 'Mais recente, última geração',
  },
]

const PROMPTS: PromptItem[] = [
  {
    id: 'flow-form',
    valueKey: 'flowFormTemplate',
    routeKey: 'generateFlowForm',
    title: 'MiniApp Form (JSON)',
    description: 'Gera o formulário para MiniApps (WhatsApp Flow) em JSON estrito.',
    path: '/lib/ai/prompts/flow-form.ts',
    variables: ['{{prompt}}', '{{titleHintBlock}}', '{{maxQuestions}}'],
    rows: 18,
    Icon: FormInput,
  },
]

// Estratégias de geração de templates (seção separada)
type StrategyItem = {
  id: string
  valueKey: keyof AiPromptsConfig
  title: string
  subtitle: string
  description: string
  metaCategory: 'MARKETING' | 'UTILITY'
  features: string[]
  warning?: string
  tone: 'amber' | 'emerald' | 'violet'
  Icon: typeof Megaphone
}

const TEMPLATE_STRATEGIES: StrategyItem[] = [
  {
    id: 'strategy-marketing',
    valueKey: 'strategyMarketing',
    title: 'Marketing',
    subtitle: 'Vendas',
    description: 'Foco total em conversão. Usa gatilhos mentais, urgência e copy persuasiva.',
    metaCategory: 'MARKETING',
    features: ['Alta Conversão', 'Emojis & Formatação', 'Framework AIDA'],
    warning: 'Custo mais alto por mensagem',
    tone: 'amber',
    Icon: Megaphone,
  },
  {
    id: 'strategy-utility',
    valueKey: 'strategyUtility',
    title: 'Utilidade',
    subtitle: 'Padrão',
    description: 'Foco em avisos e notificações. Linguagem formal, seca e direta.',
    metaCategory: 'UTILITY',
    features: ['Avisos Transacionais', 'Sem Bloqueios', 'Tom Formal'],
    warning: 'Proibido termos de venda',
    tone: 'emerald',
    Icon: Wrench,
  },
  {
    id: 'strategy-bypass',
    valueKey: 'strategyBypass',
    title: 'Camuflado',
    subtitle: 'Bypass',
    description: 'Tenta passar copy de vendas como Utility usando substituição de variáveis.',
    metaCategory: 'UTILITY',
    features: ['Custo Baixo', 'Anti-Spam AI', 'Variáveis Dinâmicas'],
    warning: 'Pode ser rejeitado se abusar',
    tone: 'violet',
    Icon: Drama,
  },
]

// URLs para criação de chaves de API de cada provider
const API_KEY_URLS: Record<AIProvider | 'mistral', { url: string; label: string }> = {
  google: {
    url: 'https://aistudio.google.com/apikey',
    label: 'Google AI Studio',
  },
  openai: {
    url: 'https://platform.openai.com/api-keys',
    label: 'OpenAI Platform',
  },
  anthropic: {
    url: 'https://console.anthropic.com/settings/keys',
    label: 'Anthropic Console',
  },
  mistral: {
    url: 'https://console.mistral.ai/api-keys/',
    label: 'Mistral Console',
  },
}

// Componente de card de estratégia com design distintivo
function StrategyCard({
  strategy,
  value,
  onChange,
}: {
  strategy: StrategyItem
  value: string
  onChange: (next: string) => void
}) {
  const Icon = strategy.Icon
  const [isOpen, setIsOpen] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Prompt copiado')
    } catch (error) {
      console.error('Failed to copy prompt:', error)
      toast.error('Não foi possível copiar o prompt')
    }
  }

  const toneStyles = {
    amber: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
      icon: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
      glow: 'shadow-amber-500/5',
    },
    emerald: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
      icon: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
      glow: 'shadow-emerald-500/5',
    },
    violet: {
      border: 'border-violet-500/30',
      bg: 'bg-violet-500/5',
      icon: 'text-violet-400 border-violet-500/30 bg-violet-500/10',
      badge: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
      glow: 'shadow-violet-500/5',
    },
  }

  const styles = toneStyles[strategy.tone]

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${styles.border} ${styles.bg} hover:shadow-lg ${styles.glow}`}
    >
      {/* Gradient accent line */}
      <div
        className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${
          strategy.tone === 'amber'
            ? 'from-transparent via-amber-400/50 to-transparent'
            : strategy.tone === 'emerald'
              ? 'from-transparent via-emerald-400/50 to-transparent'
              : 'from-transparent via-violet-400/50 to-transparent'
        }`}
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Icon container */}
            <div
              className={`flex size-12 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}
            >
              <Icon className="size-5" />
            </div>

            {/* Title & Meta */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold text-[var(--ds-text-primary)]">
                  {strategy.title}
                </h4>
                <span className="rounded-md bg-[var(--ds-bg-hover)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  {strategy.subtitle}
                </span>
              </div>
              <p className="text-sm text-[var(--ds-text-secondary)]">{strategy.description}</p>

              {/* Meta category badge */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${styles.badge}`}
                >
                  <Target className="size-3" />
                  {strategy.metaCategory}
                </span>
              </div>
            </div>
          </div>

          {/* Edit button */}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition-all ${
              isOpen
                ? `${styles.border} ${styles.bg} text-[var(--ds-text-primary)]`
                : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-surface)]'
            }`}
            aria-expanded={isOpen}
          >
            {isOpen ? 'Fechar' : 'Editar Prompt'}
            {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>

        {/* Features */}
        <div className="mt-4 flex flex-wrap gap-2">
          {strategy.features.map((feature) => (
            <span
              key={feature}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-2.5 py-1 text-xs text-[var(--ds-text-secondary)]"
            >
              <span className={`size-1.5 rounded-full ${
                strategy.tone === 'amber' ? 'bg-amber-400' : strategy.tone === 'emerald' ? 'bg-emerald-400' : 'bg-violet-400'
              }`} />
              {feature}
            </span>
          ))}
        </div>

        {/* Warning */}
        {strategy.warning && (
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
            <Info className="size-3.5" />
            <span>{strategy.warning}</span>
          </div>
        )}

        {/* Expandable editor */}
        {isOpen && (
          <div className="mt-5 space-y-4 border-t border-[var(--ds-border-subtle)] pt-5">
            <textarea
              className={`min-h-[200px] w-full rounded-xl border bg-[var(--ds-bg-surface)] px-4 py-3 font-mono text-sm text-[var(--ds-text-primary)] outline-none transition focus:ring-2 ${
                strategy.tone === 'amber'
                  ? 'border-amber-500/20 focus:border-amber-500/40 focus:ring-amber-500/10'
                  : strategy.tone === 'emerald'
                    ? 'border-emerald-500/20 focus:border-emerald-500/40 focus:ring-emerald-500/10'
                    : 'border-violet-500/20 focus:border-violet-500/40 focus:ring-violet-500/10'
              }`}
              rows={12}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Digite o prompt da estratégia..."
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--ds-text-muted)]">
                <span className="font-medium text-[var(--ds-text-secondary)]">Arquivo original:</span>{' '}
                <code className="rounded bg-[var(--ds-bg-hover)] px-1.5 py-0.5">
                  /lib/ai/prompts/{strategy.id.replace('strategy-', '')}.ts
                </code>
              </div>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                onClick={handleCopy}
              >
                Copiar prompt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: 'emerald' | 'amber' | 'red' | 'zinc'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-[var(--ds-status-success-text)] border-[var(--ds-status-success)]/30 bg-[var(--ds-status-success-bg)]'
      : tone === 'amber'
        ? 'text-[var(--ds-status-warning-text)] border-[var(--ds-status-warning)]/30 bg-[var(--ds-status-warning-bg)]'
        : tone === 'red'
          ? 'text-[var(--ds-status-error-text)] border-[var(--ds-status-error)]/30 bg-[var(--ds-status-error-bg)]'
          : 'text-[var(--ds-text-secondary)] border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  )
}

function MockSwitch({
  on,
  onToggle,
  disabled,
  label,
}: {
  on?: boolean
  onToggle?: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onToggle?.(!on)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition ${
        on ? 'border-emerald-500/40 bg-emerald-500/20' : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`inline-block size-4 rounded-full transition ${
          on ? 'translate-x-6 bg-emerald-300' : 'translate-x-1 bg-[var(--ds-text-muted)]'
        }`}
      />
    </button>
  )
}

function PromptCard({
  item,
  value,
  onChange,
  routeEnabled,
  onToggleRoute,
}: {
  item: PromptItem
  value: string
  onChange: (next: string) => void
  routeEnabled?: boolean
  onToggleRoute?: (next: boolean) => void
}) {
  const Icon = item.Icon
  const [isOpen, setIsOpen] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Prompt copiado')
    } catch (error) {
      console.error('Failed to copy prompt:', error)
      toast.error('Nao foi possivel copiar o prompt')
    }
  }
  return (
    <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-5">
      <div className="flex w-full flex-wrap items-center justify-between gap-4 text-left">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-2 text-[var(--ds-text-primary)]">
            <Icon className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{item.title}</div>
            <div className="mt-1 text-xs text-[var(--ds-text-secondary)]">{item.description}</div>
            <div className="mt-2 inline-flex rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-1 text-xs text-[var(--ds-text-secondary)]">
              {item.path}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {routeEnabled !== undefined && onToggleRoute && (
            <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
              <span>{routeEnabled ? 'Ativa' : 'Desativada'}</span>
              <MockSwitch on={routeEnabled} onToggle={onToggleRoute} label="Ativar rota" />
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="flex items-center gap-2 rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1 text-xs text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
            aria-expanded={isOpen}
          >
            {isOpen ? 'Fechar' : 'Editar'}
            {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <>
          <div className="mt-4">
            <textarea
              className="min-h-[160px] w-full rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-4 py-3 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/10"
              rows={item.rows ?? 6}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ds-text-secondary)]">
            <div className="flex flex-wrap gap-2">
              <span className="font-medium text-[var(--ds-text-primary)]">Variáveis:</span>
              {item.variables.map((v) => (
                <span
                  key={v}
                  className="rounded-full border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-2 py-0.5"
                >
                  {v}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="h-8 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
              onClick={handleCopy}
            >
              Copiar prompt
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function AICenterPage() {
  const {
    isDevMode,
    provider,
    model,
    providerStatuses,
    orderedProviders,
    configuredProvidersCount,
    hasAnyKey,
    primaryModelLabel,
    fallback,
    fallbackSummary,
    routes,
    prompts,
    primaryModelOptions,
    inlineKeyProvider,
    apiKeyDrafts,
    isLoading,
    isSaving,
    isSavingKey,
    errorMessage,
    ocrConfig,
    mistralKeyDraft,
    isSavingOcr,
    showMistralKeyInput,
    isStrategiesOpen,
    handleSave,
    handleProviderSelect,
    handleFallbackMove,
    handleFallbackToggle,
    handleModelChange,
    handleInlineKeyToggle,
    handleApiKeyDraftChange,
    handleSaveKey,
    handleOcrProviderChange,
    handleOcrGeminiModelChange,
    handleSaveMistralKey,
    handleRemoveMistralKey,
    handleMistralKeyInputToggle,
    handlePromptChange,
    handleRouteToggle,
    handleStrategiesToggle,
    setMistralKeyDraft,
    getProviderConfig,
    getModelLabel,
  } = useSettingsAIController()

  return (
    <Page>
      <PageHeader>
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--ds-status-success-text)]">
            <Sparkles className="size-4" />
            Central de IA
          </div>
          <PageTitle>Central de IA</PageTitle>
          <PageDescription>
            Escolha o modelo, publique as rotas. O resto fica invisível.
          </PageDescription>
        </div>
        <PageActions>
          <button
            type="button"
            className="h-10 rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-500 dark:bg-white dark:text-zinc-900 dark:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSave}
            disabled={isLoading || isSaving}
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </PageActions>
      </PageHeader>

      {errorMessage && (
        <div className="mb-4 rounded-2xl border border-[var(--ds-status-error)]/20 bg-[var(--ds-status-error-bg)] px-4 py-3 text-xs text-[var(--ds-status-error-text)]">
          {errorMessage}
        </div>
      )}

      {/* Loading skeleton - evita flash de estado incorreto */}
      {isLoading && (
        <div className="space-y-6 animate-pulse">
          <div className="rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-[var(--ds-bg-hover)]" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-32 rounded bg-[var(--ds-bg-hover)]" />
                <div className="h-3 w-48 rounded bg-[var(--ds-bg-hover)]" />
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-6">
            <div className="space-y-4">
              <div className="h-5 w-40 rounded bg-[var(--ds-bg-hover)]" />
              <div className="h-3 w-64 rounded bg-[var(--ds-bg-hover)]" />
              <div className="space-y-2 mt-4">
                <div className="h-16 rounded-xl bg-[var(--ds-bg-hover)]" />
                <div className="h-16 rounded-xl bg-[var(--ds-bg-hover)]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo principal - só mostra após carregar */}
      {!isLoading && (
        <>
      {/* Quick link to AI Agents */}
      <div className="mb-6">
        <a
          href="/settings/ai/agents"
          className="group flex items-center justify-between rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)] p-4 transition hover:border-emerald-500/30 hover:bg-emerald-500/5"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] p-2 text-emerald-300">
              <Bot className="size-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Agentes de Atendimento</div>
              <div className="text-xs text-[var(--ds-text-secondary)]">Configure os agentes IA para o Inbox</div>
            </div>
          </div>
          <ChevronDown className="size-4 -rotate-90 text-[var(--ds-text-muted)] transition group-hover:text-emerald-300" />
        </a>
      </div>

      <div className="space-y-6">
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-[var(--ds-text-primary)]">Modelo principal</h3>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                {hasAnyKey ? 'Escolha o modelo para produção.' : 'Adicione uma chave de API para começar.'}
              </p>
            </div>
            {/* Só mostra fallback quando tem 2+ chaves */}
            {configuredProvidersCount >= 2 && (
              <div className="flex items-center gap-3 text-xs text-[var(--ds-text-muted)]">
                <span>Fallback automático: {fallbackSummary}</span>
                <MockSwitch
                  on={fallback.enabled}
                  onToggle={handleFallbackToggle}
                  label="Ativar fallback"
                />
              </div>
            )}
          </div>

          <div className="mt-5 space-y-2">
            {orderedProviders.map((providerId, index) => {
              const item = getProviderConfig(providerId)
              if (!item) return null
              const isActive = item.id === provider
              const status = providerStatuses[item.id] ?? { isConfigured: false, source: 'none' as const, tokenPreview: null }
              const isInlineEditing = inlineKeyProvider === item.id
              const statusLabel = isActive
                ? status.isConfigured
                  ? 'Em uso'
                  : 'Sem chave'
                : status.isConfigured
                  ? 'Disponível'
                  : 'Inativa'
              const statusTone =
                status.isConfigured && isActive
                  ? 'emerald'
                  : status.isConfigured
                    ? 'zinc'
                    : 'red'
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 ${
                    isActive
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Só mostra controles de ordem quando tem 2+ chaves */}
                    {configuredProvidersCount >= 2 && (
                      <div className="flex flex-col items-center gap-1 text-xs text-[var(--ds-text-muted)]">
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] transition hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] disabled:opacity-40"
                          onClick={() => handleFallbackMove(item.id, -1)}
                          disabled={index === 0}
                          aria-label="Mover para cima"
                        >
                          <ChevronUp className="size-3" />
                        </button>
                        <span className="text-[11px] font-medium text-[var(--ds-text-secondary)]">{index + 1}</span>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ds-border-default)] text-[var(--ds-text-secondary)] transition hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-text-primary)] disabled:opacity-40"
                          onClick={() => handleFallbackMove(item.id, 1)}
                          disabled={index === orderedProviders.length - 1}
                          aria-label="Mover para baixo"
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[var(--ds-text-primary)]">{item.name}</div>
                        {status.isConfigured && (
                          <div className="text-xs text-[var(--ds-text-secondary)]">
                            Modelo: {isActive ? primaryModelLabel : getModelLabel(item.id, fallback.models?.[item.id] || item.models[0]?.id || '')}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={statusLabel} tone={statusTone} />
                      {isActive ? (
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                          onClick={() => handleInlineKeyToggle(item.id)}
                        >
                          {isInlineEditing
                            ? 'Cancelar'
                            : status.isConfigured
                              ? 'Atualizar chave'
                              : 'Adicionar chave'}
                        </button>
                      ) : status.isConfigured ? (
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                          onClick={() => handleProviderSelect(item.id)}
                        >
                          Definir como padrão
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
                          onClick={() => handleInlineKeyToggle(item.id)}
                        >
                          {isInlineEditing ? 'Cancelar' : 'Adicionar chave'}
                        </button>
                      )}
                      </div>
                    </div>
                  </div>

                  {isActive && status.isConfigured && (
                    <div className="mt-4">
                      <label className="text-xs text-[var(--ds-text-muted)]">Selecionar modelo</label>
                      <div className="relative mt-2">
                        <select
                          value={model}
                          onChange={(event) => handleModelChange(event.target.value)}
                          disabled={!status.isConfigured}
                          className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {primaryModelOptions.map((modelOption) => (
                            <option key={modelOption.id} value={modelOption.id}>
                              {modelOption.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {isInlineEditing && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <input
                        type="password"
                        placeholder="Chave de API"
                        value={apiKeyDrafts[item.id]}
                        onChange={(event) => handleApiKeyDraftChange(item.id, event.target.value)}
                        className="min-w-[220px] flex-1 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40"
                      />
                      <button
                        type="button"
                        className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-500 dark:bg-white dark:text-zinc-900 dark:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleSaveKey(item.id)}
                        disabled={isSavingKey || !apiKeyDrafts[item.id].trim()}
                      >
                        {isSavingKey ? 'Salvando...' : 'Salvar chave'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Nota de ajuda unificada */}
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-tertiary)] px-4 py-2.5 text-xs">
            <span className="text-[var(--ds-text-secondary)]">Obter chave:</span>
            <a href={API_KEY_URLS.google.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline">
              Google <ExternalLink className="size-3" />
            </a>
            {isDevMode && (
              <>
                <span className="text-[var(--ds-text-muted)]">•</span>
                <a href={API_KEY_URLS.openai.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline">
                  OpenAI <ExternalLink className="size-3" />
                </a>
                <span className="text-[var(--ds-text-muted)]">•</span>
                <a href={API_KEY_URLS.anthropic.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline">
                  Anthropic <ExternalLink className="size-3" />
                </a>
              </>
            )}
          </div>
        </section>

        {/* OCR Configuration Section */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-text-primary)]">
                <FileImage className="size-4 text-emerald-300" />
                OCR (Extração de Documentos)
              </div>
              <p className="text-sm text-[var(--ds-text-secondary)]">
                Configure o provider para extrair texto de PDFs e imagens.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {/* Gemini Card */}
            <div
              className={`rounded-xl border p-4 transition ${
                ocrConfig.provider === 'gemini'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]">
                    <span className="text-base">✨</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Gemini</div>
                    <div className="text-xs text-[var(--ds-text-secondary)]">
                      {providerStatuses.google.isConfigured
                        ? 'Usa sua chave Gemini já configurada'
                        : 'Requer chave Gemini configurada acima'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ocrConfig.provider === 'gemini' && providerStatuses.google.isConfigured ? (
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300">
                      Em uso
                    </span>
                  ) : providerStatuses.google.isConfigured ? (
                    <button
                      type="button"
                      onClick={() => handleOcrProviderChange('gemini')}
                      disabled={isSavingOcr}
                      className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                    >
                      Usar Gemini
                    </button>
                  ) : (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
                      Sem chave
                    </span>
                  )}
                </div>
              </div>

              {/* Gemini Model Selection - shown when Gemini is active */}
              {ocrConfig.provider === 'gemini' && providerStatuses.google.isConfigured && (
                <div className="mt-4 border-t border-[var(--ds-border-subtle)] pt-4">
                  <label className="text-xs text-[var(--ds-text-muted)]">Modelo para OCR</label>
                  <div className="mt-2">
                    <select
                      value={ocrConfig.geminiModel}
                      onChange={(e) => handleOcrGeminiModelChange(e.target.value)}
                      disabled={isSavingOcr}
                      className="w-full rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {OCR_GEMINI_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.price}) - {m.desc}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Mistral Card */}
            <div
              className={`rounded-xl border p-4 transition ${
                ocrConfig.provider === 'mistral'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-[var(--ds-border-default)] bg-[var(--ds-bg-elevated)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)]">
                    <span className="text-base">🔮</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--ds-text-primary)]">Mistral</div>
                    <div className="text-xs text-[var(--ds-text-secondary)]">
                      {ocrConfig.mistralStatus.isConfigured
                        ? ocrConfig.mistralStatus.tokenPreview
                          ? `Chave: ${ocrConfig.mistralStatus.tokenPreview}`
                          : 'Chave configurada'
                        : 'Qualidade superior para tabelas'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ocrConfig.provider === 'mistral' ? (
                    <>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300">
                        Em uso
                      </span>
                      <button
                        type="button"
                        onClick={handleMistralKeyInputToggle}
                        className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                      >
                        {showMistralKeyInput ? 'Cancelar' : 'Atualizar chave'}
                      </button>
                    </>
                  ) : ocrConfig.mistralStatus.isConfigured ? (
                    <button
                      type="button"
                      onClick={() => handleOcrProviderChange('mistral')}
                      disabled={isSavingOcr}
                      className="rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-primary)] transition hover:bg-[var(--ds-bg-surface)]"
                    >
                      Usar Mistral
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleMistralKeyInputToggle}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20"
                    >
                      {showMistralKeyInput ? 'Cancelar' : 'Adicionar chave'}
                    </button>
                  )}
                </div>
              </div>

              {/* Mistral Key Input - shown when adding/updating key */}
              {showMistralKeyInput && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--ds-border-subtle)] pt-4">
                  <input
                    type="password"
                    placeholder="Chave de API do Mistral"
                    value={mistralKeyDraft}
                    onChange={(e) => setMistralKeyDraft(e.target.value)}
                    className="min-w-[220px] flex-1 rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-surface)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none transition focus:border-emerald-500/40"
                  />
                  <button
                    type="button"
                    onClick={handleSaveMistralKey}
                    disabled={isSavingOcr || !mistralKeyDraft.trim()}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-500 dark:bg-white dark:text-zinc-900 dark:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingOcr ? 'Salvando...' : 'Salvar chave'}
                  </button>
                  {ocrConfig.mistralStatus.isConfigured &&
                    ocrConfig.mistralStatus.source === 'database' && (
                      <button
                        type="button"
                        onClick={handleRemoveMistralKey}
                        disabled={isSavingOcr}
                        className="flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        <Trash2 className="size-3" />
                        Remover
                      </button>
                    )}
                </div>
              )}
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-tertiary)] p-3 text-xs text-[var(--ds-text-secondary)]">
              <Info className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <div className="space-y-2">
                <span>
                  O OCR converte PDFs e imagens em texto antes de indexar na base de conhecimento
                  dos agentes. Escolha Gemini para custo-benefício ou Mistral para melhor precisão
                  em tabelas complexas.
                </span>
                <div className="flex items-center gap-2">
                  <span>Obter chave:</span>
                  <a href={API_KEY_URLS.mistral.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline">
                    Mistral <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Mem0 Memory Section */}
        <Mem0Panel />

        {/* AI Gateway Section - DESABILITADO temporariamente (bug #11280: BYOK não funciona com créditos zerados)
        <AIGatewayPanel />
        */}

        {/* Helicone Observability Section (usado quando Gateway desabilitado) */}
        <HeliconePanel />

        {/* Template Strategies Section - Collapsible */}
        <section className="relative overflow-hidden rounded-2xl border border-[var(--ds-border-default)] bg-gradient-to-br from-[var(--ds-bg-elevated)] to-[var(--ds-bg-surface)]">
          {/* Background pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.02]">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }} />
          </div>

          <div className="relative p-6">
            {/* Header - Clickable */}
            <button
              type="button"
              onClick={handleStrategiesToggle}
              className="flex w-full flex-wrap items-center justify-between gap-4 text-left"
              aria-expanded={isStrategiesOpen}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 via-emerald-500/20 to-violet-500/20">
                    <Target className="size-4 text-[var(--ds-text-primary)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--ds-text-primary)]">
                    Estratégias de Template
                  </h3>
                </div>
                <p className="text-sm text-[var(--ds-text-secondary)]">
                  Configure os prompts de cada personalidade para geração de templates Meta.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    MARKETING
                  </span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    UTILITY
                  </span>
                  <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                    BYPASS
                  </span>
                </div>
                <div className={`flex size-8 items-center justify-center rounded-lg border border-[var(--ds-border-default)] bg-[var(--ds-bg-hover)] text-[var(--ds-text-secondary)] transition-transform duration-200 ${isStrategiesOpen ? 'rotate-180' : ''}`}>
                  <ChevronDown className="size-4" />
                </div>
              </div>
            </button>

            {/* Collapsible Content */}
            {isStrategiesOpen && (
              <>
                {/* Strategy Cards */}
                <div className="mt-6 space-y-4">
                  {TEMPLATE_STRATEGIES.map((strategy) => (
                    <StrategyCard
                      key={strategy.id}
                      strategy={strategy}
                      value={prompts[strategy.valueKey] ?? ''}
                      onChange={(nextValue) => handlePromptChange(strategy.valueKey, nextValue)}
                    />
                  ))}
                </div>

                {/* AI Judge Card - Componente de validação */}
                <div className="mt-6">
                  <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--ds-text-muted)]">
                    <div className="h-px flex-1 bg-[var(--ds-border-subtle)]" />
                    <span>Validação</span>
                    <div className="h-px flex-1 bg-[var(--ds-border-subtle)]" />
                  </div>
                  <PromptCard
                    item={{
                      id: 'ai-judge',
                      valueKey: 'utilityJudgeTemplate',
                      title: 'AI Judge (classificação)',
                      description: 'Analisa se o template é UTILITY ou MARKETING e sugere correções automáticas.',
                      path: '/lib/ai/prompts/utility-judge.ts',
                      variables: ['{{header}}', '{{body}}'],
                      rows: 18,
                      Icon: ShieldCheck,
                    }}
                    value={prompts.utilityJudgeTemplate ?? ''}
                    onChange={(nextValue) => handlePromptChange('utilityJudgeTemplate', nextValue)}
                  />
                </div>

                {/* Info note */}
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-tertiary)]/50 p-4 text-xs text-[var(--ds-text-secondary)]">
                  <Info className="mt-0.5 size-4 shrink-0 text-[var(--ds-text-muted)]" />
                  <div className="space-y-1">
                    <p>
                      Estas estratégias são usadas no fluxo de criação de templates em{' '}
                      <code className="rounded bg-[var(--ds-bg-hover)] px-1.5 py-0.5 text-[var(--ds-text-primary)]">
                        /templates/new
                      </code>.
                      O usuário escolhe a personalidade e o prompt correspondente guia a geração.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ds-text-primary)]">
                <Wand2 className="size-4 text-emerald-300" />
                Prompts do sistema
              </div>
              <p className="text-sm text-[var(--ds-text-secondary)]">Edite os prompts sem sair daqui.</p>
            </div>
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              {PROMPTS.length} prompts configuráveis
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {PROMPTS.map((item) => (
              <PromptCard
                key={item.id}
                item={item}
                value={prompts[item.valueKey] ?? ''}
                onChange={(nextValue) => handlePromptChange(item.valueKey, nextValue)}
                routeEnabled={item.routeKey ? routes[item.routeKey] : undefined}
                onToggleRoute={
                  item.routeKey
                    ? (next) => handleRouteToggle(item.routeKey as keyof AiRoutesConfig, next)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      </div>
        </>
      )}
    </Page>
  )
}
