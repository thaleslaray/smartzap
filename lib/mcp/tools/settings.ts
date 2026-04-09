import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ok, err } from '@/lib/mcp/helpers'

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const adminKey = () => process.env.SMARTZAP_ADMIN_KEY ?? ''
const apiKey = () => process.env.SMARTZAP_API_KEY ?? ''

export function registerSettingsTools(server: McpServer) {
  // ─── sz.settings.get_whatsapp ─────────────────────────────────────────────
  server.registerTool(
    'sz.settings.get_whatsapp',
    {
      title: 'Credenciais WhatsApp',
      description: 'Retorna status das credenciais WhatsApp configuradas (sem expor o token).',
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${baseUrl()}/api/settings/credentials`, {
        headers: { 'x-api-key': apiKey() },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.set_whatsapp ─────────────────────────────────────────────
  server.registerTool(
    'sz.settings.set_whatsapp',
    {
      title: 'Configurar credenciais WhatsApp',
      description:
        'Salva as credenciais do WhatsApp Cloud API. Valida o token chamando a API da Meta antes de salvar.',
      inputSchema: {
        phoneNumberId: z.string().min(1).describe('Phone Number ID do Meta Business'),
        businessAccountId: z.string().min(1).describe('Business Account ID do Meta'),
        accessToken: z.string().min(1).describe('Access Token do WhatsApp Cloud API'),
      },
    },
    async ({ phoneNumberId, businessAccountId, accessToken }) => {
      const res = await fetch(`${baseUrl()}/api/settings/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey(),
        },
        body: JSON.stringify({ phoneNumberId, businessAccountId, accessToken }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? body.details ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.get_ai ───────────────────────────────────────────────────
  server.registerTool(
    'sz.settings.get_ai',
    {
      title: 'Configuração de IA',
      description: 'Retorna provider, modelo, rotas e status das chaves de API (sem expor os valores).',
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${baseUrl()}/api/settings/ai`, {
        headers: { 'x-api-key': apiKey() },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.set_ai ───────────────────────────────────────────────────
  server.registerTool(
    'sz.settings.set_ai',
    {
      title: 'Configurar IA',
      description:
        'Configura modelo, chave de API do Google e rotas de IA. Valida a chave antes de salvar.',
      inputSchema: {
        model: z.string().optional().describe('Model ID (ex: gemini-2.5-flash)'),
        google_api_key: z.string().optional().describe('Chave API do Google Gemini'),
        routes: z
          .object({
            inbox_suggest: z.boolean().optional(),
            inbox_chat: z.boolean().optional(),
            template_generation: z.boolean().optional(),
            ocr: z.boolean().optional(),
          })
          .optional()
          .describe('Rotas que usam IA (habilitar/desabilitar individualmente)'),
      },
    },
    async ({ model, google_api_key, routes }) => {
      const res = await fetch(`${baseUrl()}/api/settings/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey(),
        },
        body: JSON.stringify({ model, google_api_key, routes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.remove_ai_key ────────────────────────────────────────────
  server.registerTool(
    'sz.settings.remove_ai_key',
    {
      title: 'Remover chave de API de IA',
      description: 'Remove a chave de API do Google do banco.',
      inputSchema: {
        provider: z.enum(['google']).describe('Provider cuja chave será removida'),
      },
    },
    async ({ provider }) => {
      const res = await fetch(`${baseUrl()}/api/settings/ai?provider=${provider}`, {
        method: 'DELETE',
        headers: { 'x-api-key': adminKey() },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.get_integrations ─────────────────────────────────────────
  server.registerTool(
    'sz.settings.get_integrations',
    {
      title: 'Status das integrações',
      description: 'Retorna status do Helicone e Mem0 (sem expor as chaves).',
      inputSchema: {},
    },
    async () => {
      const [heliconeRes, mem0Res] = await Promise.all([
        fetch(`${baseUrl()}/api/settings/helicone`, { headers: { 'x-api-key': apiKey() } }),
        fetch(`${baseUrl()}/api/settings/mem0`, { headers: { 'x-api-key': apiKey() } }),
      ])
      const [helicone, mem0] = await Promise.all([
        heliconeRes.json().catch(() => ({})),
        mem0Res.json().catch(() => ({})),
      ])
      return ok({ helicone, mem0 })
    }
  )

  // ─── sz.settings.set_helicone ─────────────────────────────────────────────
  server.registerTool(
    'sz.settings.set_helicone',
    {
      title: 'Configurar Helicone',
      description: 'Ativa/desativa Helicone e configura a chave de API para observabilidade de LLM.',
      inputSchema: {
        enabled: z.boolean().describe('Ativar ou desativar Helicone'),
        apiKey: z.string().optional().describe('Chave de API do Helicone (deixar em branco para manter a atual)'),
      },
    },
    async ({ enabled, apiKey: heliconeKey }) => {
      const res = await fetch(`${baseUrl()}/api/settings/helicone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey(),
        },
        body: JSON.stringify({ enabled, apiKey: heliconeKey }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.set_mem0 ─────────────────────────────────────────────────
  server.registerTool(
    'sz.settings.set_mem0',
    {
      title: 'Configurar Mem0',
      description: 'Ativa/desativa Mem0 (memória de conversas) e configura a chave de API.',
      inputSchema: {
        enabled: z.boolean().describe('Ativar ou desativar Mem0'),
        apiKey: z.string().optional().describe('Chave de API do Mem0 (deixar em branco para manter a atual)'),
      },
    },
    async ({ enabled, apiKey: mem0Key }) => {
      const res = await fetch(`${baseUrl()}/api/settings/mem0`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey(),
        },
        body: JSON.stringify({ enabled, apiKey: mem0Key }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.webhook_status ───────────────────────────────────────────
  server.registerTool(
    'sz.settings.webhook_status',
    {
      title: 'Status do webhook WhatsApp',
      description:
        'Retorna o status da assinatura de webhook na Meta: se está subscrito, qual URL está configurada e a hierarquia de override.',
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${baseUrl()}/api/meta/webhooks/subscription`, {
        headers: { 'x-api-key': apiKey() },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.subscribe_webhook ────────────────────────────────────────
  server.registerTool(
    'sz.settings.subscribe_webhook',
    {
      title: 'Assinar webhook WhatsApp',
      description:
        'Registra o SmartZap como receptor de eventos WhatsApp na Meta. ' +
        'Usa a URL do SmartZap automaticamente se callbackUrl for omitido. ' +
        'Requer que as credenciais WhatsApp já estejam configuradas (set_whatsapp). ' +
        'URLs localhost são rejeitadas pela Meta — use uma URL pública.',
      inputSchema: {
        callbackUrl: z
          .string()
          .url()
          .optional()
          .describe(
            'URL pública do webhook (opcional — se omitida, usa a URL auto-detectada do SmartZap via VERCEL_PROJECT_PRODUCTION_URL ou NEXT_PUBLIC_APP_URL)'
          ),
      },
    },
    async ({ callbackUrl }) => {
      const res = await fetch(`${baseUrl()}/api/meta/webhooks/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey(),
        },
        body: JSON.stringify(callbackUrl ? { callbackUrl } : {}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? body.message ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )

  // ─── sz.settings.unsubscribe_webhook ──────────────────────────────────────
  server.registerTool(
    'sz.settings.unsubscribe_webhook',
    {
      title: 'Remover override de webhook',
      description:
        'Remove o override de URL do webhook (callback_uri), voltando ao padrão do app Meta. ' +
        'A assinatura de mensagens permanece ativa — apenas o override de URL é removido.',
      inputSchema: {},
    },
    async () => {
      const res = await fetch(`${baseUrl()}/api/meta/webhooks/subscription`, {
        method: 'DELETE',
        headers: { 'x-api-key': adminKey() },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return err(body.error ?? `HTTP ${res.status}`)
      return ok(body)
    }
  )
}
