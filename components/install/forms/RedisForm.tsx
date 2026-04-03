'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { TokenInput } from '../TokenInput';
import { ValidatingOverlay } from '../ValidatingOverlay';
import { SuccessCheckmark } from '../SuccessCheckmark';
import { VALIDATION, normalizeToken } from '@/lib/installer/types';
import type { FormProps } from './types';

/**
 * Form de credenciais Redis - Tema Blade Runner.
 * "Cache de Memórias" - armazenamento temporário.
 */
export function RedisForm({ data, onComplete, onBack, showBack }: FormProps) {
  const [restUrl, setRestUrl] = useState(data.redisRestUrl);
  const [restToken, setRestToken] = useState(data.redisRestToken);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoValidateTimer = useRef<NodeJS.Timeout | null>(null);
  const validateInFlightRef = useRef(false);

  const isValidUrl = restUrl.trim().startsWith('https://') && restUrl.trim().includes('.upstash.io');
  const normalizedToken = normalizeToken(restToken);
  const isValidToken = normalizedToken.length >= VALIDATION.REDIS_TOKEN_MIN_LENGTH && /^[A-Za-z0-9_=-]+$/.test(normalizedToken);
  const canValidate = isValidUrl && isValidToken;

  const handleValidate = async () => {
    if (validateInFlightRef.current) {
      return;
    }
    if (!canValidate) {
      setError('Preencha URL e Token válidos');
      return;
    }

    validateInFlightRef.current = true;
    setValidating(true);
    setError(null);

    // Tempo mínimo para apreciar a narrativa
    const MIN_VALIDATION_TIME = 2500;
    const startTime = Date.now();

    try {
      const res = await fetch('/api/installer/redis/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restUrl: restUrl.trim(),
          restToken: normalizedToken,
        }),
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
      setRestUrl('');
      setRestToken('');
    } finally {
      setValidating(false);
      validateInFlightRef.current = false;
    }
  };

  const handleSuccessComplete = () => {
    onComplete({
      redisRestUrl: restUrl.trim(),
      redisRestToken: normalizedToken,
    });
  };

  // Auto-validar quando ambos campos estiverem válidos
  useEffect(() => {
    if (autoValidateTimer.current) {
      clearTimeout(autoValidateTimer.current);
    }

    if (canValidate && !validating && !validateInFlightRef.current && !success && !error) {
      autoValidateTimer.current = setTimeout(() => {
        handleValidate();
      }, 800);
    }

    return () => {
      if (autoValidateTimer.current) {
        clearTimeout(autoValidateTimer.current);
      }
    };
  }, [restUrl, restToken, canValidate, validating, success, error]);

  if (success) {
    return (
      <SuccessCheckmark
        message="Cache de memórias online • Iniciando incubação..."
        onComplete={handleSuccessComplete}
      />
    );
  }

  return (
    <div className="relative space-y-5">
      <ValidatingOverlay
        isVisible={validating}
        message="Testando conexão..."
        subMessage="Verificando cache de memórias"
      />

      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[var(--br-deep-navy)] border border-[var(--br-neon-pink)]/30 flex items-center justify-center">
          <svg className="w-7 h-7 text-[var(--br-neon-pink)]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-wide text-[var(--br-hologram-white)] uppercase">
          Cache de Memórias
        </h2>
        <p className="mt-1 text-sm text-[var(--br-muted-cyan)] font-mono">
          Armazenamento temporário
        </p>
      </div>

      {/* REST URL */}
      <div>
        <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
          {'>'} Endpoint
        </label>
        <TokenInput
          value={restUrl}
          onChange={(val) => {
            setRestUrl(val);
            setError(null);
          }}
          placeholder="https://xxx-xxx.upstash.io"
          validating={false}
          success={isValidUrl && restUrl.length > 0}
          error={restUrl.length > 0 && !isValidUrl ? 'Formato: https://xxx.upstash.io' : undefined}
          minLength={20}
          showCharCount={false}
          accentColor="red"
          masked={false}
          autoFocus
        />
      </div>

      {/* REST Token */}
      <div>
        <label className="block text-xs font-mono text-[var(--br-muted-cyan)] mb-2 uppercase tracking-wider">
          {'>'} Chave de Acesso
        </label>
        <TokenInput
          value={restToken}
          onChange={(val) => {
            setRestToken(val);
            setError(null);
          }}
          placeholder="AXxxxxxxxxxxxxxxxxxxxx"
          validating={false}
          success={isValidToken && restToken.length > 0}
          error={error || (restToken.length > 0 && !isValidToken ? 'Token deve ter 30+ caracteres alfanuméricos' : undefined)}
          minLength={VALIDATION.REDIS_TOKEN_MIN_LENGTH}
          showCharCount={false}
          accentColor="red"
        />
      </div>

      {/* Status de validação automática */}
      {canValidate && !validating && !success && !error && (
        <p className="text-xs font-mono text-[var(--br-neon-pink)] text-center animate-pulse">
          Validando automaticamente...
        </p>
      )}

      {/* Collapsible help - esconde durante validação */}
      {!validating && (
      <details className="w-full group">
        <summary className="flex items-center justify-center gap-1.5 text-sm font-mono text-[var(--br-dust-gray)] hover:text-[var(--br-muted-cyan)] cursor-pointer list-none transition-colors">
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
          como criar um cache?
        </summary>
        <div className="mt-3 p-3 rounded-lg bg-[var(--br-void-black)]/50 border border-[var(--br-dust-gray)]/30 text-left space-y-2">
          <ol className="text-xs font-mono text-[var(--br-muted-cyan)] space-y-1.5 list-decimal list-inside">
            <li>
              Acesse o{' '}
              <a href="https://console.upstash.com/redis" target="_blank" rel="noopener noreferrer" className="text-[var(--br-neon-pink)] hover:underline">
                console Upstash Redis
              </a>
            </li>
            <li>
              Clique em <strong className="text-[var(--br-hologram-white)]">Create Database</strong>
            </li>
            <li>
              Nome: <strong className="text-[var(--br-hologram-white)]">smartzap</strong> • Região: <strong className="text-[var(--br-hologram-white)]">São Paulo</strong>
            </li>
            <li>
              Após criar, vá na aba <strong className="text-[var(--br-hologram-white)]">REST API</strong>
            </li>
            <li>Copie a URL e o Token</li>
          </ol>
        </div>
      </details>
      )}
    </div>
  );
}
