import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHookWithProviders, waitFor, act } from '@/tests/helpers/hook-test-utils'
import { buildCampaign } from '@/tests/helpers/factories'

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

// Mock query-invalidation
vi.mock('@/lib/query-invalidation', () => ({
  invalidateCampaigns: vi.fn(),
}))

// Mock campaignService
const mockList = vi.fn()
const mockDelete = vi.fn()
const mockDuplicate = vi.fn()
const mockUpdateCampaignFolder = vi.fn()

vi.mock('@/services/campaignService', () => ({
  campaignService: {
    list: (...args: unknown[]) => mockList(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    duplicate: (...args: unknown[]) => mockDuplicate(...args),
    updateCampaignFolder: (...args: unknown[]) => mockUpdateCampaignFolder(...args),
  },
}))

import { useCampaignsQuery, useCampaignMutations, useCampaignsController } from './useCampaigns'

// =============================================================================
// FIXTURES
// =============================================================================

const mockCampaigns = [
  buildCampaign({ name: 'Black Friday' }),
  buildCampaign({ name: 'Natal' }),
  buildCampaign({ name: 'Ano Novo' }),
]

const mockListResult = {
  data: mockCampaigns,
  total: 3,
}

// =============================================================================
// useCampaignsQuery
// =============================================================================

describe('useCampaignsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(mockListResult)
  })

  it('deve chamar campaignService.list com parâmetros corretos', async () => {
    const params = { page: 1, search: '', status: 'All' }
    const { result } = renderHookWithProviders(() => useCampaignsQuery(params))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        search: '',
        status: 'All',
      })
    )
  })

  it('deve calcular offset correto para página 2', async () => {
    const params = { page: 2, search: '', status: 'All' }
    const { result } = renderHookWithProviders(() => useCampaignsQuery(params))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 20 })
    )
  })

  it('deve retornar dados após fetch', async () => {
    const params = { page: 1, search: '', status: 'All' }
    const { result } = renderHookWithProviders(() => useCampaignsQuery(params))

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })

    expect(result.current.data).toEqual(mockListResult)
  })

  it('deve passar busca e filtros', async () => {
    const params = { page: 1, search: 'Black', status: 'COMPLETED', folderId: 'folder-1', tagIds: ['tag-1'] }
    renderHookWithProviders(() => useCampaignsQuery(params))

    await waitFor(() => {
      expect(mockList).toHaveBeenCalled()
    })

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Black',
        status: 'COMPLETED',
        folderId: 'folder-1',
        tagIds: ['tag-1'],
      })
    )
  })
})

// =============================================================================
// useCampaignMutations
// =============================================================================

describe('useCampaignMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockResolvedValue(undefined)
    mockDuplicate.mockResolvedValue(buildCampaign({ name: 'Black Friday (cópia)' }))
    mockUpdateCampaignFolder.mockResolvedValue(undefined)
  })

  it('deve retornar funções de mutation', () => {
    const { result } = renderHookWithProviders(() => useCampaignMutations())

    expect(typeof result.current.deleteCampaign).toBe('function')
    expect(typeof result.current.duplicateCampaign).toBe('function')
    expect(typeof result.current.moveToFolder).toBe('function')
  })

  it('deve iniciar com loading states inativos', () => {
    const { result } = renderHookWithProviders(() => useCampaignMutations())

    expect(result.current.isDeleting).toBe(false)
    expect(result.current.isDuplicating).toBe(false)
    expect(result.current.isMovingToFolder).toBe(false)
  })

  it('deve deletar campanha via mutation', async () => {
    const { result } = renderHookWithProviders(() => useCampaignMutations())

    await act(async () => {
      result.current.deleteCampaign('campaign-1')
    })

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(false)
    })

    expect(mockDelete.mock.calls[0][0]).toBe('campaign-1')
  })

  it('deve duplicar campanha e armazenar lastDuplicatedCampaignId', async () => {
    const cloned = buildCampaign({ name: 'Cópia' })
    mockDuplicate.mockResolvedValue(cloned)

    const { result } = renderHookWithProviders(() => useCampaignMutations())

    await act(async () => {
      result.current.duplicateCampaign('campaign-1')
    })

    await waitFor(() => {
      expect(result.current.isDuplicating).toBe(false)
    })

    expect(mockDuplicate.mock.calls[0][0]).toBe('campaign-1')
    expect(result.current.lastDuplicatedCampaignId).toBe(cloned.id)
  })

  it('deve limpar lastDuplicatedCampaignId', async () => {
    const cloned = buildCampaign()
    mockDuplicate.mockResolvedValue(cloned)

    const { result } = renderHookWithProviders(() => useCampaignMutations())

    await act(async () => {
      result.current.duplicateCampaign('campaign-1')
    })

    await waitFor(() => {
      expect(result.current.lastDuplicatedCampaignId).toBeDefined()
    })

    act(() => {
      result.current.clearLastDuplicatedCampaignId()
    })

    expect(result.current.lastDuplicatedCampaignId).toBeUndefined()
  })

  it('deve mover campanha para pasta', async () => {
    const { result } = renderHookWithProviders(() => useCampaignMutations())

    await act(async () => {
      result.current.moveToFolder({ campaignId: 'c-1', folderId: 'f-1' })
    })

    await waitFor(() => {
      expect(result.current.isMovingToFolder).toBe(false)
    })

    const callArgs = mockUpdateCampaignFolder.mock.calls[0]
    expect(callArgs[0]).toBe('c-1')
    expect(callArgs[1]).toBe('f-1')
  })
})

// =============================================================================
// useCampaignsController
// =============================================================================

describe('useCampaignsController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(mockListResult)
    mockDelete.mockResolvedValue(undefined)
    mockDuplicate.mockResolvedValue(buildCampaign())
    mockUpdateCampaignFolder.mockResolvedValue(undefined)
  })

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  describe('dados', () => {
    it('deve carregar campanhas', async () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.campaigns).toEqual(mockCampaigns)
      expect(result.current.totalFiltered).toBe(3)
    })

    it('deve aceitar initialData', async () => {
      const { result } = renderHookWithProviders(
        () => useCampaignsController(mockListResult)
      )

      expect(result.current.campaigns).toEqual(mockCampaigns)
      expect(result.current.isLoading).toBe(false)
    })

    it('deve retornar array vazio quando sem dados', async () => {
      mockList.mockResolvedValue({ data: [], total: 0 })

      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.campaigns).toEqual([])
      expect(result.current.totalFiltered).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Filters & Pagination
  // ---------------------------------------------------------------------------

  describe('filtros e paginação', () => {
    it('deve ter filtros com valores padrão', () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      expect(result.current.filter).toBe('All')
      expect(result.current.searchTerm).toBe('')
      expect(result.current.currentPage).toBe(1)
      expect(result.current.folderFilter).toBeNull()
      expect(result.current.tagFilter).toEqual([])
    })

    it('deve atualizar filtro de status', async () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      act(() => {
        result.current.setFilter('COMPLETED')
      })

      expect(result.current.filter).toBe('COMPLETED')
    })

    it('deve atualizar termo de busca', () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      act(() => {
        result.current.setSearchTerm('Black')
      })

      expect(result.current.searchTerm).toBe('Black')
    })

    it('deve calcular totalPages corretamente', async () => {
      mockList.mockResolvedValue({ data: mockCampaigns, total: 45 })

      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // 45 items / 20 per page = 3 pages (ceil)
      expect(result.current.totalPages).toBe(3)
    })

    it('deve navegar entre páginas', async () => {
      mockList.mockResolvedValue({ data: mockCampaigns, total: 45 })

      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setCurrentPage(2)
      })

      expect(result.current.currentPage).toBe(2)
    })

    it('deve ter totalPages mínimo de 1', async () => {
      mockList.mockResolvedValue({ data: [], total: 0 })

      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.totalPages).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  describe('ações', () => {
    it('deve ter handlers de ação', async () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      expect(typeof result.current.onDelete).toBe('function')
      expect(typeof result.current.onDuplicate).toBe('function')
      expect(typeof result.current.onRefresh).toBe('function')
      expect(typeof result.current.onMoveToFolder).toBe('function')
    })

    it('deve chamar delete ao usar onDelete', async () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        result.current.onDelete('campaign-1')
      })

      expect(mockDelete.mock.calls[0][0]).toBe('campaign-1')
    })

    it('deve chamar duplicate ao usar onDuplicate', async () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        result.current.onDuplicate('campaign-1')
      })

      expect(mockDuplicate.mock.calls[0][0]).toBe('campaign-1')
    })
  })

  // ---------------------------------------------------------------------------
  // Return Shape
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('deve retornar todas as propriedades do controller', async () => {
      const { result } = renderHookWithProviders(() => useCampaignsController())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Data
      expect(result.current).toHaveProperty('campaigns')
      expect(result.current).toHaveProperty('totalFiltered')
      expect(result.current).toHaveProperty('error')

      // Filters
      expect(result.current).toHaveProperty('filter')
      expect(result.current).toHaveProperty('searchTerm')
      expect(result.current).toHaveProperty('folderFilter')
      expect(result.current).toHaveProperty('tagFilter')

      // Pagination
      expect(result.current).toHaveProperty('currentPage')
      expect(result.current).toHaveProperty('totalPages')

      // Actions
      expect(result.current).toHaveProperty('onDelete')
      expect(result.current).toHaveProperty('onDuplicate')
      expect(result.current).toHaveProperty('onRefresh')
      expect(result.current).toHaveProperty('onMoveToFolder')

      // Loading states
      expect(result.current).toHaveProperty('isDeleting')
      expect(result.current).toHaveProperty('isDuplicating')
      expect(result.current).toHaveProperty('isMovingToFolder')
    })
  })
})
