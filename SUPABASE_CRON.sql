-- Executar uma vez no SQL Editor do projeto Supabase usado pelo IARoullete.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('ia-roulette-watch');
EXCEPTION
  WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'ia-roulette-watch',
  '* * * * *',
  $cron$
  SELECT net.http_get(
    url := 'https://lightgrey-koala-276513.hostingersite.com/api/public/roulette/check?run=' ||
      extract(epoch from clock_timestamp())::bigint::text,
    headers := '{"Cache-Control":"no-cache"}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $cron$
);
