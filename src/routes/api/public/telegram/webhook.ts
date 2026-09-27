import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { affiliateLinks, telegramCall } from "@/lib/roulette";

function expectedSecret() {
  const explicitSecret = process.env["TELEGRAM_WEBHOOK_SECRET"];
  if (explicitSecret) return explicitSecret;

  const tokenOrKey = process.env["TELEGRAM_BOT_TOKEN"] ?? process.env["TELEGRAM_API_KEY"];
  if (!tokenOrKey) return null;
  return createHash("sha256").update(`telegram-webhook:${tokenOrKey}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    return `https://${host}`;
  }
  return new URL(request.url).origin;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      GET: async () => {
        const configuration = {
          supabaseUrl: Boolean(process.env["SUPABASE_URL"]),
          supabaseServiceRole: Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]),
          telegramBotToken: Boolean(process.env["TELEGRAM_BOT_TOKEN"]),
          telegramWebhookSecret: Boolean(process.env["TELEGRAM_WEBHOOK_SECRET"]),
        };

        let database: "ready" | "not_configured" | "schema_missing" | "unavailable" =
          "not_configured";
        let databaseReason:
          | "none"
          | "invalid_credentials"
          | "permission_denied"
          | "schema_missing"
          | "request_failed" = "none";
        let monitor: {
          updatedAt: string | null;
          day: string | null;
          greens: number;
          reds: number;
          betActive: boolean;
          gale: number;
          cooldownSpins: number;
          dailyRiskLimitReached: boolean;
        } | null = null;
        if (configuration.supabaseUrl && configuration.supabaseServiceRole) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { error } = await supabaseAdmin
              .from("telegram_subscribers")
              .select("chat_id")
              .limit(1);
            if (!error) {
              database = "ready";
              const { data: monitorState } = await supabaseAdmin
                .from("alert_state")
                .select("updated_at,value")
                .eq("id", "ia_roulette_state")
                .maybeSingle();
              if (monitorState) {
                const value = JSON.parse(monitorState.value) as {
                  day?: string;
                  wins?: number;
                  losses?: number;
                  betActive?: boolean;
                  gale?: number;
                  cooldownSpins?: number;
                };
                const reds = value.losses ?? 0;
                monitor = {
                  updatedAt: monitorState.updated_at,
                  day: value.day ?? null,
                  greens: value.wins ?? 0,
                  reds,
                  betActive: value.betActive ?? false,
                  gale: value.gale ?? 0,
                  cooldownSpins: value.cooldownSpins ?? 0,
                  dailyRiskLimitReached: reds >= 2,
                };
              }
            } else {
              const signature =
                `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
              if (
                error.code === "42P01" ||
                error.code === "PGRST205" ||
                signature.includes("does not exist")
              ) {
                database = "schema_missing";
                databaseReason = "schema_missing";
              } else if (
                signature.includes("invalid api key") ||
                signature.includes("jwt") ||
                signature.includes("unauthorized")
              ) {
                database = "unavailable";
                databaseReason = "invalid_credentials";
              } else if (signature.includes("permission denied")) {
                database = "unavailable";
                databaseReason = "permission_denied";
              } else {
                database = "unavailable";
                databaseReason = "request_failed";
              }
            }
          } catch {
            database = "unavailable";
            databaseReason = "request_failed";
          }
        }

        let telegram: "ready" | "not_configured" | "unavailable" = "not_configured";
        if (configuration.telegramBotToken) {
          try {
            await telegramCall("getMe", {});
            telegram = "ready";
          } catch {
            telegram = "unavailable";
          }
        }

        return Response.json({
          ok: database === "ready" && telegram === "ready",
          configuration,
          database,
          databaseReason,
          monitor,
          telegram,
        });
      },
      PUT: async ({ request }) => {
        const secret = expectedSecret();
        if (!process.env["TELEGRAM_BOT_TOKEN"] || !secret) {
          return Response.json(
            { ok: false, error: "Telegram environment variables are not configured" },
            { status: 500 },
          );
        }

        const webhookUrl = `${publicOrigin(request)}/api/public/telegram/webhook`;
        try {
          await telegramCall("setWebhook", {
            url: webhookUrl,
            secret_token: secret,
            allowed_updates: ["message", "channel_post", "my_chat_member"],
            drop_pending_updates: false,
          });
          const info = await telegramCall("getWebhookInfo", {});

          return Response.json({
            ok: true,
            webhookUrl,
            telegram: info.result,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Telegram error";
          console.error("Telegram webhook setup failed", error);
          return Response.json({ ok: false, error: message }, { status: 502 });
        }
      },
      POST: async ({ request }) => {
        const secret = expectedSecret();
        if (!secret) return new Response("Not configured", { status: 500 });
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        type Chat = { id?: number; title?: string; username?: string; first_name?: string };
        const update = (await request.json()) as {
          update_id?: number;
          message?: { chat?: Chat; text?: string };
          channel_post?: { chat?: Chat; text?: string };
          my_chat_member?: { chat?: Chat; new_chat_member?: { status?: string } };
        };
        const post = update.message ?? update.channel_post;
        const membership = update.my_chat_member;
        const chat = post?.chat ?? membership?.chat;
        const chatId = chat?.id;
        if (typeof update.update_id !== "number" || typeof chatId !== "number") {
          return Response.json({ ok: true, ignored: true });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: dupError } = await supabaseAdmin
          .from("telegram_updates")
          .insert({ update_id: update.update_id });
        if (dupError) return Response.json({ ok: true, duplicate: true });

        const text = (post?.text ?? "").trim().toLowerCase();
        const title = chat?.title ?? chat?.username ?? chat?.first_name ?? null;

        // Bot added to / removed from a channel or group
        if (membership) {
          const status = membership.new_chat_member?.status ?? "";
          const joined = status === "administrator" || status === "member" || status === "creator";
          await supabaseAdmin
            .from("telegram_subscribers")
            .upsert({ chat_id: chatId, title, active: joined });
          if (joined) {
            try {
              await telegramCall("sendMessage", {
                chat_id: chatId,
                text:
                  "IARoullete ligada. O bot compara padrões ao vivo em colunas, dúzias, cores, paridade e baixo/alto, escolhendo a entrada com melhor evidência observada e até 3 gales.\n\n" +
                  "A análise acompanha resultados ao vivo; a taxa de acerto não é garantida." +
                  affiliateLinks(),
                parse_mode: "HTML",
              });
            } catch (err) {
              console.error("welcome failed", err);
            }
          }
          return Response.json({ ok: true });
        }

        if (text.startsWith("/stop")) {
          await supabaseAdmin
            .from("telegram_subscribers")
            .upsert({ chat_id: chatId, title, active: false });
          await telegramCall("sendMessage", {
            chat_id: chatId,
            text: "Avisos desligados. Envie /start para voltar a receber." + affiliateLinks(),
            parse_mode: "HTML",
          });
          return Response.json({ ok: true });
        }

        if (text && !text.startsWith("/start")) {
          return Response.json({ ok: true, ignored: true });
        }

        await supabaseAdmin
          .from("telegram_subscribers")
          .upsert({ chat_id: chatId, title, active: true });
        await telegramCall("sendMessage", {
          chat_id: chatId,
          text:
            "IARoullete ligada! O bot compara padrões ao vivo em colunas, dúzias, cores, paridade e baixo/alto, escolhendo a entrada com melhor evidência observada e até 3 gales.\n\n" +
            "A análise acompanha resultados ao vivo; a taxa de acerto não é garantida.\n\n" +
            "Envie /stop para desligar." +
            affiliateLinks(),
          parse_mode: "HTML",
        });
        return Response.json({ ok: true });
      },
    },
  },
});
