'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Pause, Loader2, Info, AlertCircle } from 'lucide-react';
import { TokenInput } from '../TokenInput';
import { ValidatingOverlay } from '../ValidatingOverlay';
import { SuccessCheckmark } from '../SuccessCheckmark';
import { VALIDATION, normalizeToken } from '@/lib/installer/types';
import { cn } from '@/lib/utils';
import type { FormProps } from './types';

// =============================================================================
// TYPES
// =============================================================================

type UiStep = 'pat' | 'deciding' | 'needspace' | 'done';

interface ActiveProject {
  ref: string;
  name: string;
  status: string;
  region?: string;
  orgSlug: string;
  orgName: string;
}

interface PreflightResult {
  ok: boolean;
  freeGlobalLimitHit: boolean;
  suggestedOrganizationSlug: string | null;
  allFreeActiveProjects: ActiveProject[];
}

// =============================================================================
// HELPERS
// =============================================================================

function humanizeError(message: string): string {
  const lower = String(message || '').toLowerCase();
  if (
    lower.includes('maximum limits') ||
    lower.includes('2 project limit') ||
    lower.includes('limit of 2 active projects')
  ) {
    return 'Capacidade de memória excedida. Hiberne uma unidade existente para continuar.';
  }
  if (lower.includes('timeout')) {
    return 'Protocolo de hibernação excedeu tempo limite. Tente novamente.';
  }
  return message;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Form de PAT Supabase - Tema Blade Runner.
 * "Configurar Memória Base" - banco de dados para implantes.
 *
 * Fluxo:
 * 1. pat: Coleta o PAT do usuário
 * 2. deciding: Faz preflight check para verificar slots disponíveis
 * 3. needspace: Se não houver slot, mostra UI para pausar projetos existentes
 * 4. done: Tudo OK, avança para próximo step
 */
export function SupabaseForm({ data, onComplete, onBack, showBack }: FormProps) {
  // UI State
  const [uiStep, setUiStep] = useState<UiStep>('pat');
  const [pat, setPat] = useState(data.supabasePat);

  // Validation State
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  // Preflight State
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);

  // Pause State
  const [pausingRef, setPausingRef] = useState<string | null>(null);
  const [pausePolling, setPausePolling] = useState(false);

  const isValidFormat =
    normalizeToken(pat).startsWith(VALIDATION.SUPABASE_PAT_PREFIX) &&
    normalizeToken(pat).length >= VALIDATION.SUPABASE_PAT_MIN_LENGTH;

  // Lista de projetos free ativos para a UI de needspace
  const freeActiveProjects = useMemo(() => {
    return preflight?.allFreeActiveProjects || [];
  }, [preflight]);

  // ---------------------------------------------------------------------------
  // PREFLIGHT CHECK
  // ---------------------------------------------------------------------------

  const runPreflight = useCallback(async (): Promise<PreflightResult | null> => {
    try {
      const res = await fetch('/api/installer/supabase/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: normalizeToken(pat) }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Erro no preflight');
      }

      return result as PreflightResult;
    } catch (err) {
      setError(humanizeError(err instanceof Error ? err.message : 'Erro desconhecido'));
      return null;
    }
  }, [pat]);

  // ---------------------------------------------------------------------------
  // DECIDE AND PROCEED
  // ---------------------------------------------------------------------------

  const decideAndProceed = useCallback(
    async (preflightResult: PreflightResult) => {
      // Se há uma org sugerida (paga ou free com slot), podemos prosseguir
      if (preflightResult.suggestedOrganizationSlug) {
        setUiStep('done');
        return;
      }

      // Sem slots disponíveis - mostra UI para pausar
      setUiStep('needspace');
    },
    []
  );

  // ---------------------------------------------------------------------------
  // VALIDATE PAT
  // ---------------------------------------------------------------------------

  const handleValidate = async () => {
    if (!isValidFormat) {
      setError(`Token deve começar com ${VALIDATION.SUPABASE_PAT_PREFIX}`);
      return;
    }

    setValidating(true);
    setError(null);
    setUiStep('deciding');

    const MIN_VALIDATION_TIME = 2000;
    const startTime = Date.now();

    try {
      // Run preflight check
      const preflightResult = await runPreflight();

      if (!preflightResult) {
        setUiStep('pat');
        return;
      }

      setPreflight(preflightResult);

      // Garantir tempo mínimo de exibição
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise((r) => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }

      // Decide next step
      await decideAndProceed(preflightResult);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise((r) => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }
      setError(humanizeError(err instanceof Error ? err.message : 'Falha na autenticação'));
      setUiStep('pat');
      setPat('');
    } finally {
      setValidating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // PAUSE PROJECT
  // ---------------------------------------------------------------------------

  const pollProjectStatus = async (projectRef: string): Promise<{ ok: boolean; error?: string }> => {
    const maxMs = 180_000; // 3 min
    const intervalMs = 2000;
    const startTime = Date.now();
    let lastError: string | null = null;

    while (Date.now() - startTime < maxMs) {
      try {
        const res = await fetch('/api/installer/supabase/project-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: normalizeToken(pat),
            projectRef,
          }),
        });

        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          lastError = errorBody?.error || `HTTP ${res.status}`;
          await new Promise((r) => setTimeout(r, intervalMs));
          continue;
        }

        const data = await res.json();
        const status = String(data?.status || '').toUpperCase();

        // INACTIVE ou PAUSED significa que foi pausado
        if (status === 'INACTIVE' || status.includes('PAUSED') || status.startsWith('INACTIVE')) {
          return { ok: true };
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Erro desconhecido';
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return {
      ok: false,
      error: lastError ? `Timeout aguardando projeto pausar (${lastError})` : 'Timeout aguardando projeto pausar',
    };
  };

  const handlePauseProject = async (projectRef: string) => {
    setPausingRef(projectRef);
    setPausePolling(true);
    setError(null);

    try {
      // 1. Solicita pause
      const pauseRes = await fetch('/api/installer/supabase/pause-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: normalizeToken(pat),
          projectRef,
        }),
      });

      if (!pauseRes.ok) {
        const pauseData = await pauseRes.json();
        throw new Error(pauseData.error || 'Erro ao pausar projeto');
      }

      // 2. Poll até pausar
      const pauseResult = await pollProjectStatus(projectRef);
      if (!pauseResult.ok) {
        throw new Error(pauseResult.error || 'Timeout aguardando projeto pausar. Tente novamente.');
      }

      // 3. Rerun preflight
      const newPreflight = await runPreflight();

      if (!newPreflight) {
        throw new Error('Erro ao verificar status após pause');
      }

      setPreflight(newPreflight);

      // 4. Decide novamente
      await decideAndProceed(newPreflight);
    } catch (err) {
      setError(humanizeError(err instanceof Error ? err.message : 'Erro ao pausar'));
    } finally {
      setPausingRef(null);
      setPausePolling(false);
    }
  };

  // ---------------------------------------------------------------------------
  // SUCCESS HANDLER
  // ---------------------------------------------------------------------------

  const handleSuccessComplete = () => {
    onComplete({ supabasePat: normalizeToken(pat) });
  };

  const handleAutoSubmit = () => {
    if (isValidFormat) {
      handleValidate();
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER: SUCCESS
  // ---------------------------------------------------------------------------

  if (uiStep === 'done') {
    return (
      <SuccessCheckmark
        message={orgName ? `Setor "${orgName}" localizado` : 'Memória base pronta'}
        onComplete={handleSuccessComplete}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: NEEDSPACE (Pause Projects UI)
  // ---------------------------------------------------------------------------

  if (uiStep === 'needspace') {
    return (
      <motion.div
        key="needspace"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="space-y-5"
      >
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-orange)]/30 flex items-center justify-center">
            <Pause className="w-7 h-7 text-[var(--br-neon-orange)]" />
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
            Setores de Memória Ocupados
          </h2>
          <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
            Capacidade máxima: 2 unidades ativas.
            <br />
            Hiberne uma unidade para continuar a incubação:
          </p>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-3 rounded-lg bg-[var(--br-neon-pink)]/10 border border-[var(--br-neon-pink)]/30"
          >
            <AlertCircle className="w-4 h-4 text-[var(--br-neon-pink)] shrink-0" />
            <span className="text-sm font-mono text-[var(--br-neon-pink)]">{error}</span>
          </motion.div>
        )}

        {/* Pausing State */}
        {pausePolling ? (
          <div className="p-4 rounded-xl bg-[var(--br-neon-orange)]/10 border border-[var(--br-neon-orange)]/30">
            <div className="flex items-center gap-3 text-[var(--br-neon-orange)]">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <p className="text-sm font-mono">
                Iniciando protocolo de hibernação. Aguarde…
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Project List */}
            <div className="space-y-3">
              {freeActiveProjects.map((p) => (
                <div
                  key={p.ref}
                  className={cn(
                    'flex items-center justify-between gap-4 p-4 rounded-xl',
                    'bg-[var(--br-void-black)]/50 border border-[var(--br-dust-gray)]/30'
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-[var(--br-hologram-white)] font-medium font-mono truncate">
                      {p.name}
                    </div>
                    <div className="text-[var(--br-dust-gray)] text-sm font-mono truncate">
                      {p.orgName}
                    </div>
                  </div>
                  <button
                    onClick={() => handlePauseProject(p.ref)}
                    disabled={pausingRef === p.ref || pausePolling}
                    className={cn(
                      'px-4 py-2 rounded-lg font-mono text-sm font-medium',
                      'bg-[var(--br-neon-orange)] hover:bg-[var(--br-neon-orange)]/80',
                      'text-[var(--br-void-black)]',
                      'transition-all duration-200',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'shrink-0'
                    )}
                  >
                    {pausingRef === p.ref ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'HIBERNAR'
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Info */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--br-void-black)]/50 border border-[var(--br-dust-gray)]/30">
              <Info className="w-5 h-5 text-[var(--br-neon-cyan)] shrink-0 mt-0.5" />
              <span className="text-sm font-mono text-[var(--br-muted-cyan)]">
                Unidades hibernadas podem ser reativadas a qualquer momento no setor de controle Supabase.
              </span>
            </div>
          </>
        )}
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: PAT INPUT (default)
  // ---------------------------------------------------------------------------

  return (
    <div className="relative space-y-5">
      <ValidatingOverlay
        isVisible={validating || uiStep === 'deciding'}
        message="Escaneando setores de memória..."
        subMessage="Verificando capacidade disponível"
      />

      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-cyan)]/30 flex items-center justify-center">
          <svg
            className="w-7 h-7 text-[var(--br-neon-cyan)]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M21.362 9.354H12V.396a.396.396 0 00-.716-.233L2.203 12.424l-.401.562a1.04 1.04 0 00.836 1.659H12v8.959a.396.396 0 00.716.233l9.081-12.261.401-.562a1.04 1.04 0 00-.836-1.66z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Configurar Memória Base
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Banco de dados para implantes
        </p>
      </div>

      {/* Token Input */}
      <TokenInput
        value={pat}
        onChange={(val) => {
          setPat(val);
          setError(null);
        }}
        placeholder="sbp_..."
        validating={validating}
        error={error || undefined}
        minLength={VALIDATION.SUPABASE_PAT_MIN_LENGTH}
        autoSubmitLength={VALIDATION.SUPABASE_PAT_MIN_LENGTH}
        onAutoSubmit={handleAutoSubmit}
        showCharCount={false}
        accentColor="cyan"
        autoFocus
      />

      {/* Collapsible help - esconde durante validação */}
      {!validating && uiStep === 'pat' && (
        <details className="w-full group">
          <summary className="flex items-center justify-center gap-1.5 text-sm font-mono text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)] cursor-pointer list-none transition-colors">
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            como obter credenciais?
          </summary>
          <div className="mt-3 p-3 rounded-lg bg-[var(--br-void-black)]/50 border border-[var(--br-dust-gray)]/30 text-left space-y-2">
            <ol className="text-xs font-mono text-[var(--br-muted-cyan)] space-y-1.5 list-decimal list-inside">
              <li>
                Acesse{' '}
                <a
                  href="https://supabase.com/dashboard/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--br-neon-cyan)] hover:underline"
                >
                  supabase.com/dashboard/account/tokens
                </a>
              </li>
              <li>
                Clique em{' '}
                <strong className="text-[var(--br-hologram-white)]">Generate new token</strong>
              </li>
              <li>
                Nome: <strong className="text-[var(--br-hologram-white)]">smartzap</strong>
              </li>
              <li>Copie o token (começa com sbp_)</li>
            </ol>
            <p className="text-xs font-mono text-[var(--br-dust-gray)] mt-2 pt-2 border-t border-[var(--br-dust-gray)]/30">
              Uma nova unidade será criada automaticamente durante incubação.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}
