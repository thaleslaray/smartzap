import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHookWithProviders, waitFor, act } from '@/tests/helpers/hook-test-utils'
import { buildTemplate } from '@/tests/helpers/factories'

// Mock Supabase Realtime
vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(),
  subscribeToTable: vi.fn(),
  activateChannel: vi.fn(),
  removeChannel: vi.fn(),
}))

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

// Mock business logic
vi.mock('@/lib/business/template', () => ({
  filterTemplates: (templates: unknown[], opts: { searchTerm: string; category: string; status: string }) => {
    let filtered = templates as any[]
    if (opts.searchTerm) {
      filtered = filtered.filter((t: any) => t.name?.toLowerCase().includes(opts.searchTerm.toLowerCase()))
    }
    if (opts.category && opts.category !== 'ALL') {
      filtered = filtered.filter((t: any) => t.category === opts.category)
    }
    if (opts.status && opts.status !== 'ALL') {
      filtered = filtered.filter((t: any) => t.status === opts.status)
    }
    return filtered
  },
  filterByDraftIds: (templates: unknown[], ids: Set<string>) => {
    return (templates as any[]).filter(t => ids.has(t.id))
  },
  filterExcludingIds: (templates: unknown[], ids: Set<string>) => {
    return (templates as any[]).filter(t => !ids.has(t.id))
  },
  computeDraftSendStates: () => ({}),
  getDraftBlockReason: () => null,
  toggleTemplateSelection: (prev: Set<string>, id: string) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  },
  selectAllTemplatesByName: () => new Set<string>(),
  selectAllGeneratedTemplates: () => new Set<string>(),
  clearSelection: () => new Set<string>(),
  pruneSelection: (prev: Set<string>) => prev,
  removeFromSelection: (prev: Set<string>, id: string) => {
    const next = new Set(prev)
    next.delete(id)
    return next
  },
}))

// Mock templateService
const mockGetAll = vi.fn()
const mockSync = vi.fn()
const mockDeleteTemplate = vi.fn()
const mockDeleteBulk = vi.fn()
const mockGetByName = vi.fn()
const mockGenerateUtility = vi.fn()
const mockCreateBulkInMeta = vi.fn()

vi.mock('@/services/templateService', () => ({
  templateService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    sync: (...args: unknown[]) => mockSync(...args),
    delete: (...args: unknown[]) => mockDeleteTemplate(...args),
    deleteBulk: (...args: unknown[]) => mockDeleteBulk(...args),
    getByName: (...args: unknown[]) => mockGetByName(...args),
    generateUtilityTemplates: (...args: unknown[]) => mockGenerateUtility(...args),
    createBulkInMeta: (...args: unknown[]) => mockCreateBulkInMeta(...args),
  },
  // Re-export type stubs
  UtilityCategory: {},
}))

// Mock manualDraftsService
const mockListDrafts = vi.fn()
const mockCreateDraft = vi.fn()
const mockSubmitDraft = vi.fn()
const mockRemoveDraft = vi.fn()
const mockCloneDraft = vi.fn()

vi.mock('@/services/manualDraftsService', () => ({
  manualDraftsService: {
    list: (...args: unknown[]) => mockListDrafts(...args),
    create: (...args: unknown[]) => mockCreateDraft(...args),
    submit: (...args: unknown[]) => mockSubmitDraft(...args),
    remove: (...args: unknown[]) => mockRemoveDraft(...args),
    clone: (...args: unknown[]) => mockCloneDraft(...args),
  },
}))

import { useTemplatesController } from './useTemplates'

// =============================================================================
// FIXTURES
// =============================================================================

const mockTemplates = [
  buildTemplate({ name: 'welcome_msg', status: 'APPROVED', category: 'MARKETING' }),
  buildTemplate({ name: 'order_confirm', status: 'APPROVED', category: 'UTILIDADE' }),
  buildTemplate({ name: 'promo_jan', status: 'PENDING', category: 'MARKETING' }),
  buildTemplate({ name: 'draft_test', status: 'DRAFT', category: 'MARKETING' }),
]

// =============================================================================
// TESTES
// =============================================================================

describe('useTemplatesController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAll.mockResolvedValue(mockTemplates)
    mockListDrafts.mockResolvedValue([])
  })

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  describe('carregamento de dados', () => {
    it('deve carregar templates', async () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockGetAll).toHaveBeenCalledOnce()
    })

    it('deve carregar rascunhos manuais', async () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockListDrafts).toHaveBeenCalledOnce()
    })

    it('deve retornar templates filtrados por status APPROVED (padrão)', async () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Status padrão é 'APPROVED', então só welcome_msg e order_confirm
      expect(result.current.templates.length).toBe(2)
      expect(result.current.templates.every((t: any) => t.status === 'APPROVED')).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------

  describe('filtros', () => {
    it('deve ter filtros com valores padrão', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(result.current.searchTerm).toBe('')
      expect(result.current.categoryFilter).toBe('ALL')
      expect(result.current.statusFilter).toBe('APPROVED')
    })

    it('deve atualizar busca', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.setSearchTerm('welcome')
      })

      expect(result.current.searchTerm).toBe('welcome')
    })

    it('deve atualizar filtro de categoria', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.setCategoryFilter('MARKETING')
      })

      expect(result.current.categoryFilter).toBe('MARKETING')
    })

    it('deve atualizar filtro de status', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.setStatusFilter('PENDING')
      })

      expect(result.current.statusFilter).toBe('PENDING')
    })

    it('deve filtrar por busca', async () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setSearchTerm('welcome')
        result.current.setStatusFilter('ALL')
      })

      await waitFor(() => {
        expect(result.current.templates.length).toBe(1)
      })

      expect(result.current.templates[0].name).toBe('welcome_msg')
    })

    it('deve ter statusCounts', async () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.statusCounts).toBeDefined()
      expect(typeof result.current.statusCounts.APPROVED).toBe('number')
      expect(typeof result.current.statusCounts.PENDING).toBe('number')
      expect(typeof result.current.statusCounts.ALL).toBe('number')
    })
  })

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  describe('sincronização', () => {
    it('deve ter função onSync', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(typeof result.current.onSync).toBe('function')
    })

    it('deve chamar sync mutation', async () => {
      mockSync.mockResolvedValue(5)

      const { result } = renderHookWithProviders(() => useTemplatesController())

      await act(async () => {
        result.current.onSync()
      })

      await waitFor(() => {
        expect(result.current.isSyncing).toBe(false)
      })

      expect(mockSync).toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  describe('exclusão', () => {
    it('deve abrir modal de delete', () => {
      const template = mockTemplates[0]
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onDeleteClick(template)
      })

      expect(result.current.isDeleteModalOpen).toBe(true)
      expect(result.current.templateToDelete).toBe(template)
    })

    it('deve cancelar delete', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onDeleteClick(mockTemplates[0])
      })

      act(() => {
        result.current.onCancelDelete()
      })

      expect(result.current.isDeleteModalOpen).toBe(false)
      expect(result.current.templateToDelete).toBeNull()
    })

    it('deve confirmar delete', async () => {
      mockDeleteTemplate.mockResolvedValue(undefined)

      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onDeleteClick(mockTemplates[0])
      })

      await act(async () => {
        result.current.onConfirmDelete()
      })

      expect(mockDeleteTemplate.mock.calls[0][0]).toBe(mockTemplates[0].name)
    })
  })

  // ---------------------------------------------------------------------------
  // Multi-select (Meta Templates)
  // ---------------------------------------------------------------------------

  describe('multi-seleção Meta', () => {
    it('deve iniciar sem seleção', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(result.current.selectedMetaTemplates.size).toBe(0)
    })

    it('deve ter funções de seleção', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(typeof result.current.onToggleMetaTemplate).toBe('function')
      expect(typeof result.current.onSelectAllMetaTemplates).toBe('function')
      expect(typeof result.current.onClearSelection).toBe('function')
    })

    it('deve toggle seleção', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onToggleMetaTemplate('template-1')
      })

      expect(result.current.selectedMetaTemplates.has('template-1')).toBe(true)

      act(() => {
        result.current.onToggleMetaTemplate('template-1')
      })

      expect(result.current.selectedMetaTemplates.has('template-1')).toBe(false)
    })

    it('deve limpar seleção', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onToggleMetaTemplate('t-1')
        result.current.onToggleMetaTemplate('t-2')
      })

      act(() => {
        result.current.onClearSelection()
      })

      expect(result.current.selectedMetaTemplates.size).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Bulk Delete
  // ---------------------------------------------------------------------------

  describe('exclusão em massa', () => {
    it('deve iniciar com modal fechado', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(result.current.isBulkDeleteModalOpen).toBe(false)
    })

    it('deve impedir bulk delete sem seleção', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onBulkDeleteClick()
      })

      // Toast de erro deve ter sido chamado (mock), modal não abre
      expect(result.current.isBulkDeleteModalOpen).toBe(false)
    })

    it('deve abrir modal com seleção', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onToggleMetaTemplate('t-1')
      })

      act(() => {
        result.current.onBulkDeleteClick()
      })

      expect(result.current.isBulkDeleteModalOpen).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Details Modal
  // ---------------------------------------------------------------------------

  describe('modal de detalhes', () => {
    it('deve iniciar fechado', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(result.current.isDetailsModalOpen).toBe(false)
      expect(result.current.selectedTemplate).toBeNull()
    })

    it('deve fechar detalhes', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.onCloseDetails()
      })

      expect(result.current.isDetailsModalOpen).toBe(false)
      expect(result.current.selectedTemplate).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Bulk Generator
  // ---------------------------------------------------------------------------

  describe('gerador em lote', () => {
    it('deve iniciar com modal fechado', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(result.current.isBulkModalOpen).toBe(false)
      expect(result.current.generatedTemplates).toEqual([])
    })

    it('deve abrir e fechar modal', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      act(() => {
        result.current.setIsBulkModalOpen(true)
      })

      expect(result.current.isBulkModalOpen).toBe(true)

      act(() => {
        result.current.onCloseBulkModal()
      })

      expect(result.current.isBulkModalOpen).toBe(false)
      expect(result.current.generatedTemplates).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // Manual Drafts
  // ---------------------------------------------------------------------------

  describe('rascunhos manuais', () => {
    it('deve expor manualDraftIds', async () => {
      mockListDrafts.mockResolvedValue([{ id: 'draft-1', name: 'test' }])

      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.manualDraftIds).toBeDefined()
    })

    it('deve ter funções de rascunho', () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      expect(typeof result.current.createManualDraft).toBe('function')
      expect(typeof result.current.submitManualDraft).toBe('function')
      expect(typeof result.current.deleteManualDraft).toBe('function')
      expect(typeof result.current.cloneTemplate).toBe('function')
    })
  })

  // ---------------------------------------------------------------------------
  // Return Shape
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('deve retornar todas as propriedades esperadas', async () => {
      const { result } = renderHookWithProviders(() => useTemplatesController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Data
      expect(result.current).toHaveProperty('templates')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('isSyncing')

      // Filters
      expect(result.current).toHaveProperty('searchTerm')
      expect(result.current).toHaveProperty('categoryFilter')
      expect(result.current).toHaveProperty('statusFilter')
      expect(result.current).toHaveProperty('statusCounts')

      // Sync
      expect(result.current).toHaveProperty('onSync')

      // Delete
      expect(result.current).toHaveProperty('isDeleteModalOpen')
      expect(result.current).toHaveProperty('templateToDelete')
      expect(result.current).toHaveProperty('isDeleting')

      // Multi-select
      expect(result.current).toHaveProperty('selectedMetaTemplates')
      expect(result.current).toHaveProperty('isBulkDeleteModalOpen')

      // Bulk generator
      expect(result.current).toHaveProperty('isBulkModalOpen')
      expect(result.current).toHaveProperty('generatedTemplates')

      // Manual drafts
      expect(result.current).toHaveProperty('manualDraftIds')
      expect(result.current).toHaveProperty('createManualDraft')
      expect(result.current).toHaveProperty('cloneTemplate')
    })
  })
})
