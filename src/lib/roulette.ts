export type Spin = {
  id: string;
  number: number;
  color: string;
  settledAt: string;
};

export const SPINS_API =
  "https://api-cs.casino.org/svc-evolution-game-events/api/xxxtremelightningroulette?page=0&size=40&sort=data.settledAt,desc&duration=6";

export const ENTRY_STREAK = 2;
export const MAX_GALES = 3;

export type EntryFilterReason = "not_ready" | "after_zero" | "after_loss" | null;

export function entryFilterReason(
  spins: Array<Pick<Spin, "number">>,
  index: number,
  streakCount: number,
  skipAfterLoss: boolean,
): EntryFilterReason {
  if (streakCount !== ENTRY_STREAK) return "not_ready";
  if (skipAfterLoss) return "after_loss";
  return spins[index + ENTRY_STREAK]?.number === 0 ? "after_zero" : null;
}

export function columnOf(n: number): 0 | 1 | 2 | 3 {
  if (n === 0) return 0;
  const r = n % 3;
  return r === 1 ? 1 : r === 2 ? 2 : 3;
}

export class RouletteRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Roulette feed rate limited for ${retryAfterSeconds}s`);
    this.name = "RouletteRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function fetchSpins(): Promise<Spin[]> {
  let raw: Array<{
    id: string;
    data?: {
      settledAt?: string;
      result?: { outcome?: { number?: number; color?: string } };
    };
  }> = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const url = `${SPINS_API}&_=${Date.now()}-${attempt}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        Origin: "https://www.casino.org",
        Referer: "https://www.casino.org/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`roulette feed failed [${res.status}] on attempt ${attempt + 1}`);
      // Repetir imediatamente um pedido bloqueado prolonga o bloqueio do fornecedor.
      if (res.status === 429) {
        const retryAfter = Number.parseInt(res.headers.get("Retry-After") ?? "60", 10);
        throw new RouletteRateLimitError(Number.isFinite(retryAfter) ? retryAfter : 60);
      }
      continue;
    }
    const payload = (await res.json()) as typeof raw;
    if (Array.isArray(payload) && payload.length > 0) {
      raw = payload;
      break;
    }
    console.error(`roulette feed returned no rows on attempt ${attempt + 1}`);
  }

  return raw
    .filter((r) => typeof r.data?.result?.outcome?.number === "number")
    .map((r) => ({
      id: r.id,
      number: r.data!.result!.outcome!.number as number,
      color: r.data!.result!.outcome!.color ?? "",
      settledAt: r.data!.settledAt ?? "",
    }));
}

/** spins must be newest-first. Returns the current run of the same column. */
export function currentStreak(spins: Spin[]): {
  column: 0 | 1 | 2 | 3;
  count: number;
  numbers: number[];
} {
  if (spins.length === 0) return { column: 0, count: 0, numbers: [] };
  const column = columnOf(spins[0]!.number);
  if (column === 0) return { column: 0, count: 0, numbers: [] };
  const numbers: number[] = [];
  for (const s of spins) {
    if (columnOf(s.number) !== column) break;
    numbers.push(s.number);
  }
  return { column, count: numbers.length, numbers };
}

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export class TelegramRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "TelegramRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function telegramCall(method: string, body: Record<string, unknown>) {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (botToken) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return parseTelegramResponse(method, res, await res.text());
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  const telegramKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !telegramKey) throw new Error("Telegram connector not configured");
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseTelegramResponse(method, res, await res.text());
}

async function parseTelegramResponse(method: string, res: Response, text: string) {
  let data: {
    ok: boolean;
    result?: unknown;
    error?: string;
    description?: string;
    parameters?: { retry_after?: number };
  };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  }
  if (res.status === 429) {
    throw new TelegramRateLimitError(
      `Telegram ${method} rate limited: ${data.description ?? text}`,
      data.parameters?.retry_after ?? 30,
    );
  }
  if (!res.ok) throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description ?? data.error ?? text}`);
  }
  return data;
}
