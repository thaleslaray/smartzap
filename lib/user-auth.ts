/**
 * User Authentication System for Single-Tenant DaaS
 * 
 * Simple auth using MASTER_PASSWORD from environment variable
 * - No password hashing needed (password stored in Vercel env)
 * - httpOnly + Secure cookies for sessions
 * - Rate limiting for brute force protection
 * 
 * Usa Supabase (PostgreSQL) como banco de dados
 */

import { cookies } from 'next/headers'
import { supabase } from './supabase'
import { normalizePhoneNumber, validateAnyPhoneNumber } from './phone-formatter'

function getFirstName(fullName: string): string {
  const normalized = fullName.trim().replace(/\s+/gu, ' ')
  if (!normalized) return ''
  const [first] = normalized.split(' ')
  return first || normalized
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SESSION_COOKIE_NAME = 'smartzap_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes

// Novo formato: múltiplas sessões simultâneas (evita invalidação entre domínios/devices)
// Persistido em `settings.key = 'session_tokens'` como JSON.
type StoredSession = {
  token: string
  createdAt: string
}

// ============================================================================
// TYPES
// ============================================================================

export interface Company {
  id: string
  name: string
  email: string
  phone: string
  createdAt: string
}

export interface UserAuthResult {
  success: boolean
  error?: string
  company?: Company
}

// ============================================================================
// DATABASE HELPERS
// ============================================================================

/**
 * Upsert a setting in the database
 */
async function upsertSetting(key: string, value: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: now }, { onConflict: 'key' })

  if (error) {
    // Não silencie erros de permissão/RLS — isso causa loops e estados falsos.
    throw new Error(`Falha ao salvar setting "${key}": ${error.message}`)
  }
}

/**
 * Get a setting from the database
 */
async function getSetting(key: string): Promise<{ value: string; updated_at: string } | null> {
  const { data, error } = await supabase
    .from('settings')
    .select('value, updated_at')
    .eq('key', key)
    .single()

  if (error || !data) return null
  return data
}

/**
 * Delete a setting from the database
 */
async function deleteSetting(key: string): Promise<void> {
  const { error } = await supabase.from('settings').delete().eq('key', key)
  if (error) {
    throw new Error(`Falha ao remover setting "${key}": ${error.message}`)
  }
}

function parseStoredSessions(raw: string): StoredSession[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const sessions: StoredSession[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const token = (item as any).token
      const createdAt = (item as any).createdAt
      if (typeof token !== 'string' || token.length < 10) continue
      if (typeof createdAt !== 'string' || !createdAt) continue
      sessions.push({ token, createdAt })
    }
    return sessions
  } catch {
    return []
  }
}

function pruneExpiredSessions(sessions: StoredSession[], now: Date): StoredSession[] {
  const maxAgeMs = SESSION_MAX_AGE * 1000
  return sessions.filter(s => {
    const created = new Date(s.createdAt)
    if (Number.isNaN(created.getTime())) return false
    return now.getTime() - created.getTime() <= maxAgeMs
  })
}

async function getStoredSessions(): Promise<StoredSession[] | null> {
  const setting = await getSetting('session_tokens')
  if (!setting?.value) return null
  return parseStoredSessions(setting.value)
}

async function setStoredSessions(sessions: StoredSession[]): Promise<void> {
  await upsertSetting('session_tokens', JSON.stringify(sessions))
}

/**
 * Check if setup is completed (company exists)
 */
export async function isSetupComplete(): Promise<boolean> {
  // Em produção, usamos a env var para evitar consultas e loops.
  if (process.env.SETUP_COMPLETE === 'true') return true

  // Em dev/local, o fluxo pode rodar sem Vercel.
  // Então consideramos "setup completo" se a empresa já foi gravada no banco.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('key', 'company_name')
        .single()

      if (error) {
        // Ajuda a diagnosticar "isSetup:false" causado por permissão negada.
        console.warn('[isSetupComplete] settings/company_name query error:', error.message)
        return false
      }
      return !!data?.value
    } catch {
      return false
    }
  }

  return false
}

/**
 * Get company info
 */
export async function getCompany(): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['company_id', 'company_name', 'company_email', 'company_phone', 'company_created_at'])

    if (error || !data || data.length === 0) return null

    const settings: Record<string, string> = {}
    data.forEach(row => {
      settings[row.key] = row.value
    })

    if (!settings.company_name) return null

    return {
      id: settings.company_id || 'default',
      name: settings.company_name,
      email: settings.company_email || '',
      phone: settings.company_phone || '',
      createdAt: settings.company_created_at || new Date().toISOString()
    }
  } catch {
    return null
  }
}

// ============================================================================
// SETUP (First-time configuration)
// ============================================================================

/**
 * Complete initial setup - create company, email, phone
 * Password is handled via MASTER_PASSWORD env var
 */
export async function completeSetup(
  companyName: string,
  companyAdmin: string,
  email: string,
  phone: string
): Promise<UserAuthResult> {
  // Validate inputs
  if (!companyName || companyName.trim().length < 2) {
    return { success: false, error: 'Nome da empresa deve ter pelo menos 2 caracteres' }
  }

  if (!companyAdmin || companyAdmin.trim().length < 2) {
    return { success: false, error: 'Nome do responsável deve ter pelo menos 2 caracteres' }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'E-mail inválido' }
  }

  // Normalize first so we accept inputs like "5511999999999" (without '+')
  const normalizedPhoneE164ForValidation = normalizePhoneNumber(phone)
  const phoneValidation = validateAnyPhoneNumber(normalizedPhoneE164ForValidation)
  if (!phoneValidation.isValid) {
    return { success: false, error: phoneValidation.error || 'Telefone inválido' }
  }

  try {
    const now = new Date().toISOString()
    // Use existing company_id if available, otherwise create new
    const existingId = await getSetting('company_id')
    const companyId = existingId?.value || crypto.randomUUID()

    const normalizedPhoneE164 = normalizedPhoneE164ForValidation
    const storedPhoneDigits = normalizedPhoneE164.replace(/\D/g, '')

    // Save company info using parallel upserts
    await Promise.all([
      upsertSetting('company_id', companyId),
      upsertSetting('company_name', companyName.trim()),
      upsertSetting('company_admin', companyAdmin.trim()),
      upsertSetting('company_email', email.trim().toLowerCase()),
      upsertSetting('company_phone', storedPhoneDigits),
      upsertSetting('company_created_at', now)
    ])

    // Seed automático do "Contato de Teste" (Settings → Testes)
    // Só cria se ainda não existir, para não sobrescrever a escolha do usuário.
    try {
      const existingTestContact = await getSetting('test_contact')
      const adminFullName = companyAdmin.trim()
      const adminFirstName = getFirstName(adminFullName)
      const desiredName = adminFirstName || adminFullName

      if (!existingTestContact?.value) {
        await upsertSetting(
          'test_contact',
          JSON.stringify({
            name: desiredName,
            phone: normalizedPhoneE164,
            updatedAt: now,
          })
        )
      } else {
        // Se o contato já existe mas parece ter sido seedado automaticamente com o nome completo,
        // podemos ajustar para o primeiro nome sem sobrescrever personalizações.
        try {
          const parsed = JSON.parse(existingTestContact.value) as unknown
          if (parsed && typeof parsed === 'object') {
            const tc = parsed as { name?: unknown; phone?: unknown; updatedAt?: unknown }
            const currentName = typeof tc.name === 'string' ? tc.name.trim() : ''
            const currentPhoneRaw = typeof tc.phone === 'string' ? tc.phone.trim() : ''
            const currentPhoneDigits = currentPhoneRaw.replace(/\D/g, '')
            const shouldUpgradePhoneToE164 = !!currentPhoneRaw && !currentPhoneRaw.startsWith('+')

            // Upgrade seguro de seeds antigos:
            // - Se o nome é o nome completo do admin (seed antigo) e o telefone bate (por dígitos),
            //   atualiza para primeiro nome e telefone em E.164.
            if (currentName === adminFullName && currentPhoneDigits === storedPhoneDigits) {
              await upsertSetting(
                'test_contact',
                JSON.stringify({
                  ...tc,
                  name: desiredName,
                  phone: normalizedPhoneE164,
                  updatedAt: now,
                })
              )
            } else if (shouldUpgradePhoneToE164 && currentPhoneDigits === storedPhoneDigits) {
              // Se o usuário não personalizou o nome mas o telefone está sem '+',
              // apenas normaliza para E.164.
              await upsertSetting(
                'test_contact',
                JSON.stringify({
                  ...tc,
                  phone: normalizedPhoneE164,
                  updatedAt: now,
                })
              )
            }
          }
        } catch {
          // Se não for JSON válido, não mexe.
        }
      }
    } catch (err) {
      // Não bloqueia o setup inteiro se apenas o seed do contato de teste falhar.
      console.warn('[completeSetup] Falha ao criar test_contact automaticamente:', err)
    }

    // Create session after setup
    await createSession()

    return {
      success: true,
      company: {
        id: companyId,
        name: companyName.trim(),
        email: email.trim().toLowerCase(),
        phone: storedPhoneDigits,
        createdAt: now
      }
    }
  } catch (error) {
    console.error('Setup error:', error)
    return { success: false, error: 'Erro ao salvar configuração' }
  }
}

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

/**
 * Hash SHA-256 com salt fixo (mesmo algoritmo do IdentityStep no wizard).
 */
async function hashPasswordForLogin(password: string): Promise<string> {
  const SALT = '_smartzap_salt_2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifica se uma string parece ser um hash SHA-256 (64 caracteres hexadecimais)
 */
function isHashFormat(value: string): boolean {
  return value.length === 64 && /^[a-f0-9]+$/i.test(value)
}

/**
 * Attempt login with password
 * Validates against MASTER_PASSWORD env var
 *
 * Aceita dois formatos de MASTER_PASSWORD:
 * - Hash SHA-256 (64 chars hex): compara com hash da senha digitada (retrocompatível)
 * - Texto puro: compara diretamente (mais simples para reset)
 */
export async function loginUser(password: string): Promise<UserAuthResult> {
  if (!password) {
    return { success: false, error: 'Senha é obrigatória' }
  }

  // Check if MASTER_PASSWORD is configured
  const masterPassword = process.env.MASTER_PASSWORD
  if (!masterPassword) {
    return { success: false, error: 'MASTER_PASSWORD não configurada nas variáveis de ambiente' }
  }

  // Check rate limiting
  const isLocked = await checkRateLimiting()
  if (isLocked) {
    return { success: false, error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
  }

  try {
    // Detecta automaticamente se MASTER_PASSWORD é hash ou texto puro
    const masterIsHash = isHashFormat(masterPassword)

    let isValid: boolean
    if (masterIsHash) {
      // Comportamento original: MASTER_PASSWORD é hash, compara com hash da senha digitada
      const passwordHash = await hashPasswordForLogin(password)
      isValid = passwordHash === masterPassword
    } else {
      // Novo: MASTER_PASSWORD é texto puro, compara diretamente
      isValid = password === masterPassword
    }

    if (!isValid) {
      await recordFailedAttempt()
      return { success: false, error: 'Senha incorreta' }
    }

    // Clear failed attempts on success
    await clearFailedAttempts()

    // Create session
    await createSession()

    const company = await getCompany()
    return { success: true, company: company || undefined }

  } catch (error) {
    console.error('Login error:', error)
    return { success: false, error: 'Erro ao fazer login' }
  }
}

/**
 * Logout - destroy session
 */
export async function logoutUser(): Promise<void> {
  const cookieStore = await cookies()

  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
  cookieStore.delete(SESSION_COOKIE_NAME)

  // Best-effort: remove o token atual da lista de sessões para revogar imediatamente.
  if (sessionToken) {
    try {
      const now = new Date()
      const stored = await getStoredSessions()
      if (stored) {
        const pruned = pruneExpiredSessions(stored, now)
        const filtered = pruned.filter(s => s.token !== sessionToken)
        // Só grava se houver mudança.
        if (filtered.length !== pruned.length) {
          await setStoredSessions(filtered.slice(-50))
        }
      }
    } catch {
      // Não bloqueia logout
    }
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new session
 */
async function createSession(): Promise<void> {
  const cookieStore = await cookies()
  const sessionToken = crypto.randomUUID()

  const nowIso = new Date().toISOString()

  // Store session in database (multi-session)
  // Mantém múltiplos tokens ativos para evitar invalidação entre domínios/devices.
  const existing = await getStoredSessions()
  const now = new Date()
  const pruned = pruneExpiredSessions(existing || [], now)
  const nextSessions = [...pruned, { token: sessionToken, createdAt: nowIso }].slice(-50)
  await setStoredSessions(nextSessions)

  // Backward-compat: ainda grava o token legado para instâncias antigas (se houver).
  // Não usamos mais esse campo para validar quando `session_tokens` existe.
  await upsertSetting('session_token', sessionToken)

  // Set cookie
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/'
  })
}

/**
 * Validate current session
 */
export async function validateSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (!sessionToken) return false

    const now = new Date()

    // Prefer multi-session list when available
    const storedSessions = await getStoredSessions()
    if (storedSessions) {
      const pruned = pruneExpiredSessions(storedSessions, now)
      const found = pruned.some(s => s.token === sessionToken)

      // Best-effort: se havia sessões expiradas, compacta a lista.
      if (pruned.length !== storedSessions.length) {
        try {
          await setStoredSessions(pruned.slice(-50))
        } catch {
          // ignore
        }
      }

      if (!found) return false
      return true
    }

    // Legacy fallback: single token
    const setting = await getSetting('session_token')
    if (!setting) return false

    const storedToken = setting.value
    const updatedAt = new Date(setting.updated_at)

    // Check if session is expired
    const sessionAge = (now.getTime() - updatedAt.getTime()) / 1000
    if (!Number.isNaN(sessionAge) && sessionAge > SESSION_MAX_AGE) {
      await logoutUser()
      return false
    }

    return sessionToken === storedToken
  } catch {
    return false
  }
}

/**
 * Get auth status for client
 * OPTIMIZED: Parallelized queries for better performance
 */
export async function getUserAuthStatus(): Promise<{
  isSetup: boolean
  isAuthenticated: boolean
  company: Company | null
}> {
  // Run in parallel for better performance
  const [isSetup, isAuthenticated] = await Promise.all([
    isSetupComplete(),
    validateSession()
  ])

  // Only fetch company if authenticated 
  const company = isAuthenticated ? await getCompany() : null

  return { isSetup, isAuthenticated, company }
}

// ============================================================================
// RATE LIMITING (Brute Force Protection)
// ============================================================================

async function checkRateLimiting(): Promise<boolean> {
  try {
    const setting = await getSetting('login_attempts')
    if (!setting) return false

    const attempts = parseInt(setting.value) || 0
    const lastAttempt = new Date(setting.updated_at)
    const now = new Date()

    // Reset if lockout period passed
    if (now.getTime() - lastAttempt.getTime() > LOCKOUT_DURATION) {
      await clearFailedAttempts()
      return false
    }

    return attempts >= MAX_LOGIN_ATTEMPTS
  } catch {
    return false
  }
}

async function recordFailedAttempt(): Promise<void> {
  // Get current count
  const setting = await getSetting('login_attempts')
  const currentAttempts = setting ? parseInt(setting.value) || 0 : 0

  await upsertSetting('login_attempts', (currentAttempts + 1).toString())
}

async function clearFailedAttempts(): Promise<void> {
  try {
    await deleteSetting('login_attempts')
  } catch (error) {
    console.warn('[auth] Falha ao limpar login_attempts (best-effort):', error)
  }
}

// ============================================================================
// PASSWORD INFO
// ============================================================================

/**
 * A senha é gerenciada pela variável MASTER_PASSWORD no Vercel.
 * Use texto simples (ex: "minhaSenha123") — sem hash, sem aspas extras.
 *
 * Nota: por retrocompatibilidade, o sistema ainda aceita hashes SHA-256 de
 * instalações antigas, mas novas instalações devem usar texto puro.
 *
 * Para resetar: Vercel → Settings → Environment Variables → edite MASTER_PASSWORD → Redeploy.
 */
