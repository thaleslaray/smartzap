# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmartZap é um SaaS single-tenant de automação de marketing via WhatsApp, construído com Next.js 16 (App Router), React 19, Supabase (PostgreSQL) e Upstash QStash. Integra Meta WhatsApp Cloud API (v24.0) para mensagens com template e Vercel AI SDK v6 para geração de conteúdo.

## Development Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint

# Unit tests (Vitest, jsdom)
npm run test             # Run all
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI dashboard
npm run test:coverage    # Coverage report
vitest run path/to/file.test.ts          # Single test file
vitest run -t "test name"                # Single test by name

# E2E tests (Playwright, auto-starts dev server)
npm run test:e2e         # Headless (chromium + mobile)
npm run test:e2e:ui      # Interactive UI
npm run test:e2e:headed  # Browser visible
npx playwright test path/to/file.spec.ts # Single E2E file

# Specialized test suites
npm run test:e2e:whatsapp       # WhatsApp E2E scenarios (Vitest)
npm run test:ai:api             # AI API tests (Vitest)
npm run test:all                # Unit + E2E combined

# Stress tests
npm run test:stress:local       # Webhook stress test contra localhost:3000
npm run test:stress:prod        # Webhook stress test contra produção
```

**Test file conventions**: `*.test.ts` for Vitest, `*.spec.ts` for Playwright (in `tests/e2e/`).

## Architecture

### Frontend Pattern: Page → Hook → Service → API

```
app/(dashboard)/campaigns/page.tsx    # Thin page: wires hook to view
    ↓
hooks/useCampaigns.ts                 # Controller hook: React Query + UI state
    ↓
services/campaignService.ts           # API calls (fetch wrapper)
    ↓
app/api/campaigns/route.ts            # API Route → Supabase DB
```

- **Pages**: thin components that only connect hooks to views
- **Hooks**: controller pattern with React Query + local state + derived state
- **Services**: typed fetch wrappers for API routes
- **API Routes**: validation (Zod), business logic, DB operations

### Backend Pattern: Serverless + Queues

```
API Routes (Next.js)  →  QStash Workflow  →  Meta WhatsApp API
        ↓                     ↓
  Supabase DB           (queue/durable steps)
```

### Key Directories

```
app/                    # Next.js App Router
  (auth)/               # Auth pages (login, install wizard)
  (dashboard)/          # Dashboard pages
  api/                  # API routes (28+ sub-directories)
components/
  features/             # Feature-specific view components
  ui/                   # shadcn/ui (new-york style, RSC-enabled)
  builder/              # Workflow builder components
hooks/                  # Controller hooks (React Query pattern)
services/               # API client layer
lib/                    # Business logic & utilities
  ai/                   # AI providers & prompts
  builder/              # Workflow executor
  whatsapp/             # WhatsApp API integration
types.ts                # All TypeScript interfaces & enums
supabase/migrations/    # SQL migrations (4 ativas + _archive/ com histórico)
```

### Provider Stack (app/providers.tsx)

```
ThemeProvider (next-themes, dark default)
  → QueryClientProvider (staleTime: 30s, gcTime: 5min, retry: 1)
    → DevModeProvider
      → CentralizedRealtimeProvider (Supabase Realtime)
        → PWAProvider
```

## Key Patterns

### Authentication

Single-tenant: no user accounts. Two auth mechanisms:

- **Dashboard login**: `MASTER_PASSWORD` env var — aceita texto puro (novas instalações) ou hash SHA-256 com salt `_smartzap_salt_2026` (retrocompatível). O sistema auto-detecta pelo comprimento (64 chars hex = hash).
- **API routes**: `Authorization: Bearer <key>` or `X-API-Key: <key>` header
  - `SMARTZAP_API_KEY` — general API access
  - `SMARTZAP_ADMIN_KEY` — admin endpoints (`/api/database/*`, `/api/vercel/*`)
  - Public (no auth): `/api/webhook`, `/api/health`, `/api/flows`

No middleware.ts — auth enforced per-route via `verifyApiKey()` from `lib/auth.ts`.

Sessions (dashboard): múltiplas sessões simultâneas suportadas. Tokens persistidos em `settings.key = 'session_tokens'` como JSON array (máx 50). Cookie httpOnly `smartzap_session`, TTL 7 dias.

### Supabase Client Types

Three client patterns — use the right one for the context:

```typescript
// API Routes (server-side, bypasses RLS)
import { getSupabaseAdmin } from '@/lib/supabase'
const supabase = getSupabaseAdmin()

// Client components (browser, respects RLS)
import { getSupabaseBrowser } from '@/lib/supabase'
const supabase = getSupabaseBrowser()

// Server Components (cookie-aware, @supabase/ssr)
import { createClient } from '@/lib/supabase-server'
const supabase = await createClient()
```

Both return `null` when env vars are missing (allows install wizard to run unconfigured).

### Database Layer (No ORM)

```typescript
// lib/supabase-db.ts - Direct Supabase queries with abstracted CRUD
campaignDb.getAll()
campaignDb.create({ name, templateName })
```

### Component/Controller Separation

```tsx
// components/features/campaigns/CampaignListView.tsx - PURE presentational
interface CampaignListViewProps {
  campaigns: Campaign[];
  onDelete: (id: string) => void;
  onRowClick: (id: string) => void;
}

// hooks/useCampaigns.ts - Controller hook
export const useCampaignsController = () => {
  const { data } = useCampaignsQuery();
  const [filter, setFilter] = useState('All');
  const filteredCampaigns = useMemo(() => ...);
  return { campaigns, filter, setFilter, onDelete };
};
```

### WhatsApp Credentials

Fetched from Supabase `settings` table first, env vars as fallback, Redis-cached (60s TTL):

```typescript
import { getWhatsAppCredentials } from '@/lib/whatsapp-credentials'
const credentials = await getWhatsAppCredentials()
```

### Error Handling

```typescript
// lib/whatsapp-errors.ts - 44+ error codes mapped
mapWhatsAppError(131042)  // → { type: 'payment', message: '...', action: '...' }
isCriticalError(code)     // Payment, auth errors
isOptOutError(code)       // User blocked business
```

### Phone Number Handling

```typescript
// lib/phone-formatter.ts - E.164 format required
normalizePhoneNumber('+5511999999999')
validatePhoneNumber(phone)  // Uses libphonenumber-js
```

## Workflow Engine

Upstash Workflow SDK with durable steps:

```
lib/builder/workflow-executor.workflow.ts  # Main executor
lib/builder/nodes/                         # Node-specific handlers
```

Node types: `start`, `message`, `template`, `menu`, `input`, `condition`, `delay`, `ai_agent`, `handoff`, `end`

## Meta WhatsApp API (v24.0)

### Template Payload Structure

```json
{
  "messaging_product": "whatsapp",
  "to": "+5511999999999",
  "type": "template",
  "template": {
    "name": "template_name",
    "language": { "code": "pt_BR" },
    "components": [
      { "type": "header", "parameters": [{ "type": "image", "image": { "id": "..." } }] },
      { "type": "body", "parameters": [{ "type": "text", "text": "{{1}} value" }] }
    ]
  }
}
```

### Rate Limits

- **Cloud API**: Up to 1000 msgs/sec
- **Pair limit**: 1 msg/6 sec to same user (error 131056)
- **Retry**: Exponential backoff per Meta recommendation

## Database Schema (Key Tables)

- `settings` - Config (credentials, tokens), Redis-cached
- `campaigns` - Campaign metadata + counters (sent/delivered/read/failed)
- `campaign_contacts` - Per-contact status + message_id
- `contacts` - Contact info + custom fields
- `templates` - Template cache (synced from Meta)
- `flows` - Workflow definitions
- `account_alerts` - Health alerts

## Next.js Configuration

- **React Compiler** enabled (automatic memoization)
- **Standalone output** (Docker-ready)
- **Server Actions**: 20MB body limit
- **Optimized imports**: `lucide-react`, `@radix-ui/react-icons`
- SQL migrations bundled via `outputFileTracingIncludes`
- Path alias: `@/*` → project root

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- `QSTASH_TOKEN`
- `MASTER_PASSWORD` (login password)
- `SMARTZAP_API_KEY`, `SMARTZAP_ADMIN_KEY`

Optional:
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (fallback if not in DB)
- `GEMINI_API_KEY` (AI features)
- `MEM0_API_KEY` (conversation memory)
- `SETUP_COMPLETE=true` (produção — pula consulta ao banco em `isSetupComplete()`, evitando queries desnecessárias)

Env var aliases accepted: `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

## Language Conventions

- **Code**: English (variable names, function names)
- **Comments/Documentation**: Portuguese (pt-BR)
- **UI text**: Portuguese (pt-BR)

## Styling

- Tailwind CSS v4 with shadcn/ui (new-york style)
- Primary colors: `primary-400/500/600` (emerald/green)
- Backgrounds: `zinc-800/900/950`
- Icons: lucide-react exclusively

## Types Reference

```typescript
// types.ts
CampaignStatus: DRAFT | SCHEDULED | SENDING | COMPLETED | PAUSED | FAILED
TemplateCategory: 'MARKETING' | 'UTILIDADE' | 'AUTENTICACAO'
ContactStatus: OPT_IN | OPT_OUT | UNKNOWN
```

## Known Behaviors

- **Edge cache flash-back**: Deleted items may momentarily reappear due to Vercel 10s TTL cache
- **Payment alerts**: Auto-shown on error 131042, auto-dismissed when delivery succeeds after fix
- **Null Supabase clients**: `getSupabaseAdmin()` and `getSupabaseBrowser()` return `null` when not configured — callers must handle this for the install wizard flow
