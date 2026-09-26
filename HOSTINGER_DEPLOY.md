# Deploy da IARoullete na Hostinger

Cria uma nova aplicacao Web Node.js ligada ao repositorio:

```text
https://github.com/Jomicaso/IARoullete.git
```

## Configuracao

- Install command: `npm install`
- Build command: `npm run build`
- Start command: `npm run start`
- Entry file: `.output/server/index.mjs`
- Branch: `main`

## Supabase

Usa o segundo projeto Supabase, separado do RouletteGaleXxx. Isto impede que os dois
bots partilhem subscritores, estados, estatisticas e mensagens pendentes.

No SQL Editor desse projeto, abre e executa o ficheiro `SUPABASE_SETUP.sql`.

## Variaveis de ambiente

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
```

Usa o token do novo bot. Nao reutilizes o token do RouletteGaleXxx.

## Webhook

Depois do deploy, configura:

```text
https://api.telegram.org/botTELEGRAM_BOT_TOKEN/setWebhook?url=https%3A%2F%2FTEU-DOMINIO%2Fapi%2Fpublic%2Ftelegram%2Fwebhook&secret_token=TELEGRAM_WEBHOOK_SECRET
```

## Cron

No SQL Editor do segundo Supabase:

```sql
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
    url := 'https://TEU-DOMINIO/api/public/roulette/check?run=' ||
      extract(epoch from clock_timestamp())::bigint::text,
    headers := '{"Cache-Control":"no-cache"}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $cron$
);
```
