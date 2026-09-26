CREATE TABLE public.simulation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  session text NOT NULL,
  start_bank numeric NOT NULL DEFAULT 20,
  end_bank numeric NOT NULL DEFAULT 20,
  entries integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  total_staked numeric NOT NULL DEFAULT 0,
  total_won numeric NOT NULL DEFAULT 0,
  total_lost numeric NOT NULL DEFAULT 0,
  insufficient boolean NOT NULL DEFAULT false,
  closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, session)
);

GRANT ALL ON public.simulation_sessions TO service_role;

ALTER TABLE public.simulation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages simulation sessions"
ON public.simulation_sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_simulation_sessions_updated_at
BEFORE UPDATE ON public.simulation_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();