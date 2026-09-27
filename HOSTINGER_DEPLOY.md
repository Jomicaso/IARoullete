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

Depois do deploy e das variaveis de ambiente estarem aplicadas, faz um pedido PUT:

```text
PUT https://TEU-DOMINIO/api/public/telegram/webhook
```

O servidor usa o token e o segredo guardados na Hostinger e aponta o bot para o
proprio dominio sem expor credenciais no URL.

## Cron

No SQL Editor do segundo Supabase, executa diretamente o ficheiro
`SUPABASE_CRON.sql`. O ficheiro já contém o domínio público correto da aplicação.

Equivale a:

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
    url := 'https://lightgrey-koala-276513.hostingersite.com/api/public/roulette/check?run=' ||
      extract(epoch from clock_timestamp())::bigint::text,
    headers := '{"Cache-Control":"no-cache"}'::jsonb,
    timeout_milliseconds := 55000
  ) AS request_id;
  $cron$
);
```
