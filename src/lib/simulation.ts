/**
 * Simulação de banca — funcionalidade PARALELA e independente.
 * Não interfere na deteção de sinais, nas mensagens existentes nem na lógica de Gales.
 * Apenas observa os eventos do bot (entrada, gale, win, loss) e calcula uma banca fictícia.
 */

const STATE_KEY = "ia_sim_state";

export const START_BANK = 50;
export const BASE_STAKE = 1; // total apostado na entrada, dividido pelas 2 colunas
const COLUMNS = 2;

/** Total apostado no nível de gale (0 = entrada): 1 €, 2 €, 4 €, 8 € (15 € se falhar tudo) */
export function stakeAtLevel(level: number): number {
  return BASE_STAKE * Math.pow(2, level);
}

/** Retorno bruto se ganhar nesse nível: a coluna certa paga 3x metade do total apostado */
export function returnAtLevel(level: number): number {
  return (stakeAtLevel(level) / COLUMNS) * 3;
}

export type SessionKey = "s1" | "s2" | "s3" | "s4";

export const SESSION_KEYS: SessionKey[] = ["s1", "s2", "s3", "s4"];

export type SimState = {
  day: string;
  session: SessionKey;
  bank: number;
  entryActive: boolean;
  entryLevel: number;
  entryStaked: number;
  entryAbandoned: boolean;
};

export type SessionRow = {
  day: string;
  session: string;
  start_bank: number;
  end_bank: number;
  entries: number;
  wins: number;
  losses: number;
  total_staked: number;
  total_won: number;
  total_lost: number;
  insufficient: boolean;
  closed: boolean;
};

export function lisbonNow() {
  const now = new Date();
  const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
  const hour = Number(
    now.toLocaleString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false }),
  );
  const session: SessionKey = hour < 8 ? "s1" : hour < 12 ? "s2" : hour < 20 ? "s3" : "s4";
  return { day, hour, session };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const defaultState = (day: string, session: SessionKey): SimState => ({
  day,
  session,
  bank: START_BANK,
  entryActive: false,
  entryLevel: 0,
  entryStaked: 0,
  entryAbandoned: false,
});

async function loadState(day: string, session: SessionKey): Promise<SimState> {
  const db = await admin();
  const { data } = await db.from("alert_state").select("value").eq("id", STATE_KEY).maybeSingle();
  if (!data?.value) return defaultState(day, session);
  try {
    const parsed = JSON.parse(data.value) as SimState;
    if (parsed.day !== day || parsed.session !== session) return defaultState(day, session);
    return { ...defaultState(day, session), ...parsed };
  } catch {
    return defaultState(day, session);
  }
}

async function saveState(state: SimState) {
  const db = await admin();
  await db
    .from("alert_state")
    .upsert({ id: STATE_KEY, value: JSON.stringify(state), updated_at: new Date().toISOString() });
}

async function getSession(day: string, session: string): Promise<SessionRow> {
  const db = await admin();
  const { data } = await db
    .from("simulation_sessions")
    .select("*")
    .eq("day", day)
    .eq("session", session)
    .maybeSingle();
  if (data) return data as unknown as SessionRow;
  const row: SessionRow = {
    day,
    session,
    start_bank: START_BANK,
    end_bank: START_BANK,
    entries: 0,
    wins: 0,
    losses: 0,
    total_staked: 0,
    total_won: 0,
    total_lost: 0,
    insufficient: false,
    closed: false,
  };
  await db.from("simulation_sessions").upsert(row, { onConflict: "day,session" });
  return row;
}

async function patchSession(day: string, session: string, patch: Partial<SessionRow>) {
  const db = await admin();
  await db
    .from("simulation_sessions")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("day", day)
    .eq("session", session);
}

export function eur(v: number) {
  return `${v.toFixed(2).replace(".", ",")} €`;
}

function signed(v: number) {
  const s = v >= 0 ? "+" : "-";
  return `${s}${Math.abs(v).toFixed(2).replace(".", ",")} €`;
}

const SESSION_LABEL: Record<string, string> = {
  s1: "00:00/08:00",
  s2: "08:00/12:00",
  s3: "12:00/20:00",
  s4: "20:00/00:00",
};

const SESSION_RANGE: Record<string, string> = {
  s1: "00:00 → 08:00",
  s2: "08:00 → 12:00",
  s3: "12:00 → 20:00",
  s4: "20:00 → 00:00",
};

const SESSION_ICON: Record<string, string> = { s1: "🌙", s2: "☀️", s3: "🌤️", s4: "🌙" };

export function sessionSummary(row: SessionRow): string {
  const result = row.end_bank - row.start_bank;
  return (
    `📊 <b>SIMULAÇÃO — ${SESSION_LABEL[row.session] ?? row.session}</b>\n\n` +
    `🏦 Banca inicial: ${eur(row.start_bank)}\n` +
    `🎯 Entradas: ${row.entries}\n` +
    `🟢 WIN: ${row.wins}\n` +
    `🔴 LOSS: ${row.losses}\n` +
    `💵 Total apostado: ${eur(row.total_staked)}\n` +
    `💰 Banca final: ${eur(row.end_bank)}\n` +
    `${result >= 0 ? "📈" : "📉"} <b>RESULTADO: ${signed(result)}</b>` +
    (row.insufficient ? `\n⚠️ <b>BANCA INSUFICIENTE</b> durante a sessão` : "") +
    `\n\n<i>Simulação estatística — não é dinheiro real.</i>`
  );
}

export function daySummary(rows: (SessionRow | null)[]): string {
  const results = rows.map((r) => (r ? r.end_bank - r.start_bank : 0));
  const blocks = SESSION_KEYS.map((key, i) => {
    const r = rows[i] ?? null;
    const res = results[i] ?? 0;
    return (
      `${SESSION_ICON[key]} ${SESSION_RANGE[key]}\n` +
      `🏦 Inicial: ${eur(r?.start_bank ?? START_BANK)}\n` +
      `💰 Final: ${eur(r?.end_bank ?? START_BANK)}\n` +
      `${res >= 0 ? "🟢" : "🔴"} Resultado: ${signed(res)}`
    );
  });
  const total = results.reduce((a, b) => a + b, 0);
  return (
    `📋 <b>RESULTADO DO DIA</b>\n\n` +
    blocks.join("\n\n") +
    `\n\n━━━━━━━━━━━━\n` +
    `💰 <b>RESULTADO TOTAL DO DIA: ${signed(total)}</b>` +
    `\n\n<i>Simulação estatística — não é dinheiro real.</i>`
  );
}

/**
 * Fecha sessões passadas. Devolve as mensagens a enviar (resumo da sessão e, à meia-noite,
 * o resumo do dia). Não envia nada por si.
 */
export async function closeFinishedSessions(): Promise<string[]> {
  const db = await admin();
  const { day, session } = lisbonNow();
  const { data } = await db
    .from("simulation_sessions")
    .select("*")
    .eq("closed", false)
    .order("day", { ascending: true });
  const rows = (data ?? []) as unknown as SessionRow[];
  const messages: string[] = [];
  for (const row of rows) {
    const isCurrent = row.day === day && row.session === session;
    if (isCurrent) continue;
    await patchSession(row.day, row.session, { closed: true });
    messages.push(sessionSummary({ ...row, closed: true }));
    if (row.session === "s4") {
      const others: (SessionRow | null)[] = [];
      for (const key of SESSION_KEYS) {
        if (key === "s4") {
          others.push(row);
          continue;
        }
        const { data: m } = await db
          .from("simulation_sessions")
          .select("*")
          .eq("day", row.day)
          .eq("session", key)
          .maybeSingle();
        others.push((m as unknown as SessionRow) ?? null);
      }
      messages.push(daySummary(others));
    }
  }
  return messages;
}

/** Nova entrada confirmada pelo bot. */
export async function onEntry(): Promise<void> {
  const { day, session } = lisbonNow();
  const state = await loadState(day, session);
  const row = await getSession(day, session);
  const stake = stakeAtLevel(0);

  state.entryActive = true;
  state.entryLevel = 0;
  state.entryStaked = 0;
  state.entryAbandoned = false;

  if (state.bank < stake) {
    state.entryAbandoned = true;
    await patchSession(day, session, { insufficient: true, entries: row.entries + 1 });
    await saveState(state);
    return;
  }

  state.bank -= stake;
  state.entryStaked = stake;
  await patchSession(day, session, {
    entries: row.entries + 1,
    total_staked: row.total_staked + stake,
    end_bank: state.bank,
  });
  await saveState(state);
}

/** O bot subiu de gale (level 1..3). */
export async function onGale(level: number): Promise<void> {
  const { day, session } = lisbonNow();
  const state = await loadState(day, session);
  if (!state.entryActive || state.entryAbandoned) return;
  const row = await getSession(day, session);
  const stake = stakeAtLevel(level);

  if (state.bank < stake) {
    state.entryAbandoned = true;
    await patchSession(day, session, { insufficient: true });
    await saveState(state);
    return;
  }

  state.bank -= stake;
  state.entryLevel = level;
  state.entryStaked += stake;
  await patchSession(day, session, {
    total_staked: row.total_staked + stake,
    end_bank: state.bank,
  });
  await saveState(state);
}

/** O bot registou WIN no nível atual. */
export async function onWin(level: number): Promise<void> {
  const { day, session } = lisbonNow();
  const state = await loadState(day, session);
  const row = await getSession(day, session);
  const gain = state.entryAbandoned ? 0 : returnAtLevel(level);
  const net = gain - state.entryStaked;

  state.bank += gain;
  state.entryActive = false;
  state.entryLevel = 0;
  state.entryStaked = 0;
  state.entryAbandoned = false;

  await patchSession(day, session, {
    wins: row.wins + 1,
    total_won: row.total_won + Math.max(net, 0),
    end_bank: state.bank,
  });
  await saveState(state);
}

/** O bot registou LOSS (falhou após o 3.º gale). */
export async function onLoss(): Promise<void> {
  const { day, session } = lisbonNow();
  const state = await loadState(day, session);
  const row = await getSession(day, session);
  const lost = state.entryStaked;

  state.entryActive = false;
  state.entryLevel = 0;
  state.entryStaked = 0;
  state.entryAbandoned = false;

  await patchSession(day, session, {
    losses: row.losses + 1,
    total_lost: row.total_lost + lost,
    end_bank: state.bank,
  });
  await saveState(state);
}

/** Linha curta da simulação para acrescentar a cada alerta do Telegram. */
export async function simLine(): Promise<string> {
  try {
    const { day, session } = lisbonNow();
    const row = await getSession(day, session);
    const state = await loadState(day, session);
    const result = row.end_bank - row.start_bank;
    return (
      `\n\n🧪 <b>SIMULAÇÃO ${SESSION_LABEL[session]}</b>\n` +
      `🏦 Banca: ${eur(state.bank)}  |  ${result >= 0 ? "📈" : "📉"} ${signed(result)}\n` +
      `🎯 Entradas: ${row.entries}  🟢 ${row.wins}  🔴 ${row.losses}` +
      (row.insufficient ? `\n⚠️ <b>BANCA INSUFICIENTE</b>` : "") +
      `\n<i>Simulação — não é dinheiro real.</i>`
    );
  } catch {
    return "";
  }
}

/** Sessão atual (para mostrar no site). */
export async function currentSession(): Promise<SessionRow> {
  const { day, session } = lisbonNow();
  return getSession(day, session);
}
