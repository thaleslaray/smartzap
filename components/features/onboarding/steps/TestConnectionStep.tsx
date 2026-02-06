'use client';

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, PartyPopper, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepHeader } from './StepHeader';
import { toast } from 'sonner';
import { settingsService } from '@/services/settingsService';

/**
 * Sanitiza o access token removendo caracteres não-ASCII que podem
 * causar erro "ByteString" ao fazer requests HTTP.
 */
function sanitizeAccessToken(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[^\x00-\x7F]/g, '').replace(/\s/g, '').trim();
}

/**
 * Traduz erros técnicos em mensagens amigáveis para o usuário.
 */
function getUserFriendlyError(error: any): { title: string; description: string } {
  const msg = String(error?.message || '').toLowerCase();

  if (msg.includes('bytestring') || msg.includes('character at index')) {
    return {
      title: 'Token contém caracteres inválidos',
      description: 'O token parece ter caracteres especiais. Volte ao passo anterior e cole novamente.',
    };
  }

  if (msg.includes('bad signature') || msg.includes('signature') || msg.includes('malformed')) {
    return {
      title: 'Token corrompido ou incompleto',
      description: 'O token não está completo. Copie novamente do Meta Business Manager.',
    };
  }

  if (msg.includes('token') && (msg.includes('invalid') || msg.includes('expired') || msg.includes('expirado'))) {
    return {
      title: 'Token inválido ou expirado',
      description: 'Gere um novo token no Meta Business Manager.',
    };
  }

  if (msg.includes('unsupported get') || msg.includes('does not exist') || msg.includes('no permission')) {
    return {
      title: 'ID incorreto ou sem permissão',
      description: 'Verifique se o Phone Number ID está correto.',
    };
  }

  if (msg.includes('deactivated') || msg.includes('archived')) {
    return {
      title: 'App Meta desativado',
      description: 'Reative seu App em developers.facebook.com.',
    };
  }

  return {
    title: 'Credenciais inválidas',
    description: 'Verifique se os dados foram copiados corretamente do Meta Business Manager.',
  };
}

interface TestConnectionStepProps {
  credentials: {
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    metaAppId?: string;
    metaAppSecret?: string;
  };
  onComplete: () => Promise<void>;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
}

type ValidationStatus = 'idle' | 'loading' | 'success' | 'error' | 'warning';

interface PermissionInfo {
  scope: string;
  label: string;
  present: boolean;
  critical: boolean;
}

interface ValidationResult {
  phoneNumberId: ValidationStatus;
  businessAccountId: ValidationStatus;
  accessToken: ValidationStatus;
  permissions: ValidationStatus;
  displayPhoneNumber?: string;
  verifiedName?: string;
  permissionDetails?: PermissionInfo[];
  tokenType?: string;
  tokenExpiry?: string;
  isPermanent?: boolean;
}

export function TestConnectionStep({
  credentials,
  onComplete,
  onBack,
  stepNumber,
  totalSteps,
}: TestConnectionStepProps) {
  const [validation, setValidation] = useState<ValidationResult>({
    phoneNumberId: 'idle',
    businessAccountId: 'idle',
    accessToken: 'idle',
    permissions: 'idle',
  });
  const [isCompleting, setIsCompleting] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ title: string; description: string } | null>(null);

  // Verifica se temos App Secret para validar permissões
  const canValidatePermissions = Boolean(
    credentials.metaAppId?.trim() && credentials.metaAppSecret?.trim()
  );

  useEffect(() => {
    validateCredentials();
  }, []);

  const validateCredentials = async () => {
    setValidation({
      phoneNumberId: 'loading',
      businessAccountId: 'loading',
      accessToken: 'loading',
      permissions: canValidatePermissions ? 'loading' : 'idle',
    });
    setErrorInfo(null);

    try {
      const result = await settingsService.testConnection({
        phoneNumberId: credentials.phoneNumberId.trim(),
        businessAccountId: credentials.businessAccountId.trim(),
        accessToken: sanitizeAccessToken(credentials.accessToken),
      });

      const wabaConfirmed = result.wabaId != null;

      // Atualiza conexão básica
      let newValidation: ValidationResult = {
        phoneNumberId: 'success',
        businessAccountId: wabaConfirmed ? 'success' : 'warning',
        accessToken: 'success',
        permissions: canValidatePermissions ? 'loading' : 'idle',
        displayPhoneNumber: result.displayPhoneNumber ?? undefined,
        verifiedName: result.verifiedName ?? undefined,
      };

      setValidation(newValidation);

      // Se tem App Secret, valida permissões
      if (canValidatePermissions) {
        try {
          const permRes = await fetch('/api/settings/validate-permissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: sanitizeAccessToken(credentials.accessToken),
              appId: credentials.metaAppId?.trim(),
              appSecret: credentials.metaAppSecret?.trim(),
            }),
          });

          const permData = await permRes.json();

          newValidation = {
            ...newValidation,
            permissions: permData.valid ? 'success' : (permData.missing?.length > 0 ? 'warning' : 'error'),
            permissionDetails: permData.scopeDetails?.map((s: any) => ({
              scope: s.scope,
              label: s.label,
              present: s.present,
              critical: s.critical,
            })),
            tokenType: permData.tokenInfo?.type,
            tokenExpiry: permData.tokenInfo?.expiresIn,
            isPermanent: permData.tokenInfo?.isPermanent,
          };

          setValidation(newValidation);

          if (!permData.valid && permData.missing?.length > 0) {
            toast.warning('Permissões incompletas', {
              description: `Faltando: ${permData.missing.join(', ')}`,
            });
          }
        } catch (permError) {
          // Erro na validação de permissões não bloqueia o fluxo
          newValidation = { ...newValidation, permissions: 'error' };
          setValidation(newValidation);
        }
      }
    } catch (error: any) {
      const friendlyError = getUserFriendlyError(error);
      setErrorInfo(friendlyError);

      const errorMsg = error?.message?.toLowerCase() || '';

      const isTokenError =
        errorMsg.includes('token') ||
        errorMsg.includes('oauth') ||
        errorMsg.includes('bytestring') ||
        errorMsg.includes('signature') ||
        errorMsg.includes('malformed') ||
        errorMsg.includes('expired') ||
        errorMsg.includes('invalid');

      const isPhoneError =
        errorMsg.includes('phone') ||
        errorMsg.includes('número') ||
        errorMsg.includes('unsupported get');

      const isBusinessError =
        errorMsg.includes('business') ||
        errorMsg.includes('waba') ||
        errorMsg.includes('account');

      if (isTokenError && !isPhoneError && !isBusinessError) {
        setValidation({
          phoneNumberId: 'success',
          businessAccountId: 'success',
          accessToken: 'error',
          permissions: 'idle',
        });
      } else if (isPhoneError) {
        setValidation({
          phoneNumberId: 'error',
          businessAccountId: 'success',
          accessToken: 'success',
          permissions: 'idle',
        });
      } else if (isBusinessError) {
        setValidation({
          phoneNumberId: 'success',
          businessAccountId: 'error',
          accessToken: 'success',
          permissions: 'idle',
        });
      } else {
        setValidation({
          phoneNumberId: 'idle',
          businessAccountId: 'idle',
          accessToken: 'error',
          permissions: 'idle',
        });
      }

      toast.error(friendlyError.title, {
        description: friendlyError.description,
      });
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      await onComplete();
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setIsCompleting(false);
    }
  };

  // Permissões incompletas são warning (não bloqueiam), mas erro de validação sim
  const permissionsOk = !canValidatePermissions ||
    validation.permissions === 'success' ||
    validation.permissions === 'warning' ||
    validation.permissions === 'idle';

  const allValid =
    validation.phoneNumberId === 'success' &&
    (validation.businessAccountId === 'success' || validation.businessAccountId === 'warning') &&
    validation.accessToken === 'success' &&
    permissionsOk;

  const StatusIcon = ({ status }: { status: ValidationStatus }) => {
    switch (status) {
      case 'loading':
        return <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-zinc-600" />;
    }
  };

  return (
    <div className="space-y-6">
      <StepHeader
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Testar Conexão"
        onBack={onBack}
      />

      {/* Status de validação */}
      <div className="p-4 rounded-xl bg-zinc-800/50 space-y-3">
        <p className="text-sm text-zinc-400 mb-3">Status da conexão:</p>

        <div className="flex items-center justify-between">
          <span className="text-zinc-300">Identificação do número de telefone</span>
          <div className="flex items-center gap-2">
            <StatusIcon status={validation.phoneNumberId} />
            <span className="text-sm text-zinc-400">
              {validation.phoneNumberId === 'success' ? 'válido' : validation.phoneNumberId === 'error' ? 'inválido' : '...'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-300">WABA ID</span>
          <div className="flex items-center gap-2">
            <StatusIcon status={validation.businessAccountId} />
            <span className={`text-sm ${validation.businessAccountId === 'warning' ? 'text-amber-400' : 'text-zinc-400'}`}>
              {validation.businessAccountId === 'success'
                ? 'válido'
                : validation.businessAccountId === 'warning'
                  ? 'não confirmado'
                  : validation.businessAccountId === 'error'
                    ? 'inválido'
                    : '...'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-300">Token de acesso</span>
          <div className="flex items-center gap-2">
            <StatusIcon status={validation.accessToken} />
            <span className="text-sm text-zinc-400">
              {validation.accessToken === 'success'
                ? 'válido'
                : validation.accessToken === 'error'
                  ? 'inválido'
                  : '...'}
            </span>
          </div>
        </div>

        {/* Permissões do token (se App Secret foi fornecido) */}
        {canValidatePermissions && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-300">Permissões do token</span>
            <div className="flex items-center gap-2">
              <StatusIcon status={validation.permissions} />
              <span className={`text-sm ${validation.permissions === 'warning' ? 'text-amber-400' : 'text-zinc-400'}`}>
                {validation.permissions === 'success'
                  ? 'completas'
                  : validation.permissions === 'warning'
                    ? 'incompletas'
                    : validation.permissions === 'error'
                      ? 'erro'
                      : validation.permissions === 'loading'
                        ? '...'
                        : '—'}
              </span>
            </div>
          </div>
        )}

        {/* Detalhes das permissões */}
        {validation.permissionDetails && validation.permissionDetails.length > 0 && (
          <div className="pt-2 mt-2 border-t border-zinc-700 space-y-2">
            <p className="text-xs text-zinc-500 mb-1">Escopos do token:</p>
            {validation.permissionDetails.map((perm) => (
              <div key={perm.scope} className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{perm.label}</span>
                <span className={perm.present ? 'text-emerald-400' : 'text-red-400'}>
                  {perm.present ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Info do token (tipo e expiração) */}
        {validation.tokenType && (
          <div className="pt-2 mt-2 border-t border-zinc-700">
            <p className="text-xs text-zinc-500">
              Tipo: <span className="text-zinc-300">{validation.tokenType}</span>
              {validation.isPermanent ? (
                <span className="text-emerald-400 ml-2">• Permanente</span>
              ) : validation.tokenExpiry ? (
                <span className="text-amber-400 ml-2">• Expira em {validation.tokenExpiry}</span>
              ) : null}
            </p>
          </div>
        )}

        {validation.displayPhoneNumber && (
          <div className="pt-2 mt-2 border-t border-zinc-700">
            <p className="text-sm text-zinc-400">
              Número: <span className="text-white">{validation.displayPhoneNumber}</span>
            </p>
            {validation.verifiedName && (
              <p className="text-sm text-zinc-400">
                Nome: <span className="text-white">{validation.verifiedName}</span>
              </p>
            )}
          </div>
        )}

        {validation.businessAccountId === 'warning' && (
          <div className="pt-2 mt-2 border-t border-zinc-700">
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Não foi possível confirmar o vínculo WABA↔Phone. Verifique os IDs.
            </p>
          </div>
        )}
      </div>

      {/* Erro inline */}
      {errorInfo && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-red-200 font-medium">{errorInfo.title}</p>
              <p className="text-sm text-red-200/70 mt-1">{errorInfo.description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={validateCredentials}
              disabled={validation.phoneNumberId === 'loading'}
              className="border-red-500/30 hover:bg-red-500/10"
            >
              {validation.phoneNumberId === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Tentar novamente
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-zinc-400 hover:text-white"
            >
              Voltar e corrigir
            </Button>
          </div>
        </div>
      )}

      {/* Botão de conclusão */}
      {allValid && (
        <Button
          className="w-full"
          size="lg"
          onClick={handleComplete}
          disabled={isCompleting}
        >
          {isCompleting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <PartyPopper className="w-4 h-4 mr-2" />
              Continuar para Webhook
            </>
          )}
        </Button>
      )}
    </div>
  );
}
