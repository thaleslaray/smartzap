-- =============================================================================
-- SMARTZAP - SCHEMA INICIAL
-- Gerado: 2026-01-22 via pg_dump
-- Atualizado: 2026-01-24 - Adicionado funções RPC para contadores atômicos
--
-- Contém: 38 tabelas, 16 funções, 102 indexes, 9 triggers, 29 FKs
-- =============================================================================

-- Extensão necessária para embeddings de IA (schema extensions = best practice Supabase)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
CREATE FUNCTION public.get_campaign_contact_stats(p_campaign_id text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status IN ('pending', 'sending')),
        'sent', COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'read')),
        'delivered', COUNT(*) FILTER (WHERE status IN ('delivered', 'read')),
        'read', COUNT(*) FILTER (WHERE status = 'read'),
        'skipped', COUNT(*) FILTER (WHERE status = 'skipped'),
        'failed', COUNT(*) FILTER (WHERE status = 'failed')
    ) INTO result
    FROM campaign_contacts
    WHERE campaign_id = p_campaign_id;

    RETURN COALESCE(result, '{"total":0,"pending":0,"sent":0,"delivered":0,"read":0,"skipped":0,"failed":0}'::json);
END;
$$;

CREATE FUNCTION public.get_campaigns_with_all_tags(p_tag_ids uuid[]) RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    RETURN ARRAY(
        SELECT campaign_id
        FROM campaign_tag_assignments
        WHERE tag_id = ANY(p_tag_ids)
        GROUP BY campaign_id
        HAVING COUNT(DISTINCT tag_id) = array_length(p_tag_ids, 1)
    );
END;
$$;

CREATE FUNCTION public.get_contact_stats() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', COUNT(*),
        'optIn', COUNT(*) FILTER (WHERE status IN ('Opt-in', 'OPT_IN')),
        'optOut', COUNT(*) FILTER (WHERE status IN ('Opt-out', 'OPT_OUT'))
    ) INTO result
    FROM contacts;

    RETURN COALESCE(result, '{"total":0,"optIn":0,"optOut":0}'::json);
END;
$$;

CREATE FUNCTION public.get_contact_tags() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT COALESCE(json_agg(DISTINCT tag ORDER BY tag), '[]'::json) INTO result
    FROM contacts, jsonb_array_elements_text(tags) AS tag
    WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
      AND length(trim(tag)) > 0
      AND tag NOT LIKE '[%]';

    RETURN COALESCE(result, '[]'::json);
END;
$$;

CREATE FUNCTION public.get_dashboard_stats() RETURNS TABLE(total_campaigns bigint, total_contacts bigint, total_sent bigint, total_delivered bigint, total_read bigint, total_failed bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.campaigns)::bigint,
    (SELECT COUNT(*) FROM public.contacts)::bigint,
    COALESCE((SELECT SUM(sent) FROM public.campaigns), 0)::bigint,
    COALESCE((SELECT SUM(delivered) FROM public.campaigns), 0)::bigint,
    COALESCE((SELECT SUM(read) FROM public.campaigns), 0)::bigint,
    COALESCE((SELECT SUM(failed) FROM public.campaigns), 0)::bigint;
END;
$$;

CREATE FUNCTION public.increment_campaign_stat(campaign_id_input text, field text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF field = 'sent' THEN
    UPDATE campaigns SET sent = COALESCE(sent, 0) + 1 WHERE id = campaign_id_input;
  ELSIF field = 'delivered' THEN
    UPDATE campaigns SET delivered = COALESCE(delivered, 0) + 1 WHERE id = campaign_id_input;
  ELSIF field = 'read' THEN
    UPDATE campaigns SET read = COALESCE(read, 0) + 1 WHERE id = campaign_id_input;
  ELSIF field = 'failed' THEN
    UPDATE campaigns SET failed = COALESCE(failed, 0) + 1 WHERE id = campaign_id_input;
  END IF;
END;
$$;

CREATE FUNCTION public.increment_campaign_stat(p_campaign_id uuid, p_stat text, p_value integer DEFAULT 1) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
BEGIN
  EXECUTE format(
    'UPDATE public.campaigns SET %I = COALESCE(%I, 0) + $1 WHERE id = $2',
    p_stat, p_stat
  ) USING p_value, p_campaign_id;
END;
$_$;

CREATE FUNCTION public.search_embeddings(query_embedding extensions.vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 5, p_agent_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, content text, metadata jsonb, similarity double precision)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding) as similarity
  FROM public.ai_embeddings e
  WHERE 
    (p_agent_id IS NULL OR e.agent_id = p_agent_id)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE FUNCTION public.search_embeddings(query_embedding extensions.vector, agent_id_filter uuid, expected_dimensions integer, match_threshold double precision DEFAULT 0.5, match_count integer DEFAULT 5) RETURNS TABLE(id uuid, content text, similarity double precision, metadata jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.content,
    (1 - (e.embedding <=> query_embedding))::FLOAT AS similarity,
    e.metadata
  FROM ai_embeddings e
  WHERE e.agent_id = agent_id_filter
    AND e.dimensions = expected_dimensions
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE FUNCTION public.update_attendant_tokens_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.update_campaign_dispatch_metrics() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.campaigns
  SET
    sent = (SELECT COUNT(*) FROM public.campaign_contacts WHERE campaign_id = NEW.campaign_id AND status = 'sent'),
    delivered = (SELECT COUNT(*) FROM public.campaign_contacts WHERE campaign_id = NEW.campaign_id AND status = 'delivered'),
    read = (SELECT COUNT(*) FROM public.campaign_contacts WHERE campaign_id = NEW.campaign_id AND status = 'read'),
    failed = (SELECT COUNT(*) FROM public.campaign_contacts WHERE campaign_id = NEW.campaign_id AND status = 'failed')
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.update_campaign_folders_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Ensures the first AI agent is always marked as default
CREATE FUNCTION public.ensure_default_ai_agent()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  -- If this is the first agent (no others exist), mark as default
  IF NOT EXISTS (
    SELECT 1 FROM public.ai_agents WHERE id != NEW.id
  ) THEN
    NEW.is_default := true;
  END IF;
  RETURN NEW;
END;
$$;

-- RPC: ANALYZE em tabelas de alto volume (whitelist)
CREATE OR REPLACE FUNCTION public.analyze_table(table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF table_name NOT IN (
    'campaign_contacts',
    'contacts',
    'inbox_messages',
    'whatsapp_status_events'
  ) THEN
    RAISE EXCEPTION 'Table "%" is not in the allowed list for ANALYZE', table_name;
  END IF;

  EXECUTE format('ANALYZE %I', table_name);
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;
CREATE TABLE public.account_alerts (
    id text DEFAULT concat('alert_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    type text NOT NULL,
    code integer,
    message text NOT NULL,
    details jsonb,
    dismissed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agent_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ai_agent_id uuid NOT NULL,
    conversation_id uuid,
    input_message text NOT NULL,
    output_message text,
    response_time_ms integer,
    model_used text,
    tokens_used integer,
    sources_used jsonb,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    system_prompt text NOT NULL,
    model text DEFAULT 'gemini-2.5-flash'::text NOT NULL,
    temperature real DEFAULT 0.7 NOT NULL,
    max_tokens integer DEFAULT 1024 NOT NULL,
    embedding_provider text DEFAULT 'google'::text,
    embedding_model text DEFAULT 'gemini-embedding-001'::text,
    embedding_dimensions integer DEFAULT 768,
    rerank_enabled boolean DEFAULT false,
    rerank_provider text,
    rerank_model text,
    rerank_top_k integer DEFAULT 5,
    rag_similarity_threshold real DEFAULT 0.5,
    rag_max_results integer DEFAULT 5,
    is_active boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    debounce_ms integer DEFAULT 5000 NOT NULL,
    handoff_enabled boolean DEFAULT true NOT NULL,
    handoff_instructions text DEFAULT 'Só transfira para humano quando o cliente PEDIR EXPLICITAMENTE para falar com uma pessoa, humano ou atendente.

Se o cliente estiver frustrado ou insatisfeito:
1. Primeiro peça desculpas e tente resolver
2. Ofereça a OPÇÃO de falar com humano
3. Só transfira se ele aceitar'::text,
    booking_tool_enabled boolean DEFAULT false NOT NULL,
    allow_reactions boolean DEFAULT true,
    allow_quotes boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.ai_agents.allow_reactions IS 'Permite que o agente envie reações (emoji) às mensagens do usuário';
COMMENT ON COLUMN public.ai_agents.allow_quotes IS 'Permite que o agente cite mensagens do usuário nas respostas';

CREATE TABLE public.ai_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    file_id uuid,
    content text NOT NULL,
    embedding extensions.vector(768) NOT NULL,
    dimensions integer NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ai_knowledge_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    name text NOT NULL,
    mime_type text DEFAULT 'text/plain'::text NOT NULL,
    size_bytes integer DEFAULT 0 NOT NULL,
    content text,
    external_file_id text,
    external_file_uri text,
    indexing_status text DEFAULT 'pending'::text NOT NULL,
    chunks_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_ai_knowledge_files_indexing_status CHECK ((indexing_status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'local_only'::text])))
);

CREATE TABLE public.attendant_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    token text NOT NULL,
    permissions jsonb DEFAULT '{"canView": true, "canReply": true, "canHandoff": false}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_used_at timestamp with time zone,
    access_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_batch_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id text NOT NULL,
    trace_id text NOT NULL,
    batch_index integer NOT NULL,
    configured_batch_size integer,
    batch_size integer NOT NULL,
    concurrency integer NOT NULL,
    adaptive_enabled boolean DEFAULT false NOT NULL,
    target_mps integer,
    floor_delay_ms integer,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    meta_requests integer DEFAULT 0 NOT NULL,
    meta_time_ms integer DEFAULT 0 NOT NULL,
    db_time_ms integer DEFAULT 0 NOT NULL,
    saw_throughput_429 boolean DEFAULT false NOT NULL,
    batch_ok boolean DEFAULT true NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_contacts (
    id text DEFAULT concat('cc_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    campaign_id text NOT NULL,
    contact_id text,
    phone text NOT NULL,
    name text,
    email text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    message_id text,
    sending_at timestamp with time zone,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    failed_at timestamp with time zone,
    skipped_at timestamp with time zone,
    error text,
    skip_code text,
    skip_reason text,
    failure_code integer,
    failure_reason text,
    trace_id text,
    failure_title text,
    failure_details text,
    failure_fbtrace_id text,
    failure_subcode integer,
    failure_href text,
    CONSTRAINT campaign_contacts_skipped_reason_check CHECK (((status <> 'skipped'::text) OR (failure_reason IS NOT NULL) OR (error IS NOT NULL)))
);

CREATE TABLE public.campaign_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_run_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id text NOT NULL,
    trace_id text NOT NULL,
    template_name text,
    recipients integer,
    sent_total integer,
    failed_total integer,
    skipped_total integer,
    first_dispatch_at timestamp with time zone,
    last_sent_at timestamp with time zone,
    dispatch_duration_ms integer,
    throughput_mps numeric,
    meta_avg_ms numeric,
    db_avg_ms numeric,
    saw_throughput_429 boolean DEFAULT false NOT NULL,
    config jsonb,
    config_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaigns (
    id text DEFAULT concat('c_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'Rascunho'::text NOT NULL,
    template_name text,
    template_id text,
    template_variables jsonb,
    template_snapshot jsonb,
    template_spec_hash text,
    template_parameter_format text,
    template_fetched_at timestamp with time zone,
    scheduled_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_recipients integer DEFAULT 0,
    sent integer DEFAULT 0,
    delivered integer DEFAULT 0,
    read integer DEFAULT 0,
    failed integer DEFAULT 0,
    skipped integer DEFAULT 0,
    last_sent_at timestamp with time zone,
    first_dispatch_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    qstash_schedule_message_id text,
    qstash_schedule_enqueued_at timestamp with time zone,
    flow_id text,
    flow_name text,
    folder_id uuid
);

CREATE VIEW public.campaign_stats_summary WITH (security_invoker='true') AS
 SELECT (count(*))::integer AS total_campaigns,
    (COALESCE(sum(sent), (0)::bigint))::integer AS total_sent,
    (COALESCE(sum(delivered), (0)::bigint))::integer AS total_delivered,
    (COALESCE(sum(read), (0)::bigint))::integer AS total_read,
    (COALESCE(sum(failed), (0)::bigint))::integer AS total_failed,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['enviando'::text, 'sending'::text, 'SENDING'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS active_campaigns,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['concluida'::text, 'completed'::text, 'COMPLETED'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS completed_campaigns,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['rascunho'::text, 'draft'::text, 'DRAFT'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS draft_campaigns,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['pausado'::text, 'paused'::text, 'PAUSED'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS paused_campaigns,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['agendado'::text, 'scheduled'::text, 'SCHEDULED'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS scheduled_campaigns,
    (count(
        CASE
            WHEN (status = ANY (ARRAY['falhou'::text, 'failed'::text, 'FAILED'::text])) THEN 1
            ELSE NULL::integer
        END))::integer AS failed_campaigns,
    (COALESCE(sum(
        CASE
            WHEN (created_at > (now() - '24:00:00'::interval)) THEN sent
            ELSE 0
        END), (0)::bigint))::integer AS sent_24h,
    (COALESCE(sum(
        CASE
            WHEN (created_at > (now() - '24:00:00'::interval)) THEN delivered
            ELSE 0
        END), (0)::bigint))::integer AS delivered_24h,
    (COALESCE(sum(
        CASE
            WHEN (created_at > (now() - '24:00:00'::interval)) THEN failed
            ELSE 0
        END), (0)::bigint))::integer AS failed_24h
   FROM public.campaigns;

CREATE TABLE public.campaign_tag_assignments (
    campaign_id text NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.campaign_trace_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trace_id text NOT NULL,
    ts timestamp with time zone NOT NULL,
    campaign_id text,
    step text,
    phase text NOT NULL,
    ok boolean,
    ms integer,
    batch_index integer,
    contact_id text,
    phone_masked text,
    extra jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contacts (
    id text DEFAULT concat('ct_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    phone text NOT NULL,
    email text,
    status text DEFAULT 'Opt-in'::text,
    tags jsonb DEFAULT '[]'::jsonb,
    notes text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);

CREATE TABLE public.custom_field_definitions (
    id text DEFAULT concat('cfd_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    type text DEFAULT 'text'::text NOT NULL,
    options jsonb,
    entity_type text DEFAULT 'contact'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.flow_submissions (
    id text DEFAULT concat('fs_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    message_id text NOT NULL,
    from_phone text NOT NULL,
    contact_id text,
    flow_id text,
    flow_name text,
    flow_token text,
    response_json_raw text NOT NULL,
    response_json jsonb,
    waba_id text,
    phone_number_id text,
    message_timestamp timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    flow_local_id text,
    mapped_data jsonb,
    mapped_at timestamp with time zone,
    campaign_id text
);

CREATE TABLE public.flows (
    id text DEFAULT concat('fl_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    meta_flow_id text,
    spec jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    template_key text,
    flow_json jsonb,
    flow_version text,
    mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    meta_status text,
    meta_preview_url text,
    meta_validation_errors jsonb,
    meta_last_checked_at timestamp with time zone,
    meta_published_at timestamp with time zone
);

CREATE TABLE public.inbox_conversation_labels (
    conversation_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.inbox_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id text,
    ai_agent_id uuid,
    phone text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    mode text DEFAULT 'bot'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    total_messages integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    last_message_preview text,
    automation_paused_until timestamp with time zone,
    automation_paused_by text,
    handoff_summary text,
    human_mode_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_inbox_conversations_mode CHECK ((mode = ANY (ARRAY['bot'::text, 'human'::text]))),
    CONSTRAINT chk_inbox_conversations_priority CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT chk_inbox_conversations_status CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);

-- =============================================================================
-- Funções RPC para contadores atômicos (inbox)
-- IMPORTANTE: Estas funções DEVEM estar após a criação da tabela inbox_conversations
-- pois retornam o tipo composto public.inbox_conversations
-- =============================================================================

-- Incrementa contadores de conversa de forma atômica (elimina race condition)
CREATE FUNCTION public.increment_conversation_counters(
  p_conversation_id UUID,
  p_direction TEXT DEFAULT 'inbound',
  p_message_preview TEXT DEFAULT NULL
)
RETURNS public.inbox_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.inbox_conversations;
BEGIN
  UPDATE inbox_conversations
  SET
    total_messages = total_messages + 1,
    unread_count = CASE
      WHEN p_direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    last_message_at = NOW(),
    last_message_preview = COALESCE(
      CASE
        WHEN LENGTH(p_message_preview) > 100
        THEN SUBSTRING(p_message_preview, 1, 100) || '...'
        ELSE p_message_preview
      END,
      last_message_preview
    ),
    updated_at = NOW()
  WHERE id = p_conversation_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Decrementa contador de não lidas (nunca fica negativo)
CREATE FUNCTION public.decrement_unread_count(
  p_conversation_id UUID,
  p_amount INT DEFAULT 1
)
RETURNS public.inbox_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.inbox_conversations;
BEGIN
  UPDATE inbox_conversations
  SET
    unread_count = GREATEST(0, unread_count - p_amount),
    updated_at = NOW()
  WHERE id = p_conversation_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Reseta contador de não lidas para zero (marca como lida)
CREATE FUNCTION public.reset_unread_count(
  p_conversation_id UUID
)
RETURNS public.inbox_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result public.inbox_conversations;
BEGIN
  UPDATE inbox_conversations
  SET
    unread_count = 0,
    updated_at = NOW()
  WHERE id = p_conversation_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- RPC: Processa mensagem inbound de forma atômica
-- Reduz de 4-5 queries para 1 RPC call
-- =============================================================================
CREATE FUNCTION public.process_inbound_message(
  p_phone TEXT,
  p_content TEXT,
  p_whatsapp_message_id TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT 'text',
  p_media_url TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_contact_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_conversation_id UUID;
  v_message_id UUID;
  v_conversation_status TEXT;
  v_conversation_mode TEXT;
  v_ai_agent_id UUID;
  v_human_mode_expires_at TIMESTAMPTZ;
  v_automation_paused_until TIMESTAMPTZ;
  v_is_new_conversation BOOLEAN := FALSE;
  v_message_preview TEXT;
  -- FIX: Mudado de UUID para TEXT (contacts.id usa prefixo 'ct_')
  v_contact_id TEXT;
  v_current_contact_id TEXT;
BEGIN
  -- Auto-lookup contact by phone if not provided
  IF p_contact_id IS NULL THEN
    SELECT id INTO v_contact_id FROM contacts WHERE phone = p_phone LIMIT 1;
  ELSE
    v_contact_id := p_contact_id;  -- Já é TEXT, não precisa de cast
  END IF;

  -- Trunca preview para 100 chars
  v_message_preview := CASE
    WHEN LENGTH(p_content) > 100 THEN SUBSTRING(p_content, 1, 100) || '...'
    ELSE p_content
  END;

  -- 1. Busca conversa existente pelo telefone (usa idx_inbox_conversations_phone_covering)
  SELECT
    id, status, mode, ai_agent_id, human_mode_expires_at, automation_paused_until, contact_id
  INTO
    v_conversation_id, v_conversation_status, v_conversation_mode,
    v_ai_agent_id, v_human_mode_expires_at, v_automation_paused_until, v_current_contact_id
  FROM inbox_conversations
  WHERE phone = p_phone
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 1;

  -- 2. Se não existe, cria nova conversa
  IF v_conversation_id IS NULL THEN
    INSERT INTO inbox_conversations (
      phone,
      contact_id,
      mode,
      status,
      total_messages,
      unread_count,
      last_message_at,
      last_message_preview
    ) VALUES (
      p_phone,
      v_contact_id,
      'bot',
      'open',
      1,
      1,
      NOW(),
      v_message_preview
    )
    RETURNING id, mode, ai_agent_id, human_mode_expires_at, automation_paused_until
    INTO v_conversation_id, v_conversation_mode, v_ai_agent_id,
         v_human_mode_expires_at, v_automation_paused_until;

    v_is_new_conversation := TRUE;
    v_conversation_status := 'open';
  ELSE
    -- 3. Se existe, atualiza contadores e reabre se fechada
    -- Auto-link contact if conversation has no contact but we found one
    UPDATE inbox_conversations
    SET
      total_messages = total_messages + 1,
      unread_count = unread_count + 1,
      last_message_at = NOW(),
      last_message_preview = v_message_preview,
      status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
      contact_id = COALESCE(contact_id, v_contact_id),  -- Agora ambos são TEXT
      updated_at = NOW()
    WHERE id = v_conversation_id
    RETURNING status INTO v_conversation_status;
  END IF;

  -- 4. Cria mensagem
  INSERT INTO inbox_messages (
    conversation_id,
    direction,
    content,
    message_type,
    whatsapp_message_id,
    media_url,
    delivery_status,
    payload
  ) VALUES (
    v_conversation_id,
    'inbound',
    p_content,
    p_message_type,
    p_whatsapp_message_id,
    p_media_url,
    'delivered',
    p_payload
  )
  RETURNING id INTO v_message_id;

  -- 5. Retorna resultado completo
  RETURN json_build_object(
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'is_new_conversation', v_is_new_conversation,
    'conversation_status', v_conversation_status,
    'conversation_mode', v_conversation_mode,
    'ai_agent_id', v_ai_agent_id,
    'human_mode_expires_at', v_human_mode_expires_at,
    'automation_paused_until', v_automation_paused_until
  );
END;
$$;

COMMENT ON FUNCTION public.process_inbound_message IS
'Processa mensagem inbound de forma atômica: busca/cria conversa + cria mensagem + atualiza contadores. Auto-vincula contatos pelo telefone.';

-- =============================================================================
-- RPC: Busca configurações do agente de forma otimizada
-- =============================================================================
CREATE FUNCTION public.get_agent_config(
  p_conversation_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'ai_agent_id', c.ai_agent_id,
    'debounce_ms', COALESCE(a.debounce_ms, 3000),
    'agent_name', a.name
  )
  INTO v_result
  FROM inbox_conversations c
  LEFT JOIN ai_agents a ON a.id = c.ai_agent_id
  WHERE c.id = p_conversation_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_agent_config IS
'Busca configuração do agente de IA para uma conversa em uma única query.';

CREATE TABLE public.inbox_labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'gray'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.inbox_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    direction text NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    media_url text,
    whatsapp_message_id text,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    ai_response_id uuid,
    ai_sentiment text,
    ai_sources jsonb,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    failed_at timestamp with time zone,
    failure_reason text,
    CONSTRAINT chk_inbox_messages_delivery_status CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))),
    CONSTRAINT chk_inbox_messages_direction CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT chk_inbox_messages_sentiment CHECK (((ai_sentiment IS NULL) OR (ai_sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, 'frustrated'::text])))),
    CONSTRAINT chk_inbox_messages_type CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'template'::text, 'interactive'::text, 'internal_note'::text])))
);

CREATE TABLE public.inbox_quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    shortcut text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.lead_forms (
    id text DEFAULT concat('lf_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    tag text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    success_message text,
    webhook_token text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    collect_email boolean DEFAULT true NOT NULL
);

CREATE TABLE public.phone_suppressions (
    id text DEFAULT concat('ps_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    phone text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    reason text,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    expires_at timestamp with time zone
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint text NOT NULL,
    keys jsonb NOT NULL,
    attendant_token_id uuid,
    user_agent text,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_subscriptions_keys_check CHECK (((keys ? 'p256dh'::text) AND (keys ? 'auth'::text)))
);

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.template_project_items (
    id text DEFAULT concat('tpi_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    project_id text NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    language text DEFAULT 'pt_BR'::text,
    category text DEFAULT 'UTILITY'::text,
    status text DEFAULT 'draft'::text,
    meta_id text,
    meta_status text,
    rejected_reason text,
    submitted_at timestamp with time zone,
    components jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    sample_variables jsonb,
    marketing_variables jsonb,
    header jsonb,
    footer jsonb,
    buttons jsonb,
    variables jsonb
);

CREATE TABLE public.template_projects (
    id text DEFAULT concat('tp_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    user_id text,
    title text NOT NULL,
    prompt text,
    status text DEFAULT 'draft'::text,
    template_count integer DEFAULT 0,
    approved_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    source text DEFAULT 'ai'::text,
    strategy text DEFAULT 'utility'::text
);

CREATE TABLE public.templates (
    id text DEFAULT concat('tpl_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    name text NOT NULL,
    category text,
    language text DEFAULT 'pt_BR'::text,
    status text,
    parameter_format text DEFAULT 'positional'::text,
    components jsonb,
    spec_hash text,
    fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    header_media_preview_url text,
    header_media_preview_expires_at timestamp with time zone,
    header_media_preview_updated_at timestamp with time zone
);

CREATE TABLE public.whatsapp_status_events (
    id text DEFAULT concat('wse_', replace((extensions.uuid_generate_v4())::text, '-'::text, ''::text)) NOT NULL,
    message_id text NOT NULL,
    status text NOT NULL,
    event_ts timestamp with time zone,
    event_ts_raw text,
    dedupe_key text NOT NULL,
    recipient_id text,
    errors jsonb,
    payload jsonb,
    apply_state text DEFAULT 'pending'::text NOT NULL,
    applied boolean DEFAULT false NOT NULL,
    applied_at timestamp with time zone,
    apply_error text,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    campaign_contact_id text,
    campaign_id text,
    first_received_at timestamp with time zone DEFAULT now() NOT NULL,
    last_received_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workflow_builder_executions (
    id text NOT NULL,
    workflow_id text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);

CREATE TABLE public.workflow_builder_logs (
    id bigint NOT NULL,
    execution_id text NOT NULL,
    node_id text NOT NULL,
    node_name text,
    node_type text,
    status text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE SEQUENCE public.workflow_builder_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workflow_builder_logs_id_seq OWNED BY public.workflow_builder_logs.id;

CREATE TABLE public.workflow_conversations (
    id text NOT NULL,
    workflow_id text NOT NULL,
    phone text NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    resume_node_id text,
    variable_key text,
    variables jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.workflow_run_logs (
    id bigint NOT NULL,
    run_id text NOT NULL,
    node_id text NOT NULL,
    node_name text,
    node_type text,
    status text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);

CREATE SEQUENCE public.workflow_run_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workflow_run_logs_id_seq OWNED BY public.workflow_run_logs.id;

CREATE TABLE public.workflow_runs (
    id text NOT NULL,
    workflow_id text NOT NULL,
    version_id text,
    status text DEFAULT 'running'::text NOT NULL,
    trigger_type text,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);

CREATE TABLE public.workflow_versions (
    id text NOT NULL,
    workflow_id text NOT NULL,
    version integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    nodes jsonb NOT NULL,
    edges jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone
);

CREATE TABLE public.workflows (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    owner_company_id text,
    active_version_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.workflow_builder_logs ALTER COLUMN id SET DEFAULT nextval('public.workflow_builder_logs_id_seq'::regclass);

ALTER TABLE ONLY public.workflow_run_logs ALTER COLUMN id SET DEFAULT nextval('public.workflow_run_logs_id_seq'::regclass);

ALTER TABLE ONLY public.account_alerts
    ADD CONSTRAINT account_alerts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_embeddings
    ADD CONSTRAINT ai_embeddings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_knowledge_files
    ADD CONSTRAINT ai_knowledge_files_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attendant_tokens
    ADD CONSTRAINT attendant_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attendant_tokens
    ADD CONSTRAINT attendant_tokens_token_key UNIQUE (token);

ALTER TABLE ONLY public.campaign_batch_metrics
    ADD CONSTRAINT campaign_batch_metrics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_folders
    ADD CONSTRAINT campaign_folders_name_unique UNIQUE (name);

ALTER TABLE ONLY public.campaign_folders
    ADD CONSTRAINT campaign_folders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_run_metrics
    ADD CONSTRAINT campaign_run_metrics_campaign_id_trace_id_key UNIQUE (campaign_id, trace_id);

ALTER TABLE ONLY public.campaign_run_metrics
    ADD CONSTRAINT campaign_run_metrics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_tag_assignments
    ADD CONSTRAINT campaign_tag_assignments_pkey PRIMARY KEY (campaign_id, tag_id);

ALTER TABLE ONLY public.campaign_tags
    ADD CONSTRAINT campaign_tags_name_unique UNIQUE (name);

ALTER TABLE ONLY public.campaign_tags
    ADD CONSTRAINT campaign_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaign_trace_events
    ADD CONSTRAINT campaign_trace_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_phone_key UNIQUE (phone);

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_entity_type_key_key UNIQUE (entity_type, key);

ALTER TABLE ONLY public.custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flow_submissions
    ADD CONSTRAINT flow_submissions_message_id_key UNIQUE (message_id);

ALTER TABLE ONLY public.flow_submissions
    ADD CONSTRAINT flow_submissions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.flows
    ADD CONSTRAINT flows_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_conversation_labels
    ADD CONSTRAINT inbox_conversation_labels_pkey PRIMARY KEY (conversation_id, label_id);

ALTER TABLE ONLY public.inbox_conversations
    ADD CONSTRAINT inbox_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_labels
    ADD CONSTRAINT inbox_labels_name_key UNIQUE (name);

ALTER TABLE ONLY public.inbox_labels
    ADD CONSTRAINT inbox_labels_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_quick_replies
    ADD CONSTRAINT inbox_quick_replies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_quick_replies
    ADD CONSTRAINT inbox_quick_replies_shortcut_key UNIQUE (shortcut);

ALTER TABLE ONLY public.lead_forms
    ADD CONSTRAINT lead_forms_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.lead_forms
    ADD CONSTRAINT lead_forms_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.lead_forms
    ADD CONSTRAINT lead_forms_webhook_token_key UNIQUE (webhook_token);

ALTER TABLE ONLY public.phone_suppressions
    ADD CONSTRAINT phone_suppressions_phone_key UNIQUE (phone);

ALTER TABLE ONLY public.phone_suppressions
    ADD CONSTRAINT phone_suppressions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.template_project_items
    ADD CONSTRAINT template_project_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.template_projects
    ADD CONSTRAINT template_projects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_name_language_key UNIQUE (name, language);

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_status_events
    ADD CONSTRAINT whatsapp_status_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_builder_executions
    ADD CONSTRAINT workflow_builder_executions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_builder_logs
    ADD CONSTRAINT workflow_builder_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_conversations
    ADD CONSTRAINT workflow_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT workflow_run_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflow_versions
    ADD CONSTRAINT workflow_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);

CREATE INDEX ai_embeddings_agent_dimensions_idx ON public.ai_embeddings USING btree (agent_id, dimensions);

-- ai_embeddings_agent_id_idx removido: redundante com ai_embeddings_agent_dimensions_idx(agent_id, dimensions)

CREATE INDEX ai_embeddings_embedding_idx ON public.ai_embeddings USING hnsw (embedding extensions.vector_cosine_ops);

CREATE INDEX ai_embeddings_file_id_idx ON public.ai_embeddings USING btree (file_id);

CREATE INDEX campaign_batch_metrics_campaign_idx ON public.campaign_batch_metrics USING btree (campaign_id, created_at DESC);

CREATE INDEX campaign_batch_metrics_trace_idx ON public.campaign_batch_metrics USING btree (trace_id, batch_index);

CREATE INDEX campaign_run_metrics_campaign_idx ON public.campaign_run_metrics USING btree (campaign_id, created_at DESC);

CREATE INDEX campaign_run_metrics_config_hash_idx ON public.campaign_run_metrics USING btree (config_hash, created_at DESC);

CREATE INDEX campaign_run_metrics_created_idx ON public.campaign_run_metrics USING btree (created_at DESC);

CREATE INDEX campaign_trace_events_campaign_idx ON public.campaign_trace_events USING btree (campaign_id, ts DESC);

CREATE INDEX campaign_trace_events_trace_idx ON public.campaign_trace_events USING btree (trace_id, ts DESC);

CREATE INDEX campaign_trace_events_trace_phase_idx ON public.campaign_trace_events USING btree (trace_id, phase, ts DESC);

CREATE INDEX campaigns_cancelled_at_idx ON public.campaigns USING btree (cancelled_at);

CREATE INDEX campaigns_first_dispatch_at_idx ON public.campaigns USING btree (first_dispatch_at DESC);

CREATE INDEX campaigns_last_sent_at_idx ON public.campaigns USING btree (last_sent_at DESC);

-- idx_account_alerts_dismissed removido: redundante com idx_account_alerts_dismissed_created(dismissed, created_at)

CREATE INDEX idx_account_alerts_dismissed_created ON public.account_alerts USING btree (dismissed, created_at DESC);

CREATE INDEX idx_account_alerts_type ON public.account_alerts USING btree (type);

CREATE INDEX idx_ai_agent_logs_agent_id ON public.ai_agent_logs USING btree (ai_agent_id);

CREATE INDEX idx_ai_agent_logs_conversation_id ON public.ai_agent_logs USING btree (conversation_id);

CREATE INDEX idx_ai_agent_logs_created_at ON public.ai_agent_logs USING btree (created_at);

CREATE UNIQUE INDEX idx_ai_agents_single_default ON public.ai_agents USING btree (is_default) WHERE (is_default = true);

CREATE INDEX idx_ai_knowledge_files_agent_id ON public.ai_knowledge_files USING btree (agent_id);

CREATE INDEX idx_ai_knowledge_files_created_at ON public.ai_knowledge_files USING btree (created_at DESC);

CREATE INDEX idx_attendant_tokens_active ON public.attendant_tokens USING btree (is_active) WHERE (is_active = true);

-- idx_attendant_tokens_token removido: redundante com attendant_tokens_token_key UNIQUE
-- idx_campaign_contacts_campaign removido: redundante com UNIQUE(campaign_id, contact_id) e compostos

CREATE INDEX idx_campaign_contacts_campaign_phone ON public.campaign_contacts USING btree (campaign_id, phone);

-- Composite: tela de detalhes filtra por campaign_id + status
CREATE INDEX idx_campaign_contacts_campaign_status ON public.campaign_contacts USING btree (campaign_id, status);

CREATE INDEX idx_campaign_contacts_contact_id ON public.campaign_contacts USING btree (contact_id);

CREATE INDEX idx_campaign_contacts_failed_recent ON public.campaign_contacts USING btree (campaign_id, failed_at DESC) WHERE (status = 'failed'::text);

CREATE INDEX idx_campaign_contacts_failure ON public.campaign_contacts USING btree (failure_code);

CREATE INDEX idx_campaign_contacts_failure_fbtrace_id ON public.campaign_contacts USING btree (failure_fbtrace_id);

CREATE INDEX idx_campaign_contacts_failure_subcode ON public.campaign_contacts USING btree (failure_subcode);

CREATE INDEX idx_campaign_contacts_failure_title ON public.campaign_contacts USING btree (failure_title);

CREATE INDEX idx_campaign_contacts_message_id ON public.campaign_contacts USING btree (message_id);

CREATE INDEX idx_campaign_contacts_sending_at ON public.campaign_contacts USING btree (sending_at DESC);

CREATE INDEX idx_campaign_contacts_skipped_at ON public.campaign_contacts USING btree (skipped_at DESC);

CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status);

CREATE INDEX idx_campaign_contacts_trace_id ON public.campaign_contacts USING btree (trace_id);

-- idx_campaign_tag_assignments_campaign removido: redundante com PK(campaign_id, tag_id)

CREATE INDEX idx_campaign_tag_assignments_tag ON public.campaign_tag_assignments USING btree (tag_id);

CREATE INDEX idx_campaigns_created_at ON public.campaigns USING btree (created_at DESC);

CREATE INDEX idx_campaigns_flow_id ON public.campaigns USING btree (flow_id) WHERE (flow_id IS NOT NULL);

CREATE INDEX idx_campaigns_folder_id ON public.campaigns USING btree (folder_id);

CREATE INDEX idx_campaigns_qstash_schedule_message_id ON public.campaigns USING btree (qstash_schedule_message_id);

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);

-- Partial index: hot path de campanhas ativas (dashboard + polling)
CREATE INDEX idx_campaigns_active ON public.campaigns USING btree (status, scheduled_date)
  WHERE status IN ('Enviando', 'Agendado');

CREATE INDEX idx_contacts_custom_fields ON public.contacts USING gin (custom_fields);

CREATE INDEX idx_contacts_tags ON public.contacts USING gin (tags);

-- idx_contacts_phone removido: redundante com contacts_phone_key UNIQUE

CREATE INDEX idx_contacts_status ON public.contacts USING btree (status);

-- idx_custom_field_definitions_entity removido: redundante com UNIQUE(entity_type, key)

CREATE INDEX idx_flow_submissions_campaign_id ON public.flow_submissions USING btree (campaign_id);

CREATE INDEX idx_flow_submissions_contact_id ON public.flow_submissions USING btree (contact_id);

CREATE INDEX idx_flow_submissions_created_at ON public.flow_submissions USING btree (created_at DESC);

CREATE INDEX idx_flow_submissions_flow_id ON public.flow_submissions USING btree (flow_id);

CREATE INDEX idx_flow_submissions_flow_local_id ON public.flow_submissions USING btree (flow_local_id);

CREATE INDEX idx_flow_submissions_from_phone ON public.flow_submissions USING btree (from_phone);

CREATE INDEX idx_flows_created_at ON public.flows USING btree (created_at DESC);

CREATE INDEX idx_flows_meta_flow_id ON public.flows USING btree (meta_flow_id);

CREATE INDEX idx_flows_meta_status ON public.flows USING btree (meta_status);

CREATE INDEX idx_flows_status ON public.flows USING btree (status);

CREATE INDEX idx_flows_template_key ON public.flows USING btree (template_key);

CREATE INDEX idx_inbox_conversation_labels_label_id ON public.inbox_conversation_labels USING btree (label_id);

CREATE INDEX idx_inbox_conversations_ai_agent_id ON public.inbox_conversations USING btree (ai_agent_id);

CREATE INDEX idx_inbox_conversations_contact_id ON public.inbox_conversations USING btree (contact_id);

CREATE INDEX idx_inbox_conversations_last_message_at ON public.inbox_conversations USING btree (last_message_at DESC NULLS LAST);

CREATE INDEX idx_inbox_conversations_mode_status ON public.inbox_conversations USING btree (mode, status);

-- idx_inbox_conversations_phone removido: redundante com phone_status e phone_covering

-- Índice composto para busca por telefone no webhook (hot path)
CREATE INDEX idx_inbox_conversations_phone_status ON public.inbox_conversations USING btree (phone, status);

CREATE INDEX idx_inbox_conversations_human_mode_expires ON public.inbox_conversations USING btree (human_mode_expires_at) WHERE (mode = 'human' AND human_mode_expires_at IS NOT NULL);

-- Covering Index para busca lightweight (index-only scan)
-- Inclui todos os campos usados no SELECT da função findConversationByPhoneLightweight
CREATE INDEX idx_inbox_conversations_phone_covering
ON inbox_conversations (phone)
INCLUDE (
  id,
  status,
  mode,
  ai_agent_id,
  contact_id,
  human_mode_expires_at,
  automation_paused_until,
  total_messages,
  unread_count,
  last_message_at
);

-- idx_inbox_messages_conversation_id removido: redundante com idx_inbox_messages_conversation_created(conversation_id, created_at)

-- Composite: hot path do chat (pagination por conversa)
CREATE INDEX idx_inbox_messages_conversation_created ON public.inbox_messages USING btree (conversation_id, created_at DESC);

CREATE INDEX idx_inbox_messages_created_at ON public.inbox_messages USING btree (created_at);

-- Índice para status updates do WhatsApp (renomeado de whatsapp_id para whatsapp_msg_id)
CREATE INDEX idx_inbox_messages_whatsapp_msg_id ON public.inbox_messages USING btree (whatsapp_message_id) WHERE (whatsapp_message_id IS NOT NULL);

CREATE INDEX idx_lead_forms_collect_email ON public.lead_forms USING btree (collect_email);

CREATE INDEX idx_lead_forms_is_active ON public.lead_forms USING btree (is_active);

CREATE INDEX idx_lead_forms_slug ON public.lead_forms USING btree (slug);

CREATE INDEX idx_phone_suppressions_active ON public.phone_suppressions USING btree (is_active) WHERE (is_active = true);

CREATE INDEX idx_phone_suppressions_expires ON public.phone_suppressions USING btree (expires_at) WHERE (expires_at IS NOT NULL);

CREATE INDEX idx_phone_suppressions_phone ON public.phone_suppressions USING btree (phone);

CREATE INDEX idx_push_subscriptions_attendant ON public.push_subscriptions USING btree (attendant_token_id);

CREATE INDEX idx_push_subscriptions_created ON public.push_subscriptions USING btree (created_at DESC);

CREATE INDEX idx_template_project_items_project ON public.template_project_items USING btree (project_id);

CREATE INDEX idx_template_project_items_status ON public.template_project_items USING btree (status);

CREATE INDEX idx_template_projects_status ON public.template_projects USING btree (status);

-- idx_templates_name removido: redundante com UNIQUE(name, language)

CREATE INDEX idx_templates_status ON public.templates USING btree (status);

CREATE INDEX idx_whatsapp_status_events_apply_state ON public.whatsapp_status_events USING btree (apply_state);

CREATE INDEX idx_whatsapp_status_events_campaign_contact_id ON public.whatsapp_status_events USING btree (campaign_contact_id);

CREATE INDEX idx_whatsapp_status_events_campaign_id ON public.whatsapp_status_events USING btree (campaign_id);

CREATE INDEX idx_whatsapp_status_events_last_received_at ON public.whatsapp_status_events USING btree (last_received_at DESC);

CREATE INDEX idx_whatsapp_status_events_message_id ON public.whatsapp_status_events USING btree (message_id);

CREATE INDEX idx_workflows_active_version_id ON public.workflows USING btree (active_version_id);

CREATE INDEX lead_forms_fields_gin_idx ON public.lead_forms USING gin (fields);

CREATE UNIQUE INDEX ux_whatsapp_status_events_dedupe_key ON public.whatsapp_status_events USING btree (dedupe_key);

CREATE INDEX workflow_builder_executions_workflow_id_idx ON public.workflow_builder_executions USING btree (workflow_id, started_at DESC);

CREATE INDEX workflow_builder_logs_execution_id_idx ON public.workflow_builder_logs USING btree (execution_id, started_at DESC);

CREATE INDEX workflow_conversations_phone_idx ON public.workflow_conversations USING btree (phone, updated_at DESC);

CREATE INDEX workflow_conversations_workflow_id_idx ON public.workflow_conversations USING btree (workflow_id, updated_at DESC);

CREATE INDEX workflow_run_logs_run_id_idx ON public.workflow_run_logs USING btree (run_id, started_at DESC);

CREATE INDEX workflow_runs_version_id_idx ON public.workflow_runs USING btree (version_id, started_at DESC);

CREATE INDEX workflow_runs_workflow_id_idx ON public.workflow_runs USING btree (workflow_id, started_at DESC);

CREATE INDEX workflow_versions_workflow_id_idx ON public.workflow_versions USING btree (workflow_id, created_at DESC);

CREATE UNIQUE INDEX workflow_versions_workflow_version_idx ON public.workflow_versions USING btree (workflow_id, version);

-- =============================================================================
-- AUTOVACUUM TUNING: Tabelas de alto volume
-- Defaults do Postgres: vacuum_scale_factor=0.20, analyze_scale_factor=0.10
-- Reduzido para manter estatísticas frescas e evitar bloat
-- =============================================================================

ALTER TABLE public.campaign_contacts SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE public.inbox_messages SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE public.inbox_conversations SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE public.whatsapp_status_events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE public.campaigns SET (
  autovacuum_vacuum_scale_factor = 0.10,
  autovacuum_analyze_scale_factor = 0.05
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ensure_default_ai_agent_trigger BEFORE INSERT ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.ensure_default_ai_agent();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.inbox_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendant_tokens_updated_at_trigger BEFORE UPDATE ON public.attendant_tokens FOR EACH ROW EXECUTE FUNCTION public.update_attendant_tokens_updated_at();

CREATE TRIGGER update_campaign_folders_updated_at_trigger BEFORE UPDATE ON public.campaign_folders FOR EACH ROW EXECUTE FUNCTION public.update_campaign_folders_updated_at();

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.inbox_conversations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ai_embeddings
    ADD CONSTRAINT ai_embeddings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_embeddings
    ADD CONSTRAINT ai_embeddings_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.ai_knowledge_files(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_knowledge_files
    ADD CONSTRAINT ai_knowledge_files_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.campaign_tag_assignments
    ADD CONSTRAINT campaign_tag_assignments_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaign_tag_assignments
    ADD CONSTRAINT campaign_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.campaign_tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.campaign_folders(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flow_submissions
    ADD CONSTRAINT flow_submissions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flow_submissions
    ADD CONSTRAINT flow_submissions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flow_submissions
    ADD CONSTRAINT flow_submissions_flow_local_id_fkey FOREIGN KEY (flow_local_id) REFERENCES public.flows(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inbox_conversation_labels
    ADD CONSTRAINT inbox_conversation_labels_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.inbox_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_conversation_labels
    ADD CONSTRAINT inbox_conversation_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.inbox_labels(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_conversations
    ADD CONSTRAINT inbox_conversations_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inbox_conversations
    ADD CONSTRAINT inbox_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.inbox_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_attendant_token_id_fkey FOREIGN KEY (attendant_token_id) REFERENCES public.attendant_tokens(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.template_project_items
    ADD CONSTRAINT template_project_items_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.template_projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_status_events
    ADD CONSTRAINT whatsapp_status_events_campaign_contact_id_fkey FOREIGN KEY (campaign_contact_id) REFERENCES public.campaign_contacts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.whatsapp_status_events
    ADD CONSTRAINT whatsapp_status_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.workflow_builder_logs
    ADD CONSTRAINT workflow_builder_logs_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_builder_executions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_conversations
    ADD CONSTRAINT workflow_conversations_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_run_logs
    ADD CONSTRAINT workflow_run_logs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.workflow_versions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflow_versions
    ADD CONSTRAINT workflow_versions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_active_version_fk FOREIGN KEY (active_version_id) REFERENCES public.workflow_versions(id) ON DELETE SET NULL;

-- =============================================================================
-- SECURITY: Protege TODAS as funções SECURITY DEFINER
-- =============================================================================
-- App é single-tenant e usa service_role (bypassa RLS) em todas as API routes.
-- REVOKE de anon/PUBLIC impede que a publishable key seja usada para chamar
-- funções que rodam com privilégio de postgres via PostgREST /rpc/.
-- =============================================================================

-- Funções de contadores/inbox
REVOKE ALL ON FUNCTION public.increment_conversation_counters(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_conversation_counters(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_conversation_counters(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_conversation_counters(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_unread_count(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_unread_count(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.decrement_unread_count(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_unread_count(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.reset_unread_count(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_unread_count(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reset_unread_count(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_unread_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_inbound_message(text, text, text, text, text, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_agent_config(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_agent_config(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_agent_config(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_config(uuid) TO service_role;

-- Funções de stats/dashboard
REVOKE ALL ON FUNCTION public.get_campaign_contact_stats(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaign_contact_stats(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_campaign_contact_stats(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_contact_stats(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_campaigns_with_all_tags(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaigns_with_all_tags(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_campaigns_with_all_tags(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaigns_with_all_tags(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_contact_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contact_stats() FROM anon;
REVOKE ALL ON FUNCTION public.get_contact_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_stats() TO service_role;

REVOKE ALL ON FUNCTION public.get_contact_tags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contact_tags() FROM anon;
REVOKE ALL ON FUNCTION public.get_contact_tags() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_tags() TO service_role;

CREATE OR REPLACE FUNCTION public.bulk_update_contact_tags(
    p_ids text[],
    p_tags_to_add text[],
    p_tags_to_remove text[]
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE contacts c
    SET tags = (
        SELECT COALESCE(jsonb_agg(elem ORDER BY elem), '[]'::jsonb)
        FROM (
            SELECT DISTINCT elem
            FROM (
                -- Extrai tags existentes como texto plano (achata nested arrays)
                SELECT CASE
                    WHEN jsonb_typeof(arr_elem) = 'array'
                    THEN sub_text
                    ELSE arr_elem #>> '{}'
                END AS elem
                FROM jsonb_array_elements(COALESCE(c.tags, '[]'::jsonb)) AS arr_elem
                LEFT JOIN LATERAL jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(arr_elem) = 'array' THEN arr_elem ELSE '[]'::jsonb END
                ) AS sub_text ON true
                WHERE CASE
                    WHEN jsonb_typeof(arr_elem) = 'array' THEN sub_text IS NOT NULL
                    ELSE true
                END
                UNION ALL
                -- Adiciona novas tags
                SELECT t AS elem
                FROM UNNEST(COALESCE(p_tags_to_add, ARRAY[]::text[])) AS t
            ) all_tags
            WHERE elem IS NOT NULL
              AND length(trim(elem)) > 0
              AND NOT (elem = ANY(COALESCE(p_tags_to_remove, ARRAY[]::text[])))
        ) unique_tags
    )
    WHERE c.id = ANY(p_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) TO service_role;

-- Função RPC para deletar múltiplos contatos em lote.
-- Substitui .delete().in('id', ids) que gerava 414 por URLs longas.
CREATE OR REPLACE FUNCTION public.bulk_delete_contacts(
    p_ids text[]
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_count integer;
BEGIN
    DELETE FROM contacts WHERE id = ANY(p_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_delete_contacts(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_delete_contacts(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_delete_contacts(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_contacts(text[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM anon;
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO service_role;

-- Funções de campaign stats
REVOKE ALL ON FUNCTION public.increment_campaign_stat(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_campaign_stat(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.increment_campaign_stat(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_campaign_stat(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.increment_campaign_stat(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_campaign_stat(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.increment_campaign_stat(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_campaign_stat(uuid, text, integer) TO service_role;

-- Funções de AI/embeddings
REVOKE ALL ON FUNCTION public.search_embeddings(extensions.vector, double precision, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_embeddings(extensions.vector, double precision, integer, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.search_embeddings(extensions.vector, double precision, integer, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_embeddings(extensions.vector, double precision, integer, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.search_embeddings(extensions.vector, uuid, integer, double precision, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_embeddings(extensions.vector, uuid, integer, double precision, integer) FROM anon;
REVOKE ALL ON FUNCTION public.search_embeddings(extensions.vector, uuid, integer, double precision, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_embeddings(extensions.vector, uuid, integer, double precision, integer) TO service_role;

-- Trigger functions
REVOKE ALL ON FUNCTION public.ensure_default_ai_agent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_ai_agent() FROM anon;
REVOKE ALL ON FUNCTION public.ensure_default_ai_agent() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_ai_agent() TO service_role;

REVOKE ALL ON FUNCTION public.update_attendant_tokens_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_attendant_tokens_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.update_attendant_tokens_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_attendant_tokens_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.update_campaign_dispatch_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_campaign_dispatch_metrics() FROM anon;
REVOKE ALL ON FUNCTION public.update_campaign_dispatch_metrics() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_campaign_dispatch_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.update_campaign_folders_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_campaign_folders_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.update_campaign_folders_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_campaign_folders_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

-- analyze_table
REVOKE ALL ON FUNCTION public.analyze_table(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.analyze_table(text) FROM anon;
REVOKE ALL ON FUNCTION public.analyze_table(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_table(text) TO service_role;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- RLS habilitado em TODAS as tabelas. service_role bypassa automaticamente.
-- 7 tabelas com policy SELECT para anon (frontend Realtime).
-- =============================================================================

ALTER TABLE public.account_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendant_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_batch_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_run_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_trace_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_conversation_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_builder_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_builder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- Policies SELECT para Realtime (anon pode ler)
CREATE POLICY "anon_select_campaigns" ON public.campaigns FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_contacts" ON public.contacts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_templates" ON public.templates FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_flows" ON public.flows FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_inbox_conversations" ON public.inbox_conversations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_inbox_messages" ON public.inbox_messages FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select_account_alerts" ON public.account_alerts FOR SELECT TO anon USING (true);

-- =============================================================================
-- SECURITY HARDENING: Table-level grants
-- =============================================================================
-- REVOKE ALL nas 31 tabelas sem policies + view
-- Nas 7 tabelas com policy, manter apenas SELECT
-- =============================================================================

REVOKE ALL ON TABLE public.ai_agents FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_agent_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_embeddings FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_knowledge_files FROM anon, authenticated;
REVOKE ALL ON TABLE public.attendant_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.settings FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_batch_metrics FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_contacts FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_folders FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_run_metrics FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_tag_assignments FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_tags FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_trace_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.custom_field_definitions FROM anon, authenticated;
REVOKE ALL ON TABLE public.flow_submissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.inbox_conversation_labels FROM anon, authenticated;
REVOKE ALL ON TABLE public.inbox_labels FROM anon, authenticated;
REVOKE ALL ON TABLE public.inbox_quick_replies FROM anon, authenticated;
REVOKE ALL ON TABLE public.lead_forms FROM anon, authenticated;
REVOKE ALL ON TABLE public.phone_suppressions FROM anon, authenticated;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.template_project_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.template_projects FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_status_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_builder_executions FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_builder_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_conversations FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_run_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflow_versions FROM anon, authenticated;
REVOKE ALL ON TABLE public.workflows FROM anon, authenticated;
REVOKE ALL ON TABLE public.campaign_stats_summary FROM anon, authenticated;

-- 7 tabelas com SELECT policy: remover INSERT/UPDATE/DELETE
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.account_alerts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.campaigns FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.contacts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.flows FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inbox_conversations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inbox_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.templates FROM anon, authenticated;

-- Sequences: revogar de anon/authenticated
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Default privileges: previne auto-grant em novos objetos
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;

-- =============================================================================
-- REALTIME
-- Habilita Supabase Realtime para tabelas que precisam de updates em tempo real
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE templates;
ALTER PUBLICATION supabase_realtime ADD TABLE flows;
ALTER PUBLICATION supabase_realtime ADD TABLE account_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE template_project_items;
ALTER PUBLICATION supabase_realtime ADD TABLE template_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE flow_submissions;

-- =============================================================================
-- REPLICA IDENTITY FULL
-- Permite filtros Realtime por qualquer coluna (não apenas PK)
-- =============================================================================

ALTER TABLE campaign_contacts REPLICA IDENTITY FULL;
ALTER TABLE inbox_messages REPLICA IDENTITY FULL;
ALTER TABLE template_project_items REPLICA IDENTITY FULL;
ALTER TABLE flow_submissions REPLICA IDENTITY FULL;

-- =============================================================================
-- GRANTS para role anon (JOINs em Server Actions)
-- GRANT SELECT satisfaz PostgREST para embedded resources,
-- mas RLS USING(false) bloqueia leitura direta via REST API.
-- =============================================================================

GRANT SELECT ON campaign_contacts TO anon;
GRANT SELECT ON inbox_conversation_labels TO anon;
GRANT SELECT ON inbox_labels TO anon;
GRANT SELECT ON ai_agents TO anon;
GRANT SELECT ON campaign_folders TO anon;
GRANT SELECT ON campaign_tag_assignments TO anon;
GRANT SELECT ON campaign_tags TO anon;
GRANT SELECT ON template_project_items TO anon;
GRANT SELECT ON template_projects TO anon;
GRANT SELECT ON flow_submissions TO anon;

-- =============================================================================
-- RLS Policies para bloquear leitura direta do anon via REST API
-- O Realtime recebe eventos via WAL (server-side, não passa por RLS)
-- =============================================================================

CREATE POLICY deny_anon_select ON campaign_contacts FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON inbox_conversation_labels FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON inbox_labels FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON ai_agents FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON campaign_folders FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON campaign_tag_assignments FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON campaign_tags FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON template_project_items FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON template_projects FOR SELECT TO anon USING (false);
CREATE POLICY deny_anon_select ON flow_submissions FOR SELECT TO anon USING (false);
