---
project_name: 'smartzap'
user_name: 'Thales'
date: '2026-02-08'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
status: 'complete'
rule_count: 68
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core

- **Next.js** ^16.1.4 — App Router, Turbopack (default), standalone output (Docker-ready)
  - `reactCompiler` e `turbopack` são config **top-level** (NÃO `experimental`) no Next.js 16
  - `proxyClientMaxBodySize: '20mb'` — feature do Next.js 16 para uploads grandes
- **React** ^19.2.1 + **React Compiler** ^1.0.0 — memoização automática
  - ⚠️ **NÃO usar** `useMemo`, `useCallback`, `React.memo` manualmente — o compiler faz isso
- **TypeScript** ^5.7.0 — strict mode, target ES2022, moduleResolution: bundler
- **ESM** — `"type": "module"` no package.json; afeta imports dinâmicos e scripts
- **Tailwind CSS** ^4.0.0 + shadcn/ui (new-york style, RSC-enabled)

### Backend & Data

- **Supabase** ^2.86.2 (`@supabase/supabase-js`) + ^0.8.0 (`@supabase/ssr`)
  - `@supabase/ssr` usa pattern atual; NÃO usar `createServerComponentClient` (deprecated)
- **Upstash QStash** ^2.8.4 + **Workflow SDK** 0.3.0-rc (⚠️ RC — API pode mudar; v1.1.0 stable disponível com breaking changes)
- **Upstash Redis** ^1.35.8 (caching layer, TTL 60s para credentials)
- **pg** ^8.16.3 (raw PostgreSQL para migrations programáticas)

### AI

- **Vercel AI SDK** ^6.0.41 (core `ai`) — multi-provider:
  - Google ^3.0.10, Anthropic ^3.0.9, OpenAI ^3.0.7, Cohere ^3.0.8, TogetherAI ^2.0.15
- **Mem0** ^2.0.5 (`@mem0/vercel-ai-provider`) — conversation memory

### State & UI

- **React Query** ^5.0.0 (server state — staleTime: 30s, gcTime: 5min, retry: 1)
- **Jotai** ^2.15.1 (apenas workflow builder graph state — NÃO usar para state geral)
- **Zod** ^4.1.13 — ⚠️ **v4, NÃO v3**; API tem breaking changes (coerce, pipes, transforms)
- **React Hook Form** ^7.67.0 + resolvers ^5.2.2
- **Motion** ^12.23.24 (animations, era Framer Motion)
- **Recharts** ^3.5.0 (charts)
- **@xyflow/react** ^12.9.2 (workflow builder graph editor)
- **lucide-react** ^0.554.0 — icons **exclusivamente** (não usar outros icon packs)

### Testing

- **Vitest** ^4.0.15 — unit tests, `globals: true` (NÃO importar describe/it/expect manualmente), env: jsdom
- **Playwright** ^1.49.0 — E2E, `fullyParallel: true`, 2 projects: chromium + mobile (iPhone 13)
  - Testes devem funcionar em ambos os viewports
  - Testes NÃO podem compartilhar estado entre si
- **Testing Library** ^16.0.1 (`@testing-library/react`)

### Build & Tooling

- **Turbopack** — default build tool via Next.js 16
- **ESLint** ^9.17.0 — flat config (`eslint.config.mjs`), typescript-eslint
  - `no-unused-vars` e `no-explicit-any` estão OFF (decisão intencional)
- **Standalone output** — Docker-ready, afeta file system access em produção

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **Strict mode ativo** — `noEmit`, `isolatedModules`, `esModuleInterop` habilitados
- **Path alias**: `@/*` mapeia para a raiz do projeto — usar para imports cross-cutting (`@/lib/*`, `@/components/*`); usar imports relativos para arquivos no mesmo nível
- **Sem barrel exports** — importar diretamente dos arquivos específicos, NÃO de `index.ts`
- **Type-only imports** — marcar com `type` keyword: `import { type Campaign } from '@/types'`
- **Todas as interfaces em `types.ts`** — arquivo centralizado na raiz, NÃO criar arquivos de tipo separados
- **snake_case → camelCase mapping** — colunas do DB são snake_case, interfaces TypeScript são camelCase; a transformação acontece na camada `lib/supabase-db.ts`
- **Enums com valores em português** — `CampaignStatus.DRAFT = 'Rascunho'`, `ContactStatus.OPT_IN = 'Opt-in'`
- **`any` tolerado** — ESLint `no-explicit-any` está OFF; não refatorar `any` existente sem pedido explícito
- **Organização de imports**: React/third-party → Services/types → Lib/utils internos
- **Error responses em português** — mensagens de erro da API retornadas em pt-BR

### Framework-Specific Rules

#### Arquitetura Frontend: Page → Hook → Service → API

- **Pages** (`app/(dashboard)/*/page.tsx`) — thin components que apenas conectam hooks a views
  - Server Components fazem fetch inicial (`initialData`) → passam para Client Wrapper
  - Client Wrapper instancia controller hook → passa props para View
- **Hooks** (`hooks/use*.ts`) — controller pattern com 3 camadas:
  - `useXxxQuery()` — React Query + Realtime subscription via `useRealtimeQuery()`
  - `useXxxMutations()` — `useMutation` com optimistic updates e rollback
  - `useXxxController()` — orquestra query + mutations + UI state local
- **Services** (`services/*Service.ts`) — fetch wrappers tipados, object literal com async methods
  - Usar `fetch()` direto (sem axios/ky)
  - `URLSearchParams` para query strings
- **API Routes** (`app/api/*/route.ts`) — exports nomeados: `GET`, `POST`, `PATCH`, `DELETE`
  - Sempre: `export const dynamic = 'force-dynamic'` e `revalidate = 0`
  - Validação com Zod via `validateBody()` de `@/lib/api-validation`
  - Cache-Control: `'no-store, no-cache, must-revalidate'`

#### Supabase — 3 Clients (usar o correto!)

- `getSupabaseAdmin()` — API Routes (server-side, bypassa RLS)
- `getSupabaseBrowser()` — Client Components (browser, respeita RLS)
- `createClient()` de `@/lib/supabase-server` — Server Components (cookie-aware, @supabase/ssr)
- ⚠️ Todos retornam `null` quando env vars estão ausentes (install wizard flow)

#### Database — Sem ORM

- `lib/supabase-db.ts` — CRUD abstraído por domínio: `campaignDb.getAll()`, `contactDb.create()`
- Paginação via `.range(offset, offset + limit - 1)`
- Busca via `.ilike('campo', '%termo%')`
- Transformação snake_case→camelCase na camada DB, NÃO na API route

#### React Query + Realtime

- `useRealtimeQuery()` — wrapper que combina React Query + Supabase Realtime subscription
- Invalidação centralizada via `@/lib/query-invalidation`
- Optimistic updates com `onMutate` + rollback no `onError`
- `refetchOnWindowFocus: false` (default global)

#### Autenticação — Single-Tenant, Sem Middleware

- Dashboard: `MASTER_PASSWORD` (bcrypt)
- API: `Authorization: Bearer <key>` ou `X-API-Key: <key>`
  - `SMARTZAP_API_KEY` — acesso geral
  - `SMARTZAP_ADMIN_KEY` — endpoints admin (`/api/database/*`, `/api/vercel/*`)
- Endpoints públicos (sem auth): `/api/webhook`, `/api/health`, `/api/flows`
- Auth enforced per-route via `verifyApiKey()` / `requireSessionOrApiKey()` — NÃO existe middleware.ts

#### Components — View Pattern

- Views (`components/features/*/`) — pure presentational, sem hooks, sem business logic
- Props-driven: todos handlers como `onXxx` (ex: `onDelete`, `onRowClick`)
- Composição de shadcn/ui primitives
- Event handlers prefixados com `on`

### Testing Rules

#### Vitest (Unit Tests — `*.test.ts`)

- `globals: true` — `describe`, `it`, `expect`, `vi` disponíveis globalmente, NÃO importar
- Environment: `jsdom` (default) — testes de componentes e services rodam no jsdom
- Mocking: `vi.fn()`, `vi.spyOn()`, `vi.mock()` — NÃO usar jest mocks
- Factory functions para test data: `createMockCampaign()`, `createMockContact()`
- Nomes de teste em **português**: `'deve listar campanhas com paginação'`
- Estrutura: nested `describe` por método/feature → `it` por comportamento
- Console mocking: `vi.spyOn(console, 'error').mockImplementation(() => {})` para reduzir noise
- `fetch` mockado globalmente: `const mockFetch = vi.fn(); global.fetch = mockFetch`
- Path alias `@/` funciona nos testes (configurado no `vitest.config.ts`)

#### Playwright (E2E Tests — `*.spec.ts` em `tests/e2e/`)

- 2 projects: **chromium** (desktop) + **mobile** (iPhone 13) — testes devem funcionar em ambos
- `fullyParallel: true` — testes NÃO podem compartilhar estado entre si
- Page Objects em `tests/e2e/pages/` (ex: `LoginPage`, `CampaignsPage`)
- Fixtures reutilizáveis em `tests/e2e/fixtures/`
- Global setup: `tests/e2e/global-setup.ts` (carrega .env.local)
- Dev server auto-start: `npm run dev` antes dos testes
- Retries: 0 local, 2 em CI
- Traces/screenshots/video apenas on-failure

#### Convenções Gerais

- `*.test.ts` = Vitest (unit) — NUNCA misturar com Playwright
- `*.spec.ts` = Playwright (E2E) — SEMPRE em `tests/e2e/`
- Testes de WhatsApp E2E: `tests/e2e-whatsapp/` (rodam com Vitest, não Playwright)
- Testes de AI API: `tests/api-ai/` (rodam com Vitest)

### Code Quality & Style Rules

#### Naming Conventions (por diretório)

- `app/` — PascalCase para componentes (`DashboardClientLoader.tsx`), kebab-case para pastas de rota
- `components/` — PascalCase para todos os React components (`CampaignListView.tsx`)
- `hooks/` — camelCase com prefixo `use` (`useCampaigns.ts`, `useConversation.ts`)
- `services/` — camelCase com sufixo `Service` (`campaignService.ts`, `contactService.ts`)
- `lib/` — kebab-case para utilitários (`whatsapp-errors.ts`, `phone-formatter.ts`)

#### Linting & Formatting

- ESLint flat config (`eslint.config.mjs`) — NÃO existe `.eslintrc.json`
- `@typescript-eslint/no-unused-vars`: **OFF** (intencional)
- `@typescript-eslint/no-explicit-any`: **OFF** (intencional)
- `@typescript-eslint/ban-ts-comment`: **OFF**
- Next.js core-web-vitals rules ativas

#### Documentação

- **Código**: nomes de variáveis/funções em inglês
- **Comentários**: português (pt-BR)
- **UI text**: português (pt-BR)
- Não adicionar docstrings/JSDoc a código existente sem pedido explícito
- Comentários apenas onde a lógica não é auto-evidente

#### Styling

- Tailwind CSS v4 com shadcn/ui (new-york style)
- Cores primárias: `primary-400/500/600` (emerald/green)
- Backgrounds: `zinc-800/900/950`
- Dark theme por padrão (`defaultTheme="dark"`)
- Icons: `lucide-react` exclusivamente — NÃO usar heroicons, phosphor, etc.

### Development Workflow Rules

#### Comandos de Desenvolvimento

- `npm run dev` — Turbopack dev server (padrão)
- `npm run build` — production build (standalone output)
- `npm run lint` — ESLint apenas (sem Prettier)
- `npm run test` — Vitest (unit)
- `npm run test:e2e` — Playwright (headless)
- `npm run test:all` — Unit + E2E combinados

#### Git & Branch

- Branch principal: `main`
- Deploy: Vercel (automático via push para `main`)
- URL produção: `https://smartzap-eta.vercel.app`

#### Environment Variables

- `.env.local` — variáveis locais (Next.js padrão)
- `.env.vercel.local` — carregado manualmente no dev via `next.config.ts`
- `.env.test.local` — variáveis para testes (carregado pelo `vitest.config.ts`)
- Aliases aceitos: `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- Aliases aceitos: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

#### Caching & Edge

- Vercel edge cache TTL: 10s — itens deletados podem reaparecer momentaneamente
- Redis cache TTL: 60s para WhatsApp credentials
- React Query staleTime: 30s, gcTime: 5min
- API routes: `Cache-Control: no-store` + `dynamic = 'force-dynamic'`

#### Migrations

- SQL puro em `supabase/migrations/` — NÃO usar Supabase CLI migration commands
- Scripts programáticos: `node scripts/apply-migration-pg.mjs <path>`
- Migrations bundled no serverless via `outputFileTracingIncludes`

### Critical Don't-Miss Rules

#### Anti-Patterns (NÃO FAZER)

- ❌ NÃO criar `middleware.ts` — auth é per-route, não middleware global
- ❌ NÃO usar `useMemo`/`useCallback`/`React.memo` — React Compiler faz automaticamente
- ❌ NÃO usar `createServerComponentClient` — deprecated, usar `createClient()` de `@/lib/supabase-server`
- ❌ NÃO colocar business logic em View components — vai no controller hook
- ❌ NÃO criar arquivos de tipos separados — tudo em `types.ts` na raiz
- ❌ NÃO usar axios/ky — usar `fetch()` direto nos services
- ❌ NÃO importar `describe`/`it`/`expect` nos testes — são globals do Vitest
- ❌ NÃO usar Zod v3 syntax — projeto usa Zod v4 com breaking changes
- ❌ NÃO colocar config em `experimental.reactCompiler` — é top-level no Next.js 16
- ❌ NÃO compartilhar estado entre testes Playwright — `fullyParallel: true`

#### Edge Cases Críticos

- **Supabase clients retornam `null`** quando env vars ausentes — sempre tratar para install wizard
- **Edge cache flash-back** — itens deletados podem reaparecer por até 10s (Vercel cache)
- **Payment alerts** (error 131042) — auto-shown, auto-dismissed quando delivery volta ao normal
- **Phone numbers** — sempre E.164 format (`+5511999999999`), validar com `libphonenumber-js`
- **WhatsApp pair limit** — máx 1 msg/6s para mesmo usuário (error 131056)

#### Segurança

- `poweredByHeader: false` — não expor framework
- Security headers configurados em `next.config.ts` (X-Frame-Options, HSTS, etc.)
- Passwords comparados com bcrypt — NUNCA plain text
- API keys validadas por comparação direta (sem hash) — `SMARTZAP_API_KEY` e `SMARTZAP_ADMIN_KEY`
- Webhooks (`/api/webhook`) são públicos — validação deve ser feita no payload

#### WhatsApp API

- 44+ error codes mapeados em `lib/whatsapp-errors.ts`
- `mapWhatsAppError(code)` — retorna mensagem, ação, e se é retryable
- `isCriticalError(code)` — payment + auth errors
- `isOptOutError(code)` — usuário bloqueou o business
- Rate limit Cloud API: até 1000 msgs/sec
- Retry com exponential backoff para rate limits

---

## Usage Guidelines

**Para AI Agents:**

- Ler este arquivo ANTES de implementar qualquer código
- Seguir TODAS as regras exatamente como documentadas
- Na dúvida, preferir a opção mais restritiva
- Atualizar este arquivo se novos padrões emergirem

**Para Humanos:**

- Manter este arquivo lean e focado nas necessidades dos agentes
- Atualizar quando o technology stack mudar
- Revisar trimestralmente para remover regras obsoletas
- Remover regras que se tornaram óbvias com o tempo

Last Updated: 2026-02-08
