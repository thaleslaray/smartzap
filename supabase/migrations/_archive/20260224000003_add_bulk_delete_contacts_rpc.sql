-- Função RPC para deletar múltiplos contatos em lote.
-- Substitui .delete().in('id', ids) que gerava 414 por URLs longas.
-- IDs são passados no body do POST → sem limite de URL.
-- contacts.id é TEXT com prefixo 'ct_' — sem cast, comparação text = text nativa.
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
