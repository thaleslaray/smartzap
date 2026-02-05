'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useOnboardingProgress, OnboardingStep } from './hooks/useOnboardingProgress';

// Steps
import { WelcomeStep } from './steps/WelcomeStep';
import { RequirementsStep } from './steps/RequirementsStep';
import { CreateAppStep } from './steps/CreateAppStep';
import { AddWhatsAppStep } from './steps/AddWhatsAppStep';
import { CredentialsStep } from './steps/CredentialsStep';
import { TestConnectionStep } from './steps/TestConnectionStep';
import { ConfigureWebhookStep } from './steps/ConfigureWebhookStep';
import { CreatePermanentTokenStep } from './steps/CreatePermanentTokenStep';
import { DirectCredentialsStep } from './steps/DirectCredentialsStep';
import { OnboardingCompleteStep } from './steps/OnboardingCompleteStep';
import { Button } from '@/components/ui/button';

// Ordem dos steps do tutorial (fluxo simplificado - 6 passos)
// Removidos: test-connection (integrado em credentials), sync-templates (automático), send-first-message (depende de templates)
const TUTORIAL_STEPS: OnboardingStep[] = [
  'requirements',
  'create-app',
  'add-whatsapp',
  'credentials',
  'configure-webhook',
  'create-permanent-token',
];

// Interface centralizada de credenciais (reutilizada em todo o modal)
interface OnboardingCredentials {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  metaAppId: string;
  metaAppSecret?: string;
}

// Componente interno para wizard de tutorial com navegação sequencial
function TutorialWizard({
  initialStep,
  onClose,
  onSaveCredentials,
}: {
  initialStep: OnboardingStep;
  onClose: () => void;
  onSaveCredentials?: (credentials: OnboardingCredentials) => Promise<void>;
}) {
  // Encontra o índice inicial baseado no step fornecido
  const initialIndex = TUTORIAL_STEPS.indexOf(initialStep);
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [credentials, setCredentials] = useState<OnboardingCredentials>({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    metaAppId: '',
    metaAppSecret: '',
  });

  const currentStep = TUTORIAL_STEPS[currentIndex];
  const totalSteps = TUTORIAL_STEPS.length;
  const stepNumber = currentIndex + 1;
  const isLastStep = currentIndex === totalSteps - 1;
  const isFirstStep = currentIndex === 0;

  const handleNext = useCallback(async () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [isLastStep, onClose]);

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      onClose();
    } else {
      setCurrentIndex(prev => prev - 1);
    }
  }, [isFirstStep, onClose]);

  const renderStep = () => {
    switch (currentStep) {
      case 'requirements':
        return (
          <RequirementsStep
            onNext={handleNext}
            onBack={handleBack}
            stepNumber={stepNumber}
            totalSteps={totalSteps}
          />
        );
      case 'create-app':
        return (
          <CreateAppStep
            onNext={handleNext}
            onBack={handleBack}
            stepNumber={stepNumber}
            totalSteps={totalSteps}
          />
        );
      case 'add-whatsapp':
        return (
          <AddWhatsAppStep
            onNext={handleNext}
            onBack={handleBack}
            stepNumber={stepNumber}
            totalSteps={totalSteps}
          />
        );
      case 'credentials':
        return (
          <DirectCredentialsStep
            credentials={credentials}
            onCredentialsChange={setCredentials}
            onComplete={async () => {
              // Salva credenciais se callback disponível
              if (onSaveCredentials) {
                await onSaveCredentials(credentials);
              }
              handleNext();
            }}
            onBack={handleBack}
          />
        );
      case 'configure-webhook':
        return (
          <ConfigureWebhookStep
            onNext={handleNext}
            onBack={handleBack}
            stepNumber={stepNumber}
            totalSteps={totalSteps}
          />
        );
      case 'create-permanent-token':
        return (
          <CreatePermanentTokenStep
            currentToken=""
            onTokenUpdate={async () => {}}
            onNext={onClose}
            onBack={handleBack}
            onSkip={onClose}
            stepNumber={stepNumber}
            totalSteps={totalSteps}
          />
        );
      default:
        return null;
    }
  };

  return renderStep();
}

interface OnboardingModalProps {
  isConnected: boolean;
  /** Chamado para salvar credenciais (NÃO marca onboarding como completo) */
  onSaveCredentials: (credentials: OnboardingCredentials) => Promise<void>;
  /** Chamado quando o usuário finaliza TODO o fluxo de onboarding */
  onMarkComplete: () => Promise<void>;
  /** Força exibição do modal em um step específico (ex: 'configure-webhook') */
  forceStep?: OnboardingStep;
  /** Callback para fechar o modal (limpa forceStep no pai) */
  onClose?: () => void;
  /** Modo tutorial: mostra só o conteúdo + botão fechar, sem navegação */
  tutorialMode?: boolean;
}

export function OnboardingModal({ isConnected, onSaveCredentials, onMarkComplete, forceStep, onClose, tutorialMode = false }: OnboardingModalProps) {
  const {
    progress,
    isLoaded,
    currentStepNumber,
    totalSteps,
    startOnboarding,
    nextStep,
    previousStep,
    completeOnboarding,
    completeStep,
    goToStep,
    resetOnboarding,
  } = useOnboardingProgress();

  // Se o modal está sendo exibido (banco diz não completo) mas o localStorage
  // está em 'complete', significa que o banco foi resetado - volta para welcome
  // Importante: só reseta se WhatsApp NÃO está conectado, senão é um estado legítimo
  React.useEffect(() => {
    if (isLoaded && progress.currentStep === 'complete' && !tutorialMode && !isConnected) {
      resetOnboarding();
    }
  }, [isLoaded, progress.currentStep, tutorialMode, resetOnboarding, isConnected]);

  // ============================================================================
  // MODO TUTORIAL: Wizard com navegação sequencial pelos 9 passos
  // ============================================================================
  if (tutorialMode && forceStep) {
    const handleTutorialClose = () => {
      onClose?.();
    };

    return (
      <Dialog open={true} onOpenChange={(open) => !open && handleTutorialClose()}>
        <DialogContent
          className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
          overlayClassName="bg-black/80 backdrop-blur-sm"
          showCloseButton={true}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Tutorial de Configuração</DialogTitle>
            <DialogDescription>Guia passo a passo para configurar o WhatsApp Business</DialogDescription>
          </DialogHeader>

          <TutorialWizard
            initialStep={forceStep}
            onClose={handleTutorialClose}
            onSaveCredentials={onSaveCredentials}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // ============================================================================
  // MODO ONBOARDING NORMAL: Fluxo completo com navegação
  // ============================================================================
  const currentStep = progress.currentStep;

  // A decisão de mostrar o modal agora é feita pelo DashboardShell
  // baseado em isOnboardingCompletedInDb (banco de dados).
  // Este componente sempre renderiza quando chamado - o pai controla a visibilidade.
  const shouldShow = isLoaded;

  // Estado temporário para credenciais durante o wizard
  const [credentials, setCredentials] = React.useState<OnboardingCredentials>({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    metaAppId: '',
    metaAppSecret: '',
  });

  // Usado pelo caminho direto (direct-credentials) - salva e mostra tela de conclusão
  // NÃO marca como completo ainda - só quando o usuário clicar em "Começar a usar"
  const handleDirectComplete = async () => {
    await onSaveCredentials(credentials);
    goToStep('complete');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <WelcomeStep
            onSelectPath={(path) => startOnboarding(path)}
          />
        );

      case 'requirements':
        return (
          <RequirementsStep
            onNext={nextStep}
            onBack={previousStep}
            stepNumber={currentStepNumber}
            totalSteps={totalSteps}
          />
        );

      case 'create-app':
        return (
          <CreateAppStep
            onNext={nextStep}
            onBack={previousStep}
            stepNumber={currentStepNumber}
            totalSteps={totalSteps}
          />
        );

      case 'add-whatsapp':
        return (
          <AddWhatsAppStep
            onNext={nextStep}
            onBack={previousStep}
            stepNumber={currentStepNumber}
            totalSteps={totalSteps}
          />
        );

      case 'credentials':
        return (
          <CredentialsStep
            credentials={credentials}
            onCredentialsChange={setCredentials}
            onNext={nextStep}
            onBack={previousStep}
            stepNumber={currentStepNumber}
            totalSteps={totalSteps}
          />
        );

      case 'test-connection':
        return (
          <TestConnectionStep
            credentials={credentials}
            onComplete={async () => {
              // Salva as credenciais e avança para o próximo step (webhook)
              // NÃO marca como completo ainda - o usuário precisa configurar o webhook
              await onSaveCredentials(credentials);
              nextStep();
            }}
            onBack={previousStep}
            stepNumber={currentStepNumber}
            totalSteps={totalSteps}
          />
        );

      case 'configure-webhook':
        return (
          <ConfigureWebhookStep
            onNext={async () => {
              // Marca webhook como completo
              completeStep('configure-webhook');
              // Mostra tela de conclusão (não marca como completo ainda)
              goToStep('complete');
            }}
            onBack={previousStep}
            stepNumber={6}
            totalSteps={totalSteps}
          />
        );

      case 'create-permanent-token':
        return (
          <CreatePermanentTokenStep
            currentToken={credentials.accessToken}
            onTokenUpdate={async (newToken) => {
              // Atualiza o token nas credenciais locais
              setCredentials(prev => ({ ...prev, accessToken: newToken }));
              // Salva no backend (health check será atualizado automaticamente)
              await onSaveCredentials({ ...credentials, accessToken: newToken });
            }}
            onNext={async () => {
              await onMarkComplete();
              completeOnboarding();
            }}
            onBack={previousStep}
            onSkip={async () => {
              await onMarkComplete();
              completeOnboarding();
            }}
            stepNumber={currentStepNumber}
            totalSteps={totalSteps}
          />
        );

      case 'direct-credentials':
        return (
          <DirectCredentialsStep
            credentials={credentials}
            onCredentialsChange={setCredentials}
            onComplete={handleDirectComplete}
            onBack={previousStep}
          />
        );

      case 'complete':
        return (
          <OnboardingCompleteStep
            onComplete={async () => {
              await onMarkComplete();
              completeOnboarding();
            }}
          />
        );

      default:
        return null;
    }
  };

  if (!shouldShow) return null;

  return (
    <Dialog open={true}>
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        overlayClassName="bg-black/80 backdrop-blur-sm"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {currentStep === 'welcome' ? (
          <>
            <DialogHeader className="text-center pb-2">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                  <span className="text-3xl">🚀</span>
                </div>
              </div>
              <DialogTitle className="text-2xl">Bem-vindo ao SmartZap!</DialogTitle>
              <DialogDescription className="text-base mt-2">
                Para enviar mensagens pelo WhatsApp, você precisa conectar uma conta do WhatsApp Business API.
              </DialogDescription>
            </DialogHeader>
          </>
        ) : (
          <DialogHeader className="sr-only">
            <DialogTitle>Configuração do WhatsApp</DialogTitle>
            <DialogDescription>Configure sua conta do WhatsApp Business API</DialogDescription>
          </DialogHeader>
        )}

        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}
