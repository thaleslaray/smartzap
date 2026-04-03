-- Migration: Add allow_reactions and allow_quotes to ai_agents
-- Purpose: Controla se o agente pode usar reações e citações em mensagens WhatsApp
--
-- IMPORTANTE: Esta migration foi temporariamente consolidada no init.sql e depois
-- restaurada como migration incremental para garantir compatibilidade com instâncias
-- criadas antes de 04/02/2026. O uso de IF NOT EXISTS garante idempotência.

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS allow_reactions BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS allow_quotes BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN ai_agents.allow_reactions IS 'Quando true, o agente pode enviar reações (emojis) nas mensagens';
COMMENT ON COLUMN ai_agents.allow_quotes IS 'Quando true, o agente pode citar mensagens anteriores ao responder';
