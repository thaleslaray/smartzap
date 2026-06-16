-- Dedup de mensagens inbound no nível do banco (companion da guard app-level em
-- lib/inbox/inbox-webhook.ts handleInboundMessage).
--
-- O Meta reenvia o webhook (retry) com o mesmo whatsapp_message_id. O índice do
-- baseline era apenas para performance (não-unique), então duplicatas conseguiam
-- ser inseridas. Esta migration troca por um UNIQUE INDEX parcial, garantindo no
-- DB que o mesmo whatsapp_message_id não seja persistido duas vezes.
--
-- Pré-requisito: não pode haver duplicatas existentes (a criação do UNIQUE INDEX
-- falha se houver). Em instalações novas a tabela está vazia. Para bases já em uso,
-- deduplicar antes, por exemplo:
--   DELETE FROM public.inbox_messages WHERE id IN (
--     SELECT id FROM (
--       SELECT id, row_number() OVER (
--         PARTITION BY whatsapp_message_id ORDER BY created_at ASC, id ASC
--       ) AS rn FROM public.inbox_messages WHERE whatsapp_message_id IS NOT NULL
--     ) t WHERE rn > 1
--   );

DROP INDEX IF EXISTS public.idx_inbox_messages_whatsapp_msg_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_inbox_messages_whatsapp_msg_id
  ON public.inbox_messages (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;
