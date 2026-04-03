import { Template, TemplateStatus } from '../types';
import { canonicalTemplateCategory } from '@/lib/template-category';
import { api } from '@/lib/api';

export class TemplateServiceError extends Error {
  constructor(message: string, public code: 'NOT_CONFIGURED' | 'FETCH_FAILED') {
    super(message);
    this.name = 'TemplateServiceError';
  }
}

// Tipos para geração em massa (simplificado)
export type UtilityCategory =
  | 'order_confirmation'
  | 'shipping_update'
  | 'delivery_notification'
  | 'payment_reminder'
  | 'appointment_reminder'
  | 'account_update'
  | 'ticket_status'
  | 'subscription_update'
  | 'feedback_request'
  | 'verification_code'
  | 'password_reset'
  | 'security_alert'
  | 'reservation_confirmation'
  | 'service_completion'
  | 'document_ready';

export interface GeneratedTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
}

export interface GeneratedTemplateHeader {
  format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
}

export interface GeneratedTemplateFooter {
  text: string;
}

export interface GeneratedTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  description: string;
  language: string;
  status: 'DRAFT';
  // Optional generated fields
  header?: GeneratedTemplateHeader;
  footer?: GeneratedTemplateFooter;
  buttons?: GeneratedTemplateButton[];
  // AI Agent fields
  judgment?: {
    approved: boolean;
    issues: Array<{ reason: string; fix?: string }>;
    originalScore: number;
  };
  wasFixed?: boolean;
}

// Simplificado: só precisa do prompt, quantidade e idioma
export interface GenerateUtilityParams {
  prompt: string;
  quantity?: number;
  language?: 'pt_BR' | 'en_US' | 'es_ES';
}

export interface GenerateUtilityResponse {
  templates: GeneratedTemplate[];
  metadata: {
    prompt: string;
    quantity: number;
    language: string;
    suggestedTitle?: string;
  };
}

export const templateService = {
  getAll: async (): Promise<Template[]> => {
    // Local-first: lê do Supabase e evita chamada à Meta no caminho crítico
    const response = await fetch('/api/templates?source=local', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new TemplateServiceError(
        errorData.error || 'Falha ao buscar templates da Meta',
        response.status === 401 ? 'NOT_CONFIGURED' : 'FETCH_FAILED'
      );
    }

    const data = await response.json().catch(() => [])
    if (!Array.isArray(data)) return []

    // Normaliza categoria para o padrão do app (ex.: UTILITY -> UTILIDADE)
    return (data as any[]).map((t) => ({
      ...t,
      category: canonicalTemplateCategory(t?.category),
    })) as Template[]
  },

  sync: async (): Promise<number> => {
    // Sincroniza com Meta (manual) e retorna total obtido
    const response = await fetch('/api/templates?sync=1', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new TemplateServiceError(
        errorData.error || 'Falha ao sincronizar templates da Meta',
        response.status === 401 ? 'NOT_CONFIGURED' : 'FETCH_FAILED'
      );
    }

    const payload = await response.json();
    if (Array.isArray(payload)) return payload.length;
    if (typeof payload?.count === 'number') return payload.count;
    if (typeof payload?.total === 'number') return payload.total;
    return 0;
  },

  // Note: Templates are created in Meta Business Manager and synced via getAll()
  // This method is kept for future local draft functionality
  add: async (template: Omit<Template, 'id' | 'status' | 'lastUpdated' | 'preview'>): Promise<Template> => {
    // For now, throw an error since templates should be created in Meta
    throw new Error('Templates devem ser criados no Meta Business Manager');
  },

  generateUtilityTemplates: (params: GenerateUtilityParams): Promise<GenerateUtilityResponse> =>
    api.post<GenerateUtilityResponse>('/api/ai/generate-utility-templates', {
      prompt: params.prompt,
      quantity: params.quantity || 5,
      language: params.language || 'pt_BR',
    }),

  // Criar template diretamente na Meta via API
  createInMeta: async (template: { name: string; content: string; language?: string }): Promise<{ success: boolean; message: string }> => {
    const data = await api.post<{ message: string }>('/api/templates/create', {
      name: template.name,
      content: template.content,
      language: template.language || 'pt_BR',
      category: 'UTILITY',
    });
    return { success: true, message: data.message };
  },

  // Criar múltiplos templates na Meta via API
  createBulkInMeta: (templates: Array<{
    name: string;
    content: string;
    language?: string;
    category?: string;
    exampleVariables?: string[];
    header?: { format: string; text?: string };
    footer?: { text: string };
    buttons?: Array<{ type: string; text?: string; url?: string; phone_number?: string }>;
  }>): Promise<{
    total: number;
    created: number;
    failed: number;
    success: string[];
    errors: Array<{ name: string; error: string }>;
  }> => api.post('/api/templates/create', { templates }),

  // Exportar template para formato Meta (para copiar/colar no Business Manager) - mantido como fallback
  exportForMeta: (template: GeneratedTemplate): string => {
    return JSON.stringify({
      name: template.name,
      language: template.language,
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: template.content,
          example: {
            body_text: [template.variables.map((_, i) => `Exemplo ${i + 1}`)]
          }
        }
      ]
    }, null, 2);
  },

  // Buscar detalhes de um template específico
  getByName: (
    name: string,
    options?: { refreshPreview?: boolean }
  ): Promise<Template & {
    header?: string | null;
    footer?: string | null;
    buttons?: Array<{ type: string; text: string; url?: string }>;
    headerMediaPreviewUrl?: string | null;
    headerMediaPreviewExpiresAt?: string | null;
    qualityScore?: string | null;
    rejectedReason?: string | null;
  }> => {
    const query = options?.refreshPreview ? '?refresh_preview=1' : '';
    return api.get(`/api/templates/${encodeURIComponent(name)}${query}`);
  },

  // Deletar template da Meta
  delete: async (name: string): Promise<{ success: boolean; message: string }> => {
    const response = await fetch(`/api/templates/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao deletar template');
    }

    return data;
  },

  // Deletar múltiplos templates da Meta
  deleteBulk: (names: string[]): Promise<{
    total: number;
    deleted: number;
    failed: number;
    success: string[];
    errors: Array<{ name: string; error: string }>;
  }> => api.post('/api/templates/bulk-delete', { names }),

  // Upload de mídia para header de template (retorna header_handle)
  uploadHeaderMedia: async (file: File, format: string): Promise<{ handle: string }> => {
    // Usar FormData (padrão da indústria para uploads de arquivos)
    const fd = new FormData();
    fd.set('file', file);
    fd.set('format', format);

    const response = await fetch('/api/meta/uploads/template-header', {
      method: 'POST',
      body: fd,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      // Capturar detalhes do erro para debugging
      const errorMsg = data?.error || data?.message || '';
      const errorDetails = data?.details?.message || (typeof data?.details === 'string' ? data.details : '');
      const statusText = response.statusText || '';

      let msg = String(errorMsg || 'Falha ao enviar mídia');

      // Se tiver detalhes adicionais, incluir
      if (errorDetails && !msg.includes(String(errorDetails))) {
        msg += ` (${errorDetails})`;
      }

      // Se não tiver mensagem mas tiver status, incluir
      if (!errorMsg && statusText) {
        msg = `Falha ao enviar mídia: ${statusText} (${response.status})`;
      }

      console.error('[uploadHeaderMedia] Erro:', { status: response.status, data });
      throw new Error(msg);
    }

    const handle = String(data?.handle || '').trim();
    if (!handle) {
      throw new Error('Upload concluído, mas não recebemos o header_handle.');
    }

    return { handle };
  },
};
