/**
 * S-CUBUS ERP — Calculation Engine
 *
 * Every function here is pure and deterministic so it can be unit tested
 * and reused identically by: the import/validation pipeline, the
 * recalculate-and-verify tool, and the analytics/reporting layer.
 *
 * Formulas are documented inline. Nothing here reads exam names, subject
 * names, or years — all behaviour is driven by the MarkingScheme /
 * SubjectMarks passed in, per spec §10 and §15.
 */

export interface MarkingScheme {
  correctMarks: number;
  wrongMarks: number; // stored as a negative number, e.g. -1
  unattemptedMarks: number;
  negativeMarking: boolean;
  decimalPrecision: number;
}

export function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Marks for a single subject/question-group from raw correct/wrong/
 * unattempted counts, per the exam's marking scheme. Used when a template
 * supplies counts instead of pre-computed marks (e.g. from question-level
 * response data in a future phase).
 */
export function computeMarksFromCounts(
  correctCount: number,
  wrongCount: number,
  unattemptedCount: number,
  scheme: MarkingScheme
): number {
  const wrongPenalty = scheme.negativeMarking ? scheme.wrongMarks : 0;
  const raw =
    correctCount * scheme.correctMarks +
    wrongCount * wrongPenalty +
    unattemptedCount * scheme.unattemptedMarks;
  return roundTo(raw, scheme.decimalPrecision);
}

/** Total marks = sum of subject-wise marks obtained. */
export function computeTotal(subjectMarks: number[], precision: number): number {
  const sum = subjectMarks.reduce((acc, m) => acc + m, 0);
  return roundTo(sum, precision);
}

/** Percentage = (total obtained / total maximum) * 100. */
export function computePercentage(
  total: number,
  maxTotal: number,
  precision: number
): number {
  if (maxTotal <= 0) return 0;
  return roundTo((total / maxTotal) * 100, precision);
}

/**
 * Reconcile an ERP-calculated value against a value supplied in the source
 * file. A mismatch beyond `tolerance` must be flagged, never silently
 * overwritten (spec §11).
 */
export function reconcile(
  calculated: number,
  uploaded: number | null | undefined,
  tolerance = 0.01
): { match: boolean; diff: number | null } {
  if (uploaded === null || uploaded === undefined) {
    return { match: true, diff: null }; // nothing to reconcile against
  }
  const diff = roundTo(calculated - uploaded, 4);
  return { match: Math.abs(diff) <= tolerance, diff };
}

export interface RankableEntry<T> {
  id: T;
  score: number;
}

/**
 * Standard "competition ranking" (1224 style): equal scores share the same
 * rank, and the next distinct score's rank skips ahead by the number of
 * tied students. Descending order (highest score = rank 1).
 */
export function computeRanks<T>(entries: RankableEntry<T>[]): Map<T, number> {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const ranks = new Map<T, number>();
  let rank = 0;
  let seen = 0;
  let lastScore: number | null = null;
  for (const entry of sorted) {
    seen += 1;
    if (lastScore === null || entry.score !== lastScore) {
      rank = seen;
      lastScore = entry.score;
    }
    ranks.set(entry.id, rank);
  }
  return ranks;
}

/**
 * Percentile = percentage of the cohort scoring strictly below this
 * student. A student with the single highest score in a cohort of N gets
 * ((N-1)/N) * 100. Ties receive the same percentile.
 */
export function computePercentiles<T>(
  entries: RankableEntry<T>[],
  precision = 2
): Map<T, number> {
  const n = entries.length;
  const percentiles = new Map<T, number>();
  if (n === 0) return percentiles;
  if (n === 1) {
    percentiles.set(entries[0].id, 100);
    return percentiles;
  }
  for (const entry of entries) {
    const below = entries.filter((e) => e.score < entry.score).length;
    percentiles.set(entry.id, roundTo((below / n) * 100, precision));
  }
  return percentiles;
}

export interface CohortStats {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  topper: number;
}

/** Documented, tested descriptive statistics for a cohort (spec §15). */
export function computeCohortStats(scores: number[]): CohortStats | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const variance =
    sorted.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / n;
  return {
    count: n,
    mean: roundTo(mean, 2),
    median: roundTo(median, 2),
    min: sorted[0],
    max: sorted[n - 1],
    stdDev: roundTo(Math.sqrt(variance), 2),
    topper: sorted[n - 1],
  };
}
