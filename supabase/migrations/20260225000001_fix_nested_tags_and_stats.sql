-- Migration: Corrige tags corrompidas (arrays aninhados) e garante RPCs corretos.
-- Problema: Algumas operações de escrita causaram tags como [["tag"]] em vez de ["tag"].
-- Esta migration:
--   1. Achata todas as tags aninhadas na tabela contacts
--   2. Recria get_contact_tags() com sanitização
--   3. Recria get_contact_stats() para garantir contagem correta
--   4. Melhora bulk_update_contact_tags() para prevenir futura corrupção

-- ============================================================================
-- PASSO 1: Corrigir dados corrompidos — achatar arrays aninhados
-- ============================================================================

-- Primeiro, identifica contatos com tags aninhadas (onde o primeiro elemento é um array)
-- e os corrige para um array plano de strings.
DO $$
DECLARE
    v_fixed integer := 0;
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT id, tags
        FROM contacts
        WHERE tags IS NOT NULL
          AND jsonb_array_length(tags) > 0
          AND jsonb_typeof(tags -> 0) = 'array'
    LOOP
        -- Achata recursivamente: extrai texto de todos os níveis de aninhamento
        UPDATE contacts
        SET tags = (
            SELECT COALESCE(jsonb_agg(DISTINCT leaf ORDER BY leaf), '[]'::jsonb)
            FROM (
                WITH RECURSIVE unwrap AS (
                    SELECT elem
                    FROM jsonb_array_elements(v_rec.tags) AS elem
                    UNION ALL
                    SELECT sub_elem
                    FROM unwrap, jsonb_array_elements(unwrap.elem) AS sub_elem
                    WHERE jsonb_typeof(unwrap.elem) = 'array'
                )
                SELECT elem #>> '{}' AS leaf
                FROM unwrap
                WHERE jsonb_typeof(elem) != 'array'
                  AND (elem #>> '{}') IS NOT NULL
                  AND length(trim(elem #>> '{}')) > 0
            ) flat_tags
        )
        WHERE id = v_rec.id;

        v_fixed := v_fixed + 1;
    END LOOP;

    RAISE NOTICE 'Tags corrigidas em % contatos', v_fixed;
END;
$$;

-- Step 1b: Fix string-encoded JSON arrays (e.g., '["vip"]' stored as text inside the array)
UPDATE contacts
SET tags = (
    SELECT COALESCE(jsonb_agg(flat_val), '[]'::jsonb)
    FROM (
        SELECT DISTINCT expanded.flat_val
        FROM jsonb_array_elements(tags) AS elem
        LEFT JOIN LATERAL (
            SELECT sub_elem AS flat_val
            FROM jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(elem) = 'string'
                         AND (elem #>> '{}') LIKE '[%'
                         AND (elem #>> '{}') LIKE '%]'
                    THEN ((elem #>> '{}')::jsonb)
                    ELSE jsonb_build_array(elem)
                END
            ) AS sub_elem
        ) expanded ON true
        WHERE expanded.flat_val IS NOT NULL
          AND jsonb_typeof(expanded.flat_val) = 'string'
          AND length(trim(expanded.flat_val #>> '{}')) > 0
    ) unique_vals
)
WHERE tags IS NOT NULL
  AND jsonb_array_length(tags) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(tags) AS elem
    WHERE jsonb_typeof(elem) = 'string'
      AND (elem #>> '{}') LIKE '["%]'
  );

-- ============================================================================
-- PASSO 2: Recriar get_contact_tags() com sanitização
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_tags() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
DECLARE
    result JSON;
BEGIN
    -- Extrai tags como texto e filtra vazios.
    -- jsonb_array_elements_text achata o primeiro nível automaticamente.
    SELECT COALESCE(json_agg(DISTINCT tag ORDER BY tag), '[]'::json) INTO result
    FROM contacts, jsonb_array_elements_text(tags) AS tag
    WHERE tags IS NOT NULL
      AND jsonb_array_length(tags) > 0
      AND length(trim(tag)) > 0
      -- Ignora tags que parecem arrays serializados (proteção defensiva)
      AND tag NOT LIKE '[%]';

    RETURN COALESCE(result, '[]'::json);
END;
$$;

-- ============================================================================
-- PASSO 3: Recriar get_contact_stats() garantindo contagem correta
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_stats() RETURNS json
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

-- ============================================================================
-- PASSO 4: Recriar bulk_update_contact_tags() com proteção anti-nesting
-- ============================================================================

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

-- ============================================================================
-- PERMISSÕES (manter service_role only)
-- ============================================================================

REVOKE ALL ON FUNCTION public.get_contact_tags() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contact_tags() FROM anon;
REVOKE ALL ON FUNCTION public.get_contact_tags() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_tags() TO service_role;

REVOKE ALL ON FUNCTION public.get_contact_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contact_stats() FROM anon;
REVOKE ALL ON FUNCTION public.get_contact_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_stats() TO service_role;

REVOKE ALL ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_contact_tags(text[], text[], text[]) TO service_role;
