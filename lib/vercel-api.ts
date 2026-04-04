/**
 * Cliente para a API REST do Vercel.
 *
 * Responsabilidades:
 * - Gravar environment variables no projeto (para BYOK via AI Gateway)
 * - Disparar redeploy após mudança de env vars
 * - Consultar status de deployment em andamento
 *
 * Requer as variáveis: VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID
 */

const VERCEL_API = 'https://api.vercel.com'

export type DeployStatus = 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED'

function getConfig() {
    const token = process.env.VERCEL_API_TOKEN
    const teamId = process.env.VERCEL_TEAM_ID ?? 'team_GUT7m6INuJVIxmlVzOnuiRyY'
    return { token, teamId }
}

/**
 * Consulta o status atual de um deployment.
 */
export async function getDeploymentStatus(deploymentId: string): Promise<DeployStatus> {
    const { token, teamId } = getConfig()
    if (!token) throw new Error('[Vercel API] VERCEL_API_TOKEN não configurado.')
    if (!deploymentId) return 'QUEUED'

    const url = `${VERCEL_API}/v13/deployments/${deploymentId}?teamId=${teamId}`
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`[Vercel API] Falha ao consultar deployment: ${res.status}`)

    const data = await res.json() as { readyState?: string }
    const state = data.readyState?.toUpperCase() ?? 'QUEUED'

    // Normaliza para DeployStatus
    if (state === 'READY') return 'READY'
    if (state === 'ERROR') return 'ERROR'
    if (state === 'CANCELED') return 'CANCELED'
    if (state === 'BUILDING' || state === 'INITIALIZING') return 'BUILDING'
    return 'QUEUED'
}
