# Test Design for QA: SmartZap Platform

**Objetivo:** Receita de execucao de testes para o time de QA. Define o que testar, como testar e o que QA precisa dos outros times.

**Data:** 2026-02-08
**Autor:** Murat (TEA Master Test Architect)
**Status:** Rascunho
**Projeto:** SmartZap

**Relacionado:** Ver documento de Arquitetura (`test-design-architecture.md`) para preocupacoes de testabilidade e blockers arquiteturais.

---

## Resumo Executivo

**Escopo:** Cobertura de testes completa da plataforma SmartZap -- todas as features criticas incluindo envio de campanhas WhatsApp, inbox real-time, workflow builder, AI agents, template management, gestao de contatos, flows/MiniApps, lead forms, autenticacao e webhooks.

**Resumo de Riscos:**

- Total de Riscos: 18 (7 alta prioridade score >= 6, 6 media, 5 baixa)
- Categorias Criticas: PERF (rate limiting), BUS (duplicacao de mensagens), SEC (auth), DATA (webhook ordering)

**Resumo de Cobertura:**

- P0 testes: ~35-45 (caminhos criticos, seguranca, envio de campanha)
- P1 testes: ~55-70 (features importantes, integracao)
- P2 testes: ~60-80 (edge cases, regressao)
- P3 testes: ~30-55 (exploratorio, benchmarks)
- **Total**: ~180-250 testes (~6-10 semanas com 1 QA)

---

## Fora do Escopo

**Componentes ou sistemas explicitamente excluidos deste plano de testes:**

| Item | Justificativa | Mitigacao |
|------|--------------|-----------|
| **Google Calendar Integration** | Feature secundaria, integracao com terceiro | Testes manuais quando feature for priorizada |
| **PWA offline mode** | Escopo limitado, nao critico para core business | Service worker testado via checklist manual |
| **Design System pages** | `/design-system` e `/design-system-light` sao para desenvolvimento interno | Visual review manual |
| **Helicone AI observability** | Integracao passiva (headers), nao afeta funcionalidade | Validar headers em testes de AI |
| **Onboarding wizard UX** | Feature de UX, baixo risco tecnico | Teste manual de walkthrough |

**Nota:** Itens listados aqui foram revisados e aceitos como fora do escopo.

---

## Dependencias e Blockers de Teste

**CRITICO:** QA nao pode prosseguir sem estes itens de outros times.

### Dependencias de Backend/Arquitetura (Sprint 0)

**Fonte:** Ver documento de Arquitetura "Guia Rapido" para planos de mitigacao detalhados

1. **Endpoint de seed de dados** - Backend - Sprint 0
   - QA precisa de API para criar campanhas, contatos e templates de teste com IDs previsivos e cleanup automatico
   - Bloqueia: Todos os testes E2E e de integracao

2. **Mock server da Meta WhatsApp API** - Backend + QA - Sprint 0
   - QA precisa de MSW handlers ou WireMock para simular Meta API v24.0 (send template, webhooks, rate limits)
   - Bloqueia: Testes de campanha, inbox, workflow

3. **Isolamento de banco** - Backend - Sprint 0
   - QA precisa de estrategia de isolamento para testes paralelos (prefixos unicos ou schema separado)
   - Bloqueia: Execucao paralela de testes E2E

### Setup de Infraestrutura QA (Sprint 0)

1. **Factories de dados de teste** - QA
   - `createMockCampaign()`, `createMockContact()`, `createMockTemplate()` com faker
   - Cleanup automatico pos-teste para seguranca em execucao paralela
   - Localizar em `tests/factories/` ou `tests/helpers/`

2. **Ambientes de teste** - QA
   - Local: Vitest + jsdom para unit, Playwright com dev server auto-start
   - CI/CD: GitHub Actions com Vitest paralelo + Playwright sharded
   - Staging: Supabase projeto de teste + Upstash tokens de teste

3. **MSW handlers para Meta API** - QA
   - Handlers para: `POST /{phone_id}/messages`, `GET /{waba_id}/message_templates`, `POST /{phone_id}/media`
   - Simular respostas: sucesso, rate limit (429/131056), payment error (131042), opt-out (131031)

**Padrao de factory sugerido:**

```typescript
// tests/factories/campaign.factory.ts
import { faker } from '@faker-js/faker'

export function createMockCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: `c_${faker.string.uuid()}`,
    name: faker.commerce.productName(),
    status: 'Rascunho',
    templateName: `tpl_${faker.string.alphanumeric(8)}`,
    totalRecipients: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    skipped: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: `ct_${faker.string.uuid()}`,
    name: faker.person.fullName(),
    phone: `+55${faker.string.numeric(11)}`,
    email: faker.internet.email(),
    status: 'Opt-in',
    tags: [],
    customFields: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}
```

---

## Avaliacao de Riscos

**Nota:** Detalhes completos no documento de Arquitetura. Esta secao resume riscos relevantes para planejamento de testes QA.

### Riscos de Alta Prioridade (Score >= 6)

| Risk ID | Categoria | Descricao | Score | Cobertura de Teste QA |
|---------|-----------|-----------|-------|-----------------------|
| **R-01** | PERF | Rate limiting Meta API causa falhas em massa em campanhas | **9** | Testes de stress com mock simulando 429; validar throttle adaptativo; testar campanhas de 100/500/1000 contatos |
| **R-02** | BUS | Envio duplicado de mensagens WhatsApp (custo + reputacao) | **6** | Testes de idempotencia no dispatch; retry apos falha parcial; race conditions |
| **R-03** | SEC | Auth per-route sem middleware -- rota nova pode ficar exposta | **6** | Script automatizado de cobertura de auth; testes negativos (401) para cada rota |
| **R-04** | DATA | Webhook Meta entrega eventos fora de ordem ou duplicados | **6** | Testes com eventos desordenados; validar dedup; processar delivered antes de sent |
| **R-05** | TECH | Workflow SDK em RC -- durabilidade nao garantida | **6** | Testes de falha/retry em steps; timeout de workflow; cancelamento |
| **R-06** | DATA | Supabase client null sem env vars | **6** | Testes unitarios de null check em todas as rotas |
| **R-07** | BUS | Campanha em estado inconsistente apos falha parcial | **6** | Testes de atomicidade de contadores; falha no meio do batch; recovery |

### Riscos de Media/Baixa Prioridade

| Risk ID | Categoria | Descricao | Score | Cobertura de Teste QA |
|---------|-----------|-----------|-------|-----------------------|
| R-08 | PERF | Flood de invalidacoes Realtime | 4 | Testes de debounce com muitos eventos simultaneos |
| R-09 | SEC | Webhook sem signature verification | 4 | Testar rejeicao de payloads sem signature valida |
| R-10 | TECH | Case conversion snake/camel pode causar bugs | 4 | Ampliar `schema-parity.test.ts` para todas tabelas |
| R-11 | DATA | Import CSV com dados corrompidos | 4 | Testes com CSVs malformados, encodings, telefones invalidos |
| R-12 | TECH | AI multi-provider sem fallback | 4 | Testes de fallback entre providers |
| R-13 | OPS | Migracoes SQL sem rollback | 3 | Testes de migracao em schema isolado |

---

## Criterios de Entrada

**Testes QA nao podem comecar ate que TODOS os seguintes sejam atendidos:**

- [ ] Todas as suposicoes e requisitos acordados por QA, Dev e PM
- [ ] Ambientes de teste provisionados e acessiveis (Supabase teste, Upstash teste)
- [ ] Factories de dados de teste prontas
- [ ] Blockers de Sprint 0 resolvidos (mock server Meta API, endpoint de seed, isolamento de banco)
- [ ] Feature deployada em ambiente de teste
- [ ] Dev server local rodando com `npm run dev` sem erros

## Criterios de Saida

**Fase de testes esta completa quando TODOS os seguintes forem atendidos:**

- [ ] Todos os testes P0 passando (100%)
- [ ] Todos os testes P1 passando (>= 95%) ou falhas triadas e aceitas
- [ ] Nenhum bug aberto de alta prioridade / alta severidade
- [ ] Cobertura de testes acordada como suficiente por QA Lead e Dev Lead
- [ ] Testes de stress de campanha executados com resultado aceitavel
- [ ] Cobertura de linhas >= 70% em `lib/` (excluindo `node_modules`)

---

## Plano de Cobertura de Testes

**IMPORTANTE:** P0/P1/P2/P3 = **prioridade e nivel de risco** (no que focar se tempo for limitado), NAO timing de execucao. Ver "Estrategia de Execucao" para quando os testes rodam.

### P0 (Critico)

**Criterios:** Bloqueia funcionalidade core + Risco alto (>= 6) + Sem workaround + Afeta maioria dos usuarios

| Test ID | Requisito | Nivel de Teste | Risk Link | Notas |
|---------|-----------|----------------|-----------|-------|
| **P0-001** | Envio de campanha com template: fluxo completo (criar -> selecionar template -> selecionar contatos -> enviar -> receber webhooks de status) | API + Integration | R-01, R-02, R-07 | Caminho critico principal do produto. Testar com 10, 100 e 500 contatos |
| **P0-002** | Rate limiting: campanha de 500+ contatos respeita throttle adaptativo sem erros 131056 nao tratados | API + Stress | R-01 | Mock Meta API com latencia variavel |
| **P0-003** | Idempotencia: retry de campanha nao envia duplicatas para contatos ja enviados | API | R-02 | Simular falha parcial e retry |
| **P0-004** | Webhook processing: eventos de status (sent/delivered/read/failed) atualizam contadores corretamente | API | R-04, R-07 | Incluir eventos fora de ordem |
| **P0-005** | Webhook deduplicacao: mesmo evento recebido 2x nao duplica em `whatsapp_status_events` | API | R-04 | Validar `dedupe_key` unique constraint |
| **P0-006** | Auth: todas as rotas nao-publicas retornam 401 sem auth header | Unit + API | R-03 | Script automatizado de scan de rotas |
| **P0-007** | Auth: rotas admin retornam 403 com `SMARTZAP_API_KEY` (precisa de `SMARTZAP_ADMIN_KEY`) | API | R-03 | Testar `/api/database/*`, `/api/vercel/*` |
| **P0-008** | Login dashboard: senha correta autentica; senha incorreta rejeita | E2E | R-03 | bcrypt comparison com `MASTER_PASSWORD` |
| **P0-009** | Supabase null safety: rotas retornam 503 quando env vars ausentes | Unit | R-06 | Testar `getSupabaseAdmin()` retornando null |
| **P0-010** | Cancelamento de campanha: interrompe envio e marca status corretamente | API | R-07 | Cancelar campanha mid-batch |
| **P0-011** | Phone number validation: numeros invalidos sao rejeitados antes do envio | Unit | R-02 | Usar `lib/phone-formatter.ts` com telefones edge-case |
| **P0-012** | WhatsApp error handling: erros criticos (131042 payment, 131008 auth) pausam campanha e geram alerta | API | R-01 | Simular erros criticos via mock |
| **P0-013** | Contadores atomicos de campanha: `sent + delivered + read + failed + skipped = total_recipients` apos qualquer cenario | API | R-07 | Validar invariante apos sucesso, falha parcial e cancelamento |
| **P0-014** | Credenciais WhatsApp: fallback correto DB -> env vars -> cache Redis | Unit | - | Testar `lib/whatsapp-credentials.ts` com diferentes combinacoes |
| **P0-015** | Webhook signature: rejeitar payloads sem `X-Hub-Signature-256` valido | API | R-09 | Se implementado; senao, documentar como gap |

**Total P0:** ~35-45 testes (incluindo variacoes de cenarios)

---

### P1 (Alto)

**Criterios:** Features importantes + Risco medio (3-4) + Workflows comuns + Workaround existe mas e dificil

| Test ID | Requisito | Nivel de Teste | Risk Link | Notas |
|---------|-----------|----------------|-----------|-------|
| **P1-001** | CRUD de campanhas: criar, listar, editar, deletar, duplicar | API | - | Validar status transitions: Rascunho -> Agendado -> Enviando -> Concluida |
| **P1-002** | CRUD de contatos: adicionar, editar, deletar, bulk delete | API | - | Validar unique phone constraint |
| **P1-003** | Import CSV de contatos: arquivo valido importa corretamente | API | R-11 | Testar com 10, 100, 1000 linhas |
| **P1-004** | Import CSV edge cases: encoding UTF-8/Latin1, telefones sem +55, campos vazios | API | R-11 | Validar error reporting por linha |
| **P1-005** | Template sync com Meta: `templateService.sync()` atualiza cache local | API | - | Mock Meta `GET /message_templates` |
| **P1-006** | Template Factory: geracao AI de templates (marketing, utility, bypass) | API | R-12 | Mock AI provider; validar estrutura do template gerado |
| **P1-007** | Template validation: AI Judge valida template antes de submissao | API | R-12 | Mock AI; validar schema de resposta |
| **P1-008** | Inbox: receber mensagem inbound cria/atualiza conversa corretamente | API | - | Usar `process_inbound_message()` RPC |
| **P1-009** | Inbox: enviar mensagem outbound (texto, template, media) | API | - | Mock WhatsApp send API |
| **P1-010** | Inbox: handoff bot -> humano atualiza mode e envia notificacao | API | - | Validar transition `bot` -> `human` |
| **P1-011** | Inbox: modo bot com AI agent responde automaticamente | API | R-12 | Mock AI provider; validar RAG context |
| **P1-012** | Workflow builder: salvar, carregar, publicar workflow | API | R-05 | CRUD basico de workflows + versions |
| **P1-013** | Workflow execution: fluxo basico start -> message -> end | API | R-05 | Mock WhatsApp send; validar logs |
| **P1-014** | Workflow execution: condition node com branching | API | R-05 | Testar ambos os caminhos (true/false) |
| **P1-015** | Workflow execution: delay node espera tempo configurado | API | R-05 | Mock sleep; validar duracao |
| **P1-016** | Agendamento de campanha: QStash schedule cria job no horario correto | API | - | Mock QStash client |
| **P1-017** | Flows/MiniApps: criar, editar, validar, publicar flow na Meta | API | - | Mock Meta Flows API |
| **P1-018** | Flow submissions: processar resposta de flow e vincular a contato | API | - | Simular webhook de flow response |
| **P1-019** | Lead forms: criar formulario, gerar slug, receber submissao publica | API + E2E | - | Testar `/forms/{slug}` publico |
| **P1-020** | Settings: salvar/carregar credenciais WhatsApp com cache Redis invalidation | API | - | Mock Redis; validar TTL |
| **P1-021** | Realtime: mudanca em `campaigns` table invalida React Query cache | Integration | R-08 | Simular postgres_changes event |
| **P1-022** | Realtime fallback: polling de 10s quando WebSocket desconecta | Integration | R-08 | Simular conexao WebSocket falha |
| **P1-023** | Campaign folders e tags: CRUD + filtragem de campanhas por pasta e tags | API | - | Validar foreign keys e cascade deletes |
| **P1-024** | Custom fields: criar definicoes, usar em contatos, filtrar por custom fields | API | - | Validar GIN index em JSONB |
| **P1-025** | Contact segmentation: filtrar contatos por tags, status, custom fields | API | - | Testar operadores AND/OR |
| **P1-026** | Suppressions: phone na lista de supressao nao recebe mensagem | API | - | `phone_suppressions` table |
| **P1-027** | Account alerts: erro 131042 cria alerta; delivery bem-sucedido dismisses | API | - | Simular cenario completo |
| **P1-028** | Attendant tokens: criar, listar, revogar tokens de atendente | API | - | Validar permissions JSONB |

**Total P1:** ~55-70 testes

---

### P2 (Medio)

**Criterios:** Features secundarias + Risco baixo (1-2) + Edge cases + Prevencao de regressao

| Test ID | Requisito | Nivel de Teste | Risk Link | Notas |
|---------|-----------|----------------|-----------|-------|
| **P2-001** | Campaign wizard E2E: navegacao entre steps (template -> audience -> review -> launch) | E2E | - | Playwright, desktop + mobile |
| **P2-002** | Contact list E2E: busca, filtro, paginacao, selecao em lote | E2E | - | Playwright, ambos viewports |
| **P2-003** | Template list E2E: filtro por categoria/status, preview on hover | E2E | - | Playwright |
| **P2-004** | Settings E2E: configurar credenciais, testar conectividade | E2E | - | Mock Meta API para teste de conectividade |
| **P2-005** | Inbox E2E: selecionar conversa, enviar mensagem, labels | E2E | - | Playwright com mock Supabase Realtime |
| **P2-006** | Schema parity: todas as tabelas tem correspondencia TypeScript correta | Unit | R-10 | Ampliar `lib/schema-parity.test.ts` |
| **P2-007** | WhatsApp error codes: todos os 44+ codigos mapeados corretamente | Unit | - | `lib/whatsapp-errors.test.ts` ja existe; ampliar |
| **P2-008** | Phone formatter: numeros internacionais, formatos variados, edge cases | Unit | - | `lib/phone-formatter.test.ts` ja existe; ampliar |
| **P2-009** | WhatsApp pricing: calculo de custos por regiao | Unit | - | `lib/whatsapp-pricing.test.ts` ja existe |
| **P2-010** | Case conversion: toCamelCase/toSnakeCase para objetos nested | Unit | R-10 | Edge cases: arrays, nulls, nested objects |
| **P2-011** | Service layer: todos os 19 services tem testes de request/response | Unit | - | 7 services ja tem testes; completar os 12 restantes |
| **P2-012** | Campaign precheck: validar que campanha tem template valido e contatos antes de enviar | API | - | Testar todos os cenarios de falha |
| **P2-013** | Template preview: substituicao de variaveis `{{1}}` com dados reais | Unit | - | Testar com 0, 1, N variaveis |
| **P2-014** | Campaign metrics: `campaign_run_metrics` e `campaign_batch_metrics` salvos corretamente | API | - | Validar throughput calculation |
| **P2-015** | Export de contatos: CSV e Excel com encoding correto | API | - | Validar caracteres especiais |
| **P2-016** | Quick replies: CRUD + busca por shortcut no inbox | API | - | Testar collision de shortcuts |
| **P2-017** | Inbox labels: CRUD + assign/unassign a conversas | API | - | Testar cascade delete |
| **P2-018** | AI embeddings: upload de documento, chunking, indexacao | API | R-12 | Mock embedding provider |
| **P2-019** | RAG search: busca por similaridade retorna resultados relevantes | API | R-12 | Mock pgvector com dados conhecidos |
| **P2-020** | Mem0 integration: salvar e recuperar memorias de conversa | API | - | Mock Mem0 client |
| **P2-021** | Dashboard stats: `get_dashboard_stats()` retorna valores corretos | API | - | Testar com dados conhecidos |
| **P2-022** | Responsive layout: todas as paginas principais funcionam em mobile | E2E | - | Playwright mobile project |
| **P2-023** | Workflow builder UI: drag & drop nodes, connect edges | E2E | - | React Flow + Jotai state |
| **P2-024** | Template manual builder: steps config -> content -> buttons -> preview | E2E | - | Playwright com mock Meta API |
| **P2-025** | Batch webhooks: processar multiplos eventos em uma unica chamada | API | R-04 | `lib/batch-webhooks.test.ts` ja existe; ampliar |
| **P2-026** | Install wizard: fluxo completo de setup (Supabase, Redis, QStash, Vercel) | E2E | - | Mock de todos os servicos externos |

**Total P2:** ~60-80 testes

---

### P3 (Baixo)

**Criterios:** Nice-to-have + Exploratorio + Benchmarks de performance + Validacao de documentacao

| Test ID | Requisito | Nivel de Teste | Notas |
|---------|-----------|----------------|-------|
| **P3-001** | Stress test: campanha de 5000 contatos contra mock server | Stress | `tests/stress/` ja existe; parametrizar |
| **P3-002** | Stress test: 100 webhooks simultaneos | Stress | Validar dedup sob carga |
| **P3-003** | AI adversarial: red team test do agente de inbox | Adversarial | `tests/adversarial/` ja existe |
| **P3-004** | AI response quality: respostas relevantes para perguntas conhecidas | API | `tests/api-ai/` ja existe |
| **P3-005** | AI handoff detection: agente detecta necessidade de humano | API | `tests/api-ai/scenarios/handoff-detection.test.ts` |
| **P3-006** | Accessibility: ARIA labels em todos os formularios e modais | E2E | axe-core integration com Playwright |
| **P3-007** | Performance: tempo de carregamento das paginas principais < 3s | E2E | Playwright performance metrics |
| **P3-008** | Performance: React Query cache hit ratio em cenario tipico | Unit | Validar staleTime por dominio |
| **P3-009** | Meta flow JSON validator: schemas invalidos rejeitados | Unit | `lib/meta-flow-json-validator.test.ts` ja existe |
| **P3-010** | Video codec validator: formatos invalidos rejeitados | Unit | `lib/video-codec-validator.test.ts` ja existe |
| **P3-011** | Storage validation: limites de upload respeitados | Unit | `lib/storage-validation.test.ts` ja existe |
| **P3-012** | BR geo: validacao de estados brasileiros | Unit | `lib/br-geo.test.ts` ja existe |
| **P3-013** | Campaign UI counters: exibicao correta de metricas em tempo real | Unit | `lib/campaign-ui-counters.test.ts` ja existe |
| **P3-014** | Navigation: rotas validas e breadcrumbs corretos | Unit | `lib/navigation.test.ts` ja existe |
| **P3-015** | Dark/Light theme: componentes renderizam corretamente em ambos | E2E | Visual comparison |

**Total P3:** ~30-55 testes

---

## Estrategia de Execucao

**Filosofia:** Rodar tudo em PRs a menos que haja overhead significativo de infraestrutura. Vitest e extremamente rapido; Playwright com paralelizacao roda centenas de testes em ~10-15 min.

**Organizado por TIPO DE FERRAMENTA:**

### Todo PR: Vitest Unit + API Tests (~3-5 min)

**Todos os testes funcionais unitarios e de API:**

- Todos os testes `*.test.ts` em `lib/`, `services/`, `components/`, `hooks/`
- Parallelizacao nativa do Vitest
- Total: ~120-170 testes Vitest (inclui P0, P1, P2, P3)
- Inclui: validacao de auth scan, schema parity, contract tests

**Por que rodar em PRs:** Feedback instantaneo, sem infraestrutura externa necessaria

### Todo PR: Playwright E2E Tests (~8-12 min)

**Testes E2E criticos e de regressao:**

- Testes `*.spec.ts` em `tests/e2e/`
- Paralelizado em 2 projects: chromium + mobile (iPhone 13)
- Total: ~20-30 testes Playwright (P0-P2 E2E)
- Inclui: auth flow, campaign wizard, contacts CRUD, settings

**Por que rodar em PRs:** Feedback rapido de regressao visual e funcional

### Nightly: Stress Tests (~15-30 min)

**Testes de performance e carga:**

- `tests/stress/run-stress-test.ts` com configuracoes parametrizadas
- Cenarios: campanha 1000 contatos, 100 webhooks simultaneos
- Total: ~5-10 stress tests (P0, P1, P3)

**Por que adiar para nightly:** Dependem de mock server da Meta API com capacidade; mais lentos

### Weekly: Adversarial + Long-Running (~1-2 horas)

**Testes especializados:**

- `tests/adversarial/` -- red team do AI agent
- `tests/e2e-whatsapp/` -- cenarios E2E com WhatsApp real (se conta de teste disponivel)
- `tests/api-ai/` -- qualidade de respostas AI
- Stress test com 5000+ contatos

**Por que adiar para weekly:** Dependem de APIs externas reais, custo de tokens AI, longa duracao

### Testes Manuais (excluidos de automacao):

- Validacao visual de dark/light theme
- PWA install prompt
- Service worker offline fallback
- Onboarding wizard UX flow

---

## Estimativa de Esforco QA

**Esforco de desenvolvimento de testes QA apenas** (exclui Backend, DevOps):

| Prioridade | Qtd | Esforco Estimado | Notas |
|------------|-----|------------------|-------|
| P0 | ~35-45 | ~3-4 semanas | Setup complexo (mock server, stress, multi-step scenarios) |
| P1 | ~55-70 | ~2-3 semanas | Cobertura padrao (CRUD, integracao, workflows) |
| P2 | ~60-80 | ~1-2 semanas | Edge cases, E2E simples, ampliar testes existentes |
| P3 | ~30-55 | ~3-5 dias | Exploratorio, benchmarks, maioria ja existe |
| **Total** | ~180-250 | **~6-10 semanas** | **1 engenheiro QA, full-time** |

**Suposicoes:**

- Inclui design de teste, implementacao, debugging, integracao CI
- Exclui manutencao continua (~10% do esforco)
- Assume infraestrutura de testes (factories, fixtures, mock server) pronta
- ~22 testes unitarios em `lib/` ja existem e serao ampliados (nao reescritos)
- ~7 testes de service ja existem e serao ampliados
- ~4 specs E2E Playwright ja existem e serao ampliados
- Testes de stress, adversarial e AI ja existem e serao parametrizados

**Dependencias de outros times:**

- Ver secao "Dependencias e Blockers de Teste" para o que QA precisa de Backend e DevOps

---

## Sprint Planning Handoff

**Use para informar planejamento de sprint. Como nao ha QA dedicado, atribuir a Dev owners.**

| Item de Trabalho | Owner | Sprint Alvo | Dependencias/Notas |
|-----------------|-------|-------------|---------------------|
| Criar mock server Meta API (MSW handlers) | QA/Dev | Sprint 0 | Blocker para P0 tests |
| Criar factories de dados de teste | QA/Dev | Sprint 0 | Blocker para todos os testes |
| Implementar endpoint de seed `/api/test/seed` | Backend | Sprint 0 | Proteger com ADMIN_KEY |
| Implementar estrategia de isolamento de banco | Backend | Sprint 0 | Prefixos unicos ou schema separado |
| Script automatizado de scan de auth em rotas | QA/Dev | Sprint 0 | P0-006, P0-007 |
| Implementar webhook signature verification | Backend | Sprint 0 | P0-015, R-09 |
| Implementar deep health check | Backend | Sprint 1 | R-13 |
| Testes P0 de campanha (envio, retry, idempotencia) | QA/Dev | Sprint 1 | Depende de mock server |
| Testes P0 de webhook (status, dedup, ordering) | QA/Dev | Sprint 1 | Depende de mock server |
| Testes P1 de inbox (inbound, outbound, handoff, AI) | QA/Dev | Sprint 1-2 | Depende de mock AI provider |
| Testes P1 de workflow (execution, branching, delay) | QA/Dev | Sprint 2 | Depende de modo teste do executor |
| Testes P2 E2E (wizard, contacts, settings, inbox) | QA/Dev | Sprint 2-3 | Ampliar specs existentes |
| Parametrizar testes de stress existentes | QA/Dev | Sprint 2 | `tests/stress/` ja existe |
| Ampliar testes unitarios em `lib/` | QA/Dev | Sprint 1-3 | 22 ja existem; completar cobertura |
| Completar testes dos 12 services restantes | QA/Dev | Sprint 1-2 | 7 ja existem |
| Setup CI/CD com Vitest + Playwright | DevOps/Dev | Sprint 0-1 | GitHub Actions ou Vercel CI |

---

## Tooling e Acesso

| Ferramenta/Servico | Proposito | Acesso Necessario | Status |
|-------------------|-----------|-------------------|--------|
| Vitest 4.x | Unit + API tests | Ja instalado | Pronto |
| Playwright 1.49 | E2E tests | Ja instalado | Pronto |
| MSW (Mock Service Worker) | Mock Meta WhatsApp API | Instalar via npm | Pendente |
| @faker-js/faker | Geracao de dados de teste | Instalar via npm | Pendente |
| Supabase projeto de teste | Banco isolado para testes | Criar projeto Supabase | Pendente |
| Upstash tokens de teste | QStash + Redis para testes | Criar projeto Upstash | Pendente |
| GitHub Actions | CI/CD para testes automatizados | Ja configurado (deploy) | Adaptar |

**Requests de acesso necessarios:**

- [ ] Criar projeto Supabase de teste com mesmo schema
- [ ] Criar projeto Upstash de teste (QStash + Redis)
- [ ] Instalar MSW + faker como devDependencies
- [ ] Configurar GitHub Actions workflow para testes

---

## Interworking e Regressao

**Servicos e componentes impactados por features:**

| Servico/Componente | Impacto | Escopo de Regressao | Passos de Validacao |
|-------------------|---------|---------------------|---------------------|
| **Meta WhatsApp API** | Envio de mensagens, webhooks, templates | Todos os testes P0 de campanha e webhook | Mock server simula API real; testes contra API real semanalmente |
| **Supabase PostgreSQL** | Todas as operacoes de dados | Todos os testes de CRUD e integracao | Schema parity test; constraint validation |
| **Upstash QStash** | Agendamento e workflow execution | Testes P1 de workflow e agendamento | Mock QStash client; teste real semanal |
| **Upstash Redis** | Cache de credenciais | Testes de cache TTL e invalidation | Mock Redis; validar TTL |
| **Vercel AI SDK** | AI agents, template generation, RAG | Testes P1 de inbox AI e template factory | Mock AI providers; testes reais semanais |
| **Supabase Realtime** | Invalidacao de cache, atualizacao de UI | Testes P1 de Realtime e fallback polling | Simular eventos postgres_changes |

**Estrategia de regressao:**

- Todos os testes P0 + P1 devem passar antes de qualquer release
- Testes E2E (Playwright) cobrem fluxos criticos cross-feature
- Schema parity test previne regressao de mapeamento DB <-> TypeScript
- Auth scan previne regressao de seguranca em novas rotas

---

## Appendix A: Exemplos de Codigo e Tagging

**Tags Vitest para Execucao Seletiva:**

```typescript
// lib/phone-formatter.test.ts (exemplo P0)
describe('phone-formatter', () => {
  describe('normalizePhoneNumber', () => {
    it('deve normalizar numero brasileiro com +55', () => {
      expect(normalizePhoneNumber('+55 11 99999-9999')).toBe('+5511999999999')
    })

    it('deve rejeitar numero invalido', () => {
      const result = validatePhoneNumber('abc')
      expect(result.isValid).toBe(false)
    })
  })
})
```

**Tags Playwright para Execucao Seletiva:**

```typescript
// tests/e2e/auth.spec.ts (exemplo P0)
import { test, expect } from '@playwright/test'

test.describe('Autenticacao @P0', () => {
  test('deve fazer login com senha correta', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="password-input"]', process.env.TEST_PASSWORD!)
    await page.click('[data-testid="login-button"]')
    await expect(page).toHaveURL('/')
  })

  test('deve rejeitar senha incorreta', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-testid="password-input"]', 'senha-errada')
    await page.click('[data-testid="login-button"]')
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible()
  })
})
```

**Executar tags especificas:**

```bash
# Rodar apenas testes P0 (Vitest)
vitest run --reporter=verbose --grep="P0"

# Rodar apenas testes E2E P0 (Playwright)
npx playwright test --grep "@P0"

# Rodar P0 + P1 (Playwright)
npx playwright test --grep "@P0|@P1"

# Rodar todos os testes unitarios (PR)
npm run test

# Rodar todos os testes E2E (PR)
npm run test:e2e

# Rodar testes de stress (nightly)
npm run test:stress

# Rodar suite completa (PR)
npm run test:all
```

---

## Appendix B: Mapeamento de Testes Existentes

**Testes unitarios existentes em `lib/` (22 arquivos):**

| Arquivo | Escopo | Status |
|---------|--------|--------|
| `lib/whatsapp-errors.test.ts` | Mapeamento de 44+ error codes | Existente -- ampliar |
| `lib/phone-formatter.test.ts` | Normalizacao E.164 | Existente -- ampliar edge cases |
| `lib/whatsapp-pricing.test.ts` | Calculo de custos | Existente |
| `lib/whatsapp-adaptive-throttle.test.ts` | Throttle adaptativo | Existente -- adicionar stress |
| `lib/schema-parity.test.ts` | Parity snake/camel | Existente -- ampliar para todas tabelas |
| `lib/rate-limiter.test.ts` | Rate limiter generico | Existente |
| `lib/meta-webhook-subscription.test.ts` | Webhook subscription | Existente |
| `lib/meta-limits.test.ts` | Limites da Meta API | Existente |
| `lib/meta-flow-json-validator.test.ts` | Validacao de Flow JSON | Existente |
| `lib/flow-mapping.test.ts` | Mapeamento de flows | Existente |
| `lib/batch-webhooks.test.ts` | Batch webhook processing | Existente |
| `lib/campaign-ui-counters.test.ts` | Contadores UI | Existente |
| `lib/br-geo.test.ts` | Geo brasileiro | Existente |
| `lib/navigation.test.ts` | Rotas e navegacao | Existente |
| `lib/test-contact-display.test.ts` | Display de contato teste | Existente |
| `lib/template-category.test.ts` | Categoria de template | Existente |
| `lib/precheck-humanizer.test.ts` | Humanizacao de precheck | Existente |
| `lib/storage-validation.test.ts` | Validacao de storage | Existente |
| `lib/video-codec-validator.test.ts` | Validacao de codec video | Existente |
| `lib/inbox/inbox-service.test.ts` | Service do inbox | Existente |
| `lib/whatsapp/template-contract.test.ts` | Contract test de template | Existente -- ampliar |
| `lib/installer/__tests__/machine.test.ts` | State machine do installer | Existente |

**Testes de service existentes (7 arquivos):**

| Arquivo | Escopo | Status |
|---------|--------|--------|
| `services/campaignService.test.ts` | CRUD de campanhas | Existente |
| `services/contactService.test.ts` | CRUD de contatos | Existente |
| `services/templateService.test.ts` | Templates | Existente |
| `services/inboxService.test.ts` | Inbox | Existente |
| `services/settingsService.test.ts` | Settings | Existente |
| `services/flowsService.test.ts` | Flows | Existente |
| `services/dashboardService.test.ts` | Dashboard | Existente |

**Services SEM testes (12):**
- Identificar via `ls services/` e comparar com testes existentes

**Testes E2E existentes (4 specs):**

| Arquivo | Escopo | Status |
|---------|--------|--------|
| `tests/e2e/auth.spec.ts` | Login/logout | Existente -- ampliar |
| `tests/e2e/campaigns.spec.ts` | Listagem de campanhas | Existente -- ampliar |
| `tests/e2e/contacts.spec.ts` | Listagem de contatos | Existente -- ampliar |
| `tests/e2e/settings.spec.ts` | Pagina de settings | Existente -- ampliar |

**Testes especializados existentes:**

| Diretorio | Escopo | Status |
|-----------|--------|--------|
| `tests/stress/` | Stress testing webhook + campanha | Existente -- parametrizar |
| `tests/adversarial/` | Red team AI agent | Existente |
| `tests/e2e-whatsapp/` | E2E WhatsApp com Z-API | Existente |
| `tests/api-ai/` | Qualidade de respostas AI | Existente |

---

## Appendix C: Cobertura por Feature

| Feature | Testes Existentes | Testes Planejados | Gap |
|---------|-------------------|-------------------|-----|
| **Envio de campanha** | ~5 (throttle, batch, errors) | ~25 P0+P1 | Idempotencia, retry, cancelamento, contadores |
| **Webhook processing** | ~3 (batch, subscription) | ~15 P0+P1 | Dedup, ordering, signature, error handling |
| **Auth/seguranca** | ~1 E2E (login) | ~10 P0 | Scan de rotas, admin vs API key, null safety |
| **Contatos** | ~2 (service, E2E) | ~15 P1+P2 | Import CSV, export, custom fields, segmentacao |
| **Templates** | ~4 (service, category, contract) | ~12 P1+P2 | Sync, factory AI, manual builder, preview |
| **Inbox** | ~2 (service, inbox-service) | ~15 P1+P2 | Inbound, outbound, handoff, AI agent, labels |
| **Workflows** | ~1 (flow-mapping) | ~10 P1+P2 | Execution, branching, delay, AI agent node |
| **Flows/MiniApps** | ~2 (validator, mapping) | ~8 P1+P2 | CRUD, publish, submissions |
| **Settings** | ~2 (service, E2E) | ~8 P1+P2 | Credentials, AI config, performance |
| **Lead forms** | 0 | ~5 P1+P2 | CRUD, slug, submission, webhook |
| **Dashboard** | ~1 (service) | ~3 P2 | Stats, recent campaigns |
| **AI agents** | ~3 (api-ai) | ~8 P1+P2+P3 | RAG, embeddings, Mem0, handoff |

---

**Gerado por:** Murat - TEA Master Test Architect
**Workflow:** `_bmad/tea/testarch/test-design`
**Data:** 2026-02-08
