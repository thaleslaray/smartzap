/**
 * E2E Cleanup Helpers
 *
 * Funções para limpeza de dados de teste em ambiente E2E (Playwright).
 * Usa getSupabaseAdmin() para acesso direto ao banco com credenciais reais.
 *
 * IMPORTANTE: Apenas para testes E2E com Supabase real configurado.
 * Não usar em testes unitários (use mocks em vez disso).
 *
 * @example
 * ```ts
 * // Em afterAll do Playwright:
 * await cleanupTestData(supabase, 'E2E_TEST_')
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Generic Cleanup
// ---------------------------------------------------------------------------

/**
 * Deleta rows com nome/phone matching prefixo de teste.
 * Útil para limpeza geral após suíte E2E.
 *
 * Tabelas processadas: campaigns, contacts, lead_forms, campaign_folders, campaign_tags
 */
export async function cleanupTestData(
  supabase: SupabaseClient,
  prefix: string
): Promise<{ deleted: Record<string, number> }> {
  const deleted: Record<string, number> = {}

  // Campaigns (por nome)
  {
    const { data } = await supabase
      .from('campaigns')
      .select('id')
      .ilike('name', `${prefix}%`)

    if (data && data.length > 0) {
      const ids = data.map((r) => r.id)
      await cleanupCampaigns(supabase, ids)
      deleted.campaigns = ids.length
    }
  }

  // Contacts (por nome)
  {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .ilike('name', `${prefix}%`)

    if (data && data.length > 0) {
      const ids = data.map((r) => r.id)
      await cleanupContacts(supabase, ids)
      deleted.contacts = ids.length
    }
  }

  // Contacts (por phone com prefixo em E.164)
  {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .ilike('phone', `${prefix}%`)

    if (data && data.length > 0) {
      const ids = data.map((r) => r.id)
      await cleanupContacts(supabase, ids)
      deleted.contacts_by_phone = ids.length
    }
  }

  // Lead Forms (por nome)
  {
    const { data } = await supabase
      .from('lead_forms')
      .select('id')
      .ilike('name', `${prefix}%`)

    if (data && data.length > 0) {
      const ids = data.map((r) => r.id)
      const { error } = await supabase
        .from('lead_forms')
        .delete()
        .in('id', ids)
      if (!error) deleted.lead_forms = ids.length
    }
  }

  // Campaign Folders (por nome)
  {
    const { data } = await supabase
      .from('campaign_folders')
      .select('id')
      .ilike('name', `${prefix}%`)

    if (data && data.length > 0) {
      const ids = data.map((r) => r.id)
      const { error } = await supabase
        .from('campaign_folders')
        .delete()
        .in('id', ids)
      if (!error) deleted.campaign_folders = ids.length
    }
  }

  // Campaign Tags (por nome)
  {
    const { data } = await supabase
      .from('campaign_tags')
      .select('id')
      .ilike('name', `${prefix}%`)

    if (data && data.length > 0) {
      const ids = data.map((r) => r.id)
      const { error } = await supabase
        .from('campaign_tags')
        .delete()
        .in('id', ids)
      if (!error) deleted.campaign_tags = ids.length
    }
  }

  return { deleted }
}

// ---------------------------------------------------------------------------
// Targeted Cleanup
// ---------------------------------------------------------------------------

/**
 * Deleta campanhas pelos IDs, incluindo campaign_contacts relacionados.
 */
export async function cleanupCampaigns(
  supabase: SupabaseClient,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return

  // Primeiro deleta os contacts da campanha (FK)
  await supabase
    .from('campaign_contacts')
    .delete()
    .in('campaign_id', ids)

  // Deleta tag assignments
  await supabase
    .from('campaign_tag_assignments')
    .delete()
    .in('campaign_id', ids)

  // Depois deleta as campanhas
  await supabase
    .from('campaigns')
    .delete()
    .in('id', ids)
}

/**
 * Deleta contatos pelos IDs.
 */
export async function cleanupContacts(
  supabase: SupabaseClient,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return

  await supabase
    .from('contacts')
    .delete()
    .in('id', ids)
}
