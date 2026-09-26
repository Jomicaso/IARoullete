CREATE TABLE public.roulette_monitor_lock (
  id TEXT PRIMARY KEY,
  owner UUID,
  lease_until TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
);

GRANT ALL ON public.roulette_monitor_lock TO service_role;
ALTER TABLE public.roulette_monitor_lock ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_alert_outbox (
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

CREATE INDEX telegram_alert_outbox_pending_idx
  ON public.telegram_alert_outbox (next_attempt_at, created_at)
  WHERE delivered_at IS NULL;

GRANT ALL ON public.telegram_alert_outbox TO service_role;
ALTER TABLE public.telegram_alert_outbox ENABLE ROW LEVEL SECURITY;

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