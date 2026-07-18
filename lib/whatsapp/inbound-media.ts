/**
 * Download de mídia recebida via webhook (Meta Cloud API) e persistência no Supabase Storage.
 *
 * A Meta não envia uma URL direta no payload do webhook para mensagens de mídia — apenas um
 * media_id. É preciso resolver esse id em uma URL temporária (~5min) via Graph API, baixar o
 * binário com o access token, e então subir para um bucket próprio para termos uma URL durável
 * que o Inbox possa renderizar.
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = String(process.env.SUPABASE_INBOUND_MEDIA_BUCKET || 'whatsapp-inbound-media')

let bucketEnsured = false

async function ensureBucket(client: SupabaseClient): Promise<void> {
  if (bucketEnsured) return
  try {
    const { error } = await client.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 104857600 })
    // createBucket retorna { error } em vez de lançar exceção — só ignora se já existir.
    if (error && !/already exists/i.test(error.message)) {
      console.warn(`[InboundMedia] Falha ao criar bucket "${BUCKET}":`, error.message)
    }
  } catch (error) {
    console.warn(`[InboundMedia] Erro inesperado ao criar bucket "${BUCKET}":`, error)
  }
  bucketEnsured = true
}

function guessExtFromContentType(contentType: string | null | undefined): string {
  const ct = String(contentType || '').toLowerCase().split(';')[0].trim()
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg'
  if (ct === 'image/png') return 'png'
  if (ct === 'image/webp') return 'webp'
  if (ct === 'image/gif') return 'gif'
  if (ct === 'video/mp4') return 'mp4'
  if (ct === 'video/3gpp') return '3gp'
  if (ct === 'audio/ogg') return 'ogg'
  if (ct === 'audio/mpeg') return 'mp3'
  if (ct === 'audio/mp4' || ct === 'audio/aac') return 'm4a'
  if (ct === 'application/pdf') return 'pdf'
  if (ct === 'application/msword') return 'doc'
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (ct === 'application/vnd.ms-excel') return 'xls'
  if (ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  return 'bin'
}

export interface DownloadInboundMediaParams {
  mediaId: string
  waMessageId: string
}

export interface DownloadInboundMediaResult {
  url: string
  mimeType: string
}

/**
 * Baixa a mídia de uma mensagem recebida e devolve uma URL pública durável.
 * Best-effort: retorna null em qualquer falha (credenciais ausentes, mídia expirada, etc.)
 * — a mensagem continua sendo salva no Inbox mesmo sem a mídia.
 */
export async function downloadAndStoreInboundMedia(
  params: DownloadInboundMediaParams
): Promise<DownloadInboundMediaResult | null> {
  const { mediaId, waMessageId } = params
  if (!mediaId) return null

  const client = getSupabaseAdmin()
  if (!client) return null

  try {
    const credentials = await getWhatsAppCredentials()
    if (!credentials) return null

    // 1. Resolve o media_id em uma URL temporária + mime_type
    const metaRes = await fetch(`https://graph.facebook.com/v24.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    })
    if (!metaRes.ok) {
      console.warn(`[InboundMedia] Falha ao resolver media_id ${mediaId}: HTTP ${metaRes.status}`)
      return null
    }
    const metaBody = (await metaRes.json()) as { url?: string; mime_type?: string }
    if (!metaBody.url) return null

    // 2. Baixa o binário usando o mesmo access token
    const fileRes = await fetch(metaBody.url, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
    })
    if (!fileRes.ok) {
      console.warn(`[InboundMedia] Falha ao baixar mídia ${mediaId}: HTTP ${fileRes.status}`)
      return null
    }
    const contentType = metaBody.mime_type || fileRes.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await fileRes.arrayBuffer())

    // 3. Sobe para o Supabase Storage
    await ensureBucket(client)
    const ext = guessExtFromContentType(contentType)
    const path = `${waMessageId || mediaId}.${ext}`

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: true })

    if (uploadError) {
      console.warn(`[InboundMedia] Falha ao subir mídia ${mediaId}:`, uploadError.message)
      return null
    }

    const { data } = client.storage.from(BUCKET).getPublicUrl(path)
    if (!data?.publicUrl) return null

    return { url: data.publicUrl, mimeType: contentType }
  } catch (error) {
    console.warn(`[InboundMedia] Erro inesperado ao processar mídia ${mediaId}:`, error)
    return null
  }
}
