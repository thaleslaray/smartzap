/**
 * Testes de verificação das factories.
 *
 * Garante que:
 * - IDs são únicos entre 100 entidades
 * - Phones são E.164 válidos e únicos
 * - Tipos conformam com as interfaces de types.ts
 * - resetFactoryCounters() funciona
 */

import { describe, expect, it, beforeEach } from 'vitest'
import {
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

describe('factories', () => {
  beforeEach(() => {
    resetFactoryCounters()
  })

  describe('buildContact — unicidade', () => {
    it('gera 100 contatos com IDs e phones únicos', () => {
      const contacts = Array.from({ length: 100 }, () => buildContact())

      const ids = new Set(contacts.map((c) => c.id))
      const phones = new Set(contacts.map((c) => c.phone))

      expect(ids.size).toBe(100)
      expect(phones.size).toBe(100)
    })

    it('phones estão em formato E.164 brasileiro', () => {
      const contact = buildContact()
      expect(contact.phone).toMatch(/^\+55\d{10,11}$/)
    })

    it('status default é Opt-in', () => {
      const contact = buildContact()
      expect(contact.status).toBe('Opt-in')
    })

    it('aceita overrides', () => {
      const contact = buildContact({ name: 'João', tags: ['vip'] })
      expect(contact.name).toBe('João')
      expect(contact.tags).toEqual(['vip'])
    })
  })

  describe('buildCampaign', () => {
    it('gera 100 campanhas com IDs únicos', () => {
      const campaigns = Array.from({ length: 100 }, () => buildCampaign())
      const ids = new Set(campaigns.map((c) => c.id))
      expect(ids.size).toBe(100)
    })

    it('status default é Rascunho', () => {
      const campaign = buildCampaign()
      expect(campaign.status).toBe('Rascunho')
    })

    it('contadores iniciam em zero', () => {
      const campaign = buildCampaign()
      expect(campaign.sent).toBe(0)
      expect(campaign.delivered).toBe(0)
      expect(campaign.read).toBe(0)
      expect(campaign.failed).toBe(0)
      expect(campaign.skipped).toBe(0)
    })

    it('aceita overrides', () => {
      const campaign = buildCampaign({ name: 'Black Friday', recipients: 500 })
      expect(campaign.name).toBe('Black Friday')
      expect(campaign.recipients).toBe(500)
    })
  })

  describe('buildTemplate', () => {
    it('defaults são coerentes', () => {
      const template = buildTemplate()
      expect(template.status).toBe('APPROVED')
      expect(template.language).toBe('pt_BR')
      expect(template.category).toBe('MARKETING')
      expect(template.components).toBeDefined()
      expect(template.components!.length).toBeGreaterThan(0)
    })
  })

  describe('buildInboxConversation', () => {
    it('cria conversa com defaults', () => {
      const conv = buildInboxConversation()
      expect(conv.status).toBe('open')
      expect(conv.mode).toBe('bot')
      expect(conv.priority).toBe('normal')
      expect(conv.unread_count).toBe(0)
    })
  })

  describe('buildInboxMessage', () => {
    it('cria mensagem com defaults', () => {
      const msg = buildInboxMessage()
      expect(msg.direction).toBe('inbound')
      expect(msg.message_type).toBe('text')
      expect(msg.delivery_status).toBe('delivered')
      expect(msg.content).toBeTruthy()
    })
  })

  describe('buildAIAgent', () => {
    it('cria agente com defaults', () => {
      const agent = buildAIAgent()
      expect(agent.is_active).toBe(true)
      expect(agent.is_default).toBe(false)
      expect(agent.model).toBeTruthy()
      expect(agent.temperature).toBeGreaterThan(0)
    })
  })

  describe('buildLeadForm', () => {
    it('cria formulário com defaults', () => {
      const form = buildLeadForm()
      expect(form.isActive).toBe(true)
      expect(form.collectEmail).toBe(true)
      expect(form.slug).toBeTruthy()
    })
  })

  describe('buildCampaignFolder', () => {
    it('cria pasta com defaults', () => {
      const folder = buildCampaignFolder()
      expect(folder.color).toBe('#6B7280')
      expect(folder.name).toBeTruthy()
    })
  })

  describe('buildCampaignTag', () => {
    it('cria tag com defaults', () => {
      const tag = buildCampaignTag()
      expect(tag.color).toBe('#10B981')
      expect(tag.name).toBeTruthy()
    })
  })

  describe('buildAppSettings', () => {
    it('cria settings com defaults', () => {
      const settings = buildAppSettings()
      expect(settings.isConnected).toBe(true)
      expect(settings.phoneNumberId).toBeTruthy()
      expect(settings.accessToken).toBeTruthy()
    })

    it('aceita overrides', () => {
      const settings = buildAppSettings({ isConnected: false })
      expect(settings.isConnected).toBe(false)
    })
  })

  describe('resetFactoryCounters', () => {
    it('reseta o contador de telefones', () => {
      const first = buildContact()
      resetFactoryCounters()
      const second = buildContact()

      // Mesmo sufixo numérico do phone (mas IDs diferentes)
      expect(first.phone.slice(-8)).toBe(second.phone.slice(-8))
      expect(first.id).not.toBe(second.id)
    })
  })
})
