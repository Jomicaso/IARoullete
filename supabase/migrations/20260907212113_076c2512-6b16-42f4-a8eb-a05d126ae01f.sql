CREATE TABLE public.telegram_subscribers (
  chat_id BIGINT PRIMARY KEY,
  title TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_subscribers TO service_role;
ALTER TABLE public.telegram_subscribers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.alert_state (
  id TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.alert_state TO service_role;
ALTER TABLE public.alert_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_updates (
  update_id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;