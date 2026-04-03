import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHookWithProviders, waitFor, act } from '@/tests/helpers/hook-test-utils'
import { buildInboxConversation, buildInboxMessage } from '@/tests/helpers/factories'

// Mock Supabase Realtime
vi.mock('@/lib/supabase-realtime', () => ({
  createRealtimeChannel: vi.fn(),
  subscribeToTable: vi.fn(),
  activateChannel: vi.fn(),
  removeChannel: vi.fn(),
}))

// Mock Next.js navigation
const mockRouterReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockRouterReplace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/inbox',
}))

// Mock sub-hooks
const mockConversations = vi.fn()
const mockConversationMutations = vi.fn()
const mockConversationWithMessages = vi.fn()
const mockLabels = vi.fn()
const mockQuickReplies = vi.fn()
const mockInboxSettings = vi.fn()

vi.mock('@/hooks/useConversations', () => ({
  useConversations: (...args: unknown[]) => mockConversations(...args),
  useConversationMutations: (...args: unknown[]) => mockConversationMutations(...args),
}))

vi.mock('@/hooks/useConversation', () => ({
  useConversationWithMessages: (...args: unknown[]) => mockConversationWithMessages(...args),
}))

vi.mock('@/hooks/useLabels', () => ({
  useLabels: (...args: unknown[]) => mockLabels(...args),
}))

vi.mock('@/hooks/useQuickReplies', () => ({
  useQuickReplies: (...args: unknown[]) => mockQuickReplies(...args),
}))

vi.mock('@/hooks/useInboxSettings', () => ({
  useInboxSettings: (...args: unknown[]) => mockInboxSettings(...args),
  getHumanModeTimeoutMs: (hours: number) => hours * 60 * 60 * 1000,
}))

// Mock aiAgentService
const mockGetAgent = vi.fn()
const mockUpdateAgent = vi.fn()

vi.mock('@/services/aiAgentService', () => ({
  aiAgentService: {
    get: (...args: unknown[]) => mockGetAgent(...args),
    update: (...args: unknown[]) => mockUpdateAgent(...args),
  },
}))

import { useInbox } from './useInbox'

// =============================================================================
// FIXTURES
// =============================================================================

const mockConversationList = [
  buildInboxConversation({ id: 'conv-1', contact_name: 'João', mode: 'bot' }),
  buildInboxConversation({ id: 'conv-2', contact_name: 'Maria', mode: 'human' }),
  buildInboxConversation({ id: 'conv-3', contact_name: 'Pedro', status: 'closed' }),
]

const mockMessages = [
  buildInboxMessage({ id: 'msg-1', content: 'Olá' }),
  buildInboxMessage({ id: 'msg-2', content: 'Tudo bem?' }),
]

const mockLabelList = [
  { id: 'label-1', name: 'VIP', color: '#ff0000' },
  { id: 'label-2', name: 'Suporte', color: '#0000ff' },
]

const mockQuickReplyList = [
  { id: 'qr-1', title: 'Saudação', content: 'Olá, tudo bem?' },
  { id: 'qr-2', title: 'Despedida', content: 'Até logo!' },
]

// Default return values for sub-hooks
const defaultConversationsReturn = {
  conversations: mockConversationList,
  total: 3,
  totalPages: 1,
  totalUnread: 2,
  isLoading: false,
  hasNextPage: false,
  hasPreviousPage: false,
  isRefetching: false,
  error: null,
  invalidate: vi.fn(),
  refetch: vi.fn(),
}

const defaultMutationsReturn = {
  update: vi.fn().mockResolvedValue({}),
  markAsRead: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue({}),
  reopen: vi.fn().mockResolvedValue({}),
  switchMode: vi.fn().mockResolvedValue({}),
  handoff: vi.fn().mockResolvedValue(undefined),
  returnToBot: vi.fn().mockResolvedValue({}),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  isUpdating: false,
  isMarkingAsRead: false,
  isClosing: false,
  isReopening: false,
  isSwitchingMode: false,
  isHandingOff: false,
  isReturningToBot: false,
  isDeleting: false,
}

const defaultConversationWithMessagesReturn = {
  conversation: null,
  isLoadingConversation: false,
  conversationError: null,
  updateConversation: vi.fn().mockResolvedValue({}),
  markAsRead: vi.fn(),
  pauseAutomation: vi.fn(),
  resumeAutomation: vi.fn(),
  isPausing: false,
  isResuming: false,
  messages: [],
  isLoadingMessages: false,
  isLoadingMore: false,
  hasMoreMessages: false,
  messagesError: null,
  sendMessage: vi.fn().mockResolvedValue({}),
  isSending: false,
  loadMoreMessages: vi.fn(),
  refreshMessages: vi.fn(),
}

const defaultLabelsReturn = {
  labels: mockLabelList,
  isLoading: false,
  error: null,
  create: vi.fn(),
  delete: vi.fn(),
  isCreating: false,
  isDeleting: false,
  refetch: vi.fn(),
}

const defaultQuickRepliesReturn = {
  quickReplies: mockQuickReplyList,
  isLoading: false,
  error: null,
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
  refetch: vi.fn(),
}

const defaultInboxSettingsReturn = {
  settings: { humanModeTimeoutHours: 4, retentionDays: 90 },
  isLoading: false,
  error: null,
  updateSettings: vi.fn(),
  isUpdating: false,
  updateError: null,
  humanModeTimeoutHours: 4,
  retentionDays: 90,
}

// =============================================================================
// TESTES
// =============================================================================

describe('useInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockConversations.mockReturnValue(defaultConversationsReturn)
    mockConversationMutations.mockReturnValue(defaultMutationsReturn)
    mockConversationWithMessages.mockReturnValue(defaultConversationWithMessagesReturn)
    mockLabels.mockReturnValue(defaultLabelsReturn)
    mockQuickReplies.mockReturnValue(defaultQuickRepliesReturn)
    mockInboxSettings.mockReturnValue(defaultInboxSettingsReturn)
  })

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  describe('carregamento de dados', () => {
    it('deve expor conversas do useConversations', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.conversations).toEqual(mockConversationList)
      expect(result.current.total).toBe(3)
      expect(result.current.totalUnread).toBe(2)
    })

    it('deve expor labels do useLabels', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.labels).toEqual(mockLabelList)
    })

    it('deve expor quickReplies do useQuickReplies', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.quickReplies).toEqual(mockQuickReplyList)
    })

    it('deve expor isLoadingConversations', () => {
      mockConversations.mockReturnValue({ ...defaultConversationsReturn, isLoading: true })

      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.isLoadingConversations).toBe(true)
    })

    it('deve passar initialData para sub-hooks', () => {
      const initialData = {
        conversations: mockConversationList,
        labels: mockLabelList,
        quickReplies: mockQuickReplyList,
        totalUnread: 5,
      }

      renderHookWithProviders(() => useInbox({ initialData }))

      // useConversations deve receber initialData.conversations
      expect(mockConversations.mock.calls[0][0]).toHaveProperty(
        'initialData',
        mockConversationList
      )

      // useLabels deve receber initialData.labels
      expect(mockLabels.mock.calls[0][0]).toHaveProperty(
        'initialData',
        mockLabelList
      )

      // useQuickReplies deve receber initialData.quickReplies
      expect(mockQuickReplies.mock.calls[0][0]).toHaveProperty(
        'initialData',
        mockQuickReplyList
      )
    })
  })

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------

  describe('filtros', () => {
    it('deve iniciar com filtros vazios', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.search).toBe('')
      expect(result.current.statusFilter).toBeNull()
      expect(result.current.modeFilter).toBeNull()
      expect(result.current.labelFilter).toBeNull()
      expect(result.current.page).toBe(1)
    })

    it('deve atualizar busca', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      act(() => {
        result.current.onSearchChange('João')
      })

      expect(result.current.search).toBe('João')
    })

    it('deve atualizar filtro de status', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      act(() => {
        result.current.onStatusFilterChange('open' as any)
      })

      expect(result.current.statusFilter).toBe('open')
    })

    it('deve atualizar filtro de modo', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      act(() => {
        result.current.onModeFilterChange('bot' as any)
      })

      expect(result.current.modeFilter).toBe('bot')
    })

    it('deve atualizar filtro de label', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      act(() => {
        result.current.onLabelFilterChange('label-1')
      })

      expect(result.current.labelFilter).toBe('label-1')
    })

    it('deve passar filtros para useConversations', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      act(() => {
        result.current.onSearchChange('test')
        result.current.onStatusFilterChange('open' as any)
        result.current.onModeFilterChange('bot' as any)
        result.current.onLabelFilterChange('label-1')
      })

      // Verifica que useConversations recebeu os filtros
      const lastCall = mockConversations.mock.calls[mockConversations.mock.calls.length - 1][0]
      expect(lastCall.search).toBe('test')
      expect(lastCall.status).toBe('open')
      expect(lastCall.mode).toBe('bot')
      expect(lastCall.labelId).toBe('label-1')
    })
  })

  // ---------------------------------------------------------------------------
  // Conversation Selection
  // ---------------------------------------------------------------------------

  describe('seleção de conversa', () => {
    it('deve iniciar sem seleção', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.selectedConversationId).toBeNull()
      expect(result.current.selectedConversation).toBeNull()
    })

    it('deve aceitar initialConversationId', () => {
      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      expect(result.current.selectedConversationId).toBe('conv-1')
    })

    it('deve selecionar conversa e atualizar URL', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      act(() => {
        result.current.onSelectConversation('conv-1')
      })

      expect(result.current.selectedConversationId).toBe('conv-1')
      expect(mockRouterReplace).toHaveBeenCalled()
    })

    it('deve desselecionar conversa', () => {
      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      act(() => {
        result.current.onSelectConversation(null)
      })

      expect(result.current.selectedConversationId).toBeNull()
    })

    it('deve passar selectedId para useConversationWithMessages', () => {
      renderHookWithProviders(() => useInbox({ initialConversationId: 'conv-1' }))

      expect(mockConversationWithMessages).toHaveBeenCalledWith('conv-1')
    })

    it('deve expor conversation e messages do sub-hook', () => {
      const conv = buildInboxConversation({ id: 'conv-1', mode: 'bot' })
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
        messages: mockMessages,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      expect(result.current.selectedConversation).toEqual(conv)
      expect(result.current.messages).toEqual(mockMessages)
    })
  })

  // ---------------------------------------------------------------------------
  // Send Message (with auto mode switch)
  // ---------------------------------------------------------------------------

  describe('enviar mensagem', () => {
    it('deve enviar mensagem via sendMessage', async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({})
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: buildInboxConversation({ id: 'conv-1', mode: 'human' }),
        sendMessage: sendMessageMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onSendMessage('Olá!')
      })

      expect(sendMessageMock).toHaveBeenCalledWith({
        content: 'Olá!',
        message_type: 'text',
      })
    })

    it('deve auto-trocar para modo human se conversa está em bot', async () => {
      const sendMessageMock = vi.fn().mockResolvedValue({})
      const switchModeMock = vi.fn().mockResolvedValue({})
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: buildInboxConversation({ id: 'conv-1', mode: 'bot' }),
        sendMessage: sendMessageMock,
      })
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        switchMode: switchModeMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onSendMessage('Mensagem manual')
      })

      // Deve ter chamado switchMode para 'human' antes de enviar
      expect(switchModeMock).toHaveBeenCalledWith({ id: 'conv-1', mode: 'human' })
      expect(sendMessageMock).toHaveBeenCalled()
    })

    it('não deve trocar modo se conversa já está em human', async () => {
      const switchModeMock = vi.fn()
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: buildInboxConversation({ id: 'conv-1', mode: 'human' }),
        sendMessage: vi.fn().mockResolvedValue({}),
      })
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        switchMode: switchModeMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onSendMessage('Mensagem')
      })

      expect(switchModeMock).not.toHaveBeenCalled()
    })

    it('não deve enviar se não há conversa selecionada', async () => {
      const sendMessageMock = vi.fn()
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        sendMessage: sendMessageMock,
      })

      const { result } = renderHookWithProviders(() => useInbox())

      await act(async () => {
        await result.current.onSendMessage('Sem conversa')
      })

      expect(sendMessageMock).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Conversation Actions
  // ---------------------------------------------------------------------------

  describe('ações de conversa', () => {
    const setupSelectedConversation = (mode: 'bot' | 'human' = 'bot') => {
      const conv = buildInboxConversation({
        id: 'conv-1',
        mode,
        labels: [{ id: 'label-1', name: 'VIP', color: '#ff0000' }],
      })
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
      })
      return conv
    }

    it('deve alternar modo bot <-> human', async () => {
      setupSelectedConversation('bot')
      const switchModeMock = vi.fn().mockResolvedValue({})
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        switchMode: switchModeMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onModeToggle()
      })

      expect(switchModeMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'conv-1', mode: 'human' })
      )
    })

    it('deve passar timeout correto ao mudar para human', async () => {
      setupSelectedConversation('bot')
      const switchModeMock = vi.fn().mockResolvedValue({})
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        switchMode: switchModeMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onModeToggle()
      })

      // humanModeTimeoutHours = 4, convertido para ms: 4 * 3600 * 1000 = 14400000
      expect(switchModeMock).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 14400000 })
      )
    })

    it('deve fechar conversa', async () => {
      setupSelectedConversation()
      const closeMock = vi.fn().mockResolvedValue({})
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        close: closeMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onCloseConversation()
      })

      expect(closeMock).toHaveBeenCalledWith('conv-1')
    })

    it('deve reabrir conversa', async () => {
      setupSelectedConversation()
      const reopenMock = vi.fn().mockResolvedValue({})
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        reopen: reopenMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onReopenConversation()
      })

      expect(reopenMock).toHaveBeenCalledWith('conv-1')
    })

    it('deve alterar prioridade', async () => {
      setupSelectedConversation()
      const updateMock = vi.fn().mockResolvedValue({})
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: buildInboxConversation({ id: 'conv-1' }),
        updateConversation: updateMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onPriorityChange('high' as any)
      })

      expect(updateMock).toHaveBeenCalledWith({ priority: 'high' })
    })

    it('deve toggle label (adicionar)', async () => {
      const conv = buildInboxConversation({
        id: 'conv-1',
        labels: [{ id: 'label-1', name: 'VIP', color: '#ff0000' }],
      })
      const updateMock = vi.fn().mockResolvedValue({})
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
        updateConversation: updateMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onLabelToggle('label-2') // Adicionar label-2
      })

      expect(updateMock).toHaveBeenCalledWith({
        labels: ['label-1', 'label-2'],
      })
    })

    it('deve toggle label (remover)', async () => {
      const conv = buildInboxConversation({
        id: 'conv-1',
        labels: [
          { id: 'label-1', name: 'VIP', color: '#ff0000' },
          { id: 'label-2', name: 'Suporte', color: '#0000ff' },
        ],
      })
      const updateMock = vi.fn().mockResolvedValue({})
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
        updateConversation: updateMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onLabelToggle('label-1') // Remover label-1
      })

      expect(updateMock).toHaveBeenCalledWith({
        labels: ['label-2'],
      })
    })

    it('deve fazer handoff para humano', async () => {
      setupSelectedConversation()
      const handoffMock = vi.fn().mockResolvedValue(undefined)
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        handoff: handoffMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onHandoff({ reason: 'Cliente insatisfeito' })
      })

      expect(handoffMock).toHaveBeenCalledWith({
        id: 'conv-1',
        reason: 'Cliente insatisfeito',
      })
    })

    it('deve retornar para bot', async () => {
      setupSelectedConversation('human')
      const returnToBotMock = vi.fn().mockResolvedValue({})
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        returnToBot: returnToBotMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onReturnToBot()
      })

      expect(returnToBotMock).toHaveBeenCalledWith('conv-1')
    })

    it('deve deletar conversa e limpar seleção', async () => {
      setupSelectedConversation()
      const deleteMock = vi.fn().mockResolvedValue(undefined)
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        deleteConversation: deleteMock,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onDeleteConversation()
      })

      expect(deleteMock).toHaveBeenCalledWith('conv-1')
      // Seleção deve ser limpa
      expect(result.current.selectedConversationId).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // AI Agent Editing
  // ---------------------------------------------------------------------------

  describe('edição de agente AI', () => {
    it('deve iniciar com modal fechado', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.isAgentModalOpen).toBe(false)
      expect(result.current.editingAgent).toBeNull()
      expect(result.current.isLoadingAgent).toBe(false)
      expect(result.current.isSavingAgent).toBe(false)
    })

    it('deve abrir editor e carregar agente', async () => {
      const agent = { id: 'agent-1', name: 'Bot Vendas', instructions: 'Venda tudo' }
      mockGetAgent.mockResolvedValue(agent)

      const conv = buildInboxConversation({ id: 'conv-1', ai_agent_id: 'agent-1' })
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onOpenAgentEditor()
      })

      expect(mockGetAgent).toHaveBeenCalledWith('agent-1')
      expect(result.current.isAgentModalOpen).toBe(true)
      expect(result.current.editingAgent).toEqual(agent)
    })

    it('deve fechar editor', async () => {
      const agent = { id: 'agent-1', name: 'Bot' }
      mockGetAgent.mockResolvedValue(agent)

      const conv = buildInboxConversation({ id: 'conv-1', ai_agent_id: 'agent-1' })
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onOpenAgentEditor()
      })

      act(() => {
        result.current.onCloseAgentEditor()
      })

      expect(result.current.isAgentModalOpen).toBe(false)
      expect(result.current.editingAgent).toBeNull()
    })

    it('deve salvar alterações no agente', async () => {
      const agent = { id: 'agent-1', name: 'Bot Vendas' }
      mockGetAgent.mockResolvedValue(agent)
      mockUpdateAgent.mockResolvedValue({})

      const conv = buildInboxConversation({ id: 'conv-1', ai_agent_id: 'agent-1' })
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onOpenAgentEditor()
      })

      await act(async () => {
        await result.current.onSaveAgent({ name: 'Bot Atualizado' })
      })

      expect(mockUpdateAgent).toHaveBeenCalledWith('agent-1', { name: 'Bot Atualizado' })
      expect(result.current.isAgentModalOpen).toBe(false)
    })

    it('não deve abrir editor sem ai_agent_id', async () => {
      const conv = buildInboxConversation({ id: 'conv-1' }) // sem ai_agent_id
      mockConversationWithMessages.mockReturnValue({
        ...defaultConversationWithMessagesReturn,
        conversation: conv,
      })

      const { result } = renderHookWithProviders(() =>
        useInbox({ initialConversationId: 'conv-1' })
      )

      await act(async () => {
        await result.current.onOpenAgentEditor()
      })

      expect(mockGetAgent).not.toHaveBeenCalled()
      expect(result.current.isAgentModalOpen).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // Loading States
  // ---------------------------------------------------------------------------

  describe('loading states', () => {
    it('deve refletir isUpdatingConversation dos sub-hooks', () => {
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        isUpdating: true,
      })

      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.isUpdatingConversation).toBe(true)
    })

    it('deve combinar loading states para isUpdatingConversation', () => {
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        isUpdating: false,
        isSwitchingMode: true,
      })

      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.isUpdatingConversation).toBe(true)
    })

    it('deve expor isHandingOff e isReturningToBot', () => {
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        isHandingOff: true,
        isReturningToBot: false,
      })

      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.isHandingOff).toBe(true)
      expect(result.current.isReturningToBot).toBe(false)
    })

    it('deve expor isDeletingConversation', () => {
      mockConversationMutations.mockReturnValue({
        ...defaultMutationsReturn,
        isDeleting: true,
      })

      const { result } = renderHookWithProviders(() => useInbox())

      expect(result.current.isDeletingConversation).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Return Shape
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('deve retornar todas as propriedades esperadas', () => {
      const { result } = renderHookWithProviders(() => useInbox())

      // Conversations
      expect(result.current).toHaveProperty('conversations')
      expect(result.current).toHaveProperty('total')
      expect(result.current).toHaveProperty('totalPages')
      expect(result.current).toHaveProperty('totalUnread')
      expect(result.current).toHaveProperty('isLoadingConversations')
      expect(result.current).toHaveProperty('page')
      expect(result.current).toHaveProperty('setPage')
      expect(result.current).toHaveProperty('hasNextPage')

      // Selected conversation
      expect(result.current).toHaveProperty('selectedConversationId')
      expect(result.current).toHaveProperty('onSelectConversation')
      expect(result.current).toHaveProperty('selectedConversation')
      expect(result.current).toHaveProperty('isLoadingSelectedConversation')

      // Messages
      expect(result.current).toHaveProperty('messages')
      expect(result.current).toHaveProperty('isLoadingMessages')
      expect(result.current).toHaveProperty('isLoadingMoreMessages')
      expect(result.current).toHaveProperty('hasMoreMessages')
      expect(result.current).toHaveProperty('onLoadMoreMessages')
      expect(result.current).toHaveProperty('onSendMessage')
      expect(result.current).toHaveProperty('isSending')

      // Labels
      expect(result.current).toHaveProperty('labels')
      expect(result.current).toHaveProperty('isLoadingLabels')

      // Quick Replies
      expect(result.current).toHaveProperty('quickReplies')
      expect(result.current).toHaveProperty('quickRepliesLoading')
      expect(result.current).toHaveProperty('refetchQuickReplies')

      // Filters
      expect(result.current).toHaveProperty('search')
      expect(result.current).toHaveProperty('onSearchChange')
      expect(result.current).toHaveProperty('statusFilter')
      expect(result.current).toHaveProperty('onStatusFilterChange')
      expect(result.current).toHaveProperty('modeFilter')
      expect(result.current).toHaveProperty('onModeFilterChange')
      expect(result.current).toHaveProperty('labelFilter')
      expect(result.current).toHaveProperty('onLabelFilterChange')

      // Conversation actions
      expect(result.current).toHaveProperty('onModeToggle')
      expect(result.current).toHaveProperty('onCloseConversation')
      expect(result.current).toHaveProperty('onReopenConversation')
      expect(result.current).toHaveProperty('onPriorityChange')
      expect(result.current).toHaveProperty('onLabelToggle')
      expect(result.current).toHaveProperty('onHandoff')
      expect(result.current).toHaveProperty('onReturnToBot')
      expect(result.current).toHaveProperty('onDeleteConversation')

      // Loading states
      expect(result.current).toHaveProperty('isUpdatingConversation')
      expect(result.current).toHaveProperty('isHandingOff')
      expect(result.current).toHaveProperty('isReturningToBot')
      expect(result.current).toHaveProperty('isDeletingConversation')

      // AI Agent editing
      expect(result.current).toHaveProperty('isAgentModalOpen')
      expect(result.current).toHaveProperty('editingAgent')
      expect(result.current).toHaveProperty('isLoadingAgent')
      expect(result.current).toHaveProperty('isSavingAgent')
      expect(result.current).toHaveProperty('onOpenAgentEditor')
      expect(result.current).toHaveProperty('onCloseAgentEditor')
      expect(result.current).toHaveProperty('onSaveAgent')
    })
  })
})
