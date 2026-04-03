/**
 * Mocks Tipados para os Db objects de lib/supabase-db.ts
 *
 * Cada mock retorna vi.fn() stubs com returns configuráveis,
 * tipados contra as interfaces de types.ts.
 *
 * @example
 * ```ts
 * vi.mock('@/lib/supabase-db', () => createAllDbMocks())
 *
 * // Ou mock individual:
 * vi.mock('@/lib/supabase-db', () => ({
 *   campaignDb: createCampaignDbMock(),
 * }))
 * ```
 */

import { vi } from 'vitest'
import type {
  Campaign,
  Contact,
  ContactStatus,
  Template,
  LeadForm,
  AppSettings,
  CampaignFolder,
  CampaignTag,
  TemplateProject,
  TemplateProjectItem,
  CreateTemplateProjectDTO,
  CustomFieldDefinition,
} from '@/types'

// ---------------------------------------------------------------------------
// Individual Db Mocks
// ---------------------------------------------------------------------------

export function createCampaignDbMock() {
  return {
    getAll: vi.fn<() => Promise<Campaign[]>>().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: vi.fn<(id: string) => Promise<Campaign | undefined>>().mockResolvedValue(undefined),
    create: vi.fn<(input: any) => Promise<Campaign>>().mockImplementation(async (input) => ({
      id: 'mock-campaign-id',
      name: input.name,
      status: 'Rascunho' as any,
      templateName: input.templateName,
      recipients: input.recipients ?? 0,
      sent: 0,
      delivered: 0,
      read: 0,
      skipped: 0,
      failed: 0,
      createdAt: new Date().toISOString(),
    })),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    duplicate: vi.fn<(id: string) => Promise<Campaign | undefined>>().mockResolvedValue(undefined),
    updateStatus: vi.fn<(id: string, data: Partial<Campaign>) => Promise<Campaign | undefined>>().mockResolvedValue(undefined),
    pause: vi.fn<(id: string) => Promise<Campaign | undefined>>().mockResolvedValue(undefined),
    resume: vi.fn<(id: string) => Promise<Campaign | undefined>>().mockResolvedValue(undefined),
    start: vi.fn<(id: string) => Promise<Campaign | undefined>>().mockResolvedValue(undefined),
  }
}

export function createContactDbMock() {
  return {
    getAll: vi.fn<() => Promise<Contact[]>>().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getIds: vi.fn().mockResolvedValue([]),
    getById: vi.fn<(id: string) => Promise<Contact | undefined>>().mockResolvedValue(undefined),
    getByPhone: vi.fn<(phone: string) => Promise<Contact | undefined>>().mockResolvedValue(undefined),
    add: vi.fn().mockImplementation(async (input) => ({
      id: 'mock-contact-id',
      ...input,
      lastActive: 'Agora mesmo',
    })),
    update: vi.fn<(id: string, data: Partial<Contact>) => Promise<Contact | undefined>>().mockResolvedValue(undefined),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(0),
    import: vi.fn().mockResolvedValue({ inserted: 0, updated: 0 }),
    upsertMergeTagsByPhone: vi.fn().mockImplementation(async (input) => ({
      id: 'mock-contact-id',
      ...input,
      lastActive: 'Agora mesmo',
    })),
    getTags: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total: 0, optIn: 0, optOut: 0 }),
    bulkSetCustomField: vi.fn().mockResolvedValue({ updated: 0, notFound: [] }),
    bulkUpdateTags: vi.fn<(ids: string[], tagsToAdd: string[], tagsToRemove: string[]) => Promise<number>>().mockResolvedValue(0),
    bulkUpdateStatus: vi.fn<(ids: string[], status: ContactStatus) => Promise<number>>().mockResolvedValue(0),
  }
}

export function createTemplateDbMock() {
  return {
    getAll: vi.fn<() => Promise<Template[]>>().mockResolvedValue([]),
    getByName: vi.fn<(name: string) => Promise<Template | undefined>>().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
  }
}

export function createLeadFormDbMock() {
  return {
    getAll: vi.fn<() => Promise<LeadForm[]>>().mockResolvedValue([]),
    getById: vi.fn<(id: string) => Promise<LeadForm | undefined>>().mockResolvedValue(undefined),
    getBySlug: vi.fn<(slug: string) => Promise<LeadForm | undefined>>().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (dto) => ({
      id: 'mock-leadform-id',
      ...dto,
      isActive: dto.isActive ?? true,
      createdAt: new Date().toISOString(),
    })),
    update: vi.fn<(id: string, data: any) => Promise<LeadForm | undefined>>().mockResolvedValue(undefined),
    rotateWebhookToken: vi.fn<(id: string) => Promise<LeadForm | undefined>>().mockResolvedValue(undefined),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  }
}

export function createCampaignContactDbMock() {
  return {
    addContacts: vi.fn().mockResolvedValue(undefined),
    getContacts: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  }
}

export function createSettingsDbMock() {
  return {
    get: vi.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
    set: vi.fn<(key: string, value: string) => Promise<void>>().mockResolvedValue(undefined),
    getAll: vi.fn<() => Promise<AppSettings>>().mockResolvedValue({
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      isConnected: false,
    }),
    saveAll: vi.fn<(settings: AppSettings) => Promise<void>>().mockResolvedValue(undefined),
  }
}

export function createDashboardDbMock() {
  return {
    getStats: vi.fn().mockResolvedValue({
      sent24h: '0',
      deliveryRate: '100%',
      activeCampaigns: '0',
      failedMessages: '0',
      chartData: [],
    }),
  }
}

export function createCustomFieldDefDbMock() {
  return {
    getAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (def) => ({
      id: 'mock-field-id',
      ...def,
      created_at: new Date().toISOString(),
    })),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
  }
}

export function createTemplateProjectDbMock() {
  return {
    getAll: vi.fn<() => Promise<TemplateProject[]>>().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (dto: CreateTemplateProjectDTO) => ({
      id: 'mock-project-id',
      title: dto.title,
      prompt: dto.prompt,
      status: 'draft',
      template_count: dto.items.length,
      approved_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    updateItem: vi.fn().mockResolvedValue(undefined),
    deleteItem: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  }
}

export function createCampaignFolderDbMock() {
  return {
    getAll: vi.fn<() => Promise<CampaignFolder[]>>().mockResolvedValue([]),
    getAllWithCounts: vi.fn<() => Promise<CampaignFolder[]>>().mockResolvedValue([]),
    getById: vi.fn<(id: string) => Promise<CampaignFolder | undefined>>().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (dto) => ({
      id: 'mock-folder-id',
      name: dto.name,
      color: dto.color || '#6B7280',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    getUnfiledCount: vi.fn<() => Promise<number>>().mockResolvedValue(0),
    getTotalCount: vi.fn<() => Promise<number>>().mockResolvedValue(0),
  }
}

export function createCampaignTagDbMock() {
  return {
    getAll: vi.fn<() => Promise<CampaignTag[]>>().mockResolvedValue([]),
    getById: vi.fn<(id: string) => Promise<CampaignTag | undefined>>().mockResolvedValue(undefined),
    create: vi.fn().mockImplementation(async (dto) => ({
      id: 'mock-tag-id',
      name: dto.name,
      color: dto.color || '#6B7280',
      createdAt: new Date().toISOString(),
    })),
    delete: vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
    getForCampaign: vi.fn().mockResolvedValue([]),
    assignToCampaign: vi.fn().mockResolvedValue(undefined),
    addToCampaign: vi.fn().mockResolvedValue(undefined),
    removeFromCampaign: vi.fn().mockResolvedValue(undefined),
  }
}

// ---------------------------------------------------------------------------
// All Mocks Combined
// ---------------------------------------------------------------------------

/**
 * Cria mocks de todos os 11 objetos Db de lib/supabase-db.ts.
 *
 * Uso: `vi.mock('@/lib/supabase-db', () => createAllDbMocks())`
 */
export function createAllDbMocks() {
  return {
    campaignDb: createCampaignDbMock(),
    contactDb: createContactDbMock(),
    templateDb: createTemplateDbMock(),
    leadFormDb: createLeadFormDbMock(),
    campaignContactDb: createCampaignContactDbMock(),
    settingsDb: createSettingsDbMock(),
    dashboardDb: createDashboardDbMock(),
    customFieldDefDb: createCustomFieldDefDbMock(),
    templateProjectDb: createTemplateProjectDbMock(),
    campaignFolderDb: createCampaignFolderDbMock(),
    campaignTagDb: createCampaignTagDbMock(),
  }
}
