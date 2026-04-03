# Test Design for Architecture: SmartZap Platform

**Objetivo:** Avaliacao de testabilidade arquitetural, gaps e requisitos de NFR para revisao pelo time de desenvolvimento. Serve como contrato entre QA e Engenharia sobre o que deve ser endereacdo antes do desenvolvimento de testes comecar.

**Data:** 2026-02-08
**Autor:** Murat (TEA Master Test Architect)
**Status:** Revisao Arquitetural Pendente
**Projeto:** SmartZap
**Referencia:** `docs/architecture.md`, `docs/data-models.md`, `CLAUDE.md`

---

## Resumo Executivo

**Escopo:** Plataforma completa SmartZap -- SaaS single-tenant de automacao de marketing via WhatsApp. 870 arquivos fonte, 200+ API routes, 460+ componentes, 38 tabelas PostgreSQL, integracoes com Meta WhatsApp Cloud API v24.0, Upstash QStash/Redis, Vercel AI SDK v6.

**Contexto de Negocio:**

- **Impacto:** Envio massivo de mensagens WhatsApp -- erros afetam reputacao e custos financeiros diretos (cada mensagem template custa dinheiro na Meta)
- **Problema:** Automacao de marketing via WhatsApp com inbox inteligente, workflows e IA
- **Escala:** Single-tenant, porem com campanhas de milhares de contatos e rate limits da Meta API

**Arquitetura:**

- **Decisao 1:** Monolito Next.js 16 serverless (App Router) com API Routes
- **Decisao 2:** Supabase PostgreSQL (sem ORM) + Realtime WebSocket
- **Decisao 3:** QStash durable workflows para processamento assincrono
- **Decisao 4:** Multi-provider AI (Google, OpenAI, Anthropic, Cohere, TogetherAI)

**Escala Esperada:**

- Campanhas com 1000+ contatos
- Rate limit Meta: 1000 msgs/seg (Cloud API), 1 msg/6s por par
- 11 tabelas com Realtime (WebSocket)
- 200+ API routes

**Resumo de Riscos:**

- **Total de riscos**: 18
- **Alta prioridade (score >= 6)**: 7 riscos requerendo mitigacao imediata
- **Esforco de testes**: ~180-250 testes (~6-10 semanas para 1 QA)

---

## Guia Rapido

### BLOCKERS - Time Deve Decidir (Nao da para prosseguir sem)

**Sprint 0 Critical Path** - DEVEM ser completados antes de QA escrever testes de integracao:

1. **BLK-01: Endpoint de seed de dados para testes** - Nao existe API para criar dados de teste de forma isolada. Sem isso, testes E2E nao podem rodar em paralelo com seguranca. (responsavel: Backend)
2. **BLK-02: Mock/stub da Meta WhatsApp API** - Testes de campanha, inbox e workflow dependem da Meta API. Sem mock server, testes sao frageis e caros. (responsavel: QA + Backend)
3. **BLK-03: Estrategia de isolamento de banco para testes** - Sem schema separado ou transactions rollback, testes de integracao poluem dados. (responsavel: Backend)

**O que precisamos do time:** Completar estes 3 itens na Sprint 0 ou o desenvolvimento de testes fica bloqueado.

---

### ALTA PRIORIDADE - Time Deve Validar (Nos Fornecemos Recomendacao, Voces Aprovam)

1. **R-01: Rate limiting e backoff exponencial** - Validar que a logica de throttle adaptativo funciona sob carga real (Sprint 1)
2. **R-04: Processamento de webhook da Meta** - Validar idempotencia e deduplicacao de eventos (Sprint 1)
3. **R-07: Durabilidade do workflow engine** - Validar retry e state recovery do Upstash Workflow SDK (Sprint 1)

**O que precisamos do time:** Revisar recomendacoes e aprovar (ou sugerir mudancas).

---

### INFO - Solucoes Fornecidas (Revisao, Sem Decisoes Necessarias)

1. **Estrategia de teste**: 60% Unit/API, 30% Integracao, 10% E2E (piramide de testes)
2. **Tooling**: Vitest (unit + API) + Playwright (E2E) + MSW (mock WhatsApp API)
3. **CI tiered**: PR (~5-10 min unit/API), Nightly (E2E + stress), Weekly (adversarial + chaos)
4. **Cobertura**: ~180-250 cenarios de teste priorizados P0-P3 com classificacao baseada em risco
5. **Quality gates**: P0 = 100% pass, P1 >= 95%, cobertura de linhas >= 70% em lib/

**O que precisamos do time:** Apenas revisar e dar ciencia.

---

## Para Arquitetos e Devs - Topicos Abertos

### Avaliacao de Riscos

**Total de riscos identificados**: 18 (7 alta prioridade score >= 6, 6 media, 5 baixa)

#### Riscos de Alta Prioridade (Score >= 6) - ATENCAO IMEDIATA

| Risk ID | Categoria | Descricao | Prob. | Impacto | Score | Mitigacao | Owner | Timeline |
|---------|-----------|-----------|-------|---------|-------|-----------|-------|----------|
| **R-01** | **PERF** | Rate limiting da Meta API (131056) pode causar falhas em massa em campanhas grandes. Throttle adaptativo (`lib/whatsapp-adaptive-throttle.ts`) nao testado sob carga real | 3 | 3 | **9** | Testes de stress com mock da Meta API simulando 429/131056; validar backoff exponencial | Backend + QA | Sprint 1 |
| **R-02** | **BUS** | Envio duplicado de mensagens WhatsApp -- cada msg custa dinheiro e duplicata afeta reputacao | 2 | 3 | **6** | Testes de idempotencia no dispatch; validar dedup key em `campaign_contacts`; testar cenarios de retry | Backend | Sprint 1 |
| **R-03** | **SEC** | Auth per-route sem middleware global -- qualquer nova rota pode esquecer `verifyApiKey()` | 3 | 2 | **6** | Teste automatizado que lista todas as rotas e valida que rotas nao-publicas tem auth; linting rule | QA + Backend | Sprint 0 |
| **R-04** | **DATA** | Webhook da Meta pode entregar eventos fora de ordem ou duplicados. Deduplicacao via `dedupe_key` em `whatsapp_status_events` e critica | 2 | 3 | **6** | Testes de integracao com eventos fora de ordem; validar dedup; testar race conditions | Backend + QA | Sprint 1 |
| **R-05** | **TECH** | Upstash Workflow SDK em versao RC (0.3.0-rc) -- API pode mudar; durabilidade nao garantida em edge cases | 2 | 3 | **6** | Testes de falha/retry no workflow executor; monitorar changelogs do SDK; plano de migracao para v1.1.0 | Backend | Sprint 1-2 |
| **R-06** | **DATA** | Supabase clients retornam `null` quando env vars ausentes -- NullPointerException silenciosa em qualquer rota | 3 | 2 | **6** | Testes unitarios para todas as rotas validando tratamento de supabase null; guard clauses | QA | Sprint 0-1 |
| **R-07** | **BUS** | Falha no processamento de batch de campanha pode deixar campanha em estado inconsistente (parcialmente enviada sem marcacao correta) | 2 | 3 | **6** | Testes de integracao simulando falha no meio do batch; validar atomicidade dos contadores; testar recovery | Backend + QA | Sprint 1 |

#### Riscos de Media Prioridade (Score 3-5)

| Risk ID | Categoria | Descricao | Prob. | Impacto | Score | Mitigacao | Owner |
|---------|-----------|-----------|-------|---------|-------|-----------|-------|
| R-08 | PERF | Realtime WebSocket com 11 tabelas pode gerar flood de invalidacoes em campanhas grandes | 2 | 2 | 4 | Testes de carga no CentralizedRealtimeProvider; validar debounce adaptativo | Frontend + QA |
| R-09 | SEC | Webhook endpoint `/api/webhook` e publico -- sem signature verification mencionada na arch | 2 | 2 | 4 | Implementar e testar validacao de assinatura da Meta; rejeitar payloads invalidos | Backend |
| R-10 | TECH | Case conversion snake_case/camelCase na camada DB -- pode causar bugs silenciosos | 2 | 2 | 4 | Teste de parity `lib/schema-parity.test.ts` ja existe; ampliar cobertura para todas as tabelas | QA |
| R-11 | DATA | Importacao CSV de contatos sem validacao rigida pode inserir dados corrompidos | 2 | 2 | 4 | Testes com CSVs malformados, encodings diferentes, telefones invalidos | QA |
| R-12 | TECH | Multi-provider AI sem fallback automatico -- falha de um provider derruba feature inteira | 2 | 2 | 4 | Testes de fallback entre providers; circuit breaker pattern | Backend |
| R-13 | OPS | Migracoes SQL executadas programaticamente sem rollback automatico | 1 | 3 | 3 | Testes de migracao em schema isolado; backup antes de aplicar | Backend + DevOps |

#### Riscos de Baixa Prioridade (Score 1-2)

| Risk ID | Categoria | Descricao | Prob. | Impacto | Score | Acao |
|---------|-----------|-----------|-------|---------|-------|------|
| R-14 | PERF | Edge cache flash-back (10s TTL) causa UX confusa mas nao e bug | 1 | 1 | 1 | Monitorar; optimistic updates ja mitigam |
| R-15 | TECH | React Compiler (memoizacao automatica) pode ter edge cases | 1 | 1 | 1 | Monitorar; React 19 e estavel |
| R-16 | TECH | Jotai usado apenas no workflow builder -- risco isolado | 1 | 2 | 2 | Testes unitarios do builder state |
| R-17 | OPS | PWA service worker pode cachear versao antiga | 1 | 1 | 1 | Testes de atualizacao do service worker |
| R-18 | TECH | Zod v4 com breaking changes em relacao a v3 -- migracoes futuras | 1 | 1 | 1 | Monitorar; manter versao pinada |

#### Legenda de Categorias de Risco

- **TECH**: Tecnico/Arquitetura (falhas, integracao, escalabilidade)
- **SEC**: Seguranca (controles de acesso, auth, exposicao de dados)
- **PERF**: Performance (violacoes de SLA, degradacao, limites de recursos)
- **DATA**: Integridade de Dados (perda, corrupcao, inconsistencia)
- **BUS**: Impacto no Negocio (dano UX, erros logicos, receita)
- **OPS**: Operacoes (deploy, config, monitoramento)

---

### Preocupacoes de Testabilidade e Gaps Arquiteturais

**PREOCUPACOES ACIONAVEIS - Time de Arquitetura Deve Enderear**

#### 1. Blockers para Feedback Rapido (O QUE PRECISAMOS DA ARQUITETURA)

| Preocupacao | Impacto | O que Arquitetura Deve Fornecer | Owner | Timeline |
|-------------|---------|--------------------------------|-------|----------|
| **Sem API de seed de dados para testes** | Testes E2E nao podem ser paralelizados; dependem de estado compartilhado | Endpoint `POST /api/test/seed` com factory de dados (campanhas, contatos, templates) com cleanup automatico. Proteger com `SMARTZAP_ADMIN_KEY` | Backend | Sprint 0 |
| **Sem mock server da Meta WhatsApp API** | Testes de envio de campanha, inbox e workflow precisam chamar API real ou falham | MSW (Mock Service Worker) handlers para endpoints da Meta API v24.0: send template, send text, get templates, upload media, webhooks. Ou docker container com WireMock | QA + Backend | Sprint 0 |
| **Sem isolamento de banco entre testes** | Testes paralelos interferem uns nos outros; dados residuais causam flaky tests | Opcao A: Schema separado por test run + truncate. Opcao B: Transactions com rollback (complexo com Supabase). Opcao C: Prefixos unicos por test suite (ex: `test_{uuid}_` nos IDs) | Backend | Sprint 0 |
| **Sem contract tests para Meta API** | Mudancas na Meta API v24.0 quebram silenciosamente | JSON schemas dos payloads da Meta para validar contra a integracao local. `lib/whatsapp/template-contract.test.ts` ja existe -- ampliar | QA | Sprint 0-1 |

#### 2. Melhorias Arquiteturais Necessarias (O QUE DEVE SER MUDADO)

1. **Cobertura de auth automatizada em todas as rotas**
   - **Problema atual**: Auth e per-route via `verifyApiKey()`. Novas rotas podem ser adicionadas sem auth
   - **Mudanca necessaria**: Teste automatizado que enumera todas as rotas em `app/api/` e valida que rotas nao-publicas tem `verifyApiKey()` ou `requireSessionOrApiKey()`
   - **Impacto se nao corrigido**: Endpoint sem autenticacao exposto em producao
   - **Owner**: QA + Backend
   - **Timeline**: Sprint 0

2. **Validacao de signature do webhook Meta**
   - **Problema atual**: `/api/webhook` e publico e a documentacao nao menciona validacao de assinatura do app secret
   - **Mudanca necessaria**: Implementar `X-Hub-Signature-256` verification conforme spec da Meta
   - **Impacto se nao corrigido**: Qualquer pessoa pode enviar payloads falsos ao webhook
   - **Owner**: Backend
   - **Timeline**: Sprint 0

3. **Health check com profundidade**
   - **Problema atual**: `/api/health` pode retornar OK mesmo se Supabase, Redis ou QStash estiverem inacessiveis
   - **Mudanca necessaria**: Deep health check que valida conectividade com todos os servicos externos
   - **Impacto se nao corrigido**: Deploy pode parecer saudavel mas estar quebrado
   - **Owner**: Backend
   - **Timeline**: Sprint 1

4. **Observabilidade de testes para workflow engine**
   - **Problema atual**: Workflow executor (`lib/builder/workflow-executor.workflow.ts`) usa Upstash durable steps -- dificil de testar localmente
   - **Mudanca necessaria**: Modo de teste que permite executar workflows sincronamente sem QStash real; injecao de falhas em steps especificos
   - **Impacto se nao corrigido**: Workflows so podem ser testados em ambiente staging com QStash real
   - **Owner**: Backend
   - **Timeline**: Sprint 1

---

### Avaliacao de Testabilidade - Resumo

**ESTADO ATUAL - INFORMATIVO**

#### O que Funciona Bem

- **Separacao Page -> Hook -> Service -> API**: Arquitetura em camadas facilita testes em cada nivel de forma isolada. Hooks controllers podem ser testados com `renderHook`, services com `vi.mock(fetch)`, API routes com request mocking
- **Types centralizados em `types.ts`**: Interface unica para todo o projeto facilita criacao de factories de teste
- **DB layer abstraido em `lib/supabase-db.ts`**: CRUD por dominio (campaignDb, contactDb) facilita mocking na camada de banco
- **React Query como server state**: Cache configuravel por dominio permite testes deterministicos com `staleTime` controlado
- **Validacao Zod em API routes**: Schemas tipados permitem testes de contrato e validacao automatica
- **Testes existentes**: 22 testes unitarios em `lib/`, 7 testes de service, 4 specs E2E Playwright, 3 cenarios AI, 3 cenarios WhatsApp E2E, testes de stress ja implementados
- **Page Objects ja implementados**: `LoginPage`, `CampaignsPage`, `ContactsPage`, `SettingsPage` em `tests/e2e/pages/`
- **Fixtures de auth reutilizaveis**: `tests/e2e/fixtures/auth.fixture.ts` e `test-data.fixture.ts` ja existem
- **Error codes mapeados**: `lib/whatsapp-errors.ts` com 44+ codigos facilita testes de tratamento de erro

#### Trade-offs Aceitos (Sem Acao Necessaria)

Para SmartZap Phase 1, os seguintes trade-offs sao aceitaveis:

- **Sem middleware.ts global** -- Auth per-route e intencional para controle granular. Mitigo com teste de cobertura de auth
- **Sem ORM** -- Queries diretas Supabase sao intencionais para performance. Mitigo com testes de parity snake_case/camelCase
- **Single-tenant sem user accounts** -- Simplificacao intencional. Sem necessidade de testes de multi-tenancy
- **React Compiler sem memoizacao manual** -- Trade-off aceito; sem necessidade de testes especificos
- **Upstash Workflow SDK RC** -- Risco aceito com monitoramento; plano de migracao documentado

---

### Planos de Mitigacao de Riscos (Alta Prioridade >= 6)

#### R-01: Rate Limiting da Meta API (Score: 9) - CRITICO

**Estrategia de Mitigacao:**

1. Criar mock server da Meta API que simula respostas 429 e error 131056 com latencias variadas
2. Testes de stress do `lib/whatsapp-adaptive-throttle.ts` com cenarios: campanha de 100, 500, 1000, 5000 contatos
3. Validar que throttle adaptativo reduce throughput quando recebe 429s e recupera quando rate limit desaparece
4. Testar cenario de pair rate limit (1 msg/6s para mesmo destinatario)

**Owner:** Backend + QA
**Timeline:** Sprint 1
**Status:** Planejado
**Verificacao:** Campanha de 1000 contatos contra mock server completa sem erros 131056 nao tratados

#### R-02: Envio Duplicado de Mensagens (Score: 6) - ALTO

**Estrategia de Mitigacao:**

1. Testes de idempotencia: enviar mesma campanha 2x e validar que `campaign_contacts` nao duplica
2. Testar cenario de retry apos falha parcial -- contatos ja enviados nao devem receber novamente
3. Validar constraint UNIQUE (campaign_id, contact_id) em `campaign_contacts`
4. Testar race condition: 2 dispatches simultaneos da mesma campanha

**Owner:** Backend
**Timeline:** Sprint 1
**Status:** Planejado
**Verificacao:** Nenhum contato recebe mensagem duplicada em cenarios de retry e concorrencia

#### R-03: Auth Per-Route sem Middleware Global (Score: 6) - ALTO

**Estrategia de Mitigacao:**

1. Script automatizado que lista todas as rotas em `app/api/` via filesystem scan
2. Validar que cada rota (exceto PUBLIC_ROUTES) chama `verifyApiKey()` ou `requireSessionOrApiKey()`
3. Executar em CI como parte do lint/check
4. Testes negativos: chamar cada rota sem auth header e validar 401

**Owner:** QA + Backend
**Timeline:** Sprint 0
**Status:** Planejado
**Verificacao:** 100% das rotas nao-publicas retornam 401 sem auth header

#### R-04: Webhook Meta com Eventos Fora de Ordem (Score: 6) - ALTO

**Estrategia de Mitigacao:**

1. Testes com sequencia de eventos fora de ordem: `delivered` antes de `sent`, `read` sem `delivered`
2. Validar deduplicacao via `dedupe_key` em `whatsapp_status_events`
3. Testar cenario de evento duplicado (mesmo `message_id` + `status`)
4. Validar que `apply_state` machine funciona corretamente

**Owner:** Backend + QA
**Timeline:** Sprint 1
**Status:** Planejado
**Verificacao:** Contadores de campanha corretos apos processar eventos fora de ordem

#### R-05: Upstash Workflow SDK em RC (Score: 6) - ALTO

**Estrategia de Mitigacao:**

1. Testes de durabilidade: simular falha em step intermediario e validar retry
2. Testes de timeout: workflow com step que excede timeout
3. Monitorar changelogs do SDK para breaking changes
4. Plano de migracao para v1.1.0 stable documentado

**Owner:** Backend
**Timeline:** Sprint 1-2
**Status:** Planejado
**Verificacao:** Workflow completa corretamente apos falha simulada em qualquer step

#### R-06: Supabase Client Null (Score: 6) - ALTO

**Estrategia de Mitigacao:**

1. Testes unitarios para toda rota que chama `getSupabaseAdmin()` validando tratamento de retorno null
2. Guard clause padrao: `if (!supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })`
3. Grep automatizado em CI para detectar uso de `getSupabaseAdmin()` sem null check

**Owner:** QA
**Timeline:** Sprint 0-1
**Status:** Planejado
**Verificacao:** Nenhuma rota gera NullPointerException quando Supabase nao esta configurado

#### R-07: Estado Inconsistente de Campanha (Score: 6) - ALTO

**Estrategia de Mitigacao:**

1. Testes de integracao simulando falha no meio do batch de envio
2. Validar que contadores (sent, failed, skipped) sao atomicos via `increment_campaign_stat()`
3. Testar cenario: 50% dos contatos enviados, QStash falha -- campanha deve ficar em estado recuperavel
4. Validar que cancelamento de campanha interrompe batches pendentes

**Owner:** Backend + QA
**Timeline:** Sprint 1
**Status:** Planejado
**Verificacao:** Contadores de campanha = soma exata dos status em `campaign_contacts` apos qualquer cenario de falha

---

### Suposicoes e Dependencias

#### Suposicoes

1. Meta WhatsApp Cloud API v24.0 permanece estavel durante o periodo de testes (sem breaking changes)
2. Supabase managed service tem uptime suficiente para nao afetar testes (99.9%)
3. Upstash QStash/Redis estao disponiveis para testes de integracao em ambiente staging
4. Single-tenant significa que nao ha necessidade de testes de isolamento entre tenants
5. A versao RC do Upstash Workflow SDK (0.3.0-rc) sera mantida ate decisao de migracao

#### Dependencias

1. **Conta Meta WhatsApp Business de teste** -- necessaria para testes E2E reais (Sprint 0)
2. **Projeto Supabase de teste** -- schema separado para testes de integracao (Sprint 0)
3. **Tokens Upstash de teste** -- QStash + Redis para ambiente de teste (Sprint 0)
4. **CI/CD pipeline** -- GitHub Actions ou Vercel CI para execucao automatizada (Sprint 0)

#### Riscos ao Plano

- **Risco**: Meta pode mudar rate limits ou deprecar v24.0 durante desenvolvimento de testes
  - **Impacto**: Testes contra API real ficam invalidos
  - **Contingencia**: Mock server como fonte primaria; testes contra API real como validacao secundaria

- **Risco**: Upstash Workflow SDK RC pode ter bugs que afetam testes
  - **Impacto**: Testes de workflow podem falhar por bugs do SDK e nao do produto
  - **Contingencia**: Isolar testes de workflow com timeout generoso; skip tests se SDK estiver instavel

---

**Fim do Documento de Arquitetura**

**Proximos Passos para Time de Arquitetura:**

1. Revisar Guia Rapido (BLOCKERS / ALTA PRIORIDADE / INFO) e priorizar blockers
2. Atribuir owners e timelines para riscos de alta prioridade (>= 6)
3. Validar suposicoes e dependencias
4. Fornecer feedback sobre gaps de testabilidade

**Proximos Passos para QA:**

1. Aguardar resolucao dos blockers de Sprint 0
2. Consultar documento complementar de QA (`test-design-qa.md`) para cenarios de teste
3. Iniciar setup de infraestrutura de testes (factories, fixtures, mock servers)
