--- Migration: Adiciona RPC get_contact_tag_counts()
--- Retorna todas as tags com contagem de contatos, agregado no SQL.
--- Usa mesma sanitização de get_contact_tags() (jsonb_array_elements_text + filtros).

CREATE OR REPLACE FUNCTION public.get_contact_tag_counts()
RETURNS TABLE(tag text, count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT t.tag, COUNT(*) AS count
    FROM contacts c,
         jsonb_array_elements_text(c.tags) AS t(tag)
    WHERE c.tags IS NOT NULL
      AND jsonb_array_length(c.tags) > 0
      AND length(trim(t.tag)) > 0
      AND t.tag NOT LIKE '[%]'
    GROUP BY t.tag
    ORDER BY count DESC, t.tag ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_contact_tag_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contact_tag_counts() FROM anon;
REVOKE ALL ON FUNCTION public.get_contact_tag_counts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_tag_counts() TO service_role;
