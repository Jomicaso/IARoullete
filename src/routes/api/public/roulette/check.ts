import { createFileRoute } from "@tanstack/react-router";
import {
  affiliateLinks,
  currentStreak,
  fetchSpins,
  MAX_GALES,
  RouletteRateLimitError,
  TelegramRateLimitError,
  telegramCall,
  type Spin,
} from "@/lib/roulette";
import {
  analyzeStrategy,
  strategyEntryLabel,
  strategyWins,
  type StrategyMarket,
} from "@/lib/strategy";

const STATE_KEY = "ia_roulette_state";

type State = {
  last2AlertedSpinId: string | null;
  last3AlertedSpinId: string | null;
  lastProcessedSpinId: string | null;
  // active bet
  betMarket: StrategyMarket;
  betSelection: string;
  betEntryLabel: string;
  gale: number; // 0 = entrada, 1..3 = gales
  betActive: boolean;
  skipNextEntryAfterLoss: boolean;
  // daily stats
  day: string;
  wins: number;
  losses: number;
  winStreak: number;
};

const defaultState: State = {
  last2AlertedSpinId: null,
  last3AlertedSpinId: null,
  lastProcessedSpinId: null,
  betMarket: "columns",
  betSelection: "exclude:1",
  betEntryLabel: "2ª e 3ª colunas + zero",
  gale: 0,
  betActive: false,
  skipNextEntryAfterLoss: false,
  day: "",
  wins: 0,
  losses: 0,
  winStreak: 0,
};

function lisbon() {
  const now = new Date();
  const hora = now.toLocaleTimeString("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
  return { hora, day };
}

async function loadState(): Promise<State> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("alert_state")
    .select("value")
    .eq("id", STATE_KEY)
    .maybeSingle();
  if (!data?.value) return { ...defaultState };
  try {
    const saved = JSON.parse(data.value) as Partial<State> & { betColumn?: number };
    const state = { ...defaultState, ...saved } as State;
    if (!saved.betMarket && saved.betColumn && saved.betColumn >= 1 && saved.betColumn <= 3) {
      state.betMarket = "columns";
      state.betSelection = `exclude:${saved.betColumn}`;
      state.betEntryLabel = strategyEntryLabel(state.betMarket, state.betSelection);
    }
    return state;
  } catch {
    return { ...defaultState };
  }
}

async function saveState(state: State) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("alert_state")
    .upsert({ id: STATE_KEY, value: JSON.stringify(state), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Failed to save roulette state: ${error.message}`);
}

async function getActiveSubscribers() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("telegram_subscribers")
    .select("chat_id")
    .eq("active", true);
  if (error) throw new Error(`Failed to load Telegram subscribers: ${error.message}`);
  return (data ?? []).map((s) => s.chat_id as number);
}

async function broadcast(eventKey: string, text: string) {
  const chats = await getActiveSubscribers();
  if (chats.length === 0) throw new Error("No active Telegram subscribers");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("telegram_alert_outbox").upsert(
    chats.map((chat_id) => ({ event_key: eventKey, chat_id, message: text })),
    { onConflict: "event_key,chat_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Failed to queue Telegram alert: ${error.message}`);
}

async function flushTelegramOutbox(limit = 6) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("telegram_alert_outbox")
    .select("event_key,chat_id,message,attempts")
    .is("delivered_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load queued Telegram alerts: ${error.message}`);

  for (const item of data ?? []) {
    try {
      await telegramCall("sendMessage", {
        chat_id: item.chat_id,
        text: item.message,
        parse_mode: "HTML",
      });
      await supabaseAdmin
        .from("telegram_alert_outbox")
        .update({
          delivered_at: new Date().toISOString(),
          attempts: item.attempts + 1,
          last_error: null,
        })
        .eq("event_key", item.event_key)
        .eq("chat_id", item.chat_id);
      console.info(`telegram alert delivered event=${item.event_key} chat=${item.chat_id}`);
    } catch (err) {
      const retrySeconds = err instanceof TelegramRateLimitError ? err.retryAfterSeconds : 30;
      await supabaseAdmin
        .from("telegram_alert_outbox")
        .update({
          attempts: item.attempts + 1,
          last_error: err instanceof Error ? err.message : String(err),
          next_attempt_at: new Date(Date.now() + retrySeconds * 1_000).toISOString(),
        })
        .eq("event_key", item.event_key)
        .eq("chat_id", item.chat_id);
      console.error(
        `telegram delivery deferred event=${item.event_key} retry=${retrySeconds}s`,
        err,
      );
      if (err instanceof TelegramRateLimitError) break;
    }
  }
}

function scoreboard(state: State) {
  const total = state.wins + state.losses;
  const rate = total > 0 ? ((state.wins / total) * 100).toFixed(2) : "0.00";
  return (
    `📄 <b>PLACAR DO DIA</b>\n` +
    `🟢: ${state.wins} 🔴: ${state.losses}\n` +
    `📊 <b>GANHOS SEGUIDOS: ${state.winStreak}</b>\n` +
    `🎯 <b>TAXA DE ASSERTIVIDADE: ${rate}%</b>` +
    affiliateLinks()
  );
}

function analyzingMessage() {
  const { hora } = lisbon();
  return (
    `🕵️ <b>ANALISANDO O PRÓXIMO SINAL, FIQUE ATENTO</b> 🧠💸\n` + `🕒 ${hora}` + affiliateLinks()
  );
}

async function processSpin(
  spins: Spin[],
  index: number,
  state: State,
  deliver: boolean,
): Promise<string> {
  const spin = spins[index];
  if (!spin) return "idle";
  const { hora } = lisbon();

  // ---- Active bet resolution ----
  if (state.betActive) {
    state.lastProcessedSpinId = spin.id;
    const won = strategyWins(spin, state.betMarket, state.betSelection);

    if (won) {
      state.wins += 1;
      state.winStreak += 1;
      state.betActive = false;
      state.gale = 0;
      state.last2AlertedSpinId = spin.id;
      state.last3AlertedSpinId = spin.id;
      console.info(`roulette signal WIN number=${spin.number}`);
      if (deliver)
        await broadcast(
          `${spin.id}:win`,
          `✅✅✅ <b>WIN (${spin.number})</b> ✅✅✅` + affiliateLinks(),
        );
      if (deliver) await broadcast(`${spin.id}:scoreboard`, scoreboard(state));
      if (deliver) await broadcast(`${spin.id}:analyzing`, analyzingMessage());
      await saveState(state);
      return "win";
    }

    if (state.gale < MAX_GALES) {
      state.gale += 1;
      const label =
        state.gale === MAX_GALES
          ? `PREPARE O ${MAX_GALES} GALE — ÚLTIMO`
          : `PREPARE O ${state.gale} GALE`;
      console.info(`roulette signal gale=${state.gale} number=${spin.number}`);
      if (deliver)
        await broadcast(
          `${spin.id}:gale:${state.gale}`,
          `⚠️ <b>${label}</b>\n` +
            `🎡 <b>ENTRAR: ${state.betEntryLabel.toUpperCase()}</b>\n` +
            `🎯 <b>COBRIR O ZERO (🟢)</b>\n` +
            `🕒 ${hora}` +
            affiliateLinks(),
        );
      await saveState(state);
      return `gale_${state.gale}`;
    }

    state.losses += 1;
    state.winStreak = 0;
    state.betActive = false;
    state.gale = 0;
    state.skipNextEntryAfterLoss = false;
    state.last2AlertedSpinId = spin.id;
    state.last3AlertedSpinId = spin.id;
    console.info(`roulette signal LOSS number=${spin.number}`);
    if (deliver)
      await broadcast(
        `${spin.id}:loss`,
        `🔴🔴🔴 <b>LOSS (${spin.number})</b> 🔴🔴🔴\n` +
          `A IA vai recalcular a estratégia antes do próximo sinal.` +
          affiliateLinks(),
      );
    if (deliver) await broadcast(`${spin.id}:scoreboard`, scoreboard(state));
    if (deliver) await broadcast(`${spin.id}:analyzing`, analyzingMessage());
    await saveState(state);
    return "loss";
  }

  // ---- Sem sinal ativo: comparar padroes e preparar a proxima estrategia ----
  if (spin.id !== state.last3AlertedSpinId) {
    const strategy = analyzeStrategy(spins.slice(index));
    state.last3AlertedSpinId = spin.id;
    state.last2AlertedSpinId = spin.id;
    state.lastProcessedSpinId = spin.id;

    if (!strategy) {
      await saveState(state);
      return "collecting_history";
    }

    console.info(
      `ia strategy market=${strategy.market} selection=${strategy.selection} strength=${strategy.strength}`,
    );
    if (deliver)
      await broadcast(
        `${spin.id}:strategy`,
        `🧠 <b>ESTRATÉGIA IA — AO VIVO</b>\n` +
          `🎯 Mercado: <b>${strategy.marketLabel}</b>\n` +
          `🎡 <b>ENTRAR: ${strategy.entryLabel.toUpperCase()}</b>\n` +
          `🧩 Leitura: ${strategy.pattern}\n` +
          `📈 Cobertura recente: ${strategy.recentHitRate}% | histórica: ${strategy.historicalHitRate}%\n` +
          `📐 Probabilidade-base: ${strategy.baselineRate}%\n` +
          `📊 Força do padrão: ${strategy.strength}%\n` +
          `🕒 ${hora}` +
          affiliateLinks(),
      );
    state.betActive = true;
    state.betMarket = strategy.market;
    state.betSelection = strategy.selection;
    state.betEntryLabel = strategy.entryLabel;
    state.gale = 0;
    await saveState(state);
    return "strategy_ready";
  }

  state.lastProcessedSpinId = spin.id;
  await saveState(state);
  return "idle";
}

async function runOnce(): Promise<{ status: string; count: number }> {
  let spins;
  try {
    spins = await fetchSpins();
  } catch (err) {
    console.error("fetchSpins failed", err);
    throw err;
  }
  if (spins.length === 0) {
    return { status: "no_data", count: 0 };
  }

  const head = spins[0];
  if (!head) return { status: "no_data", count: 0 };
  const streak = currentStreak(spins);
  const state = await loadState();
  const { day } = lisbon();

  if (state.day !== day) {
    state.day = day;
    state.wins = 0;
    state.losses = 0;
    state.winStreak = 0;
    state.skipNextEntryAfterLoss = false;
  }

  if (!state.lastProcessedSpinId) {
    state.lastProcessedSpinId = head.id;
    await saveState(state);
    return { status: "init", count: streak.count };
  }

  const previousIndex = spins.findIndex((spin) => spin.id === state.lastProcessedSpinId);
  if (previousIndex < 0) {
    console.warn("roulette state fell outside feed history; resynchronizing at latest spin");
    state.lastProcessedSpinId = head.id;
    await saveState(state);
    return { status: "resynced", count: streak.count };
  }

  if (previousIndex === 0) {
    return {
      status: state.betActive ? "bet_wait" : "idle",
      count: state.betActive ? state.gale : streak.count,
    };
  }

  const statuses: string[] = [];
  for (let index = previousIndex - 1; index >= 0; index -= 1) {
    const spin = spins[index];
    const settledAt = spin?.settledAt ? new Date(spin.settledAt).getTime() : Number.NaN;
    const age = Date.now() - settledAt;
    const deliver = Number.isFinite(settledAt) && age >= 0 && age <= 30_000;
    statuses.push(await processSpin(spins, index, state, deliver));
  }
  console.info(`roulette processed ${statuses.length} new spin(s): ${statuses.join(",")}`);
  return { status: statuses.at(-1) ?? "idle", count: streak.count };
}

const MONITOR_WINDOW_MS = 50_000;
const POLL_INTERVAL_MS = 12_000;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function runContinuous(): Promise<{
  checks: number;
  statuses: Record<string, number>;
  count: number;
}> {
  const deadline = Date.now() + MONITOR_WINDOW_MS;
  const statuses: Record<string, number> = {};
  let checks = 0;
  let count = 0;

  while (Date.now() < deadline) {
    try {
      const result = await runOnce();
      checks += 1;
      count = result.count;
      statuses[result.status] = (statuses[result.status] ?? 0) + 1;
      await flushTelegramOutbox();
    } catch (err) {
      console.error("continuous roulette check failed", err);
      statuses["error"] = (statuses["error"] ?? 0) + 1;
      if (err instanceof RouletteRateLimitError) break;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await wait(Math.min(POLL_INTERVAL_MS, remaining));
  }

  return { checks, statuses, count };
}

async function claimMonitorLock(owner: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("claim_roulette_monitor_lock", {
    _owner: owner,
    _lease_seconds: 55,
  });
  if (error) throw new Error(`Failed to claim roulette monitor lock: ${error.message}`);
  return data === true;
}

async function releaseMonitorLock(owner: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("release_roulette_monitor_lock", { _owner: owner });
  if (error) console.error("Failed to release roulette monitor lock", error);
}

async function executeMonitorCheck() {
  const owner = crypto.randomUUID();
  let lockClaimed = false;
  try {
    if (!(await claimMonitorLock(owner))) {
      return Response.json({ ok: true, status: "skipped_locked" });
    }
    lockClaimed = true;
    await flushTelegramOutbox();
    const result = await runContinuous();
    await flushTelegramOutbox();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("check failed", err);
    const message = err instanceof Error ? err.message : String(err);
    const reason = message.includes("Missing Supabase environment variable")
      ? "missing_supabase_environment"
      : message.includes("claim roulette monitor lock")
        ? "supabase_monitor_not_ready"
        : message.includes("queued Telegram alerts")
          ? "telegram_outbox_not_ready"
          : "monitor_runtime_error";
    return Response.json({ ok: false, error: "roulette check failed", reason }, { status: 500 });
  } finally {
    if (lockClaimed) await releaseMonitorLock(owner);
  }
}

export const Route = createFileRoute("/api/public/roulette/check")({
  server: {
    handlers: {
      POST: executeMonitorCheck,
      GET: executeMonitorCheck,
    },
  },
});
