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
  expectedReturn: number;
  sampleSize: number;
  transitionSamples: number;
  pattern: string;
};

export type StrategyLearning = Record<
  string,
  { samples: number; averageReturn: number; winRate: number }
>;

type Candidate = {
  market: StrategyMarket;
  marketLabel: string;
  selection: string;
  entryLabel: string;
  baselineRate: number;
  stakeUnits: number;
  matches: (spin: Spin) => boolean;
  profitUnits: (spin: Spin) => number;
  context: (spin: Spin) => string | null;
};

const HISTORY_SIZE = 500;
const RECENT_SIZE = 18;
const MIN_HISTORY = 40;
export const MIN_SIGNAL_STRENGTH = 65;

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
      stakeUnits: 2.1,
      matches: (spin: Spin) => spin.number === 0 || columnOf(spin.number) !== excluded,
      profitUnits: (spin: Spin) =>
        spin.number === 0 ? 1.5 : columnOf(spin.number) !== excluded ? 0.9 : -2.1,
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
      stakeUnits: 2.1,
      matches: (spin: Spin) => spin.number === 0 || dozenOf(spin.number) !== excluded,
      profitUnits: (spin: Spin) =>
        spin.number === 0 ? 1.5 : dozenOf(spin.number) !== excluded ? 0.9 : -2.1,
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
      stakeUnits: 1.05,
      matches: (spin) => spin.number === 0 || colorOf(spin) === "red",
      profitUnits: (spin) => (spin.number === 0 ? 0.75 : colorOf(spin) === "red" ? 0.95 : -1.05),
      context: (spin) => colorOf(spin),
    },
    {
      market: "color",
      marketLabel: "Cor",
      selection: "black",
      entryLabel: "preto + zero",
      baselineRate: 19 / 37,
      stakeUnits: 1.05,
      matches: (spin) => spin.number === 0 || colorOf(spin) === "black",
      profitUnits: (spin) => (spin.number === 0 ? 0.75 : colorOf(spin) === "black" ? 0.95 : -1.05),
      context: (spin) => colorOf(spin),
    },
    {
      market: "parity",
      marketLabel: "Paridade",
      selection: "even",
      entryLabel: "par + zero",
      baselineRate: 19 / 37,
      stakeUnits: 1.05,
      matches: (spin) => spin.number === 0 || parityOf(spin.number) === "even",
      profitUnits: (spin) =>
        spin.number === 0 ? 0.75 : parityOf(spin.number) === "even" ? 0.95 : -1.05,
      context: (spin) => parityOf(spin.number),
    },
    {
      market: "parity",
      marketLabel: "Paridade",
      selection: "odd",
      entryLabel: "ímpar + zero",
      baselineRate: 19 / 37,
      stakeUnits: 1.05,
      matches: (spin) => spin.number === 0 || parityOf(spin.number) === "odd",
      profitUnits: (spin) =>
        spin.number === 0 ? 0.75 : parityOf(spin.number) === "odd" ? 0.95 : -1.05,
      context: (spin) => parityOf(spin.number),
    },
    {
      market: "range",
      marketLabel: "Baixo/Alto",
      selection: "low",
      entryLabel: "1–18 + zero",
      baselineRate: 19 / 37,
      stakeUnits: 1.05,
      matches: (spin) => spin.number === 0 || rangeOf(spin.number) === "low",
      profitUnits: (spin) =>
        spin.number === 0 ? 0.75 : rangeOf(spin.number) === "low" ? 0.95 : -1.05,
      context: (spin) => rangeOf(spin.number),
    },
    {
      market: "range",
      marketLabel: "Baixo/Alto",
      selection: "high",
      entryLabel: "19–36 + zero",
      baselineRate: 19 / 37,
      stakeUnits: 1.05,
      matches: (spin) => spin.number === 0 || rangeOf(spin.number) === "high",
      profitUnits: (spin) =>
        spin.number === 0 ? 0.75 : rangeOf(spin.number) === "high" ? 0.95 : -1.05,
      context: (spin) => rangeOf(spin.number),
    },
  ];

  return [...columnCandidates, ...dozenCandidates, ...singleChanceCandidates];
}

function hitRate(spins: Spin[], matches: Candidate["matches"]) {
  if (spins.length === 0) return 0;
  return spins.filter(matches).length / spins.length;
}

function returnRate(spins: Spin[], candidate: Candidate) {
  if (spins.length === 0) return 0;
  const profit = spins.reduce((total, spin) => total + candidate.profitUnits(spin), 0);
  return profit / (spins.length * candidate.stakeUnits);
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

export function strategySequenceReturn(
  spin: Spin,
  market: StrategyMarket,
  selection: string,
  gale: number,
  won: boolean,
) {
  const candidate = candidates().find(
    (item) => item.market === market && item.selection === selection,
  );
  if (!candidate) return -1;
  if (!won) return -1;
  const profit = -candidate.stakeUnits * gale + candidate.profitUnits(spin);
  return profit / (candidate.stakeUnits * (gale + 1));
}

function candidateKey(candidate: Candidate) {
  return `${candidate.market}:${candidate.selection}`;
}

function rankCandidates(spins: Spin[], learning: StrategyLearning = {}) {
  const history = spins.slice(0, HISTORY_SIZE);
  const recent = history.slice(0, RECENT_SIZE);

  return candidates()
    .map((candidate) => {
      const transitions = transitionOutcomes(history, candidate);
      const historicalRate = hitRate(history, candidate.matches);
      const recentRate = hitRate(recent, candidate.matches);
      const transitionRate =
        transitions.length >= 3 ? hitRate(transitions, candidate.matches) : null;
      const historicalReturn = returnRate(history, candidate);
      const recentReturn = returnRate(recent, candidate);
      const transitionReturn = transitions.length >= 3 ? returnRate(transitions, candidate) : null;
      const observedReturn =
        transitionReturn === null
          ? historicalReturn * 0.4 + recentReturn * 0.6
          : historicalReturn * 0.3 + recentReturn * 0.45 + transitionReturn * 0.25;
      const instability = Math.abs(recentReturn - historicalReturn);
      const learned = learning[candidateKey(candidate)];
      const reliability = learned ? Math.min(1, learned.samples / 30) : 0;
      const learnedAdjustment = learned ? learned.averageReturn * reliability * 0.25 : 0;
      const rankingScore = observedReturn - instability * 0.1 + learnedAdjustment;
      const strength = Math.max(
        1,
        Math.min(99, Math.round(50 + (rankingScore + 1 / 37) * 100 - instability * 15)),
      );

      return {
        candidate,
        transitions,
        historicalRate,
        recentRate,
        transitionRate,
        observedReturn,
        rankingScore,
        strength,
      };
    })
    .sort(
      (a, b) =>
        b.rankingScore - a.rankingScore ||
        b.recentRate - a.recentRate ||
        b.historicalRate - a.historicalRate,
    );
}

export function backtestStrategies(spins: Spin[]): StrategyLearning {
  const totals: Record<string, { samples: number; returns: number; wins: number }> = {};

  for (let index = spins.length - MIN_HISTORY; index >= 4; index -= 1) {
    const best = rankCandidates(spins.slice(index))[0];
    if (!best) continue;
    const key = candidateKey(best.candidate);
    const row = (totals[key] ??= { samples: 0, returns: 0, wins: 0 });
    let profit = 0;
    let staked = 0;
    let won = false;
    for (let gale = 0; gale <= 3; gale += 1) {
      const outcome = spins[index - 1 - gale];
      if (!outcome) break;
      profit += best.candidate.profitUnits(outcome);
      staked += best.candidate.stakeUnits;
      if (best.candidate.matches(outcome)) {
        won = true;
        break;
      }
    }
    row.samples += 1;
    row.returns += staked > 0 ? profit / staked : 0;
    row.wins += won ? 1 : 0;
  }

  return Object.fromEntries(
    Object.entries(totals).map(([key, row]) => [
      key,
      {
        samples: row.samples,
        averageReturn: row.samples > 0 ? row.returns / row.samples : 0,
        winRate: row.samples > 0 ? row.wins / row.samples : 0,
      },
    ]),
  );
}

/** Compara mercados pelo retorno observado, estabilidade e backtest sem olhar para o futuro. */
export function analyzeStrategy(
  spins: Spin[],
  learning: StrategyLearning = {},
): StrategyRecommendation | null {
  const history = spins.slice(0, HISTORY_SIZE);
  if (history.length < MIN_HISTORY) return null;
  const ranked = rankCandidates(history, learning);

  const best = ranked[0];
  if (!best || best.strength < MIN_SIGNAL_STRENGTH) return null;
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
    expectedReturn: Math.round(best.observedReturn * 100),
    sampleSize: history.length,
    transitionSamples: best.transitions.length,
    pattern:
      best.transitionRate === null
        ? "frequência histórica + tendência recente"
        : `frequência + tendência + transições após ${latestContext}`,
  };
}
