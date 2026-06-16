import { NextRequest, NextResponse } from 'next/server'
import {
    verifyApiKey,
    verifyAdminAccess,
    isAdminEndpoint,
    isPublicEndpoint,
    unauthorizedResponse,
    forbiddenResponse
} from '@/lib/auth'

export const config = {
    matcher: [
        // Match all pages except static files and _next
        // Includes: .json (manifest.json), .js (sw.js), common images/audio, and Next.js internals
        '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|wav|ogg|m4a|yaml|yml)$).*)',
    ],
}

// Routes that don't require user authentication
const PUBLIC_PAGES = ['/login', '/install', '/debug-auth', '/f', '/atendimento', '/docs']
// Rotas que NÃO precisam de autenticação
// CUIDADO: adicionar rotas aqui expõe elas publicamente!
const PUBLIC_API_ROUTES = [
    '/api/auth',              // Login/logout/status
    '/api/webhook',           // Meta WhatsApp webhooks (usa HMAC)
    '/api/health',            // Health checks
    '/api/system',            // Info básica do sistema
    '/api/installer',         // Setup inicial (protegido separadamente após install)
    '/api/campaign/workflow', // Chamado internamente pelo QStash
    '/api/public',            // Rotas explicitamente públicas (lead forms, etc)
]

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    // Session cookie can exist even when SETUP_COMPLETE env isn't set (dev/local).
    // If the user has a valid session, we should not force them back into the setup wizard.
    const sessionCookie = request.cookies.get('smartzap_session')

    // Handle OPTIONS requests for CORS preflight.
    // Alguns scripts (ex.: Vercel feedback/toolbar) disparam OPTIONS/HEAD mesmo em páginas.
    // Deixar isso cair no roteamento padrão pode virar 400 e poluir o console.
    if (request.method === 'OPTIONS') {
        const origin = request.headers.get('origin')
        const reqHeaders = request.headers.get('access-control-request-headers')

        return new NextResponse(null, {
            status: 204,
            headers: {
                ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
                'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD',
                'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization',
                ...(origin ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
                'Access-Control-Max-Age': '86400',
                'Vary': 'Origin, Access-Control-Request-Headers',
            },
        })
    }

    // ==========================================================================
    // BOOTSTRAP CHECK - Redirect to installer if not configured
    // ==========================================================================
    const hasMasterPassword = !!process.env.MASTER_PASSWORD

    // ==========================================================================
    // INSTALLER LOCKDOWN (produção)
    // - Após a instalação, ninguém "anônimo" deveria conseguir abrir o wizard
    // - As APIs do installer também não devem ficar abertas após concluído
    //   (exceto com sessão ou admin key)
    // ==========================================================================
    // Em produção, se já existe MASTER_PASSWORD, o installer não pode ser público.
    // Isso protege mesmo quando INSTALLER_ENABLED não estiver setado corretamente.
    const shouldLockInstaller = process.env.NODE_ENV === 'production' && hasMasterPassword
    const isInstallerPage = pathname === '/install' || pathname.startsWith('/install/')
    const isInstallerApi = pathname.startsWith('/api/installer')

    if (shouldLockInstaller && (isInstallerPage || isInstallerApi)) {
        // Para páginas: exige sessão (login)
        if (isInstallerPage) {
            if (!sessionCookie?.value) {
                const loginUrl = new URL('/login', request.url)
                loginUrl.searchParams.set('reason', 'installer_locked')
                loginUrl.searchParams.set('redirect', pathname)
                return NextResponse.redirect(loginUrl)
            }
        }

        // Para APIs: permite sessão OU admin key
        if (isInstallerApi) {
            if (sessionCookie?.value) {
                return NextResponse.next()
            }

            const adminAuth = await verifyAdminAccess(request)
            if (!adminAuth.valid) {
                return unauthorizedResponse('Installer API bloqueada após instalação. Faça login ou use SMARTZAP_ADMIN_KEY.')
            }
            return NextResponse.next()
        }
    }

    // If not configured and not already on install, redirect immediately
    if (!hasMasterPassword) {
        if (!pathname.startsWith('/install') && !pathname.startsWith('/api')) {
            const installUrl = new URL('/install', request.url)
            return NextResponse.redirect(installUrl)
        }
    }

    // If configured but install not complete, go to wizard.
    // IMPORTANT:
    // - Não force o wizard aqui. Em dev/local, a completude da instalação pode ser detectada via DB,
    //   enquanto INSTALLER_ENABLED é uma env que controla se o installer está disponível.
    // - Para ser mais "à prova de falhas", sempre deixe o usuário cair em /login quando não houver
    //   sessão, e deixe o /login decidir (via /api/auth/status) se precisa mandar para o wizard.
    // - Se existir session cookie, deixa passar.
    //
    // Obs: o redirect para /login já é feito mais abaixo para páginas protegidas.

    // ==========================================================================
    // API Routes - Use API Key authentication
    // ==========================================================================
    if (pathname.startsWith('/api/')) {
        // Subpaths que casam um prefixo público mas NÃO devem ser públicos
        // (ex.: /api/webhook/info expõe o verify token + metadados de deploy).
        const PRIVATE_API_OVERRIDES = ['/api/webhook/info']
        const isPrivateOverride = PRIVATE_API_OVERRIDES.some(
            p => pathname === p || pathname.startsWith(`${p}/`)
        )

        // Auth endpoints are always public
        if (!isPrivateOverride && PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))) {
            return NextResponse.next()
        }

        // Public endpoints don't require authentication
        if (!isPrivateOverride && isPublicEndpoint(pathname)) {
            return NextResponse.next()
        }

        // Admin endpoints require admin-level access
        if (isAdminEndpoint(pathname)) {
            const adminAuth = await verifyAdminAccess(request)

            if (!adminAuth.valid) {
                return adminAuth.error?.includes('Admin')
                    ? forbiddenResponse(adminAuth.error)
                    : unauthorizedResponse(adminAuth.error)
            }

            return NextResponse.next()
        }

        // Check for user session cookie (for browser API calls)
        if (sessionCookie?.value) {
            // Session exists, allow request (validation happens in API route)
            return NextResponse.next()
        }

        // All other API endpoints require at least API key
        const authResult = await verifyApiKey(request)

        if (!authResult.valid) {
            return unauthorizedResponse(authResult.error)
        }

        return NextResponse.next()
    }

    // ==========================================================================
    // Page Routes - Use Session Cookie authentication
    // ==========================================================================

    // Public pages don't require authentication
    if (PUBLIC_PAGES.some(page => pathname.startsWith(page))) {
        return NextResponse.next()
    }

    // No session cookie - redirect to login
    if (!sessionCookie?.value) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
    }

    // Session cookie exists - allow access (validation happens in layout)
    return NextResponse.next()
}
