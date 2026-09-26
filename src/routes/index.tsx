import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSpins, type Spin } from "@/lib/spins.functions";
import { getSimulation, type SimSession } from "@/lib/simulation.functions";
import { analyzeStrategy } from "@/lib/strategy";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IARoullete | Análise de Estratégias" },
      {
        name: "description",
        content:
          "Simulador que compara padrões históricos da XXXtreme Lightning Roulette e seleciona uma estratégia.",
      },
      { property: "og:title", content: "IARoullete | Análise de Estratégias" },
      {
        property: "og:description",
        content: "Análise estatística de estratégias de colunas em tempo real.",
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
  excludedColumn: number;
  betColumns: [number, number];
  confidence: number;
  sampleSize: number;
  pattern: string;
  numbers: number[];
  at: string;
  label: string;
};

const SESSION_LABEL: Record<string, string> = {
  s1: "00:00 → 08:00",
  s2: "08:00 → 12:00",
  s3: "12:00 → 20:00",
  s4: "20:00 → 00:00",
};

function eur(v: number) {
  return `${Number(v).toFixed(2).replace(".", ",")} €`;
}

function SimulationPanel() {
  const fetchSim = useServerFn(getSimulation);
  const [sessions, setSessions] = useState<SimSession[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const data = await fetchSim();
        if (alive) setSessions(data.sessions);
      } catch {
        /* ignorar */
      }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetchSim]);

  const total = sessions.reduce((acc, s) => acc + (Number(s.end_bank) - Number(s.start_bank)), 0);

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Simulação de banca (50 € por sessão)
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Apenas simulação estatística — não é dinheiro real e não faz apostas.
      </p>
      <div className="mt-3 space-y-2">
        {["s1", "s2", "s3", "s4"].map((key) => {
          const s = sessions.find((x) => x.session === key);
          const res = s ? Number(s.end_bank) - Number(s.start_bank) : 0;
          return (
            <div key={key} className="rounded-lg border border-border px-3 py-2 text-sm">
              <p className="font-semibold">{SESSION_LABEL[key]}</p>
              <p className="text-muted-foreground">
                Inicial {eur(s?.start_bank ?? 50)} · Final {eur(s?.end_bank ?? 50)} · Entradas{" "}
                {s?.entries ?? 0} · 🟢 {s?.wins ?? 0} · 🔴 {s?.losses ?? 0}
              </p>
              <p className={res >= 0 ? "font-bold text-primary" : "font-bold text-roulette-red"}>
                Resultado: {res >= 0 ? "+" : "-"}
                {eur(Math.abs(res))}
              </p>
              {s?.insufficient && (
                <p className="text-xs font-semibold text-roulette-red">Banca insuficiente</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm font-bold">
        Total do dia: {total >= 0 ? "+" : "-"}
        {eur(Math.abs(total))}
      </p>
    </section>
  );
}

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
        const strategy = analyzeStrategy(data);
        if (head && strategy && lastAlertId.current !== head.id) {
          lastAlertId.current = head.id;
          const label = `Estratégia: ${strategy.betColumns[0]}ª e ${strategy.betColumns[1]}ª colunas`;
          const item: AlertItem = {
            id: head.id,
            excludedColumn: strategy.excludedColumn,
            betColumns: strategy.betColumns,
            confidence: strategy.confidence,
            sampleSize: strategy.sampleSize,
            pattern: strategy.pattern,
            numbers: data.slice(0, 8).map((s) => s.number),
            at: new Date().toLocaleTimeString("pt-PT"),
            label,
          };
          setAlerts((a) => [item, ...a].slice(0, 20));
          setBanner(item);
          if (soundOn) beep();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(label, {
              body: `Evitar a ${strategy.excludedColumn}ª coluna · Confiança estatística ${strategy.confidence}%`,
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

  const strategy = analyzeStrategy(spins);
  const active = strategy !== null;

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
                  Estratégia IA · Simulação
                </p>
                <p className="mt-1 text-3xl font-black leading-none">{banner.label}</p>
                <p className="mt-2 text-sm font-semibold">
                  Evitar {banner.excludedColumn}ª coluna · Confiança {banner.confidence}% ·{" "}
                  {banner.at}
                </p>
                <p className="mt-1 text-sm opacity-90">{banner.numbers.join(" · ")}</p>
                <p className="mt-1 text-xs font-bold opacity-90">
                  Cobrir o zero · Histórico de {banner.sampleSize} resultados · Máximo de 3 gales
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
          <h1 className="mt-1 text-2xl font-bold leading-tight">
            IARoullete — Análise de Estratégias
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compara frequência recente, histórico e transições entre colunas para escolher uma
            cobertura. É uma simulação estatística, não uma previsão do próximo resultado.
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
                Estratégia atual · Simulação
              </p>
              <p className="mt-1 text-3xl font-black">
                {strategy.betColumns[0]}ª e {strategy.betColumns[1]}ª colunas + zero
              </p>
              <p className="mt-2 text-xs font-bold opacity-90">
                Evitar {strategy.excludedColumn}ª coluna · Confiança estatística{" "}
                {strategy.confidence}% · Máximo de 3 gales
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">A recolher histórico</p>
              <p className="mt-1 text-3xl font-black">São necessários pelo menos 8 resultados</p>
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

        <SimulationPanel />

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
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    a.confidence >= 70 ? "border-primary bg-card" : "border-yellow-500/50 bg-card"
                  }`}
                >
                  <span className="font-bold text-primary">{a.label}</span> · Evitar{" "}
                  {a.excludedColumn}ª · Confiança {a.confidence}% · {a.pattern} — {a.at}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
