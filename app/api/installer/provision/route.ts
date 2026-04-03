/**
 * API de Provisioning Unificada
 *
 * Esta é a ÚNICA API de provisioning do SmartZap.
 * Recebe todos os dados coletados e executa o setup completo.
 *
 * Steps:
 * 1. Validar Vercel token + detectar projeto
 * 2. Validar Supabase PAT + listar orgs
 * 3. Criar projeto Supabase (ou detectar existente)
 * 4. Aguardar projeto ACTIVE
 * 5. Resolver keys (anon, service_role)
 * 6. Validar QStash token
 * 7. Validar Redis credentials
 * 8. Configurar env vars no Vercel
 * 9. Rodar migrations
 * 10. Bootstrap admin
 * 11. Trigger redeploy
 * 12. Aguardar deploy ready
 */

import { z } from 'zod';
import { fetchWithTimeout } from '@/lib/installer/fetch-with-timeout';
import { runSchemaMigration, checkSchemaApplied } from '@/lib/installer/migrations';
import { bootstrapInstance } from '@/lib/installer/bootstrap';
import { triggerProjectRedeploy, upsertProjectEnvs, waitForVercelDeploymentReady, disableDeploymentProtection } from '@/lib/installer/vercel';
import {
  resolveSupabaseApiKeys,
  resolveSupabaseDbUrl,
  waitForSupabaseProjectReady,
  listSupabaseProjects,
  createSupabaseProject,
  detectSupabaseRegion,
} from '@/lib/installer/supabase';
import type { InstallStep, InstallErrorType } from '@/lib/installer/types';

export const maxDuration = 300;
export const runtime = 'nodejs';

// =============================================================================
// SCHEMA
// =============================================================================

const ProvisionSchema = z.object({
  identity: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
  }),
  vercel: z.object({
    token: z.string().min(24),
  }),
  supabase: z.object({
    pat: z.string().min(40),
  }),
  qstash: z.object({
    token: z.string().min(30),
  }),
  redis: z.object({
    restUrl: z.string().url(),
    restToken: z.string().min(30),
  }),
});

// =============================================================================
// TYPES
// =============================================================================

interface StreamEvent {
  type: 'progress' | 'error' | 'complete';
  progress?: number;
  title?: string;
  subtitle?: string;
  error?: string;
  errorType?: InstallErrorType;
  errorDetails?: string;
  returnToStep?: InstallStep;
}

interface Step {
  id: string;
  title: string;
  subtitle: string;
  weight: number;
  returnToStep: InstallStep;
}

const STEPS: Step[] = [
  { id: 'validate_vercel', title: 'Conectando Link Neural...', subtitle: 'Autenticando com servidor de deploy', weight: 5, returnToStep: 2 },
  { id: 'validate_supabase', title: 'Escaneando Memória Base...', subtitle: 'Verificando credenciais Supabase', weight: 5, returnToStep: 3 },
  { id: 'create_project', title: 'Criando Unidade...', subtitle: 'Alocando nova instância de memória', weight: 10, returnToStep: 3 },
  { id: 'wait_project', title: 'Incubando Unidade...', subtitle: 'Aguardando células se multiplicarem', weight: 15, returnToStep: 3 },
  { id: 'resolve_keys', title: 'Extraindo DNA...', subtitle: 'Resolvendo chaves de acesso', weight: 5, returnToStep: 3 },
  { id: 'validate_qstash', title: 'Calibrando Transmissão...', subtitle: 'Verificando canal de mensagens', weight: 5, returnToStep: 4 },
  { id: 'validate_redis', title: 'Inicializando Cache...', subtitle: 'Testando memória temporária', weight: 5, returnToStep: 5 },
  { id: 'setup_envs', title: 'Implantando Memórias...', subtitle: 'Configurando variáveis de ambiente', weight: 10, returnToStep: 2 },
  { id: 'migrations', title: 'Estruturando Sinapses...', subtitle: 'Criando conexões neurais do banco', weight: 15, returnToStep: 3 },
  { id: 'bootstrap', title: 'Registrando Baseline...', subtitle: 'Criando identidade administrativa', weight: 10, returnToStep: 1 },
  { id: 'redeploy', title: 'Ativando Replicante...', subtitle: 'Fazendo deploy das configurações', weight: 10, returnToStep: 2 },
  { id: 'wait_deploy', title: 'Despertar Iminente...', subtitle: 'Finalizando processo de incubação', weight: 5, returnToStep: 2 },
];

// =============================================================================
// HELPERS
// =============================================================================

async function hashPassword(password: string): Promise<string> {
  const SALT = '_smartzap_salt_2026';
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function calculateProgress(completedSteps: number, currentStepProgress = 0): number {
  const totalWeight = STEPS.reduce((sum, s) => sum + s.weight, 0);
  const completedWeight = STEPS.slice(0, completedSteps).reduce((sum, s) => sum + s.weight, 0);
  const currentStep = STEPS[completedSteps];
  const currentWeight = currentStep ? currentStep.weight * currentStepProgress : 0;
  return Math.min(Math.round(((completedWeight + currentWeight) / totalWeight) * 100), 99);
}

function buildDirectDbUrl(projectRef: string, dbPass: string): string {
  return `postgresql://postgres:${encodeURIComponent(dbPass)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`;
}

function buildPoolerDbUrl(projectRef: string, dbPass: string, poolerHost: string): string {
  return `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPass)}@${poolerHost}:6543/postgres?sslmode=require&pgbouncer=true`;
}

function isDbConnectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    lower.includes('tenant or user not found') ||
    lower.includes('connection') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again')
  );
}

async function validateVercelToken(token: string): Promise<{ projectId: string; projectName: string; teamId?: string }> {
  // List projects to validate token and find smartzap project
  const res = await fetchWithTimeout('https://api.vercel.com/v9/projects?limit=100', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Token Vercel inválido ou sem permissões. Verifique em vercel.com/account/tokens.');
    }
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Erro ao validar token Vercel');
  }

  const data = await res.json();
  const projects = data.projects || [];

  // Find smartzap project or use first
  let project = projects.find((p: { name: string }) => p.name.toLowerCase().includes('smartzap'));
  if (!project && projects.length > 0) {
    project = projects[0];
  }

  if (!project) {
    throw new Error('Nenhum projeto encontrado na Vercel. Crie um projeto primeiro.');
  }

  return {
    projectId: project.id,
    projectName: project.name,
    teamId: project.accountId !== project.ownerId ? project.accountId : undefined,
  };
}

async function validateQStashToken(token: string): Promise<void> {
  // Detecta região via JWT (mesmo padrão de /api/installer/qstash/validate)
  let qstashBaseUrl = 'https://qstash.upstash.io';
  try {
    const payloadB64 = token.split('.')[1];
    if (payloadB64) {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      if (payload.iss && typeof payload.iss === 'string') {
        qstashBaseUrl = payload.iss.replace(/\/$/, '');
      }
    }
  } catch {
    // JWT indecodificável: usa fallback genérico
  }

  const res = await fetchWithTimeout(`${qstashBaseUrl}/v2/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Token QStash inválido. Copie o QSTASH_TOKEN do console Upstash → QStash → Details.');
    }
    throw new Error('Erro ao validar token QStash');
  }
}

async function validateRedisCredentials(url: string, token: string): Promise<void> {
  let normalizedUrl = url.trim();
  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('URL do Redis deve usar HTTPS');
    }
    if (!parsed.hostname.endsWith('.upstash.io')) {
      throw new Error('URL do Redis deve ser do Upstash (*.upstash.io)');
    }
    normalizedUrl = parsed.origin;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'URL do Redis inválida';
    throw new Error(message);
  }

  const res = await fetchWithTimeout(`${normalizedUrl}/ping`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Credenciais Redis inválidas');
  }
}

async function findOrCreateSupabaseProject(
  pat: string,
  onProgress: (fraction: number) => Promise<void>
): Promise<{ projectRef: string; projectUrl: string; dbPass: string; isNew: boolean }> {
  // SEMPRE cria um projeto novo para evitar herdar lixo de instalações anteriores
  // Se "smartzap" já existe, tenta smartzap-v2, smartzap-v3, etc.

  await onProgress(0.1);

  // List existing projects to find available name
  const projectsResult = await listSupabaseProjects({ accessToken: pat });
  const existingNames = new Set(
    projectsResult.ok
      ? projectsResult.projects.map((p) => p.name?.toLowerCase())
      : []
  );

  await onProgress(0.2);

  // Generate DB password
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const array = new Uint8Array(24);
  crypto.getRandomValues(array);
  const dbPass = Array.from(array, (b) => charset[b % charset.length]).join('');

  // Get first org
  const orgsRes = await fetchWithTimeout('https://api.supabase.com/v1/organizations', {
    headers: { Authorization: `Bearer ${pat}` },
  });

  if (!orgsRes.ok) {
    throw new Error('Falha ao listar organizações Supabase');
  }

  const orgs = await orgsRes.json();
  if (!orgs.length) {
    throw new Error('Nenhuma organização Supabase encontrada');
  }

  const org = orgs[0];
  await onProgress(0.3);

  // Find available project name (smartzap, smartzap-v2, smartzap-v3, ...)
  let projectName = 'smartzap';
  let version = 1;

  while (existingNames.has(projectName.toLowerCase()) && version < 100) {
    version++;
    projectName = `smartzap-v${version}`;
  }

  await onProgress(0.4);

  // Create project
  // Detecta automaticamente a região Supabase mais próxima da Vercel
  // Ex: gru1 (São Paulo Vercel) -> sa-east-1 (São Paulo Supabase)
  const supabaseRegion = detectSupabaseRegion();
  console.log(`[provision] Região detectada: Vercel=${process.env.VERCEL_REGION || 'unknown'} -> Supabase=${supabaseRegion}`);

  const createResult = await createSupabaseProject({
    accessToken: pat,
    organizationSlug: org.slug || org.id,
    name: projectName,
    dbPass,
    region: supabaseRegion,
  });

  if (!createResult.ok) {
    // Handle race condition where name was taken between check and create
    if (createResult.status === 409) {
      // Try with timestamp suffix as fallback
      const fallbackName = `smartzap-${Date.now().toString(36)}`;
      const retryResult = await createSupabaseProject({
        accessToken: pat,
        organizationSlug: org.slug || org.id,
        name: fallbackName,
        dbPass,
        region: supabaseRegion,
      });

      if (!retryResult.ok) {
        throw new Error(retryResult.error || 'Falha ao criar projeto Supabase');
      }

      await onProgress(1);
      return {
        projectRef: retryResult.projectRef,
        projectUrl: `https://${retryResult.projectRef}.supabase.co`,
        dbPass,
        isNew: true,
      };
    }

    throw new Error(createResult.error || 'Falha ao criar projeto Supabase');
  }

  await onProgress(1);

  return {
    projectRef: createResult.projectRef,
    projectUrl: `https://${createResult.projectRef}.supabase.co`,
    dbPass,
    isNew: true,
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function POST(req: Request) {
  console.log('[provision] 🚀 POST /api/installer/provision iniciado');

  // Check if installer is enabled
  if (process.env.INSTALLER_ENABLED === 'false') {
    console.log('[provision] ❌ Installer desabilitado');
    return new Response(JSON.stringify({ error: 'Installer desabilitado' }), { status: 403 });
  }

  // Parse and validate payload
  console.log('[provision] 📦 Parseando payload...');
  const contentLengthHeader = req.headers.get('content-length') || '';
  const rawText = await req.text().catch((e) => {
    console.log('[provision] ❌ Erro ao ler body:', e);
    return '';
  });
  if (!rawText) {
    console.log('[provision] ❌ Payload vazio (possível abort)');
    return new Response(
      JSON.stringify({ error: 'Payload vazio', details: { contentLengthHeader } }),
      { status: 400 }
    );
  }
  const raw = JSON.parse(rawText);

  const parsed = ProvisionSchema.safeParse(raw);

  if (!parsed.success) {
    console.log('[provision] ❌ Payload inválido:', parsed.error.flatten());
    return new Response(
      JSON.stringify({ error: 'Payload inválido', details: parsed.error.flatten() }),
      { status: 400 }
    );
  }

  console.log('[provision] ✅ Payload válido');
  const { identity, vercel, supabase, qstash, redis } = parsed.data;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: StreamEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  console.log('[provision] 🔄 Iniciando stream SSE...');

  // Run provisioning in background
  (async () => {
    console.log('[provision] ⚡ Background task iniciada');

    let stepIndex = 0;
    let vercelProject: { projectId: string; projectName: string; teamId?: string } | null = null;
    let supabaseProject: { projectRef: string; projectUrl: string; dbPass: string; isNew: boolean } | null = null;
    let anonKey = '';
    let serviceRoleKey = '';
    let dbUrl = '';

    try {
      // Step 1: Validate Vercel token
      console.log('[provision] 📍 Step 1/12: Validate Vercel - INICIANDO');
      const step1 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step1.title,
        subtitle: step1.subtitle,
      });

      vercelProject = await validateVercelToken(vercel.token);
      console.log('[provision] ✅ Step 1/12: Validate Vercel - COMPLETO', { projectId: vercelProject.projectId, projectName: vercelProject.projectName });
      stepIndex++;

      // Step 2: Validate Supabase PAT
      console.log('[provision] 📍 Step 2/12: Validate Supabase PAT - INICIANDO');
      const step2 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step2.title,
        subtitle: step2.subtitle,
      });

      // Just validate the PAT format for now - actual validation happens in project creation
      if (!supabase.pat.startsWith('sbp_')) {
        throw new Error('PAT Supabase inválido (deve começar com sbp_)');
      }
      console.log('[provision] ✅ Step 2/12: Validate Supabase PAT - COMPLETO');
      stepIndex++;

      // Step 3: Create/find Supabase project
      console.log('[provision] 📍 Step 3/12: Create Supabase Project - INICIANDO');
      const step3 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step3.title,
        subtitle: step3.subtitle,
      });

      let createTick = 0;
      let createHeartbeat: ReturnType<typeof setInterval> | null = null;
      try {
        createHeartbeat = setInterval(async () => {
          createTick += 1;
          const subtitle =
            createTick <= 6
              ? 'Escaneando setores ocupados...'
              : createTick <= 20
                ? 'Alocando nova unidade de memória...'
                : 'Provisionamento do Supabase em andamento...';
          await sendEvent({
            type: 'progress',
            progress: calculateProgress(stepIndex, Math.min(0.2 + createTick * 0.01, 0.95)),
            title: step3.title,
            subtitle,
          });
        }, 6000);
        supabaseProject = await findOrCreateSupabaseProject(supabase.pat, async (fraction) => {
          await sendEvent({
            type: 'progress',
            progress: calculateProgress(stepIndex, fraction),
            title: step3.title,
            subtitle: fraction < 0.3 ? 'Escaneando setores ocupados...' : 'Alocando nova unidade de memória...',
          });
        });
      } finally {
        if (createHeartbeat) {
          clearInterval(createHeartbeat);
        }
      }
      console.log('[provision] ✅ Step 3/12: Create Supabase Project - COMPLETO', { projectRef: supabaseProject.projectRef, isNew: supabaseProject.isNew });
      stepIndex++;

      // Step 4: Wait for project to be ready (sempre aguarda - projeto é sempre novo)
      console.log('[provision] 📍 Step 4/12: Wait for Supabase Ready - INICIANDO');
      const step4 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step4.title,
        subtitle: step4.subtitle,
      });

      const startTime = Date.now();
      const timeoutMs = 210_000;

      while (Date.now() - startTime < timeoutMs) {
        const ready = await waitForSupabaseProjectReady({
          accessToken: supabase.pat,
          projectRef: supabaseProject.projectRef,
          timeoutMs: 4_000,
          pollMs: 4_000,
        });

        if (ready.ok) {
          console.log('[provision] ✅ Step 4/12: Supabase project is READY');
          break;
        }

        const fraction = Math.min((Date.now() - startTime) / timeoutMs, 0.95);
        await sendEvent({
          type: 'progress',
          progress: calculateProgress(stepIndex, fraction),
          title: step4.title,
          subtitle: `Células se multiplicando... (${Math.round(fraction * 100)}%)`,
        });
      }
      console.log('[provision] ✅ Step 4/12: Wait for Supabase Ready - COMPLETO', { elapsed: Date.now() - startTime });
      stepIndex++;

      // Step 5: Resolve Supabase keys
      console.log('[provision] 📍 Step 5/12: Resolve Supabase Keys - INICIANDO');
      const step5 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step5.title,
        subtitle: step5.subtitle,
      });

      const keysResult = await resolveSupabaseApiKeys({
        projectRef: supabaseProject.projectRef,
        accessToken: supabase.pat,
      });

      if (!keysResult.ok) {
        throw new Error(keysResult.error || 'Falha ao obter chaves do Supabase');
      }

      anonKey = keysResult.publishableKey;
      serviceRoleKey = keysResult.secretKey;
      console.log('[provision] ✅ Step 5/12: Got API keys (anon + service_role)');

      // Resolve DB URL
      if (supabaseProject.dbPass) {
        console.log('[provision] 📍 Step 5/12: Resolving DB URL (shared pooler primary)...');
        const poolerResult = await resolveSupabaseDbUrl({
          projectRef: supabaseProject.projectRef,
          accessToken: supabase.pat,
        });

        if (poolerResult.ok) {
          dbUrl = buildPoolerDbUrl(supabaseProject.projectRef, supabaseProject.dbPass, poolerResult.host);
          console.log('[provision] ✅ Step 5/12: DB URL pooler (postgres) resolvida', { host: poolerResult.host });
        } else {
          console.warn('[provision] ⚠️ Step 5/12: Pooler indisponível - usando conexão direta');
          dbUrl = buildDirectDbUrl(supabaseProject.projectRef, supabaseProject.dbPass);
        }
      } else {
        console.log('[provision] 📍 Step 5/12: dbPass ausente, usando pooler...');
        const poolerResult = await resolveSupabaseDbUrl({
          projectRef: supabaseProject.projectRef,
          accessToken: supabase.pat,
        });

        if (poolerResult.ok) {
          dbUrl = poolerResult.dbUrl;
          console.log('[provision] ✅ Step 5/12: DB URL pooler resolvida', { host: poolerResult.host });
        } else {
          console.warn('[provision] ⚠️ Step 5/12: No dbPass and failed to resolve pooler - migrations will be skipped!');
        }
      }

      console.log('[provision] ✅ Step 5/12: Resolve Supabase Keys - COMPLETO', { hasDbUrl: !!dbUrl });
      stepIndex++;

      // Step 6: Validate QStash
      console.log('[provision] 📍 Step 6/12: Validate QStash - INICIANDO');
      const step6 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step6.title,
        subtitle: step6.subtitle,
      });

      await validateQStashToken(qstash.token);
      console.log('[provision] ✅ Step 6/12: Validate QStash - COMPLETO');
      stepIndex++;

      // Step 7: Validate Redis
      console.log('[provision] 📍 Step 7/12: Validate Redis - INICIANDO');
      const step7 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step7.title,
        subtitle: step7.subtitle,
      });

      await validateRedisCredentials(redis.restUrl, redis.restToken);
      console.log('[provision] ✅ Step 7/12: Validate Redis - COMPLETO');
      stepIndex++;

      // Step 8: Setup env vars
      console.log('[provision] 📍 Step 8/12: Setup Env Vars - INICIANDO');
      const step8 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step8.title,
        subtitle: step8.subtitle,
      });

      const passwordHash = await hashPassword(identity.password);
      const envTargets = ['production', 'preview'] as const;

      const envVars = [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', value: supabaseProject.projectUrl, targets: [...envTargets] },
        { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', value: anonKey, targets: [...envTargets] },
        { key: 'SUPABASE_SECRET_KEY', value: serviceRoleKey, targets: [...envTargets] },
        { key: 'QSTASH_TOKEN', value: qstash.token, targets: [...envTargets] },
        { key: 'UPSTASH_REDIS_REST_URL', value: redis.restUrl, targets: [...envTargets] },
        { key: 'UPSTASH_REDIS_REST_TOKEN', value: redis.restToken, targets: [...envTargets] },
        { key: 'MASTER_PASSWORD', value: passwordHash, targets: [...envTargets] },
        { key: 'SMARTZAP_API_KEY', value: `szap_${crypto.randomUUID().replace(/-/g, '')}`, targets: [...envTargets] },
        { key: 'SETUP_COMPLETE', value: 'true', targets: [...envTargets] },
        // Tokens para métricas de uso (painel de infraestrutura)
        { key: 'VERCEL_API_TOKEN', value: vercel.token, targets: [...envTargets] },
        { key: 'SUPABASE_ACCESS_TOKEN', value: supabase.pat, targets: [...envTargets] },
      ];

      console.log('[provision] 📍 Step 8/12: Upserting', envVars.length, 'env vars...');
      await upsertProjectEnvs(vercel.token, vercelProject.projectId, envVars, vercelProject.teamId);
      console.log('[provision] ✅ Step 8/12: Env vars upserted');

      // Desabilita Deployment Protection para permitir acesso de serviços M2M (QStash)
      // Isso é necessário para que workflows e webhooks funcionem corretamente
      console.log('[provision] 📍 Step 8/12: Disabling Deployment Protection...');
      const protectionResult = await disableDeploymentProtection(
        vercel.token,
        vercelProject.projectId,
        vercelProject.teamId
      );
      if (!protectionResult.ok) {
        console.warn('[provision] ⚠️ Não foi possível desabilitar Deployment Protection:', protectionResult.error);
        // Não falha a instalação - apenas loga o warning
        // O usuário pode desabilitar manualmente se necessário
      } else {
        console.log('[provision] ✅ Deployment Protection desabilitado com sucesso');
      }

      console.log('[provision] ✅ Step 8/12: Setup Env Vars - COMPLETO');
      stepIndex++;

      // Step 9: Run migrations
      console.log('[provision] 📍 Step 9/12: Run Migrations - INICIANDO');
      console.log('[provision] 📍 Step 9/12: dbUrl available?', !!dbUrl);
      const step9 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step9.title,
        subtitle: step9.subtitle,
      });

      if (dbUrl) {
        console.log('[provision] 📍 Step 9/12: Checking if schema exists...');
        const schemaExists = await checkSchemaApplied(dbUrl);
        console.log('[provision] 📍 Step 9/12: schemaExists =', schemaExists);
        if (!schemaExists) {
          console.log('[provision] 📍 Step 9/12: Running migrations...');
          await runSchemaMigration(dbUrl);
          console.log('[provision] ✅ Step 9/12: Migrations completed, waiting 5s for schema cache...');
          // Wait for schema cache to update
          await new Promise((r) => setTimeout(r, 5000));
          console.log('[provision] ✅ Step 9/12: Schema cache wait complete');
        } else {
          console.log('[provision] ℹ️ Step 9/12: Schema already exists, skipping migrations');
        }
      } else {
        console.error('[provision] ❌ Step 9/12: NO DB URL - MIGRATIONS SKIPPED!');
      }
      console.log('[provision] ✅ Step 9/12: Run Migrations - COMPLETO');
      stepIndex++;

      // Step 10: Bootstrap admin
      console.log('[provision] 📍 Step 10/12: Bootstrap Admin - INICIANDO');
      const step10 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step10.title,
        subtitle: step10.subtitle,
      });

      await bootstrapInstance({
        supabaseUrl: supabaseProject.projectUrl,
        serviceRoleKey,
        adminEmail: identity.email,
        adminName: identity.name,
      });
      console.log('[provision] ✅ Step 10/12: Bootstrap Admin - COMPLETO');
      stepIndex++;

      // Step 11: Redeploy
      console.log('[provision] 📍 Step 11/12: Redeploy - INICIANDO');
      const step11 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step11.title,
        subtitle: step11.subtitle,
      });

      // Disable installer before redeploy
      console.log('[provision] 📍 Step 11/12: Disabling installer...');
      await upsertProjectEnvs(
        vercel.token,
        vercelProject.projectId,
        [{ key: 'INSTALLER_ENABLED', value: 'false', targets: ['production', 'preview'] }],
        vercelProject.teamId
      );

      console.log('[provision] 📍 Step 11/12: Triggering redeploy...');
      let redeploy: { deploymentId?: string };
      try {
        redeploy = await triggerProjectRedeploy(vercel.token, vercelProject.projectId, vercelProject.teamId);
      } catch (err) {
        try {
          console.warn('[provision] ⚠️ Redeploy falhou, reabilitando installer...');
          await upsertProjectEnvs(
            vercel.token,
            vercelProject.projectId,
            [{ key: 'INSTALLER_ENABLED', value: 'true', targets: ['production', 'preview'] }],
            vercelProject.teamId
          );
        } catch (rollbackErr) {
          console.error('[provision] ❌ Falha ao reabilitar installer após erro no redeploy:', rollbackErr);
        }
        throw err;
      }
      console.log('[provision] ✅ Step 11/12: Redeploy triggered', { deploymentId: redeploy.deploymentId });
      stepIndex++;

      // Step 12: Wait for deploy
      console.log('[provision] 📍 Step 12/12: Wait for Deploy - INICIANDO');
      const step12 = STEPS[stepIndex];
      await sendEvent({
        type: 'progress',
        progress: calculateProgress(stepIndex),
        title: step12.title,
        subtitle: step12.subtitle,
      });

      if (redeploy.deploymentId) {
        console.log('[provision] 📍 Step 12/12: Waiting for deployment to be ready...');
        await waitForVercelDeploymentReady({
          token: vercel.token,
          deploymentId: redeploy.deploymentId,
          teamId: vercelProject.teamId,
          timeoutMs: 240_000,
          pollMs: 2_500,
          onTick: async ({ elapsedMs }) => {
            const fraction = Math.min(elapsedMs / 240_000, 0.95);
            await sendEvent({
              type: 'progress',
              progress: calculateProgress(stepIndex, fraction),
              title: step12.title,
              subtitle: `Consciência emergindo... (${Math.round(fraction * 100)}%)`,
            });
          },
        });
        console.log('[provision] ✅ Step 12/12: Deployment is READY');
      } else {
        console.warn('[provision] ⚠️ Step 12/12: No deploymentId, skipping wait');
      }
      console.log('[provision] ✅ Step 12/12: Wait for Deploy - COMPLETO');

      // Complete!
      console.log('[provision] 🎉 PROVISIONING COMPLETE - ALL 12 STEPS DONE!');
      await sendEvent({ type: 'complete' });
    } catch (err) {
      const currentStep = STEPS[stepIndex] || STEPS[0];
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      const stack = err instanceof Error ? err.stack : undefined;

      console.error(`[provision] ❌❌❌ ERROR at step ${stepIndex + 1}/12 (${currentStep.id}):`, message);
      console.error('[provision] ❌ Error details:', {
        stepIndex,
        stepId: currentStep.id,
        stepTitle: currentStep.title,
        errorMessage: message,
      });
      if (stack) console.error('[provision] ❌ Stack:', stack);

      // Derivar errorType a partir do step que falhou e se foi timeout de rede
      const isTimeout = err instanceof Error && err.message.toLowerCase().includes('timeout');
      const errorTypeMap: Record<string, InstallErrorType> = {
        validate_vercel: 'vercel_token',
        validate_supabase: 'supabase_pat',
        validate_qstash: 'qstash_token',
      };

      // Para redis, distingue URL vs token pelo conteúdo da mensagem de erro
      let derivedErrorType: InstallErrorType;
      if (currentStep.id === 'validate_redis') {
        const msg = message.toLowerCase();
        derivedErrorType = isTimeout ? 'network'
          : msg.includes('token') || msg.includes('inválido') || msg.includes('permiss') ? 'redis_token'
          : 'redis_url';
      } else {
        derivedErrorType = isTimeout ? 'network' : (errorTypeMap[currentStep.id] ?? 'unknown');
      }

      await sendEvent({
        type: 'error',
        error: message,
        errorType: derivedErrorType,
        errorDetails: stack,
        returnToStep: currentStep.returnToStep,
      });
    } finally {
      console.log('[provision] 🔚 Provision stream closing');
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
