-- Executar uma vez no SQL Editor do projeto Supabase exclusivo da IARoullete.

CREATE TABLE IF NOT EXISTS public.telegram_subscribers (
  chat_id BIGINT PRIMARY KEY,
  title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.alert_state (
  id TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telegram_updates (
  update_id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.simulation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day DATE NOT NULL,
  session TEXT NOT NULL,
  start_bank NUMERIC NOT NULL DEFAULT 50,
  end_bank NUMERIC NOT NULL DEFAULT 50,
  entries INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  total_staked NUMERIC NOT NULL DEFAULT 0,
  total_won NUMERIC NOT NULL DEFAULT 0,
  total_lost NUMERIC NOT NULL DEFAULT 0,
  insufficient BOOLEAN NOT NULL DEFAULT false,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day, session)
);

CREATE TABLE IF NOT EXISTS public.roulette_monitor_lock (
  id TEXT PRIMARY KEY,
  owner UUID,
  lease_until TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);

CREATE TABLE IF NOT EXISTS public.telegram_alert_outbox (
  event_key TEXT NOT NULL,
  chat_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  PRIMARY KEY (event_key, chat_id)
);

CREATE INDEX IF NOT EXISTS telegram_alert_outbox_pending_idx
  ON public.telegram_alert_outbox (next_attempt_at, created_at)
  WHERE delivered_at IS NULL;

GRANT ALL ON public.telegram_subscribers TO service_role;
GRANT ALL ON public.alert_state TO service_role;
GRANT ALL ON public.telegram_updates TO service_role;
GRANT ALL ON public.simulation_sessions TO service_role;
GRANT ALL ON public.roulette_monitor_lock TO service_role;
GRANT ALL ON public.telegram_alert_outbox TO service_role;

ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roulette_monitor_lock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_alert_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_simulation_sessions_updated_at
  ON public.simulation_sessions;
CREATE TRIGGER update_simulation_sessions_updated_at
BEFORE UPDATE ON public.simulation_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_roulette_monitor_lock(
  _owner UUID,
  _lease_seconds INTEGER DEFAULT 55
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed BOOLEAN := false;
BEGIN
  INSERT INTO public.roulette_monitor_lock (id, owner, lease_until)
  VALUES ('main', _owner, now() + make_interval(secs => _lease_seconds))
  ON CONFLICT (id) DO NOTHING;

  IF FOUND THEN
    RETURN true;
  END IF;

  UPDATE public.roulette_monitor_lock
  SET owner = _owner,
      lease_until = now() + make_interval(secs => _lease_seconds)
  WHERE id = 'main'
    AND lease_until <= now();

  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_roulette_monitor_lock(_owner UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.roulette_monitor_lock
  SET lease_until = now()
  WHERE id = 'main' AND owner = _owner;
$$;

REVOKE ALL ON FUNCTION public.claim_roulette_monitor_lock(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_roulette_monitor_lock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_roulette_monitor_lock(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_roulette_monitor_lock(UUID) TO service_role;
