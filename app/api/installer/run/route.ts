import { z } from 'zod';
import { runSchemaMigration, checkSchemaApplied } from '@/lib/installer/migrations';
import { bootstrapInstance } from '@/lib/installer/bootstrap';
import { triggerProjectRedeploy, upsertProjectEnvs, waitForVercelDeploymentReady } from '@/lib/installer/vercel';
import {
  extractProjectRefFromSupabaseUrl,
  resolveSupabaseApiKeys,
  resolveSupabaseDbUrl,
  waitForSupabaseProjectReady,
} from '@/lib/installer/supabase';

export const maxDuration = 300;
export const runtime = 'nodejs';

// Health check result schema (do /api/installer/health-check)
const HealthCheckResultSchema = z.object({
  skipWaitProject: z.boolean().default(false),
  skipWaitStorage: z.boolean().default(false),
  skipMigrations: z.boolean().default(false),
  skipBootstrap: z.boolean().default(false),
  estimatedSeconds: z.number().default(120),
}).optional();

const RunSchema = z
  .object({
    vercel: z.object({
      token: z.string().min(1),
      teamId: z.string().nullish().transform(val => val ?? undefined), // aceita null do JSON
      projectId: z.string().min(1),
      targets: z.array(z.enum(['production', 'preview'])).min(1),
    }),
    supabase: z.object({
      url: z.string().url(),
      accessToken: z.string().min(1),
      projectRef: z.string().optional(),
      dbPass: z.string().min(1).optional(), // Senha do banco (criada junto com o projeto)
    }),
    upstash: z.object({
      qstashToken: z.string().min(1),
      redisRestUrl: z.string().url(),
      redisRestToken: z.string().min(1),
    }),
    admin: z.object({
      name: z.string().min(1),
      email: z.string().email(),
      passwordHash: z.string().min(1),
    }),
    // Health check result para pular etapas
    healthCheck: HealthCheckResultSchema,
  })
  .strict();

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function withRetry<T>(
  stepId: string,
  fn: () => Promise<T>,
  sendEvent: (event: { type: string; stepId?: string; error?: string; retryCount?: number; maxRetries?: number }) => Promise<void>,
  isRetryable: (err: unknown) => boolean = () => true
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || attempt === MAX_RETRIES) {
        throw err;
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[run] Step ${stepId} failed (attempt ${attempt}/${MAX_RETRIES}):`, errorMsg);
      await sendEvent({
        type: 'retry',
        stepId,
        retryCount: attempt,
        maxRetries: MAX_RETRIES,
        error: errorMsg,
      });

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw lastError;
}

export async function POST(req: Request) {
  // Verificar se installer está habilitado
  if (process.env.INSTALLER_ENABLED === 'false') {
    return new Response(JSON.stringify({ error: 'Installer desabilitado' }), { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = RunSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Payload inválido', details: parsed.error.flatten() }), { status: 400 });
  }

  const { vercel, supabase, upstash, admin, healthCheck } = parsed.data;
  const envTargets = vercel.targets;
  const shouldWaitStorage = process.env.SMARTZAP_WAIT_STORAGE === 'true';

  // Determine which steps to skip based on health check
  const skippedSteps: string[] = [];
  if (healthCheck?.skipWaitProject) skippedSteps.push('wait_project');
  if (!shouldWaitStorage) skippedSteps.push('wait_storage');
  if (shouldWaitStorage && healthCheck?.skipWaitStorage) skippedSteps.push('wait_storage');
  if (healthCheck?.skipMigrations) skippedSteps.push('migrations');
  if (healthCheck?.skipBootstrap) skippedSteps.push('bootstrap');

  const sendEvent = async () => undefined;

  try {
    const resolvedProjectRef =
      supabase.projectRef?.trim() ||
      extractProjectRefFromSupabaseUrl(supabase.url) ||
      '';

    if (!resolvedProjectRef) {
      return new Response(JSON.stringify({ error: 'Não foi possível identificar o projeto Supabase.' }), { status: 400 });
    }

    let resolvedAnonKey = '';
    let resolvedServiceRoleKey = '';
    let resolvedDbUrl = '';

    const keys = await withRetry(
      'resolve_keys',
      async () => {
        const result = await resolveSupabaseApiKeys({
          projectRef: resolvedProjectRef,
          accessToken: supabase.accessToken,
        });
        if (!result.ok) throw new Error(result.error || 'Falha ao obter chaves de acesso.');
        return result;
      },
      sendEvent
    );
    resolvedAnonKey = keys.publishableKey;
    resolvedServiceRoleKey = keys.secretKey;

    // Se dbPass foi fornecido, usa postgres user diretamente (tem todas permissões)
    // Senão, tenta CLI login role (permissões limitadas)
    if (supabase.dbPass) {
      const poolerResult = await resolveSupabaseDbUrl({
        projectRef: resolvedProjectRef,
        accessToken: supabase.accessToken,
      });

      if (poolerResult.ok) {
        const poolerHost = poolerResult.host;
        resolvedDbUrl = `postgresql://postgres.${resolvedProjectRef}:${encodeURIComponent(supabase.dbPass)}@${poolerHost}:6543/postgres?sslmode=require&pgbouncer=true`;
      } else {
        throw new Error(poolerResult.error || 'Falha ao resolver host do banco.');
      }
    } else {
      const db = await withRetry(
        'resolve_db',
        async () => {
          const result = await resolveSupabaseDbUrl({
            projectRef: resolvedProjectRef,
            accessToken: supabase.accessToken,
          });
          if (!result.ok) throw new Error(result.error || 'Falha ao conectar com o banco de dados.');
          return result;
        },
        sendEvent
      );
      resolvedDbUrl = db.dbUrl;
    }

    // Setup envs
    const envVars = [
      // Supabase
      { key: 'NEXT_PUBLIC_SUPABASE_URL', value: supabase.url, targets: envTargets },
      { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', value: resolvedAnonKey, targets: envTargets },
      { key: 'SUPABASE_SECRET_KEY', value: resolvedServiceRoleKey, targets: envTargets },

      // QStash
      { key: 'QSTASH_TOKEN', value: upstash.qstashToken, targets: envTargets },
      // Região obrigatória us-east-1 para o runtime (@upstash/qstash lê QSTASH_URL)
      { key: 'QSTASH_URL', value: 'https://qstash-us-east-1.upstash.io', targets: envTargets },

      // Redis
      { key: 'UPSTASH_REDIS_REST_URL', value: upstash.redisRestUrl, targets: envTargets },
      { key: 'UPSTASH_REDIS_REST_TOKEN', value: upstash.redisRestToken, targets: envTargets },

      // Auth
      { key: 'MASTER_PASSWORD', value: admin.passwordHash, targets: envTargets },

      // API Key para acesso programático
      { key: 'SMARTZAP_API_KEY', value: `szap_${crypto.randomUUID().replace(/-/g, '')}`, targets: envTargets },

      // Setup flag (para isSetupComplete() retornar true em produção)
      { key: 'SETUP_COMPLETE', value: 'true', targets: envTargets },
    ];

    await upsertProjectEnvs(
      vercel.token,
      vercel.projectId,
      envVars,
      vercel.teamId || undefined
    );

    // wait_project (skippable)
    if (!skippedSteps.includes('wait_project')) {
      const startTime = Date.now();
      const timeoutMs = 210_000;
      const pollMs = 4_000;

      while (Date.now() - startTime < timeoutMs) {
        const ready = await waitForSupabaseProjectReady({
          accessToken: supabase.accessToken,
          projectRef: resolvedProjectRef,
          timeoutMs: pollMs,
          pollMs: pollMs,
        });

        if (ready.ok) break;
      }
    }

    // wait_storage + migrations
    const skipStorage = skippedSteps.includes('wait_storage');
    const skipMigrations = skippedSteps.includes('migrations');

    if (!skipStorage || !skipMigrations) {
      if (!skipMigrations) {
        const schemaExists = await checkSchemaApplied(resolvedDbUrl);
        if (!schemaExists) {
          await withRetry(
            'migrations',
            async () => {
              await runSchemaMigration(resolvedDbUrl);
            },
            sendEvent,
            (err) => {
              const msg = err instanceof Error ? err.message : '';
              return !msg.includes('already exists');
            }
          );
        }
      }
    }

    if (!skippedSteps.includes('migrations')) {
      await new Promise((r) => setTimeout(r, 5000));
    }

    // bootstrap
    if (!skippedSteps.includes('bootstrap')) {
      await withRetry(
        'bootstrap',
        async () => {
          const bootstrap = await bootstrapInstance({
            supabaseUrl: supabase.url,
            serviceRoleKey: resolvedServiceRoleKey,
            adminEmail: admin.email,
            adminName: admin.name,
          });

          if (!bootstrap.ok) throw new Error(bootstrap.error || 'Falha ao configurar instância.');
        },
        sendEvent
      );
    }

    // redeploy
    await upsertProjectEnvs(
      vercel.token,
      vercel.projectId,
      [{ key: 'INSTALLER_ENABLED', value: 'false', targets: envTargets }],
      vercel.teamId || undefined
    );

    let vercelDeploymentId: string | null = null;
    try {
      const redeploy = await triggerProjectRedeploy(
        vercel.token,
        vercel.projectId,
        vercel.teamId || undefined
      );
      vercelDeploymentId = redeploy.deploymentId;
    } catch (err) {
      try {
        await upsertProjectEnvs(
          vercel.token,
          vercel.projectId,
          [{ key: 'INSTALLER_ENABLED', value: 'true', targets: envTargets }],
          vercel.teamId || undefined
        );
      } catch (rollbackErr) {
        console.error('[run] Falha ao reabilitar installer após erro no redeploy:', rollbackErr);
      }
      throw err;
    }

    if (!vercelDeploymentId) {
      throw new Error('Falha ao acompanhar redeploy: deploymentId ausente.');
    }

    const wait = await waitForVercelDeploymentReady({
      token: vercel.token,
      deploymentId: vercelDeploymentId,
      teamId: vercel.teamId || undefined,
      timeoutMs: 240_000,
      pollMs: 2_500,
    });

    if (!wait.ok) {
      throw new Error('Redeploy disparado, mas ainda não finalizou. Aguarde o status ficar READY na Vercel.');
    }

    return new Response(JSON.stringify({ ok: true, skippedSteps }), { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro durante a instalação.';
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
}
