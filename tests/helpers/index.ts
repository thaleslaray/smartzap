/**
 * Test Helpers — Barrel Export
 *
 * Entry point único para toda a infraestrutura de testes.
 *
 * @example
 * ```ts
 * import {
 *   buildCampaign,
 *   buildContact,
 *   createMockQueryBuilder,
 *   createAllDbMocks,
 *   setupMSW,
 *   server,
 * } from '@/tests/helpers'
 * ```
 */

// Fase 1 — Mock Supabase
export {
  createMockQueryBuilder,
  mockSupabaseModule,
  configureMockPerTable,
  type MockQueryBuilderOptions,
  type MockQueryBuilder,
} from './supabase-mock'

export {
  createCampaignDbMock,
  createContactDbMock,
  createTemplateDbMock,
  createLeadFormDbMock,
  createCampaignContactDbMock,
  createSettingsDbMock,
  createDashboardDbMock,
  createCustomFieldDefDbMock,
  createTemplateProjectDbMock,
  createCampaignFolderDbMock,
  createCampaignTagDbMock,
  createAllDbMocks,
} from './db-mock'

export {
  cleanupTestData,
  cleanupCampaigns,
  cleanupContacts,
} from './e2e-cleanup'

// Fase 2 — Factories
export {
  buildCampaign,
  buildContact,
  buildTemplate,
  buildInboxConversation,
  buildInboxMessage,
  buildAIAgent,
  buildLeadForm,
  buildCampaignFolder,
  buildCampaignTag,
  buildAppSettings,
  resetFactoryCounters,
} from './factories'

export {
  seedCampaign,
  seedContact,
  seedCampaignWithContacts,
} from './seed'

// Fetch mock (service tests)
export {
  createMockFetchResponse,
  setupFetchMock,
} from './fetch-mock'

// Hook test utils (React Query + renderHook)
export {
  createTestQueryClient,
  renderHookWithProviders,
  waitFor,
  act,
} from './hook-test-utils'

// Fase 3 — MSW (re-export seletivo dos mais usados)
export {
  server,
  setupMSW,
  metaHandlers,
  createMetaErrorResponse,
  paymentErrorHandler,
  rateLimitHandler,
  pairRateLimitHandler,
  templateNotFoundHandler,
  systemErrorHandler,
} from './msw'

// API route test utils
export {
  createApiRequest,
  createRouteContext,
  parseJsonResponse,
} from './api-test-utils'
