/**
 * Seeding de Dados para Testes E2E
 *
 * Insere dados reais via Supabase admin client.
 * Usa factories internamente para gerar dados tipados.
 * Faz mapeamento camelCase → snake_case para o Supabase.
 *
 * IMPORTANTE: Apenas para testes E2E com Supabase real configurado.
 *
 * @example
 * ```ts
 * const campaign = await seedCampaign(supabase, { name: 'E2E_TEST_Campaign' })
 * const { campaign, contacts } = await seedCampaignWithContacts(supabase, { contactCount: 5 })
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Campaign, Contact } from '@/types'
import { buildCampaign, buildContact } from './factories'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mapeia Campaign (camelCase) → row Supabase (snake_case)
 */
function campaignToRow(campaign: Campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    template_name: campaign.templateName,
    template_variables: campaign.templateVariables ?? null,
    total_recipients: campaign.recipients,
    sent: campaign.sent,
    delivered: campaign.delivered,
    read: campaign.read,
    skipped: campaign.skipped,
    failed: campaign.failed,
    created_at: campaign.createdAt,
    scheduled_date: campaign.scheduledAt ?? null,
    started_at: campaign.startedAt ?? null,
    completed_at: campaign.completedAt ?? null,
    cancelled_at: campaign.cancelledAt ?? null,
    flow_id: campaign.flowId ?? null,
    flow_name: campaign.flowName ?? null,
    folder_id: campaign.folderId ?? null,
  }
}

/**
 * Mapeia Contact (camelCase) → row Supabase (snake_case)
 */
function contactToRow(contact: Contact) {
  return {
    id: contact.id,
    name: contact.name ?? '',
    phone: contact.phone,
    email: contact.email ?? null,
    status: contact.status,
    tags: contact.tags,
    custom_fields: contact.custom_fields ?? {},
    created_at: contact.createdAt ?? new Date().toISOString(),
    updated_at: contact.updatedAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Seed Functions
// ---------------------------------------------------------------------------

/**
 * Insere uma campanha no banco via admin client.
 * Retorna a entidade completa em formato camelCase.
 */
export async function seedCampaign(
  supabase: SupabaseClient,
  overrides?: Partial<Campaign>
): Promise<Campaign> {
  const campaign = buildCampaign(overrides)
  const row = campaignToRow(campaign)

  const { error } = await supabase
    .from('campaigns')
    .insert(row)

  if (error) throw new Error(`seedCampaign failed: ${error.message}`)

  return campaign
}

/**
 * Insere um contato no banco via admin client.
 * Retorna a entidade completa em formato camelCase.
 */
export async function seedContact(
  supabase: SupabaseClient,
  overrides?: Partial<Contact>
): Promise<Contact> {
  const contact = buildContact(overrides)
  const row = contactToRow(contact)

  const { error } = await supabase
    .from('contacts')
    .insert(row)

  if (error) throw new Error(`seedContact failed: ${error.message}`)

  return contact
}

/**
 * Insere uma campanha com N contatos associados.
 * Retorna a campanha e a lista de contatos criados.
 */
export async function seedCampaignWithContacts(
  supabase: SupabaseClient,
  options: {
    campaignOverrides?: Partial<Campaign>
    contactCount?: number
  } = {}
): Promise<{ campaign: Campaign; contacts: Contact[] }> {
  const { contactCount = 5, campaignOverrides } = options

  // Cria a campanha
  const campaign = await seedCampaign(supabase, {
    recipients: contactCount,
    ...campaignOverrides,
  })

  // Cria os contatos
  const contacts: Contact[] = []
  for (let i = 0; i < contactCount; i++) {
    const contact = await seedContact(supabase)
    contacts.push(contact)
  }

  // Vincula os contatos à campanha
  const campaignContactRows = contacts.map((contact) => ({
    id: crypto.randomUUID(),
    campaign_id: campaign.id,
    contact_id: contact.id,
    phone: contact.phone,
    name: contact.name ?? '',
    email: contact.email ?? null,
    custom_fields: contact.custom_fields ?? {},
    status: 'pending',
  }))

  const { error } = await supabase
    .from('campaign_contacts')
    .insert(campaignContactRows)

  if (error) throw new Error(`seedCampaignWithContacts (contacts link) failed: ${error.message}`)

  return { campaign, contacts }
}
