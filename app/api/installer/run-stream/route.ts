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

// Step definitions for progress calculation
interface Step {
  id: string;
  phase: PhaseId;
  weight: number;
  skippable: boolean;
}

const ALL_STEPS: Step[] = [
  { id: 'resolve_keys', phase: 'coordinates', weight: 10, skippable: false },
  { id: 'setup_envs', phase: 'coordinates', weight: 10, skippable: false },
  { id: 'wait_project', phase: 'signal', weight: 20, skippable: true },
  { id: 'wait_storage', phase: 'station', weight: 15, skippable: true },
  { id: 'migrations', phase: 'station', weight: 15, skippable: true },
  { id: 'bootstrap', phase: 'contact', weight: 10, skippable: true },
  { id: 'redeploy', phase: 'landing', weight: 10, skippable: false },
  { id: 'wait_vercel_deploy', phase: 'landing', weight: 10, skippable: false },
];

// Mapeamento cinematográfico (estilo Matrix)
function createCinemaPhases(firstName: string) {
  return {
    coordinates: {
      id: 'coordinates',
      title: 'Seguindo o coelho branco...',
      subtitle: 'Estabelecendo conexão com a Matrix...',
    },
    signal: {
      id: 'signal',
      title: 'Entrando na Matrix',
      subtitle: 'A realidade está sendo construída...',
    },
    station: {
      id: 'station',
      title: 'Instalando conhecimento',
      subtitle: 'I know kung fu...',
    },
    contact: {
      id: 'contact',
      title: 'Você é o Escolhido',
      subtitle: 'Configurando sua identidade...',
    },
    landing: {
      id: 'landing',
      title: 'A escolha foi feita',
      subtitle: 'Livre sua mente...',
    },
    complete: {
      id: 'complete',
      title: `Bem-vindo à realidade, ${firstName}.`,
      subtitle: 'Você tomou a pílula verde.',
    },
  } as const;
}

type PhaseId = 'coordinates' | 'signal' | 'station' | 'contact' | 'landing' | 'complete';

interface StreamEvent {
  type: 'phase' | 'progress' | 'error' | 'complete' | 'skip' | 'retry' | 'step_complete';
  phase?: PhaseId;
  title?: string;
  subtitle?: string;
  progress?: number;
  error?: string;
  ok?: boolean;
  skipped?: string[];
  stepId?: string;
  retryCount?: number;
  maxRetries?: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Helper for retry logic
async function withRetry<T>(
  stepId: string,
  fn: () => Promise<T>,
  sendEvent: (event: StreamEvent) => Promise<void>,
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
      const errorStack = err instanceof Error ? err.stack : undefined;
      console.error(`[run-stream] Step ${stepId} failed (attempt ${attempt}/${MAX_RETRIES}):`, errorMsg);
      if (errorStack) console.error(`[run-stream] Stack:`, errorStack);
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

// Calculate progress based on active steps
function createProgressCalculator(skippedStepIds: string[]) {
  const activeSteps = ALL_STEPS.filter(s => !skippedStepIds.includes(s.id));
  const totalWeight = activeSteps.reduce((sum, s) => sum + s.weight, 0);

  let completedWeight = 0;

  return {
    activeSteps,
    totalWeight,
    completeStep(stepId: string): number {
      const step = activeSteps.find(s => s.id === stepId);
      if (step) {
        completedWeight += step.weight;
      }
      return Math.min(Math.round((completedWeight / totalWeight) * 100), 99);
    },
    partialProgress(stepId: string, fraction: number): number {
      const step = activeSteps.find(s => s.id === stepId);
      if (!step) return Math.round((completedWeight / totalWeight) * 100);
      const partial = step.weight * Math.min(fraction, 1);
      return Math.min(Math.round(((completedWeight + partial) / totalWeight) * 100), 99);
    },
    getPhase(stepId: string): PhaseId {
      const step = ALL_STEPS.find(s => s.id === stepId);
      return step?.phase || 'coordinates';
    },
  };
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

  // Determine which steps to skip based on health check
  const skippedSteps: string[] = [];
  const shouldWaitStorage = process.env.SMARTZAP_WAIT_STORAGE === 'true';
  if (healthCheck?.skipWaitProject) skippedSteps.push('wait_project');
  if (!shouldWaitStorage) skippedSteps.push('wait_storage');
  if (shouldWaitStorage && healthCheck?.skipWaitStorage) skippedSteps.push('wait_storage');
  if (healthCheck?.skipMigrations) skippedSteps.push('migrations');
  if (healthCheck?.skipBootstrap) skippedSteps.push('bootstrap');

  // Extract first name for personalization (usa nome real, não extrai do email)
  const firstName = admin.name.split(' ')[0] || 'você';
  const PHASES = createCinemaPhases(firstName);

  // Create progress calculator
  const progress = createProgressCalculator(skippedSteps);

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: StreamEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  const sendPhase = async (stepId: string, partialFraction?: number) => {
    const phase = progress.getPhase(stepId);
    const p = PHASES[phase];
    const prog = partialFraction !== undefined
      ? progress.partialProgress(stepId, partialFraction)
      : progress.completeStep(stepId);
    await sendEvent({ type: 'phase', phase, title: p.title, subtitle: p.subtitle, progress: prog });
  };

  // Run installation in background
  (async () => {
    try {
      // Send initial event with skipped steps info
      if (skippedSteps.length > 0) {
        await sendEvent({ type: 'skip', skipped: skippedSteps });
      }

      const resolvedProjectRef =
        supabase.projectRef?.trim() ||
        extractProjectRefFromSupabaseUrl(supabase.url) ||
        '';

      if (!resolvedProjectRef) {
        await sendEvent({ type: 'error', error: 'Não foi possível identificar o projeto Supabase.' });
        await writer.close();
        return;
      }

      let resolvedAnonKey = '';
      let resolvedServiceRoleKey = '';
      let resolvedDbUrl = '';

      // Step: resolve_keys
      await sendPhase('resolve_keys', 0);

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

      await sendPhase('resolve_keys', 0.5);

      // Se dbPass foi fornecido, usa postgres user diretamente (tem todas permissões)
      // Senão, tenta CLI login role (permissões limitadas)
      if (supabase.dbPass) {
        // Resolve o pooler host via API
        const poolerResult = await resolveSupabaseDbUrl({
          projectRef: resolvedProjectRef,
          accessToken: supabase.accessToken,
        });

        if (poolerResult.ok) {
          // Usa postgres user com a senha fornecida
          const poolerHost = poolerResult.host;
          resolvedDbUrl = `postgresql://postgres.${resolvedProjectRef}:${encodeURIComponent(supabase.dbPass)}@${poolerHost}:6543/postgres?sslmode=require&pgbouncer=true`;
          console.log('[run-stream] DB URL usando postgres user (dbPass fornecido):', { host: poolerHost });
        } else {
          throw new Error(poolerResult.error || 'Falha ao resolver host do banco.');
        }
      } else {
        // Fallback: CLI login role (pode ter permissões limitadas)
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

        console.log('[run-stream] DB URL via CLI login role:', {
          host: db.host,
          role: db.role,
          ttlSeconds: db.ttlSeconds,
        });
      }

      await sendPhase('resolve_keys');

      // Step: setup_envs
      await sendPhase('setup_envs', 0);

      // Configurar TODAS as variáveis de ambiente necessárias
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

      await sendPhase('setup_envs');

      // Step: wait_project
      if (!skippedSteps.includes('wait_project')) {
        await sendPhase('wait_project', 0);

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

          const elapsed = Date.now() - startTime;
          const fraction = Math.min(elapsed / timeoutMs, 0.95);
          await sendPhase('wait_project', fraction);
        }

        await sendPhase('wait_project');
      }

      // Step: wait_storage + migrations (combined in station phase)
      const skipStorage = skippedSteps.includes('wait_storage');
      const skipMigrations = skippedSteps.includes('migrations');

      if (!skipStorage || !skipMigrations) {
        if (!skipStorage) {
          await sendPhase('wait_storage', 0);
        }

        if (!skipMigrations) {
          await sendPhase('migrations', 0);

          // Verifica se schema já foi aplicado
          const schemaExists = await checkSchemaApplied(resolvedDbUrl);
          if (schemaExists) {
            console.log('[run-stream] Schema já aplicado, pulando migrations');
            skippedSteps.push('migrations');
          } else {
            // Igual ao CRM - chamada simples sem callbacks
            await withRetry(
              'migrations',
              async () => {
                await runSchemaMigration(resolvedDbUrl);
              },
              sendEvent,
              (err) => {
                // Don't retry if it's a schema conflict (already applied)
                const msg = err instanceof Error ? err.message : '';
                return !msg.includes('already exists');
              }
            );
          }

          await sendPhase('migrations');
        }

        if (!skipStorage) {
          await sendPhase('wait_storage'); // Complete (done as part of migrations)
        }
      }

      // Aguarda schema cache do Supabase atualizar após migrations
      // O PostgREST mantém cache do schema que demora alguns segundos para invalidar
      // Só precisa aguardar se as migrations realmente rodaram (não foram puladas)
      if (!skippedSteps.includes('migrations')) {
        console.log('[run-stream] Aguardando schema cache atualizar (5s)...');
        await new Promise((r) => setTimeout(r, 5000));
      }

      // Step: bootstrap
      if (!skippedSteps.includes('bootstrap')) {
        await sendPhase('bootstrap', 0);

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
            // Nota: O CRM não faz verificação de conectividade aqui - vai direto para o redeploy
          },
          sendEvent
        );

        await sendPhase('bootstrap');
      }

      // Step: redeploy
      console.log('[run-stream] Iniciando passo: redeploy');
      await sendPhase('redeploy', 0);

      // IMPORTANTE: Desabilita o installer ANTES do redeploy
      // Assim o novo deploy já sobe com INSTALLER_ENABLED=false
      console.log('[run-stream] Desabilitando installer (INSTALLER_ENABLED=false) antes do redeploy...');
      await upsertProjectEnvs(
        vercel.token,
        vercel.projectId,
        [{ key: 'INSTALLER_ENABLED', value: 'false', targets: envTargets }],
        vercel.teamId || undefined
      );
      console.log('[run-stream] INSTALLER_ENABLED definido como false');

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
          console.warn('[run-stream] Redeploy falhou, reabilitando installer...');
          await upsertProjectEnvs(
            vercel.token,
            vercel.projectId,
            [{ key: 'INSTALLER_ENABLED', value: 'true', targets: envTargets }],
            vercel.teamId || undefined
          );
        } catch (rollbackErr) {
          console.error('[run-stream] Falha ao reabilitar installer após erro no redeploy:', rollbackErr);
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          'Falha ao iniciar redeploy na Vercel. ' +
          'Abra o projeto na Vercel → Deployments → Redeploy manualmente. ' +
          (msg ? 'Detalhe: ' + msg : '')
        );
      }

      await sendPhase('redeploy');
      console.log('[run-stream] Redeploy disparado, deploymentId:', vercelDeploymentId);

      // Step: wait_vercel_deploy
      console.log('[run-stream] Iniciando passo: wait_vercel_deploy');
      await sendPhase('wait_vercel_deploy', 0);

      if (!vercelDeploymentId) {
        throw new Error('Falha ao acompanhar redeploy: deploymentId ausente.');
      }

      const wait = await waitForVercelDeploymentReady({
        token: vercel.token,
        deploymentId: vercelDeploymentId,
        teamId: vercel.teamId || undefined,
        timeoutMs: 240_000,
        pollMs: 2_500,
        onTick: async ({ elapsedMs }) => {
          const fraction = Math.min(elapsedMs / 240_000, 0.95);
          await sendPhase('wait_vercel_deploy', fraction);
        },
      });

      if (!wait.ok) {
        throw new Error(
          'Redeploy disparado, mas ainda não finalizou. ' +
          'Aguarde o status ficar READY na Vercel.'
        );
      }

      await sendPhase('wait_vercel_deploy');

      // Complete!
      console.log('[run-stream] Instalação concluída com sucesso!');
      const completePhase = PHASES['complete'];
      await sendEvent({
        type: 'phase',
        phase: 'complete',
        title: completePhase.title,
        subtitle: completePhase.subtitle,
        progress: 100,
      });
      await sendEvent({ type: 'complete', ok: true });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro durante a instalação.';
      const stack = err instanceof Error ? err.stack : undefined;
      console.error('[run-stream] ERRO na instalação:', message);
      if (stack) console.error('[run-stream] Stack:', stack);
      try {
        await sendEvent({ type: 'error', error: message });
      } catch (sendErr) {
        console.error('[run-stream] Falha ao enviar evento de erro (stream possivelmente fechada):', sendErr);
      }
    } finally {
      console.log('[run-stream] Finalizando stream...');
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
