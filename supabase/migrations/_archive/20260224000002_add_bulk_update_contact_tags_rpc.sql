-- Função RPC para atualizar tags de múltiplos contatos em lote.
-- Substitui a abordagem SELECT + upsert (que gerava 414 por URLs longas com UUIDs).
-- IDs são passados no body do POST → sem limite de URL.
-- UPDATE direto em SQL → sem violação de NOT NULL constraints.
-- p_ids é text[] — contacts.id é TEXT com prefixo 'ct_', não UUID.
-- Comparação text = text nativa, sem cast.
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
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM (
            SELECT DISTINCT elem
            FROM (
                -- Tags atuais do contato
                SELECT elem
                FROM jsonb_array_elements_text(COALESCE(c.tags, '[]'::jsonb)) AS elem
                UNION ALL
                -- Tags a adicionar
                SELECT t AS elem
                FROM UNNEST(p_tags_to_add) AS t
            ) all_tags
            -- Remove as tags marcadas para remoção
            WHERE NOT (elem = ANY(p_tags_to_remove))
            ORDER BY elem
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
