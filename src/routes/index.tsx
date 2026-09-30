import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpins, type Spin } from "@/lib/spins.functions";
import { currentStreak, ENTRY_STREAK } from "@/lib/roulette";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IARoullete | Análise de Estratégias" },
      {
        name: "description",
        content:
          "Monitor que deteta quatro resultados seguidos na mesma coluna da XXXtreme Lightning Roulette.",
      },
      { property: "og:title", content: "IARoullete | Análise de Estratégias" },
      {
        property: "og:description",
        content: "Deteção de sequências de quatro resultados na mesma coluna em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function columnOf(n: number): 0 | 1 | 2 | 3 {
  if (n === 0) return 0;
  const r = n % 3;
  return r === 1 ? 1 : r === 2 ? 2 : 3;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.28, 0.56].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.25);
    });
  } catch {
    /* som indisponível */
  }
}

type AlertItem = {
  id: string;
  column: number;
  entryLabel: string;
  numbers: number[];
  at: string;
  label: string;
};

function Index() {
  const fetchSpins = useServerFn(getSpins);
  const [spins, setSpins] = useState<Spin[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [banner, setBanner] = useState<AlertItem | null>(null);

  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [soundOn, setSoundOn] = useState(true);
  const lastAlertId = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await fetchSpins();
        if (!alive) return;
        setSpins(data);
        setError(false);
        setUpdatedAt(new Date().toLocaleTimeString("pt-PT"));

        const head = data[0];
        const streak = currentStreak(data);
        if (head && streak.count === ENTRY_STREAK && lastAlertId.current !== head.id) {
          lastAlertId.current = head.id;
          const selected = [1, 2, 3].filter((column) => column !== streak.column);
          const entryLabel = `${selected[0]}ª e ${selected[1]}ª colunas + zero`;
          const label = `Entrada: ${entryLabel}`;
          const item: AlertItem = {
            id: head.id,
            column: streak.column,
            entryLabel,
            numbers: data.slice(0, 8).map((s) => s.number),
            at: new Date().toLocaleTimeString("pt-PT"),
            label,
          };
          setAlerts((a) => [item, ...a].slice(0, 20));
          setBanner(item);
          if (soundOn) beep();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(label, {
              body: `Quatro resultados seguidos na coluna ${streak.column}`,
            });
          }
        }
      } catch {
        if (alive) setError(true);
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetchSpins, soundOn]);

  const streak = currentStreak(spins);
  const active = streak.count === ENTRY_STREAK;
  const detecting = streak.count >= 2 && streak.count < ENTRY_STREAK;
  const selectedColumns = [1, 2, 3].filter((column) => column !== streak.column);
  const entryLabel = `${selectedColumns[0]}ª e ${selectedColumns[1]}ª colunas + zero`;

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      {banner && (
        <div className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
          <div
            className={`mx-auto w-full max-w-2xl animate-pulse rounded-xl border-2 p-4 shadow-2xl ${"border-primary bg-primary text-primary-foreground"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em]">
                  Sinal de colunas · Ao vivo
                </p>
                <p className="mt-1 text-3xl font-black leading-none">{banner.label}</p>
                <p className="mt-2 text-sm font-semibold">
                  Quatro resultados seguidos na coluna {banner.column} · {banner.at}
                </p>
                <p className="mt-1 text-sm opacity-90">{banner.numbers.join(" · ")}</p>
                <p className="mt-1 text-xs font-bold opacity-90">
                  Cobrir o zero · Máximo de 3 gales
                </p>
              </div>
              <button
                onClick={() => setBanner(null)}
                aria-label="Fechar aviso"
                className="rounded-md border border-current px-2 py-1 text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Ao vivo · Evolution</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">IARoullete — Padrão de Colunas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aguarda quatro resultados seguidos na mesma coluna e indica a entrada nas outras duas
            colunas, com cobertura do zero e até três gales. O padrão não garante o próximo
            resultado.
          </p>
        </header>

        <section className="mb-5 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-primary">
            Avisos no Telegram (24h, app fechada)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra o Telegram, procure{" "}
            <a
              href="https://t.me/IARoullete_bot"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground underline"
            >
              @IARoullete_bot
            </a>{" "}
            e envie <strong>/start</strong>. A partir daí recebe lá cada aviso, mesmo com esta
            página fechada. Envie <strong>/stop</strong> para desligar.
          </p>
        </section>

        <section
          className={`rounded-xl border p-5 text-center ${
            active
              ? "animate-pulse border-primary bg-primary text-primary-foreground"
              : "border-border bg-card"
          }`}
        >
          {active ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-widest">
                Sinal atual · Ao vivo
              </p>
              <p className="mt-1 text-3xl font-black">{entryLabel}</p>
              <p className="mt-2 text-xs font-bold opacity-90">
                Quatro resultados seguidos na coluna {streak.column} · Máximo de 3 gales
              </p>
            </>
          ) : detecting ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-widest">A detetar padrão</p>
              <p className="mt-1 text-3xl font-black">
                Coluna {streak.column}: {streak.count}/{ENTRY_STREAK}
              </p>
              <p className="mt-2 text-xs font-bold opacity-90">Espere a jogada</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">A acompanhar os resultados</p>
              <p className="mt-1 text-3xl font-black">À espera do padrão de quatro colunas</p>
            </>
          )}
          <p className="mt-2 text-xs opacity-80">
            {error ? "A tentar ligar..." : `Atualizado às ${updatedAt || "—"}`}
          </p>
        </section>

        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setSoundOn((s) => !s)}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Som: {soundOn ? "ligado" : "desligado"}
          </button>
          <button
            onClick={() => {
              if ("Notification" in window) void Notification.requestPermission();
            }}
            className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Ativar notificações
          </button>
        </div>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Últimos números
          </h2>
          <div className="flex flex-wrap gap-2">
            {spins.slice(0, 27).map((s) => {
              const c = columnOf(s.number);
              const bg =
                s.number === 0
                  ? "bg-roulette-green"
                  : s.color === "Red"
                    ? "bg-roulette-red"
                    : "bg-roulette-black";
              return (
                <div key={s.id} className="flex flex-col items-center gap-1">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full border border-border text-sm font-bold text-foreground ${bg}`}
                  >
                    {s.number}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {c === 0 ? "—" : `C${c}`}
                  </span>
                </div>
              );
            })}
            {spins.length === 0 && (
              <p className="text-sm text-muted-foreground">A carregar resultados...</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Histórico de alertas
          </h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem alertas desde que abriu a página.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-primary bg-card px-3 py-2 text-sm"
                >
                  <span className="font-bold text-primary">{a.label}</span> · Quatro resultados na
                  coluna {a.column} — {a.at}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
