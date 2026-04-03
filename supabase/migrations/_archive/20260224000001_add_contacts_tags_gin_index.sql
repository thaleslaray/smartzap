-- Migration: Adicionar índice GIN na coluna tags de contacts
-- Necessário para performance do operador @> (contains) e && (overlap)
-- usados no filtro de tags do segment-count e outros filtros de tag.
-- Sem este índice, cada query de segment-count faz full scan na tabela contacts.

CREATE INDEX IF NOT EXISTS idx_contacts_tags
  ON public.contacts USING GIN (tags);
