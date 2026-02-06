import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest'
import { syncCampaignTemplateToInbox } from './inbox-service'

// Mock das dependências do inbox-db
vi.mock('./inbox-db', () => ({
  findMessageByWhatsAppId: vi.fn(),
  getOrCreateConversation: vi.fn(),
  createMessage: vi.fn(),
}))

import {
  findMessageByWhatsAppId,
  getOrCreateConversation,
  createMessage,
} from './inbox-db'

const mockFindMessageByWhatsAppId = findMessageByWhatsAppId as Mock
const mockGetOrCreateConversation = getOrCreateConversation as Mock
const mockCreateMessage = createMessage as Mock

describe('syncCampaignTemplateToInbox', () => {
  const baseParams = {
    phone: '+5511999999999',
    contactId: 'contact_123',
    whatsappMessageId: 'wamid.123456',
    templateName: 'promo_black_friday',
    templatePreviewText: '📋 *Template: promo_black_friday*\n\nOlá João!',
    resolvedValues: {
      body: [{ key: '1', text: 'João' }],
    },
    campaignId: 'campaign_123',
    template: {
      id: 'tpl_1',
      name: 'promo_black_friday',
      language: 'pt_BR',
      category: 'MARKETING',
      status: 'APPROVED',
      content: '',
      preview: '',
      lastUpdated: new Date().toISOString(),
      components: [
        { type: 'BODY', text: 'Olá {{1}}!' },
      ],
    } as any,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Suprime console.log e console.warn durante os testes
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deve criar mensagem no inbox quando não existe duplicata', async () => {
    // Arrange
    mockFindMessageByWhatsAppId.mockResolvedValue(null)
    mockGetOrCreateConversation.mockResolvedValue({
      id: 'conv_123',
      phone: '+5511999999999',
      status: 'open',
    })
    mockCreateMessage.mockResolvedValue({
      id: 'msg_123',
      conversation_id: 'conv_123',
      direction: 'outbound',
      content: baseParams.templatePreviewText,
      message_type: 'template',
    })

    // Act
    const result = await syncCampaignTemplateToInbox(baseParams)

    // Assert
    expect(result).toBe('msg_123')
    expect(mockFindMessageByWhatsAppId).toHaveBeenCalledWith('wamid.123456')
    expect(mockGetOrCreateConversation).toHaveBeenCalledWith(
      '+5511999999999',
      'contact_123',
      undefined
    )
    expect(mockCreateMessage).toHaveBeenCalledWith({
      conversation_id: 'conv_123',
      direction: 'outbound',
      content: baseParams.templatePreviewText,
      message_type: 'template',
      whatsapp_message_id: 'wamid.123456',
      delivery_status: 'sent',
      payload: expect.objectContaining({
        type: 'campaign_template',
        campaign_id: 'campaign_123',
        template_name: 'promo_black_friday',
        template_language: 'pt_BR',
        resolved_values: baseParams.resolvedValues,
      }),
    })
  })

  it('deve retornar ID existente quando mensagem já existe (idempotência)', async () => {
    // Arrange
    mockFindMessageByWhatsAppId.mockResolvedValue({
      id: 'msg_existing',
      whatsapp_message_id: 'wamid.123456',
    })

    // Act
    const result = await syncCampaignTemplateToInbox(baseParams)

    // Assert
    expect(result).toBe('msg_existing')
    expect(mockGetOrCreateConversation).not.toHaveBeenCalled()
    expect(mockCreateMessage).not.toHaveBeenCalled()
  })

  it('deve retornar null e não propagar erro quando findMessageByWhatsAppId falha', async () => {
    // Arrange
    mockFindMessageByWhatsAppId.mockRejectedValue(new Error('Database connection failed'))

    // Act
    const result = await syncCampaignTemplateToInbox(baseParams)

    // Assert
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[inbox-sync] Failed to sync'),
      expect.stringContaining('Database connection failed')
    )
  })

  it('deve retornar null e não propagar erro quando createMessage falha', async () => {
    // Arrange
    mockFindMessageByWhatsAppId.mockResolvedValue(null)
    mockGetOrCreateConversation.mockResolvedValue({
      id: 'conv_123',
      phone: '+5511999999999',
      status: 'open',
    })
    mockCreateMessage.mockRejectedValue(new Error('Insert failed'))

    // Act
    const result = await syncCampaignTemplateToInbox(baseParams)

    // Assert
    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[inbox-sync] Failed to sync'),
      expect.stringContaining('Insert failed')
    )
  })

  it('deve funcionar quando contactId é null', async () => {
    // Arrange
    const paramsWithNullContact = {
      ...baseParams,
      contactId: null,
    }
    mockFindMessageByWhatsAppId.mockResolvedValue(null)
    mockGetOrCreateConversation.mockResolvedValue({
      id: 'conv_123',
      phone: '+5511999999999',
      status: 'open',
    })
    mockCreateMessage.mockResolvedValue({
      id: 'msg_123',
      conversation_id: 'conv_123',
    })

    // Act
    const result = await syncCampaignTemplateToInbox(paramsWithNullContact)

    // Assert
    expect(result).toBe('msg_123')
    expect(mockGetOrCreateConversation).toHaveBeenCalledWith(
      '+5511999999999',
      undefined, // contactId null vira undefined
      undefined
    )
  })

  it('deve incluir synced_at no payload', async () => {
    // Arrange
    const beforeTest = new Date().toISOString()
    mockFindMessageByWhatsAppId.mockResolvedValue(null)
    mockGetOrCreateConversation.mockResolvedValue({
      id: 'conv_123',
      phone: '+5511999999999',
      status: 'open',
    })
    mockCreateMessage.mockResolvedValue({
      id: 'msg_123',
      conversation_id: 'conv_123',
    })

    // Act
    await syncCampaignTemplateToInbox(baseParams)

    // Assert
    const createMessageCall = mockCreateMessage.mock.calls[0][0]
    expect(createMessageCall.payload.synced_at).toBeDefined()
    expect(new Date(createMessageCall.payload.synced_at).getTime()).toBeGreaterThanOrEqual(
      new Date(beforeTest).getTime()
    )
  })
})
