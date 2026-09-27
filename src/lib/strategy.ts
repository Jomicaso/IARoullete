import { columnOf, type Spin } from "./roulette.ts";

export type RouletteColumn = 1 | 2 | 3;

export type StrategyRecommendation = {
  excludedColumn: RouletteColumn;
  betColumns: [RouletteColumn, RouletteColumn];
  confidence: number;
  historicalHitRate: number;
  recentHitRate: number;
  transitionHitRate: number | null;
  sampleSize: number;
  transitionSamples: number;
  pattern: string;
};

const HISTORY_SIZE = 40;
const RECENT_SIZE = 12;
const MIN_HISTORY = 8;

function hitRate(spins: Spin[], excludedColumn: RouletteColumn) {
  if (spins.length === 0) return 0;
  const hits = spins.filter((spin) => columnOf(spin.number) !== excludedColumn).length;
  return hits / spins.length;
}

function transitionOutcomes(spins: Spin[], fromColumn: number) {
  const outcomes: Spin[] = [];
  for (let index = spins.length - 1; index >= 1; index -= 1) {
    const previous = spins[index];
    const next = spins[index - 1];
    if (previous && next && columnOf(previous.number) === fromColumn) outcomes.push(next);
  }
  return outcomes;
}

/**
 * Compara as tres coberturas possiveis. Os resultados devem estar do mais recente
 * para o mais antigo. A recomendacao usa o historico recebido em tempo real.
 */
export function analyzeStrategy(spins: Spin[]): StrategyRecommendation | null {
  const history = spins.slice(0, HISTORY_SIZE);
  if (history.length < MIN_HISTORY) return null;

  const recent = history.slice(0, Math.min(RECENT_SIZE, history.length));
  const latestColumn = columnOf(history[0]!.number);
  const transitions = latestColumn === 0 ? [] : transitionOutcomes(history, latestColumn);

  const candidates = ([1, 2, 3] as RouletteColumn[]).map((excludedColumn) => {
    const historicalHitRate = hitRate(history, excludedColumn);
    const recentHitRate = hitRate(recent, excludedColumn);
    const transitionHitRate = transitions.length >= 3 ? hitRate(transitions, excludedColumn) : null;
    const score =
      transitionHitRate === null
        ? historicalHitRate * 0.45 + recentHitRate * 0.55
        : historicalHitRate * 0.3 + recentHitRate * 0.45 + transitionHitRate * 0.25;

    return {
      excludedColumn,
      historicalHitRate,
      recentHitRate,
      transitionHitRate,
      score,
    };
  });

  candidates.sort(
    (a, b) =>
      b.score - a.score || b.recentHitRate - a.recentHitRate || a.excludedColumn - b.excludedColumn,
  );

  const best = candidates[0]!;
  const betColumns = ([1, 2, 3] as RouletteColumn[]).filter(
    (column) => column !== best.excludedColumn,
  ) as [RouletteColumn, RouletteColumn];

  return {
    excludedColumn: best.excludedColumn,
    betColumns,
    confidence: Math.round(best.score * 100),
    historicalHitRate: Math.round(best.historicalHitRate * 100),
    recentHitRate: Math.round(best.recentHitRate * 100),
    transitionHitRate:
      best.transitionHitRate === null ? null : Math.round(best.transitionHitRate * 100),
    sampleSize: history.length,
    transitionSamples: transitions.length,
    pattern:
      best.transitionHitRate === null
        ? "frequencia recente e historica"
        : `transicoes depois da coluna ${latestColumn}`,
  };
}
