/**
 * Tipos MELHORADOS para o fluxo de instalação.
 *
 * Melhorias implementadas:
 * 1. Data integrado ao state machine
 * 2. ProvisionStreamEvent como discriminated union
 * 3. Action Creators tipados
 * 4. Validação por step
 * 5. Exhaustive type checking helper
 * 6. Validação de email com regex
 * 7. Schema versioning para hydration segura
 */

// =============================================================================
// CONFIGURAÇÃO
// =============================================================================

/** Versão do schema - incrementar quando mudar a estrutura de InstallData */
export const SCHEMA_VERSION = 1;

/** Flag para habilitar logs de debug (desabilitar em produção) */
export const DEBUG = process.env.NODE_ENV === 'development';

// =============================================================================
// CONSTANTES DE VALIDAÇÃO (elimina magic numbers)
// =============================================================================

export const VALIDATION = {
  /** Mínimo de caracteres para token Vercel */
  VERCEL_TOKEN_MIN_LENGTH: 24,
  /** Mínimo de caracteres para PAT Supabase */
  SUPABASE_PAT_MIN_LENGTH: 40,
  /** Prefixo obrigatório do PAT Supabase */
  SUPABASE_PAT_PREFIX: 'sbp_',
  /** Mínimo de caracteres para token QStash */
  QSTASH_TOKEN_MIN_LENGTH: 30,
  /** Mínimo de caracteres para token Redis */
  REDIS_TOKEN_MIN_LENGTH: 30,
  /** Mínimo de caracteres para senha */
  PASSWORD_MIN_LENGTH: 8,
  /** Mínimo de caracteres para nome */
  NAME_MIN_LENGTH: 2,
} as const;

// =============================================================================
// TIPOS DE ERRO (para mensagens específicas no ErrorView)
// =============================================================================

export type InstallErrorType =
  | 'vercel_token'
  | 'supabase_pat'
  | 'qstash_token'
  | 'redis_url'
  | 'redis_token'
  | 'network'
  | 'unknown';

// =============================================================================
// DADOS COLETADOS (sem mudanças)
// =============================================================================

export interface InstallData {
  name: string;
  email: string;
  password: string;
  vercelToken: string;
  supabasePat: string;
  qstashToken: string;
  redisRestUrl: string;
  redisRestToken: string;
}

export const EMPTY_INSTALL_DATA: InstallData = {
  name: '',
  email: '',
  password: '',
  vercelToken: '',
  supabasePat: '',
  qstashToken: '',
  redisRestUrl: '',
  redisRestToken: '',
};

// =============================================================================
// VALIDAÇÃO POR STEP (NOVO)
// =============================================================================

export type InstallStep = 1 | 2 | 3 | 4 | 5;

/**
 * Valida formato de email usando regex.
 * Regex baseada em RFC 5322 (simplificada).
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  // Regex que cobre 99.99% dos emails válidos sem ser excessivamente complexa
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Normaliza tokens copiados pelo aluno.
 * Remove espaços e aspas extras (simples, duplas ou backtick) que ficam quando
 * o token é copiado de um arquivo .env ou documentação — ex: QSTASH_TOKEN="eyJ..."
 */
export function normalizeToken(value: string): string {
  return value.trim().replace(/^["'`]|["'`]$/g, '');
}

/** Funções que validam se um step está completo */
export const stepValidators: Record<InstallStep, (data: InstallData) => boolean> = {
  1: (data) => {
    const name = data.name?.trim() ?? '';
    const email = data.email?.trim() ?? '';
    const password = data.password?.trim() ?? '';
    return Boolean(name.length >= VALIDATION.NAME_MIN_LENGTH && isValidEmail(email) && password.length >= VALIDATION.PASSWORD_MIN_LENGTH);
  },
  2: (data) => {
    const token = normalizeToken(data.vercelToken ?? '');
    return token.length >= VALIDATION.VERCEL_TOKEN_MIN_LENGTH;
  },
  3: (data) => {
    const pat = normalizeToken(data.supabasePat ?? '');
    return pat.startsWith(VALIDATION.SUPABASE_PAT_PREFIX) && pat.length >= VALIDATION.SUPABASE_PAT_MIN_LENGTH;
  },
  4: (data) => {
    const token = normalizeToken(data.qstashToken ?? '');
    return token.length >= VALIDATION.QSTASH_TOKEN_MIN_LENGTH;
  },
  5: (data) => {
    const url = data.redisRestUrl?.trim() ?? '';
    const token = normalizeToken(data.redisRestToken ?? '');
    return /^https:\/\/[a-z0-9][a-z0-9-]*\.upstash\.io\/?$/i.test(url)
      && token.length >= VALIDATION.REDIS_TOKEN_MIN_LENGTH
      && /^[A-Za-z0-9_=+/-]+$/.test(token);
  },
};

/** Campos requeridos por step (para mensagens de erro) */
export const stepRequiredFields: Record<InstallStep, (keyof InstallData)[]> = {
  1: ['name', 'email', 'password'],
  2: ['vercelToken'],
  3: ['supabasePat'],
  4: ['qstashToken'],
  5: ['redisRestUrl', 'redisRestToken'],
};

// =============================================================================
// STATE MACHINE - COM DATA INTEGRADO (MELHORIA #1)
// =============================================================================

export interface CollectingState {
  phase: 'collecting';
  step: InstallStep;
  data: InstallData;           // ✅ DATA DENTRO DO STATE
  direction: 1 | -1;           // ✅ DIRECTION DENTRO DO STATE
}

export interface ProvisioningState {
  phase: 'provisioning';
  data: InstallData;           // ✅ Mantém data para o provisioning
  progress: number;
  title: string;
  subtitle: string;
}

export interface ErrorState {
  phase: 'error';
  data: InstallData;           // ✅ Mantém data para retry
  returnToStep: InstallStep;
  error: string;
  errorType?: InstallErrorType;
  errorDetails?: string;
}

export interface SuccessState {
  phase: 'success';
  data: InstallData;           // ✅ Mantém data para exibir nome
}

export type InstallState =
  | CollectingState
  | ProvisioningState
  | ErrorState
  | SuccessState;

// =============================================================================
// ACTIONS - COM PAYLOADS TIPADOS (MELHORIA #3)
// =============================================================================

export type InstallAction =
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'GO_TO_STEP'; step: InstallStep }
  | { type: 'UPDATE_DATA'; data: Partial<InstallData> }
  | { type: 'SUBMIT_STEP'; data: Partial<InstallData> }  // ✅ Atômico: update + next
  | { type: 'START_PROVISIONING' }
  | { type: 'PROGRESS'; progress: number; title: string; subtitle: string }
  | { type: 'ERROR'; returnToStep: InstallStep; error: string; errorType?: InstallErrorType; errorDetails?: string }
  | { type: 'COMPLETE' }
  | { type: 'RETRY' }
  | { type: 'RESET' };  // ✅ Recomeça instalação do zero

// =============================================================================
// ACTION CREATORS (MELHORIA #3)
// =============================================================================

export const actions = {
  next: (): InstallAction => ({ type: 'NEXT' }),
  back: (): InstallAction => ({ type: 'BACK' }),
  goToStep: (step: InstallStep): InstallAction => ({ type: 'GO_TO_STEP', step }),
  updateData: (data: Partial<InstallData>): InstallAction => ({ type: 'UPDATE_DATA', data }),
  /** Ação atômica: atualiza dados E avança (evita race condition) */
  submitStep: (data: Partial<InstallData>): InstallAction => ({ type: 'SUBMIT_STEP', data }),
  startProvisioning: (): InstallAction => ({ type: 'START_PROVISIONING' }),
  progress: (progress: number, title: string, subtitle: string): InstallAction => ({
    type: 'PROGRESS',
    progress,
    title,
    subtitle,
  }),
  error: (error: string, returnToStep: InstallStep, errorType?: InstallErrorType, errorDetails?: string): InstallAction => ({
    type: 'ERROR',
    error,
    returnToStep,
    errorType,
    errorDetails,
  }),
  complete: (): InstallAction => ({ type: 'COMPLETE' }),
  retry: (): InstallAction => ({ type: 'RETRY' }),
  /** Reseta toda a instalação para o estado inicial */
  reset: (): InstallAction => ({ type: 'RESET' }),
} as const;

// =============================================================================
// PROVISIONING STREAM EVENTS - DISCRIMINATED UNION (MELHORIA #2)
// =============================================================================

export type ProvisionStreamEvent =
  | { type: 'progress'; progress: number; title: string; subtitle: string }
  | { type: 'error'; error: string; returnToStep: InstallStep; errorType?: InstallErrorType; errorDetails?: string }
  | { type: 'complete' };

// Type guards para ProvisionStreamEvent
export function isProgressEvent(e: ProvisionStreamEvent): e is { type: 'progress'; progress: number; title: string; subtitle: string } {
  return e.type === 'progress';
}

export function isErrorEvent(e: ProvisionStreamEvent): e is { type: 'error'; error: string; returnToStep: InstallStep; errorType?: InstallErrorType; errorDetails?: string } {
  return e.type === 'error';
}

export function isCompleteEvent(e: ProvisionStreamEvent): e is { type: 'complete' } {
  return e.type === 'complete';
}

// =============================================================================
// EXHAUSTIVE CHECK HELPER (MELHORIA #4)
// =============================================================================

/**
 * Helper para garantir que todos os casos foram tratados em um switch.
 * Se TypeScript reclamar aqui, significa que falta um case.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

// =============================================================================
// API PAYLOADS (sem mudanças)
// =============================================================================

export interface ProvisionPayload {
  identity: {
    name: string;
    email: string;
    password: string;
  };
  vercel: {
    token: string;
  };
  supabase: {
    pat: string;
  };
  qstash: {
    token: string;
  };
  redis: {
    restUrl: string;
    restToken: string;
  };
}

// =============================================================================
// STEP METADATA (sem mudanças)
// =============================================================================

export const STEP_META: Record<InstallStep, { title: string; service: string }> = {
  1: { title: 'Identidade', service: 'identity' },
  2: { title: 'Vercel', service: 'vercel' },
  3: { title: 'Supabase', service: 'supabase' },
  4: { title: 'QStash', service: 'qstash' },
  5: { title: 'Redis', service: 'redis' },
};
