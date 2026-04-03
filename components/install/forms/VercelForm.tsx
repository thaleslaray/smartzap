'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TokenInput } from '../TokenInput';
import { ValidatingOverlay } from '../ValidatingOverlay';
import { SuccessCheckmark } from '../SuccessCheckmark';
import { VALIDATION, normalizeToken } from '@/lib/installer/types';
import type { FormProps } from './types';

/**
 * Form de token Vercel - Tema Blade Runner.
 * "Estabelecer Link Neural" - conexão com servidor de deploy.
 */
export function VercelForm({ data, onComplete, onBack, showBack }: FormProps) {
  const [token, setToken] = useState(data.vercelToken);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  const handleValidate = async () => {
    if (normalizeToken(token).length < VALIDATION.VERCEL_TOKEN_MIN_LENGTH) {
      setError('Credenciais insuficientes');
      return;
    }

    setValidating(true);
    setError(null);

    // Tempo mínimo para apreciar a narrativa
    const MIN_VALIDATION_TIME = 2500;
    const startTime = Date.now();

    try {
      const res = await fetch('/api/installer/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: normalizeToken(token),
          domain: window.location.hostname,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Credenciais inválidas');
      }

      // Garantir tempo mínimo de exibição
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise(r => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }

      setProjectName(result.project?.name || 'Link estabelecido');
      setSuccess(true);
    } catch (err) {
      // Também garantir tempo mínimo em erro (para não parecer que nem tentou)
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise(r => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }
      setError(err instanceof Error ? err.message : 'Falha na conexão');
      setToken('');
    } finally {
      setValidating(false);
    }
  };

  const handleSuccessComplete = () => {
    onComplete({ vercelToken: normalizeToken(token) });
  };

  if (success) {
    return (
      <SuccessCheckmark
        message={projectName ? `Projeto "${projectName}" localizado` : 'Link neural estabelecido'}
        onComplete={handleSuccessComplete}
      />
    );
  }

  return (
    <div className="relative space-y-5">
      <ValidatingOverlay
        isVisible={validating}
        message="Executando Voight-Kampff..."
        subMessage="Verificando autenticidade"
      />

      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-magenta)]/30 flex items-center justify-center">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 19.5h20L12 2z" className="text-[var(--br-neon-magenta)]" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Estabelecer Link Neural
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Conexão com servidor de deploy
        </p>
      </div>

      {/* Token Input */}
      <TokenInput
        value={token}
        onChange={(val) => {
          setToken(val);
          setError(null);
        }}
        placeholder="paste_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        validating={validating}
        error={error || undefined}
        minLength={VALIDATION.VERCEL_TOKEN_MIN_LENGTH}
        autoSubmitLength={VALIDATION.VERCEL_TOKEN_MIN_LENGTH}
        onAutoSubmit={handleValidate}
        showCharCount={false}
        accentColor="magenta"
        autoFocus
      />

      {/* Dica de formato */}
      {!validating && !error && !token && (
        <p className="text-center text-xs font-mono text-[var(--br-dust-gray)]/60">
          Token começa com letras e números (24+ caracteres)
        </p>
      )}

      {/* Collapsible help - esconde durante validação */}
      {!validating && (
      <details className="w-full group">
        <summary className="flex items-center justify-center gap-1.5 text-sm font-mono text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)] cursor-pointer list-none transition-colors">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          como obter credenciais?
        </summary>
        <div className="mt-3 p-3 rounded-lg bg-[var(--br-void-black)]/50 border border-[var(--br-dust-gray)]/30 text-left space-y-2">
          <ol className="text-xs font-mono text-[var(--br-muted-cyan)] space-y-1.5 list-decimal list-inside">
            <li>
              Acesse{' '}
              <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-[var(--br-neon-magenta)] hover:underline">
                vercel.com/account/tokens
              </a>
            </li>
            <li>
              Clique em <strong className="text-[var(--br-hologram-white)]">Create</strong>
            </li>
            <li>
              Nome: <strong className="text-[var(--br-hologram-white)]">smartzap</strong> • Scope: <strong className="text-[var(--br-hologram-white)]">Full Account</strong>
            </li>
            <li>Copie e cole as credenciais acima</li>
          </ol>
        </div>
      </details>
      )}
    </div>
  );
}
