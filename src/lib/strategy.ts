import { columnOf, type Spin } from "./roulette.ts";

export type StrategyMarket = "columns" | "dozens" | "color" | "parity" | "range";

export type StrategyRecommendation = {
  market: StrategyMarket;
  marketLabel: string;
  selection: string;
  entryLabel: string;
  strength: number;
  baselineRate: number;
  historicalHitRate: number;
  recentHitRate: number;
  transitionHitRate: number | null;
  sampleSize: number;
  transitionSamples: number;
  pattern: string;
};

type Candidate = {
  market: StrategyMarket;
  marketLabel: string;
  selection: string;
  entryLabel: string;
  baselineRate: number;
  matches: (spin: Spin) => boolean;
  context: (spin: Spin) => string | null;
};

const HISTORY_SIZE = 40;
const RECENT_SIZE = 12;
const MIN_HISTORY = 20;

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function dozenOf(number: number) {
  if (number === 0) return 0;
  return Math.ceil(number / 12);
}

function colorOf(spin: Spin) {
  if (spin.number === 0) return "green";
  const supplied = spin.color.toLowerCase();
  if (supplied.includes("red")) return "red";
  if (supplied.includes("black")) return "black";
  return RED_NUMBERS.has(spin.number) ? "red" : "black";
}

function parityOf(number: number) {
  if (number === 0) return "zero";
  return number % 2 === 0 ? "even" : "odd";
}

function rangeOf(number: number) {
  if (number === 0) return "zero";
  return number <= 18 ? "low" : "high";
}

function candidates(): Candidate[] {
  const columnCandidates = [1, 2, 3].map((excluded) => {
    const selected = [1, 2, 3].filter((column) => column !== excluded);
    return {
      market: "columns" as const,
      marketLabel: "Colunas",
      selection: `exclude:${excluded}`,
      entryLabel: `${selected[0]}ª e ${selected[1]}ª colunas + zero`,
      baselineRate: 25 / 37,
      matches: (spin: Spin) => spin.number === 0 || columnOf(spin.number) !== excluded,
      context: (spin: Spin) => {
        const column = columnOf(spin.number);
        return column === 0 ? null : `coluna:${column}`;
      },
    };
  });

  const dozenCandidates = [1, 2, 3].map((excluded) => {
    const selected = [1, 2, 3].filter((dozen) => dozen !== excluded);
    return {
      market: "dozens" as const,
      marketLabel: "Dúzias",
      selection: `exclude:${excluded}`,
      entryLabel: `${selected[0]}ª e ${selected[1]}ª dúzias + zero`,
      baselineRate: 25 / 37,
      matches: (spin: Spin) => spin.number === 0 || dozenOf(spin.number) !== excluded,
      context: (spin: Spin) => {
        const dozen = dozenOf(spin.number);
        return dozen === 0 ? null : `dúzia:${dozen}`;
      },
    };
  });

  const singleChanceCandidates: Candidate[] = [
    {
      market: "color",
      marketLabel: "Cor",
      selection: "red",
      entryLabel: "vermelho + zero",
      baselineRate: 19 / 37,
      matches: (spin) => spin.number === 0 || colorOf(spin) === "red",
      context: (spin) => colorOf(spin),
    },
    {
      market: "color",
      marketLabel: "Cor",
      selection: "black",
      entryLabel: "preto + zero",
      baselineRate: 19 / 37,
      matches: (spin) => spin.number === 0 || colorOf(spin) === "black",
      context: (spin) => colorOf(spin),
    },
    {
      market: "parity",
      marketLabel: "Paridade",
      selection: "even",
      entryLabel: "par + zero",
      baselineRate: 19 / 37,
      matches: (spin) => spin.number === 0 || parityOf(spin.number) === "even",
      context: (spin) => parityOf(spin.number),
    },
    {
      market: "parity",
      marketLabel: "Paridade",
      selection: "odd",
      entryLabel: "ímpar + zero",
      baselineRate: 19 / 37,
      matches: (spin) => spin.number === 0 || parityOf(spin.number) === "odd",
      context: (spin) => parityOf(spin.number),
    },
    {
      market: "range",
      marketLabel: "Baixo/Alto",
      selection: "low",
      entryLabel: "1–18 + zero",
      baselineRate: 19 / 37,
      matches: (spin) => spin.number === 0 || rangeOf(spin.number) === "low",
      context: (spin) => rangeOf(spin.number),
    },
    {
      market: "range",
      marketLabel: "Baixo/Alto",
      selection: "high",
      entryLabel: "19–36 + zero",
      baselineRate: 19 / 37,
      matches: (spin) => spin.number === 0 || rangeOf(spin.number) === "high",
      context: (spin) => rangeOf(spin.number),
    },
  ];

  return [...columnCandidates, ...dozenCandidates, ...singleChanceCandidates];
}

function hitRate(spins: Spin[], matches: Candidate["matches"]) {
  if (spins.length === 0) return 0;
  return spins.filter(matches).length / spins.length;
}

function transitionOutcomes(spins: Spin[], candidate: Candidate) {
  const latestContext = candidate.context(spins[0]!);
  if (!latestContext || latestContext === "zero" || latestContext === "green") return [];

  const outcomes: Spin[] = [];
  for (let index = spins.length - 1; index >= 1; index -= 1) {
    const previous = spins[index];
    const next = spins[index - 1];
    if (previous && next && candidate.context(previous) === latestContext) outcomes.push(next);
  }
  return outcomes;
}

export function strategyWins(spin: Spin, market: StrategyMarket, selection: string) {
  const candidate = candidates().find(
    (item) => item.market === market && item.selection === selection,
  );
  return candidate?.matches(spin) ?? false;
}

export function strategyEntryLabel(market: StrategyMarket, selection: string) {
  return (
    candidates().find((item) => item.market === market && item.selection === selection)
      ?.entryLabel ?? "estratégia selecionada + zero"
  );
}

/** Compara mercados diferentes pelo desvio observado face à probabilidade-base de cada aposta. */
export function analyzeStrategy(spins: Spin[]): StrategyRecommendation | null {
  const history = spins.slice(0, HISTORY_SIZE);
  if (history.length < MIN_HISTORY) return null;
  const recent = history.slice(0, RECENT_SIZE);

  const ranked = candidates().map((candidate) => {
    const transitions = transitionOutcomes(history, candidate);
    const historicalRate = hitRate(history, candidate.matches);
    const recentRate = hitRate(recent, candidate.matches);
    const transitionRate = transitions.length >= 3 ? hitRate(transitions, candidate.matches) : null;
    const observedRate =
      transitionRate === null
        ? historicalRate * 0.4 + recentRate * 0.6
        : historicalRate * 0.3 + recentRate * 0.45 + transitionRate * 0.25;
    const edge = observedRate - candidate.baselineRate;
    const instability = Math.abs(recentRate - historicalRate);
    const rankingScore = edge - instability * 0.12;
    const strength = Math.max(
      1,
      Math.min(
        99,
        Math.round(50 + edge * 180 - instability * 30 + Math.min(transitions.length, 8)),
      ),
    );

    return {
      candidate,
      transitions,
      historicalRate,
      recentRate,
      transitionRate,
      rankingScore,
      strength,
    };
  });

  ranked.sort(
    (a, b) =>
      b.rankingScore - a.rankingScore ||
      b.recentRate - a.recentRate ||
      b.historicalRate - a.historicalRate,
  );

  const best = ranked[0];
  if (!best) return null;
  const { candidate } = best;
  const latestContext = candidate.context(history[0]!);

  return {
    market: candidate.market,
    marketLabel: candidate.marketLabel,
    selection: candidate.selection,
    entryLabel: candidate.entryLabel,
    strength: best.strength,
    baselineRate: Math.round(candidate.baselineRate * 100),
    historicalHitRate: Math.round(best.historicalRate * 100),
    recentHitRate: Math.round(best.recentRate * 100),
    transitionHitRate: best.transitionRate === null ? null : Math.round(best.transitionRate * 100),
    sampleSize: history.length,
    transitionSamples: best.transitions.length,
    pattern:
      best.transitionRate === null
        ? "frequência histórica + tendência recente"
        : `frequência + tendência + transições após ${latestContext}`,
  };
}
