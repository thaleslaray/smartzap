import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsService } from '../services/settingsService';
import type {
  AppSettings,
  WorkflowExecutionConfig,
  PhoneNumber,
  DomainOption,
  WebhookInfo,
} from '../types/settings.types';

// Re-export types for backward compatibility
export type { PhoneNumber, DomainOption } from '../types/settings.types';
import { useAccountLimits } from './useAccountLimits';
import {
  checkAccountHealth,
  quickHealthCheck,
  getHealthSummary,
  type AccountHealth
} from '../lib/account-health';
import { DEFAULT_WEBHOOK_PATH } from '../lib/business/settings';
import { Zap, MessageSquare } from 'lucide-react';
import React from 'react';
import { SetupStep } from '../components/features/settings/SetupWizardView';

/**
 * Meta webhook subscription status.
 * Includes WABA override info (#2 level) and hierarchy.
 */
interface WebhookSubscriptionStatus {
  ok: boolean;
  wabaId?: string;
  messagesSubscribed?: boolean;
  subscribedFields?: string[];
  apps?: Array<{ id?: string; name?: string; subscribed_fields?: string[] }>;
  error?: string;
  details?: unknown;
  // WABA override status (#2)
  wabaOverride?: {
    url: string | null;
    isConfigured: boolean;
    isSmartZap: boolean;
  };
  // Webhook hierarchy from phone number perspective
  hierarchy?: {
    phoneNumberOverride: string | null;
    wabaOverride: string | null;
    appWebhook: string | null;
  } | null;
  smartzapWebhookUrl?: string;
}

export const useSettingsController = () => {
  const queryClient = useQueryClient();

  // Account limits (tier, quality, etc.)
  const {
    limits: accountLimits,
    refreshLimits,
    tierName,
    isError: limitsError,
    errorMessage: limitsErrorMessage,
    isLoading: limitsLoading,
    hasLimits
  } = useAccountLimits();

  // Local state for form
  const [formSettings, setFormSettings] = useState<AppSettings>({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    isConnected: false
  });

  // Account Health State
  const [accountHealth, setAccountHealth] = useState<AccountHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // Connection test state (Settings -> Configuração da API)
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // --- Queries ---
  // Consolidated query for all independent settings (reduces 8 requests to 1)
  const allSettingsQuery = useQuery({
    queryKey: ['allSettings'],
    queryFn: settingsService.getAll,
    staleTime: 30 * 1000,
  });

  // Derive individual data from consolidated query
  const settingsData = useMemo(() => {
    if (!allSettingsQuery.data?.credentials) return null;
    const cred = allSettingsQuery.data.credentials;
    return {
      phoneNumberId: cred.phoneNumberId || '',
      businessAccountId: cred.businessAccountId || '',
      displayPhoneNumber: cred.displayPhoneNumber,
      verifiedName: cred.verifiedName,
      accessToken: cred.hasToken ? '***configured***' : '',
      isConnected: cred.isConnected,
    } as AppSettings;
  }, [allSettingsQuery.data?.credentials]);

  // Legacy settingsQuery accessor for compatibility
  const settingsQuery = {
    data: settingsData,
    isLoading: allSettingsQuery.isLoading,
  };

  // Webhook info query (dependent on isConnected)
  const webhookQuery = useQuery({
    queryKey: ['webhookInfo'],
    queryFn: async (): Promise<WebhookInfo> => {
      const response = await fetch('/api/webhook/info');
      if (!response.ok) throw new Error('Failed to fetch webhook info');
      return response.json();
    },
    enabled: !!settingsData?.isConnected,
    staleTime: 30 * 1000,
  });

  // Meta subscription status (WABA subscribed_apps) — dependent on isConnected
  const webhookSubscriptionQuery = useQuery({
    queryKey: ['metaWebhookSubscription'],
    queryFn: async (): Promise<WebhookSubscriptionStatus> => {
      const response = await fetch('/api/meta/webhooks/subscription');
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        return {
          ok: false,
          error: (data?.error as string) || 'Falha ao consultar subscription',
          details: data?.details,
        };
      }
      return data as unknown as WebhookSubscriptionStatus;
    },
    enabled: !!settingsData?.isConnected,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  // Phone numbers query (dependent on isConnected)
  const phoneNumbersQuery = useQuery({
    queryKey: ['phoneNumbers'],
    queryFn: async (): Promise<PhoneNumber[]> => {
      const response = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch phone numbers');
      }
      return response.json();
    },
    enabled: !!settingsData?.isConnected,
    staleTime: 60 * 1000,
    retry: false,
  });

  // AI Settings - derived from consolidated query
  const aiSettingsQuery = {
    data: allSettingsQuery.data?.ai,
    isLoading: allSettingsQuery.isLoading,
  };

  // Meta App - derived from consolidated query
  const metaAppQuery = {
    data: allSettingsQuery.data?.metaApp,
    isLoading: allSettingsQuery.isLoading,
  };

  // Test Contact - derived from consolidated query
  const testContactQuery = {
    data: allSettingsQuery.data?.testContact,
    isLoading: allSettingsQuery.isLoading,
  };

  // WhatsApp Turbo (dependent on isConnected)
  const whatsappThrottleQuery = useQuery({
    queryKey: ['whatsappThrottle'],
    queryFn: settingsService.getWhatsAppThrottle,
    enabled: !!settingsData?.isConnected,
    staleTime: 30 * 1000,
    retry: false,
  });

  // Auto-supressão (dependent on isConnected)
  const autoSuppressionQuery = useQuery({
    queryKey: ['autoSuppression'],
    queryFn: settingsService.getAutoSuppression,
    enabled: !!settingsData?.isConnected,
    staleTime: 30 * 1000,
    retry: false,
  });

  // Calendar Booking - derived from consolidated query
  const calendarBookingQuery = {
    data: allSettingsQuery.data?.calendarBooking,
    isLoading: allSettingsQuery.isLoading,
  };

  // Workflow Execution - derived from consolidated query
  const workflowExecutionQuery = {
    data: allSettingsQuery.data?.workflowExecution,
    isLoading: allSettingsQuery.isLoading,
  };

  // Upstash Config - derived from consolidated query
  const upstashConfigQuery = {
    data: allSettingsQuery.data?.upstashConfig,
    isLoading: allSettingsQuery.isLoading,
  };

  // Domains - derived from consolidated query and transformed to DomainOption format
  const availableDomains = useMemo((): DomainOption[] => {
    const rawDomains = allSettingsQuery.data?.domains?.domains || [];
    return rawDomains.map((d) => ({
      url: d.value,
      source: d.isPrimary ? 'production' : 'vercel',
      recommended: d.isPrimary,
    }));
  }, [allSettingsQuery.data?.domains?.domains]);

  const domainsQuery = {
    data: allSettingsQuery.data?.domains,
    isLoading: allSettingsQuery.isLoading,
  };

  // System status query (kept separate - has different caching needs)
  const systemQuery = useQuery({
    queryKey: ['systemStatus'],
    queryFn: async () => {
      const response = await fetch('/api/system');
      if (!response.ok) throw new Error('Failed to fetch system status');
      return response.json();
    },
    staleTime: 60 * 1000,
  });

  // Backward compatible healthQuery accessor
  const healthQuery = {
    data: systemQuery.data?.health ? {
      ...systemQuery.data.health,
      vercel: systemQuery.data.vercel,
      timestamp: systemQuery.data.timestamp,
    } : undefined,
    isLoading: systemQuery.isLoading,
  };

  // Sync form with data when loaded
  useEffect(() => {
    if (settingsQuery.data) {
      setFormSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  // --- Mutations ---
  const saveMutation = useMutation({
    mutationFn: settingsService.save,
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      // Invalida allSettings para atualizar isConnected na UI
      queryClient.invalidateQueries({ queryKey: ['allSettings'] });
      // Limpa cache e re-verifica limites com novo token
      localStorage.removeItem('smartzap_account_limits');
      queryClient.invalidateQueries({ queryKey: ['account-limits'] });
      toast.success('Configuração salva com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao salvar configuração.');
    }
  });

  const saveAIMutation = useMutation({
    mutationFn: settingsService.saveAIConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSettings'] });
      toast.success('Configuração de IA salva com sucesso!');
    },
    // Error is handled inline in the component
  });

  const removeAIMutation = useMutation({
    mutationFn: settingsService.removeAIKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allSettings'] });
    },
    onError: () => {
      toast.error('Erro ao remover chave de IA.');
    }
  });

  // Test Contact Mutations - Supabase
  // Usa refetchQueries (não apenas invalidate) para garantir que os dados
  // estejam disponíveis quando mutateAsync resolver - evita race condition na UI
  const saveTestContactMutation = useMutation({
    mutationFn: settingsService.saveTestContact,
    onSuccess: async () => {
      // Aguarda refetch da query principal (UI depende disso)
      await queryClient.refetchQueries({ queryKey: ['allSettings'] });
      // Invalida outras variações (não precisa aguardar)
      queryClient.invalidateQueries({ queryKey: ['testContact'] });
      queryClient.invalidateQueries({ queryKey: ['test-contact'] });
      toast.success('Contato de teste salvo!');
    },
    onError: () => {
      toast.error('Erro ao salvar contato de teste.');
    }
  });

  const removeTestContactMutation = useMutation({
    mutationFn: settingsService.removeTestContact,
    onSuccess: async () => {
      // Aguarda refetch da query principal (UI depende disso)
      await queryClient.refetchQueries({ queryKey: ['allSettings'] });
      // Invalida outras variações (não precisa aguardar)
      queryClient.invalidateQueries({ queryKey: ['testContact'] });
      queryClient.invalidateQueries({ queryKey: ['test-contact'] });
      toast.success('Contato de teste removido!');
    },
    onError: () => {
      toast.error('Erro ao remover contato de teste.');
    }
  });

  const saveWhatsAppThrottleMutation = useMutation({
    mutationFn: settingsService.saveWhatsAppThrottle,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['whatsappThrottle'] });
      toast.success('Configuração do modo turbo salva!');
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao salvar modo turbo');
    }
  });

  const saveAutoSuppressionMutation = useMutation({
    mutationFn: settingsService.saveAutoSuppression,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['autoSuppression'] });
      toast.success('Configuração de auto-supressão salva!');
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao salvar auto-supressão');
    },
  });

  const saveCalendarBookingMutation = useMutation({
    mutationFn: settingsService.saveCalendarBookingConfig,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['allSettings'] });
      toast.success('Configuração de agendamento salva!');
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao salvar configuracao de agendamento');
    },
  });

  const saveWorkflowExecutionMutation = useMutation({
    mutationFn: (data: Partial<WorkflowExecutionConfig>) =>
      settingsService.saveWorkflowExecutionConfig(data),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['allSettings'] });
      toast.success('Configuração de execução salva!');
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao salvar configuração de execução');
    },
  });

  // Upstash Config Mutations
  const saveUpstashConfigMutation = useMutation({
    mutationFn: settingsService.saveUpstashConfig,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['allSettings'] });
      toast.success('Credenciais do Upstash salvas!');
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao salvar credenciais do Upstash');
    },
  });

  const removeUpstashConfigMutation = useMutation({
    mutationFn: settingsService.removeUpstashConfig,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['allSettings'] });
      toast.success('Credenciais do Upstash removidas!');
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao remover credenciais do Upstash');
    },
  });

  const subscribeWebhookMessagesMutation = useMutation({
    mutationFn: async (callbackUrl?: string) => {
      const response = await fetch('/api/meta/webhooks/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl }), // Passa a URL do frontend (ex: URL de túnel em dev)
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error((data?.error as string) || 'Erro ao configurar webhook WABA');
      }

      return data;
    },
    onSuccess: async (data: Record<string, unknown>) => {
      await queryClient.invalidateQueries({ queryKey: ['metaWebhookSubscription'] });
      await queryClient.refetchQueries({ queryKey: ['metaWebhookSubscription'] });

      const wabaOverride = data?.wabaOverride as Record<string, unknown> | undefined;
      const isSmartZap = wabaOverride?.isSmartZap;
      if (isSmartZap) {
        toast.success('SmartZap ativado para WABA!', {
          description: 'Todos os números sem override #1 usarão este webhook.',
        });
      } else {
        toast.warning('Webhook WABA configurado.', {
          description: 'Clique em "Atualizar status" para confirmar.',
        });
      }
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao configurar webhook WABA');
    },
  });

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    const toastId = toast.loading('Testando conexão com a Meta…');
    try {
      // Se o usuário ainda não salvou as credenciais, testamos com o que está no formulário.
      // Se estiver mascarado (***configured***), o backend usa credenciais salvas.
      const result = await settingsService.testConnection({
        phoneNumberId: formSettings.phoneNumberId,
        businessAccountId: formSettings.businessAccountId,
        accessToken: formSettings.accessToken,
      });

      toast.dismiss(toastId);

      // Se o backend conseguiu inferir o WABA e o usuário não preencheu, auto-preenche.
      if (!formSettings.businessAccountId && result?.wabaId) {
        setFormSettings((prev) => ({
          ...prev,
          businessAccountId: String(result.wabaId),
        }));
      }

      const phone = result.displayPhoneNumber || result.phoneNumberId || 'OK';
      toast.success('Teste de conexão bem-sucedido!', {
        description: result.verifiedName
          ? `${phone} • ${result.verifiedName}${(!formSettings.businessAccountId && result?.wabaId) ? `\nWABA preenchido automaticamente: ${result.wabaId}` : ''}`
          : `${phone}${(!formSettings.businessAccountId && result?.wabaId) ? `\nWABA preenchido automaticamente: ${result.wabaId}` : ''}`,
      });
    } catch (err: unknown) {
      toast.dismiss(toastId);
      const error = err as Error & { details?: Record<string, unknown> };
      const msg = error?.message || 'Falha ao testar conexão';
      const details = error?.details;

      const innerDetails = details?.details as Record<string, unknown> | undefined
      const hintTitle = innerDetails?.hintTitle as string | undefined
      const hint = innerDetails?.hint as string | undefined
      const nextSteps = innerDetails?.nextSteps as string[] | undefined
      const fbtraceId = innerDetails?.fbtraceId as string | undefined

      const stepsPreview = Array.isArray(nextSteps) && nextSteps.length
        ? nextSteps.slice(0, 2).map((s) => `• ${s}`).join('\n')
        : null

      const descriptionParts = [
        hintTitle ? `${hintTitle}: ${msg}` : msg,
        hint ? hint : null,
        stepsPreview,
        fbtraceId ? `fbtrace_id: ${fbtraceId}` : null,
      ].filter(Boolean)

      toast.error('Falha no teste de conexão', {
        description: descriptionParts.join('\n'),
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const unsubscribeWebhookMessagesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/meta/webhooks/subscription', {
        method: 'DELETE',
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error((data?.error as string) || 'Erro ao remover webhook WABA');
      }

      return data;
    },
    onSuccess: async (data: Record<string, unknown>) => {
      await queryClient.invalidateQueries({ queryKey: ['metaWebhookSubscription'] });
      await queryClient.refetchQueries({ queryKey: ['metaWebhookSubscription'] });

      const wabaOverrideUnsub = data?.wabaOverride as Record<string, unknown> | undefined;
      const isConfigured = wabaOverrideUnsub?.isConfigured;
      if (!isConfigured) {
        toast.success('Override WABA removido.', {
          description: 'Webhooks voltarão a usar o fallback do App (#3).',
        });
      } else {
        toast.message('Remoção solicitada.', {
          description: 'Clique em "Atualizar status" para confirmar.',
        });
      }
    },
    onError: (err: Error) => {
      toast.error(err?.message || 'Erro ao remover webhook WABA');
    },
  });

  const handleSave = async () => {
    // 1. Optimistic Update
    const pendingSettings = { ...formSettings, isConnected: true };

    try {
      // 2. Fetch Real Data from Meta
      const metaData = await settingsService.fetchPhoneDetails({
        phoneNumberId: formSettings.phoneNumberId,
        accessToken: formSettings.accessToken
      });

      // 3. Merge Data
      const finalSettings = {
        ...pendingSettings,
        displayPhoneNumber: metaData.display_phone_number,
        qualityRating: metaData.quality_rating,
        verifiedName: metaData.verified_name
      };

      // 4. Save (usando mutateAsync para aguardar conclusão)
      await saveMutation.mutateAsync(finalSettings);

      // 5. Atualiza estado local para refletir conexão
      setFormSettings(finalSettings);
    } catch (error) {
      toast.error('Erro ao conectar com a Meta API. Verifique as credenciais.');
      console.error(error);
      throw error; // Re-throw para o caller saber que falhou
    }
  };

  const handleDisconnect = async () => {
    try {
      // Chama DELETE /api/settings/credentials para limpar no banco
      const response = await fetch('/api/settings/credentials', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Falha ao desconectar');
      }

      // Limpa estado local
      setFormSettings({
        phoneNumberId: '',
        businessAccountId: '',
        accessToken: '',
        isConnected: false,
      });
      setAccountHealth(null);

      // Invalida caches para forçar refetch
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['allSettings'] });
      queryClient.invalidateQueries({ queryKey: ['webhookInfo'] });
      queryClient.invalidateQueries({ queryKey: ['phoneNumbers'] });
      queryClient.invalidateQueries({ queryKey: ['metaWebhookSubscription'] });
      queryClient.invalidateQueries({ queryKey: ['metaAppConfig'] }); // Meta App ID também é removido

      toast.success('WhatsApp desconectado com sucesso!');
    } catch (error) {
      toast.error('Erro ao desconectar. Tente novamente.');
      console.error('Disconnect error:', error);
    }
  };

  // Direct save settings (for test contact, etc.)
  const handleSaveSettings = (settings: AppSettings) => {
    setFormSettings(settings);
    saveMutation.mutate(settings);
  };

  // Check account health
  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const health = await checkAccountHealth();
      setAccountHealth(health);

      const summary = getHealthSummary(health);
      if (health.isHealthy) {
        toast.success(summary.title);
      } else if (health.status === 'degraded') {
        toast.warning(summary.title);
      } else {
        toast.error(summary.title);
      }
    } catch (error) {
      toast.error('Erro ao verificar saúde da conta');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  // Quick health check (for pre-send validation)
  const canSendCampaign = async (): Promise<{ canSend: boolean; reason?: string }> => {
    return quickHealthCheck();
  };

  // Set webhook override for a phone number
  const setWebhookOverride = async (phoneNumberId: string, callbackUrl: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/phone-numbers/${phoneNumberId}/webhook/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // accessToken é obtido no servidor a partir das credenciais salvas (Supabase/env)
          callbackUrl,
          // Preflight por padrão: retorna erro mais claro quando Preview está protegido (401)
          preflight: true,
          force: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        const title = (errorData?.error as string) || 'Erro ao configurar webhook';
        const hint = (errorData?.hint as string) || (errorData?.action as string);
        const code = errorData?.code as string | undefined;

        if (hint) {
          toast.error(title, {
            description: code ? `${hint} (código: ${code})` : hint,
          });
        } else {
          toast.error(title);
        }
        return false;
      }

      toast.success('Webhook configurado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['phoneNumbers'] });
      return true;
    } catch (error) {
      toast.error('Erro ao configurar webhook');
      return false;
    }
  };

  // Remove webhook override for a phone number
  const removeWebhookOverride = async (phoneNumberId: string): Promise<boolean> => {
    try {
      // Sem body: servidor busca credenciais salvas (Supabase/env)
      const response = await fetch(`/api/phone-numbers/${phoneNumberId}/webhook/override`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(error.error || 'Erro ao remover webhook');
        return false;
      }

      toast.success('Webhook removido!');
      queryClient.invalidateQueries({ queryKey: ['phoneNumbers'] });
      return true;
    } catch (error) {
      toast.error('Erro ao remover webhook');
      return false;
    }
  };

  // Build setup wizard steps based on health status
  const setupSteps = useMemo((): SetupStep[] => {
    const health = healthQuery.data;

    return [
      {
        id: 'qstash',
        title: 'QStash (Upstash)',
        description: 'Filas de mensagens para processamento assíncrono de campanhas. Configure pelo assistente (/install).',
        status: health?.services.qstash?.status === 'ok'
          ? 'configured'
          : health?.services.qstash?.status === 'error'
            ? 'error'
            : 'pending',
        icon: React.createElement(Zap, { size: 20, className: 'text-purple-400' }),
        actionLabel: 'Abrir assistente',
        actionUrl: '/install',
        errorMessage: health?.services.qstash?.message,
        isRequired: true,
      },
      {
        id: 'whatsapp',
        title: 'WhatsApp Business API',
        description: 'Credenciais da Meta para enviar mensagens. (Opcional no início — você pode configurar depois.)',
        status: health?.services.whatsapp?.status === 'ok'
          ? 'configured'
          : health?.services.whatsapp?.status === 'error'
            ? 'error'
            : 'pending',
        icon: React.createElement(MessageSquare, { size: 20, className: 'text-green-400' }),
        errorMessage: health?.services.whatsapp?.message,
        isRequired: false,
      },
    ];
  }, [healthQuery.data]);

  // Check if setup is needed (any required step not configured)
  const needsSetup = useMemo(() => {
    const health = healthQuery.data;
    if (!health) return false; // Don't show wizard while loading - show settings instead

    // Setup é necessário apenas para infra mínima (QStash).
    // WhatsApp é opcional e pode ser configurado depois.
    return health.services.qstash?.status !== 'ok';
  }, [healthQuery.data]);

  // Check if infrastructure is ready (QStash configured)
  const infrastructureReady = useMemo(() => {
    const health = healthQuery.data;
    if (!health) return false;

    return health.services.qstash?.status === 'ok';
  }, [healthQuery.data]);

  // Check if all steps are configured
  const allConfigured = useMemo(() => {
    return setupSteps.every(step => step.status === 'configured');
  }, [setupSteps]);

  return {
    // Settings with testContact merged from Supabase
    settings: {
      ...formSettings,
      testContact: testContactQuery.data || formSettings.testContact,
    },
    setSettings: setFormSettings,
    isLoading: settingsQuery.isLoading || testContactQuery.isLoading,
    isSaving: saveMutation.isPending,
    onSave: handleSave,
    onSaveSettings: handleSaveSettings,
    onDisconnect: handleDisconnect,

    // Test connection (sem salvar)
    onTestConnection: handleTestConnection,
    isTestingConnection,
    // Account limits
    accountLimits,
    refreshLimits,
    tierName,
    limitsError,
    limitsErrorMessage,
    limitsLoading,
    hasLimits,
    // Account health
    accountHealth,
    isCheckingHealth,
    onCheckHealth: handleCheckHealth,
    canSendCampaign,
    getHealthSummary: accountHealth ? () => getHealthSummary(accountHealth) : null,
    // Webhook info
    webhookUrl: webhookQuery.data?.webhookUrl,
    webhookToken: webhookQuery.data?.webhookToken,
    webhookStats: webhookQuery.data?.stats,
    // Meta webhook subscription (messages)
    webhookSubscription: webhookSubscriptionQuery.data,
    webhookSubscriptionLoading: webhookSubscriptionQuery.isLoading,
    refreshWebhookSubscription: () => queryClient.invalidateQueries({ queryKey: ['metaWebhookSubscription'] }),
    subscribeWebhookMessages: async (callbackUrl?: string) => { await subscribeWebhookMessagesMutation.mutateAsync(callbackUrl) },
    unsubscribeWebhookMessages: async () => { await unsubscribeWebhookMessagesMutation.mutateAsync() },
    webhookSubscriptionMutating: subscribeWebhookMessagesMutation.isPending || unsubscribeWebhookMessagesMutation.isPending,
    // Phone numbers for webhook override
    phoneNumbers: phoneNumbersQuery.data || [],
    phoneNumbersLoading: phoneNumbersQuery.isLoading,
    refreshPhoneNumbers: () => queryClient.invalidateQueries({ queryKey: ['phoneNumbers'] }),
    setWebhookOverride,
    removeWebhookOverride,
    // Available domains for webhook URL
    availableDomains,
    webhookPath: domainsQuery.data?.webhookPath || DEFAULT_WEBHOOK_PATH,
    selectedDomain: domainsQuery.data?.currentSelection || null,
    // System health
    systemHealth: healthQuery.data || null,
    systemHealthLoading: healthQuery.isLoading,
    refreshSystemHealth: () => queryClient.invalidateQueries({ queryKey: ['systemStatus'] }),
    // Setup wizard
    setupSteps,
    needsSetup,
    infrastructureReady,
    allConfigured,
    // AI Settings
    aiSettings: aiSettingsQuery.data,
    aiSettingsLoading: aiSettingsQuery.isLoading,
    saveAIConfig: saveAIMutation.mutateAsync,
    removeAIKey: removeAIMutation.mutateAsync,
    isSavingAI: saveAIMutation.isPending,

    // Meta App (opcional)
    metaApp: metaAppQuery.data || null,
    metaAppLoading: metaAppQuery.isLoading,
    refreshMetaApp: () => {
      queryClient.invalidateQueries({ queryKey: ['allSettings'] });
      queryClient.invalidateQueries({ queryKey: ['metaAppConfig'] });
    },
    // Test Contact - persisted in Supabase
    testContact: testContactQuery.data || null,
    testContactLoading: testContactQuery.isLoading,
    saveTestContact: saveTestContactMutation.mutateAsync,
    removeTestContact: removeTestContactMutation.mutateAsync,
    isSavingTestContact: saveTestContactMutation.isPending,

    // WhatsApp Turbo
    whatsappThrottle: whatsappThrottleQuery.data || null,
    whatsappThrottleLoading: whatsappThrottleQuery.isLoading,
    saveWhatsAppThrottle: saveWhatsAppThrottleMutation.mutateAsync,
    isSavingWhatsAppThrottle: saveWhatsAppThrottleMutation.isPending,

    // Auto-supressão (Proteção de Qualidade)
    autoSuppression: autoSuppressionQuery.data || null,
    autoSuppressionLoading: autoSuppressionQuery.isLoading,
    saveAutoSuppression: saveAutoSuppressionMutation.mutateAsync,
    isSavingAutoSuppression: saveAutoSuppressionMutation.isPending,

    // Calendar Booking (Google Calendar)
    calendarBooking: calendarBookingQuery.data || null,
    calendarBookingLoading: calendarBookingQuery.isLoading,
    saveCalendarBooking: saveCalendarBookingMutation.mutateAsync,
    isSavingCalendarBooking: saveCalendarBookingMutation.isPending,

    workflowExecution: workflowExecutionQuery.data || null,
    workflowExecutionLoading: workflowExecutionQuery.isLoading,
    saveWorkflowExecution: saveWorkflowExecutionMutation.mutateAsync,
    isSavingWorkflowExecution: saveWorkflowExecutionMutation.isPending,

    // Upstash Config (métricas de uso do QStash)
    upstashConfig: upstashConfigQuery.data || null,
    upstashConfigLoading: upstashConfigQuery.isLoading,
    saveUpstashConfig: saveUpstashConfigMutation.mutateAsync,
    removeUpstashConfig: removeUpstashConfigMutation.mutateAsync,
    isSavingUpstashConfig: saveUpstashConfigMutation.isPending,

  };
};  
