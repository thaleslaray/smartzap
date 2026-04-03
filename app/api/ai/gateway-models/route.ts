import { NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/lib/server-http'

export interface GatewayModel {
  id: string
  name: string
  provider: string
}

export async function GET() {
  try {
    const res = await fetchWithTimeout('https://ai-gateway.vercel.sh/v1/models', {
      timeoutMs: 5000,
    })

    if (!res.ok) {
      return NextResponse.json({ models: [] }, { status: res.status })
    }

    const data = await res.json()

    const models: GatewayModel[] = (data.data ?? [])
      .filter((m: { type?: string }) => m.type === 'language')
      .sort((a: { created?: number }, b: { created?: number }) => (b.created ?? 0) - (a.created ?? 0))
      .map((m: { id: string; name: string; owned_by: string }) => ({
        id: m.id,
        name: m.name,
        provider: m.owned_by,
      }))

    return NextResponse.json(
      { models },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    )
  } catch {
    return NextResponse.json({ models: [] })
  }
}
