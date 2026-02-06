'use client';

import React from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepHeader } from './StepHeader';
import { WhatsAppCredentialsForm, type WhatsAppCredentials } from '@/components/shared/WhatsAppCredentialsForm';

interface CredentialsStepProps {
  credentials: {
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    metaAppId: string;
    metaAppSecret?: string;
  };
  onCredentialsChange: (credentials: {
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    metaAppId: string;
    metaAppSecret?: string;
  }) => void;
  onNext: () => void;
  onBack: () => void;
  stepNumber: number;
  totalSteps: number;
}

// Validação de formato dos IDs da Meta (geralmente 15-20 dígitos numéricos)
function isValidMetaId(value: string): boolean {
  const trimmed = value.trim();
  // Deve ser apenas números e ter entre 10-25 dígitos
  return /^\d{10,25}$/.test(trimmed);
}

// Validação básica do formato do token Meta (começa com EAA)
function isValidTokenFormat(value: string): boolean {
  const trimmed = value.trim();
  // Tokens Meta começam com EAA e têm pelo menos 50 caracteres
  return trimmed.startsWith('EAA') && trimmed.length >= 50;
}

export function CredentialsStep({
  credentials,
  onCredentialsChange,
  onNext,
  onBack,
  stepNumber,
  totalSteps,
}: CredentialsStepProps) {
  const phoneId = credentials.phoneNumberId.trim();
  const wabaId = credentials.businessAccountId.trim();
  const token = credentials.accessToken.trim();
  const appId = credentials.metaAppId.trim();

  // Validações de formato
  const phoneIdValid = isValidMetaId(phoneId);
  const wabaIdValid = isValidMetaId(wabaId);
  const tokenValid = isValidTokenFormat(token);
  const appIdValid = !appId || isValidMetaId(appId); // Opcional, mas se preenchido deve ser válido

  // IDs não podem ser iguais - são campos diferentes
  const idsAreEqual = phoneId && wabaId && phoneId === wabaId;

  // Todos os campos obrigatórios preenchidos e com formato válido
  const isValid = phoneIdValid && wabaIdValid && tokenValid && appIdValid && !idsAreEqual;

  // Adapta a interface para o componente centralizado
  const formValues: WhatsAppCredentials = {
    phoneNumberId: credentials.phoneNumberId,
    businessAccountId: credentials.businessAccountId,
    accessToken: credentials.accessToken,
    metaAppId: credentials.metaAppId,
    metaAppSecret: credentials.metaAppSecret || '',
  };

  const handleChange = (values: WhatsAppCredentials) => {
    onCredentialsChange({
      phoneNumberId: values.phoneNumberId,
      businessAccountId: values.businessAccountId,
      accessToken: values.accessToken,
      metaAppId: values.metaAppId || '',
      metaAppSecret: values.metaAppSecret,
    });
  };

  return (
    <div className="space-y-6">
      <StepHeader
        stepNumber={stepNumber}
        totalSteps={totalSteps}
        title="Copiar Credenciais"
        onBack={onBack}
      />

      <p className="text-sm text-zinc-400">
        Na página <strong className="text-white">"API Setup"</strong> do seu app, copie os seguintes dados:
      </p>

      {/* Formulário centralizado */}
      <WhatsAppCredentialsForm
        values={formValues}
        onChange={handleChange}
        showMetaApp={true}
        showAppSecret={true}
        showValidateButton={false}
        showSaveButton={false}
        showTestButton={false}
        showHelpLink={false}
        variant="compact"
      />

      {/* Aviso sobre IDs iguais */}
      {idsAreEqual && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-200">
              <strong>Phone Number ID</strong> e <strong>WABA ID</strong> devem ser diferentes. São campos distintos.
            </p>
          </div>
        </div>
      )}

      {/* Aviso sobre token temporário */}
      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-200/80">
            Este token expira em <strong>24 horas</strong>. Depois de testar, vamos te mostrar como criar um token permanente.
          </p>
        </div>
      </div>

      {/* Ações */}
      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={!isValid}>
          Próximo
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
