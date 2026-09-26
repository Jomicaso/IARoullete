import { createServerFn } from "@tanstack/react-start";

export type Spin = {
  id: string;
  number: number;
  color: string;
  settledAt: string;
};

const API =
  "https://api-cs.casino.org/svc-evolution-game-events/api/xxxtremelightningroulette?page=0&size=40&sort=data.settledAt,desc&duration=6";

export const getSpins = createServerFn({ method: "GET" }).handler(async (): Promise<Spin[]> => {
  let raw: Array<{
    id: string;
    data?: {
      settledAt?: string;
      result?: { outcome?: { number?: number; color?: string } };
    };
  }> = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${API}&_=${Date.now()}-${attempt}`, {
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
    if (!res.ok) continue;
    const payload = (await res.json()) as typeof raw;
    if (Array.isArray(payload) && payload.length > 0) {
      raw = payload;
      break;
    }
  }

  return raw
    .filter((r) => typeof r.data?.result?.outcome?.number === "number")
    .map((r) => ({
      id: r.id,
      number: r.data!.result!.outcome!.number as number,
      color: r.data!.result!.outcome!.color ?? "",
      settledAt: r.data!.settledAt ?? "",
    }));
});
