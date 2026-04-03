'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TokenInput } from '../TokenInput';
import { ValidatingOverlay } from '../ValidatingOverlay';
import { SuccessCheckmark } from '../SuccessCheckmark';
import { VALIDATION, normalizeToken } from '@/lib/installer/types';
import type { FormProps } from './types';

/**
 * Form de token QStash - Tema Blade Runner.
 * "Sistema de Transmissão" - filas de mensagens neurais.
 */
export function QStashForm({ data, onComplete, onBack, showBack }: FormProps) {
  const [token, setToken] = useState(data.qstashToken);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeToken(token);
  const isValidFormat =
    normalized.startsWith('eyJ') ||
    normalized.startsWith('qstash_') ||
    normalized.split('.').length === 3;

  const canValidate = isValidFormat && normalized.length >= VALIDATION.QSTASH_TOKEN_MIN_LENGTH;

  const handleValidate = async () => {
    if (!canValidate) {
      setError('Token deve começar com eyJ ou qstash_');
      return;
    }

    setValidating(true);
    setError(null);

    // Tempo mínimo para apreciar a narrativa
    const MIN_VALIDATION_TIME = 2500;
    const startTime = Date.now();

    try {
      const res = await fetch('/api/installer/qstash/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: normalized }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Credenciais inválidas');
      }

      // Garantir tempo mínimo de exibição
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_VALIDATION_TIME) {
        await new Promise(r => setTimeout(r, MIN_VALIDATION_TIME - elapsed));
      }

      setSuccess(true);
    } catch (err) {
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
    onComplete({ qstashToken: normalized });
  };

  const handleAutoSubmit = () => {
    if (canValidate) {
      handleValidate();
    }
  };

  if (success) {
    return (
      <SuccessCheckmark
        message="Canal de transmissão ativo"
        onComplete={handleSuccessComplete}
      />
    );
  }

  return (
    <div className="relative space-y-5">
      <ValidatingOverlay
        isVisible={validating}
        message="Testando frequência..."
        subMessage="Verificando canal de transmissão"
      />

      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-orange)]/30 flex items-center justify-center">
          <svg className="w-7 h-7 text-[var(--br-neon-orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Sistema de Transmissão
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Filas de mensagens neurais
        </p>
      </div>

      {/* Token Input */}
      <TokenInput
        value={token}
        onChange={(val) => {
          setToken(val);
          setError(null);
        }}
        placeholder="eyJ... ou qstash_..."
        validating={validating}
        error={error || undefined}
        minLength={VALIDATION.QSTASH_TOKEN_MIN_LENGTH}
        autoSubmitLength={VALIDATION.QSTASH_TOKEN_MIN_LENGTH}
        onAutoSubmit={handleAutoSubmit}
        showCharCount={false}
        accentColor="orange"
        autoFocus
      />

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
              Crie uma conta gratuita no{' '}
              <a href="https://console.upstash.com" target="_blank" rel="noopener noreferrer" className="text-[var(--br-neon-orange)] hover:underline">
                Upstash
              </a>
            </li>
            <li>
              Selecione qualquer região{' '}
              <span className="text-[var(--br-dust-gray)]">(US ou EU — ambas funcionam)</span>
            </li>
            <li>
              Clique em <strong className="text-[var(--br-hologram-white)]">QStash</strong> no menu lateral
            </li>
            <li>
              Copie o <strong className="text-[var(--br-hologram-white)]">QSTASH_TOKEN</strong> na aba Details{' '}
              <span className="text-[var(--br-dust-gray)]">(sem aspas)</span>
            </li>
          </ol>
          {/* Formatos válidos do token */}
          <div className="mt-2 pt-2 border-t border-[var(--br-dust-gray)]/20">
            <p className="text-xs font-mono text-[var(--br-dust-gray)] mb-1">Formatos válidos do QSTASH_TOKEN:</p>
            <ul className="text-xs font-mono text-[var(--br-muted-cyan)] space-y-0.5 list-none">
              <li><span className="text-[var(--br-neon-orange)]">eyJ</span>xxxxxxxxx... (JWT — mais comum)</li>
              <li><span className="text-[var(--br-neon-orange)]">qstash_</span>xxxxxxxxx... (prefixo)</li>
            </ul>
            <p className="text-xs font-mono text-[var(--br-dust-gray)] mt-1">
              Copie exatamente como aparece, sem aspas.
            </p>
          </div>
        </div>
      </details>
      )}
    </div>
  );
}
