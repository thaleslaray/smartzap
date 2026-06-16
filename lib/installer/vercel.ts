/**
 * Integração com API da Vercel para o installer.
 * Gerencia projetos, variáveis de ambiente e deploys.
 */

type VercelTeam = {
  id: string;
  name: string;
  slug?: string;
};

type VercelProject = {
  id: string;
  name: string;
  accountId?: string;
  alias?: { domain: string }[];
  targets?: {
    production?: {
      alias?: string[];
    };
  };
};

type VercelEnv = {
  id: string;
  key: string;
  value?: string;
  target?: string[];
  type?: string;
};

type VercelDeployment = {
  id?: string;
  uid?: string;
  name?: string;
  url?: string;
  state?: string;
  readyState?: string;
  target?: 'production' | 'preview' | 'development';
};

const VERCEL_API_BASE = 'https://api.vercel.com';

type VercelErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    invalidToken?: boolean;
  };
};

function formatVercelError(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as VercelErrorPayload;
    const err = parsed?.error;
    if (!err) return null;

    const message = err.message || '';
    const code = err.code || '';

    if (err.invalidToken || /invalid token/i.test(message)) {
      return 'Token da Vercel inválido ou expirado. Gere um novo token com Full Account.';
    }

    if (code === 'forbidden' || /not authorized/i.test(message)) {
      return 'Token da Vercel sem permissão para este projeto. Gere um token com Full Account.';
    }

    if (code === 'missing_scope' || code === 'insufficient_scope') {
      return 'Token da Vercel sem escopo necessário. Crie um token com Full Account.';
    }

    if (code === 'not_found') {
      return 'Recurso não encontrado na Vercel para este token.';
    }

    if (message) {
      return `Erro da Vercel: ${message}`;
    }
  } catch {
    return null;
  }

  return null;
}

function buildUrl(path: string, teamId?: string) {
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  if (teamId) url.searchParams.set('teamId', teamId);
  return url.toString();
}

async function vercelFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  teamId?: string
): Promise<T> {
  const res = await fetch(buildUrl(path, teamId), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    const parsedMessage = text ? formatVercelError(text) : null;
    const message = parsedMessage || text || `Vercel API error (${res.status})`;
    throw new Error(message);
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function getVercelDeployment(params: {
  token: string;
  deploymentId: string;
  teamId?: string;
}): Promise<{ ok: true; deployment: VercelDeployment } | { ok: false; error: string }> {
  try {
    const deployment = await vercelFetch<VercelDeployment>(
      `/v13/deployments/${encodeURIComponent(params.deploymentId)}`,
      params.token,
      {},
      params.teamId
    );
    return { ok: true, deployment };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro ao buscar deployment' };
  }
}

export async function waitForVercelDeploymentReady(params: {
  token: string;
  deploymentId: string;
  teamId?: string;
  timeoutMs?: number;
  pollMs?: number;
  onTick?: (info: { readyState?: string; elapsedMs: number }) => Promise<void> | void;
}): Promise<
  | { ok: true; deployment: VercelDeployment }
  | { ok: false; error: string; lastReadyState?: string }
> {
  const timeoutMs = params.timeoutMs ?? 180_000;
  const pollMs = params.pollMs ?? 2_500;

  const t0 = Date.now();
  let lastReadyState: string | undefined;

  while (Date.now() - t0 < timeoutMs) {
    const res = await getVercelDeployment({
      token: params.token,
      deploymentId: params.deploymentId,
      teamId: params.teamId,
    });

    if (res.ok) {
      lastReadyState = res.deployment.readyState;
      const normalized = String(lastReadyState || '').toUpperCase();
      if (normalized === 'READY') {
        return { ok: true, deployment: res.deployment };
      }
    }

    if (params.onTick) {
      await params.onTick({ readyState: lastReadyState, elapsedMs: Date.now() - t0 });
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  return {
    ok: false,
    error:
      `Deployment da Vercel ainda está finalizando (${lastReadyState || 'desconhecido'}). ` +
      'Aguarde e tente novamente.',
    lastReadyState,
  };
}

export async function listVercelTeams(token: string): Promise<VercelTeam[]> {
  const data = await vercelFetch<{ teams?: VercelTeam[] }>(
    '/v2/teams',
    token
  );
  return data.teams ?? [];
}

export async function listVercelProjects(
  token: string,
  teamId?: string
): Promise<VercelProject[]> {
  const data = await vercelFetch<{ projects?: VercelProject[] }>(
    '/v9/projects',
    token,
    {},
    teamId
  );
  return data.projects ?? [];
}

async function listProjectEnvs(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelEnv[]> {
  const data = await vercelFetch<{ envs?: VercelEnv[] }>(
    `/v10/projects/${projectId}/env`,
    token,
    {},
    teamId
  );
  return data.envs ?? [];
}

/**
 * Retorna o conjunto de chaves de env já existentes no projeto Vercel.
 * Usado para tornar idempotente a geração de segredos (ex.: SMARTZAP_API_KEY):
 * re-rodar o provision não deve regenerar uma key que já existe.
 */
export async function getExistingEnvKeys(
  token: string,
  projectId: string,
  teamId?: string
): Promise<Set<string>> {
  const existing = await listProjectEnvs(token, projectId, teamId);
  return new Set(existing.map((item) => item.key).filter(Boolean));
}

async function updateEnv(
  token: string,
  projectId: string,
  envId: string,
  value: string,
  teamId?: string
) {
  await vercelFetch(
    `/v10/projects/${projectId}/env/${envId}`,
    token,
    {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    },
    teamId
  );
}

async function createEnv(
  token: string,
  projectId: string,
  payload: { key: string; value: string; target: string[]; type: 'encrypted' },
  teamId?: string
) {
  await vercelFetch(
    `/v10/projects/${projectId}/env`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    teamId
  );
}

/**
 * Insere ou atualiza variáveis de ambiente em um projeto Vercel.
 * Se a variável já existe, atualiza o valor. Se não, cria nova.
 */
export async function upsertProjectEnvs(
  token: string,
  projectId: string,
  envs: Array<{ key: string; value: string; targets: string[] }>,
  teamId?: string
) {
  const existing = await listProjectEnvs(token, projectId, teamId);

  for (const env of envs) {
    const handledTargets = new Set<string>();
    const matching = existing.filter((item) => item.key === env.key);

    for (const item of matching) {
      if (item.id) {
        await updateEnv(token, projectId, item.id, env.value, teamId);
        (item.target ?? []).forEach((target) => handledTargets.add(target));
      }
    }

    const targetsToCreate = env.targets.filter(
      (target) => !handledTargets.has(target)
    );

    if (targetsToCreate.length > 0) {
      await createEnv(
        token,
        projectId,
        {
          key: env.key,
          value: env.value,
          target: targetsToCreate,
          type: 'encrypted',
        },
        teamId
      );
    }
  }
}

/**
 * Dispara redeploy de um projeto Vercel.
 * Retorna o ID do novo deployment para acompanhar status.
 */
export async function triggerProjectRedeploy(
  token: string,
  projectId: string,
  teamId?: string
): Promise<{ deploymentId: string }> {
  // Busca o último deployment de production
  let data = await vercelFetch<{ deployments?: VercelDeployment[] }>(
    `/v6/deployments?projectId=${projectId}&target=production&limit=1`,
    token,
    {},
    teamId
  );

  let latest = data.deployments?.[0];

  // Fallback: se não encontrou por target, busca os últimos 5
  if (!latest) {
    data = await vercelFetch<{ deployments?: VercelDeployment[] }>(
      `/v6/deployments?projectId=${projectId}&limit=5`,
      token,
      {},
      teamId
    );
    latest = data.deployments?.find((d) => d.target === 'production') ?? data.deployments?.[0];
  }

  const deploymentId = latest?.id ?? latest?.uid;
  if (!deploymentId) {
    throw new Error('Nenhum deployment encontrado para este projeto.');
  }

  // Obtém nome do deployment/projeto
  let deploymentName = (latest as Record<string, unknown>)?.name as string | undefined;
  if (!deploymentName) {
    try {
      const proj = await vercelFetch<VercelProject>(`/v9/projects/${projectId}`, token, {}, teamId);
      deploymentName = proj?.name;
    } catch {
      // ignore
    }
  }
  if (!deploymentName) {
    throw new Error('Falha ao preparar redeploy: nome do deployment/projeto ausente.');
  }

  // Cria novo deployment
  const created = await vercelFetch<VercelDeployment>(
    `/v13/deployments`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ deploymentId, name: deploymentName, target: 'production' }),
    },
    teamId
  );

  const newId = (created as Record<string, unknown>)?.id || (created as Record<string, unknown>)?.uid;
  if (!newId) {
    throw new Error('Falha ao iniciar redeploy: id do novo deployment ausente.');
  }

  return { deploymentId: String(newId) };
}

/**
 * Valida um token Vercel.
 */
export async function validateVercelToken(
  token: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  try {
    const data = await vercelFetch<{ user?: { id?: string } }>('/v2/user', token);
    const userId = data?.user?.id;
    if (!userId) {
      return { ok: false, error: 'Token inválido' };
    }
    return { ok: true, userId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token inválido';
    return { ok: false, error: message };
  }
}

/**
 * Obtém detalhes de um projeto Vercel.
 */
export async function getProject(
  token: string,
  projectId: string,
  teamId?: string
): Promise<{ ok: true; project: VercelProject } | { ok: false; error: string }> {
  try {
    const project = await vercelFetch<VercelProject>(
      `/v9/projects/${projectId}`,
      token,
      {},
      teamId
    );
    if (!project?.id) {
      return { ok: false, error: 'Projeto não encontrado' };
    }
    return { ok: true, project };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Projeto não encontrado';
    return { ok: false, error: message };
  }
}

/**
 * Desabilita Deployment Protection de um projeto Vercel.
 * Isso permite que serviços machine-to-machine (como QStash) acessem
 * a aplicação sem necessidade de bypass token ou headers especiais.
 */
export async function disableDeploymentProtection(
  token: string,
  projectId: string,
  teamId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await vercelFetch(
      `/v9/projects/${projectId}`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          // null desabilita completamente o SSO/Deployment Protection
          ssoProtection: null,
        }),
      },
      teamId
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao desabilitar Deployment Protection';
    return { ok: false, error: message };
  }
}

/**
 * Encontra um projeto Vercel pelo domínio.
 */
export async function findProjectByDomain(
  token: string,
  domain: string
): Promise<{ ok: true; project: VercelProject } | { ok: false; error: string }> {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

  try {
    // Tenta via API de domínios
    const domainResponse = await fetch(
      `${VERCEL_API_BASE}/v6/domains/${normalizedDomain}/config`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (domainResponse.ok) {
      const domainData = (await domainResponse.json()) as { configuredBy?: string };
      if (domainData?.configuredBy) {
        const projectResult = await getProject(token, domainData.configuredBy);
        if (projectResult.ok) {
          return { ok: true, project: projectResult.project };
        }
      }
    }
  } catch {
    // Fallback para outras estratégias
  }

  try {
    const projects = await listVercelProjects(token);

    // Busca por alias
    for (const project of projects) {
      const projectAliases =
        project.alias?.map((alias) => alias.domain.toLowerCase()) || [];
      const targetAliases =
        project.targets?.production?.alias?.map((alias) => alias.toLowerCase()) ||
        [];
      const allAliases = [...projectAliases, ...targetAliases];

      if (allAliases.includes(normalizedDomain)) {
        return { ok: true, project };
      }
    }

    // Busca por domínio .vercel.app
    for (const project of projects) {
      const vercelDomain = `${project.name.toLowerCase()}.vercel.app`;
      if (normalizedDomain === vercelDomain) {
        return { ok: true, project };
      }
    }

    // Localhost: retorna primeiro projeto
    if (
      normalizedDomain === 'localhost' ||
      normalizedDomain.startsWith('localhost:') ||
      normalizedDomain === '127.0.0.1' ||
      normalizedDomain.startsWith('127.0.0.1:')
    ) {
      if (projects.length > 0) {
        return { ok: true, project: projects[0] };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao buscar projetos';
    return { ok: false, error: message };
  }

  return { ok: false, error: 'Projeto não encontrado para este domínio' };
}
