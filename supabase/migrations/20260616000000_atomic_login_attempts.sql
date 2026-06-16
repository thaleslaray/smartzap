-- Incremento atômico de tentativas de login (rate limiting / brute force).
--
-- Antes: lib/user-auth.ts recordFailedAttempt fazia read-then-write em dois passos
-- (getSetting + upsertSetting), abrindo uma race: dois logins concorrentes liam o
-- mesmo valor e escreviam o mesmo +1, permitindo tentativas extras antes do lockout.
--
-- Esta função faz o incremento numa única instrução atômica (INSERT .. ON CONFLICT
-- DO UPDATE), eliminando a janela de race no nível da linha.

CREATE OR REPLACE FUNCTION public.increment_login_attempts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  INSERT INTO public.settings (key, value, updated_at)
  VALUES ('login_attempts', '1', now())
  ON CONFLICT (key) DO UPDATE
    SET value = (COALESCE((NULLIF(public.settings.value, ''))::integer, 0) + 1)::text,
        updated_at = now()
  RETURNING value::integer INTO v_new;

  RETURN v_new;
END;
$$;

-- Apenas o service_role (API routes server-side) pode chamar.
REVOKE ALL ON FUNCTION public.increment_login_attempts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_login_attempts() FROM anon;
REVOKE ALL ON FUNCTION public.increment_login_attempts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_login_attempts() TO service_role;
