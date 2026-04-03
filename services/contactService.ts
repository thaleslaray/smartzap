import { Contact, ContactStatus } from '../types';
import {
  processPhoneNumber
} from '../lib/phone-formatter';
import {
  parseContactsFile,
  parseContactsFromFile,
  generateImportReport,
  type ParseOptions
} from '../lib/csv-parser';
import { logger } from '../lib/logger';
import { api } from '@/lib/api';

export interface ContactStats {
  total: number;
  optIn: number;
  optOut: number;
}

export interface ImportResult {
  imported: number;
  failed: number;
  duplicates: number;
  report: string;
}

export interface ContactListParams {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  tag?: string;
}

export interface ContactListResult {
  data: Contact[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Contact Service
 * All data is stored in Main Database (source of truth)
 */
export const contactService = {
  getAll: (): Promise<Contact[]> =>
    api.get<Contact[]>('/api/contacts', { cache: 'no-store' }),

  // Retorna undefined tanto em 404 quanto em outros erros (comportamento intencional)
  getById: (id: string): Promise<Contact | undefined> =>
    api.safeGet<Contact | undefined>(`/api/contacts/${id}`, undefined, { cache: 'no-store' }),

  getStats: (): Promise<ContactStats> =>
    api.safeGet<ContactStats>('/api/contacts/stats', { total: 0, optIn: 0, optOut: 0 }, { cache: 'no-store' }),

  getTags: (): Promise<string[]> =>
    api.get<string[]>('/api/contacts/tags', { cache: 'no-store' }),

  list: (params: ContactListParams): Promise<ContactListResult> => {
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(params.limit));
    searchParams.set('offset', String(params.offset));
    if (params.search) searchParams.set('search', params.search);
    if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
    if (params.tag && params.tag !== 'ALL') searchParams.set('tag', params.tag);
    return api.get<ContactListResult>(`/api/contacts?${searchParams.toString()}`, { cache: 'no-store' });
  },

  getIds: (params: { search?: string; status?: string; tag?: string }): Promise<string[]> => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
    if (params.tag && params.tag !== 'ALL') searchParams.set('tag', params.tag);
    const qs = searchParams.toString();
    return api.get<string[]>(`/api/contacts/ids${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  },

  /**
   * Add a single contact with phone validation
   */
  add: async (contact: Omit<Contact, 'id' | 'lastActive'>): Promise<Contact> => {
    const { normalized, validation } = processPhoneNumber(contact.phone);

    if (!validation.isValid) {
      logger.warn('Invalid phone number rejected', { phone: contact.phone, error: validation.error });
      throw new Error(validation.error || 'Número de telefone inválido');
    }

    const result = await api.post<Contact>('/api/contacts', { ...contact, phone: normalized });

    logger.info('Contact added', { name: contact.name, phone: normalized });
    return result;
  },

  /**
   * Validate a phone number without saving
   */
  validatePhone: (phone: string): { isValid: boolean; error?: string; normalized?: string } => {
    const { normalized, validation } = processPhoneNumber(phone);
    return {
      isValid: validation.isValid,
      error: validation.error,
      normalized: validation.isValid ? normalized : undefined,
    };
  },

  // Retorna undefined em caso de erro (comportamento intencional — não lança exceção)
  update: async (
    id: string,
    data: (Partial<Omit<Contact, 'id'>> & { email?: string | null })
  ): Promise<Contact | undefined> => {
    if (data.phone) {
      const { normalized, validation } = processPhoneNumber(data.phone);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Número de telefone inválido');
      }
      data.phone = normalized;
    }

    const response = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) return undefined;
    return response.json();
  },

  /**
   * Import contacts from CSV/TXT file content
   */
  importFromContent: async (
    content: string,
    options?: ParseOptions
  ): Promise<ImportResult> => {
    logger.info('Starting contact import', { contentLength: content.length });

    const parseResult = parseContactsFile(content, options);

    if (!parseResult.success) {
      throw new Error('Falha ao processar arquivo');
    }

    const contactsToImport = parseResult.contacts.map(c => ({
      name: c.name || 'Desconhecido',
      phone: c.phone,
      status: ContactStatus.OPT_IN,
      tags: [] as string[],
    }));

    const { imported } = await api.post<{ imported: number }>('/api/contacts/import', { contacts: contactsToImport });

    const result: ImportResult = {
      imported,
      failed: parseResult.invalidRows.length,
      duplicates: parseResult.duplicates.length,
      report: generateImportReport(parseResult),
    };

    logger.info('Contact import completed', { ...result });
    return result;
  },

  /**
   * Import contacts from File object (browser)
   */
  importFromFile: async (
    file: File,
    options?: ParseOptions
  ): Promise<ImportResult> => {
    const parseResult = await parseContactsFromFile(file, options);

    const contactsToImport = parseResult.contacts.map(c => ({
      name: c.name || 'Desconhecido',
      phone: c.phone,
      status: ContactStatus.OPT_IN,
      tags: [] as string[],
    }));

    const { imported } = await api.post<{ imported: number }>('/api/contacts/import', { contacts: contactsToImport });

    return {
      imported,
      failed: parseResult.invalidRows.length,
      duplicates: parseResult.duplicates.length,
      report: generateImportReport(parseResult),
    };
  },

  /**
   * Import contacts with merge strategy
   * - New contacts: inserted
   * - Existing contacts (by phone): updated with merged tags
   */
  import: async (contacts: Omit<Contact, 'id' | 'lastActive'>[]): Promise<{ inserted: number; updated: number }> => {
    const validContacts = contacts
      .map(c => {
        const { normalized, validation } = processPhoneNumber(c.phone);
        if (!validation.isValid) return null;
        return { ...c, phone: normalized };
      })
      .filter((c): c is Omit<Contact, 'id' | 'lastActive'> => c !== null);

    logger.info('Import contacts', { total: contacts.length, valid: validContacts.length });

    const { inserted, updated } = await api.post<{ inserted: number; updated: number }>(
      '/api/contacts/import',
      { contacts: validContacts }
    );
    return { inserted: inserted || 0, updated: updated || 0 };
  },

  delete: (id: string): Promise<void> =>
    api.del(`/api/contacts/${id}`),

  // Mantido raw: DELETE com body JSON + lê { deleted } do response
  deleteMany: async (ids: string[]): Promise<number> => {
    const response = await fetch('/api/contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Falha ao deletar contatos');
    }

    const { deleted } = await response.json();
    return deleted;
  },

  /**
   * Atualiza tags de múltiplos contatos em uma operação.
   */
  bulkUpdateTags: async (ids: string[], tagsToAdd: string[], tagsToRemove: string[]): Promise<number> => {
    const { updated } = await api.post<{ updated: number }>('/api/contacts/bulk-tags', { ids, tagsToAdd, tagsToRemove });
    return updated;
  },

  /**
   * Remove a supressão global de um telefone.
   * Útil para números de teste ou clientes que pediram para voltar a receber.
   */
  unsuppress: async (phone: string): Promise<void> => {
    await api.del(`/api/phone-suppressions/${encodeURIComponent(phone)}`);
    logger.info('Phone unsuppressed', { phone });
  }
};
