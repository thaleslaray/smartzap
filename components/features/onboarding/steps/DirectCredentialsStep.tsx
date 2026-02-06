'use client'

import React, { useState, useCallback } from 'react'
import { ArrowLeft, Loader2, PartyPopper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { WhatsAppCredentialsForm, type WhatsAppCredentials } from '@/components/shared/WhatsAppCredentialsForm'

interface DirectCredentialsStepProps {
  credentials: {
    phoneNumberId: string
    businessAccountId: string
    accessToken: string
    metaAppId: string
    metaAppSecret?: string
  }
  onCredentialsChange: (credentials: {
    phoneNumberId: string
    businessAccountId: string
    accessToken: string
    metaAppId: string
    metaAppSecret?: string
  }) => void
  onComplete: () => Promise<void>
  onBack: () => void
}

/**
 * Step de credenciais do onboarding wizard.
 *
 * Usa o componente centralizado WhatsAppCredentialsForm com configuração
 * específica para o fluxo de onboarding:
 * - Sem botão de salvar (usa fluxo de teste → continuar)
 * - Mostra Meta App ID e App Secret para configuração completa
 * - Após teste bem sucedido, mostra botão "Conectar e Continuar"
 */
export function DirectCredentialsStep({
  credentials,
  onCredentialsChange,
  onComplete,
  onBack,
}: DirectCredentialsStepProps) {
  const [isValid, setIsValid] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  // Converte para o formato do WhatsAppCredentialsForm
  const formValues: WhatsAppCredentials = {
    phoneNumberId: credentials.phoneNumberId,
    businessAccountId: credentials.businessAccountId,
    accessToken: credentials.accessToken,
    metaAppId: credentials.metaAppId,
    metaAppSecret: credentials.metaAppSecret || '',
  }

  // Handler para mudança de valores
  const handleChange = useCallback(
    (values: WhatsAppCredentials) => {
      onCredentialsChange({
        phoneNumberId: values.phoneNumberId,
        businessAccountId: values.businessAccountId,
        accessToken: values.accessToken,
        metaAppId: values.metaAppId || '',
        metaAppSecret: values.metaAppSecret,
      })
      // Reseta validação quando os campos mudam
      setIsValid(false)
    },
    [onCredentialsChange]
  )

  // Handler para teste de conexão bem sucedido
  const handleTestSuccess = useCallback(() => {
    setIsValid(true)
  }, [])

  // Handler para completar o step
  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      await onComplete()
    } catch (error) {
      toast.error('Erro ao salvar configuração')
    } finally {
      setIsCompleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <h2 className="text-xl font-semibold text-white">Conectar Credenciais</h2>
      </div>

      {/* Formulário centralizado */}
      <WhatsAppCredentialsForm
        values={formValues}
        onChange={handleChange}
        onTestSuccess={handleTestSuccess}
        showMetaApp={true}
        showAppSecret={true}
        showValidateButton={false} // Não valida permissões no onboarding
        showSaveButton={false} // Usa botão customizado abaixo
        showTestButton={!isValid} // Esconde após validação
        showHelpLink={true}
        variant="compact"
      />

      {/* Botão de continuar (após validação) */}
      {isValid && (
        <Button
          className="w-full"
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
              Conectar e Continuar
            </>
          )}
        </Button>
      )}
    </div>
  )
}
