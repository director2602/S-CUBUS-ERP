/**
 * S-CUBUS ERP — RAG (Red/Amber/Green) Engine
 *
 * Turns a student-vs-benchmark comparison into a configurable, explainable
 * status. Never color-only: every result carries the metric, value,
 * benchmark, gap, and a plain-English reason (spec Phase 3, 71).
 *
 * RAG is analytical only — it must never be used to decide scholarship
 * eligibility (spec Phase 34). Keep this engine and the scholarship engine
 * entirely separate.
 */

export type RAGStatus = "GREEN" | "AMBER" | "RED" | "INSUFFICIENT_DATA";

export const RAG_ENGINE_VERSION = "RAG_ENGINE_v1.0";

export interface RAGConfig {
  /** Gap (value - benchmark) at or above this is GREEN. Default 0. */
  greenThreshold: number;
  /** Gap below this is RED; between this and greenThreshold is AMBER. Default -15. */
  redThreshold: number;
  /** Below this many observations in the benchmark population, don't call it. Default 3. */
  minSampleSize: number;
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  greenThreshold: 0,
  redThreshold: -15,
  minSampleSize: 3,
};

export interface RAGResult {
  status: RAGStatus;
  metric: string;
  value: number;
  benchmark: number | null;
  gap: number | null;
  reason: string;
  calculationVersion: string;
}

/**
 * Compares a value against a benchmark and returns an explainable RAG
 * status. `sampleSize` is the number of observations the benchmark itself
 * was computed from — below `minSampleSize`, the result is
 * INSUFFICIENT_DATA rather than a misleading color (spec Phase 51).
 */
export function computeRAG(
  metric: string,
  value: number,
  benchmark: number | null,
  sampleSize: number,
  config: RAGConfig = DEFAULT_RAG_CONFIG
): RAGResult {
  if (benchmark === null || sampleSize < config.minSampleSize) {
    return {
      status: "INSUFFICIENT_DATA",
      metric,
      value,
      benchmark,
      gap: null,
      reason:
        benchmark === null
          ? `No benchmark is available yet for ${metric}.`
          : `Only ${sampleSize} observation${sampleSize === 1 ? "" : "s"} available — at least ${config.minSampleSize} are needed for a reliable comparison.`,
      calculationVersion: RAG_ENGINE_VERSION,
    };
  }

  const gap = roundTo(value - benchmark, 2);

  if (gap >= config.greenThreshold) {
    return {
      status: "GREEN",
      metric,
      value,
      benchmark,
      gap,
      reason: `${metric} is ${formatGap(gap)} the benchmark of ${benchmark}.`,
      calculationVersion: RAG_ENGINE_VERSION,
    };
  }

  if (gap >= config.redThreshold) {
    return {
      status: "AMBER",
      metric,
      value,
      benchmark,
      gap,
      reason: `${metric} is ${formatGap(gap)} the benchmark of ${benchmark} — below the ${Math.abs(config.redThreshold)}-point threshold for RED.`,
      calculationVersion: RAG_ENGINE_VERSION,
    };
  }

  return {
    status: "RED",
    metric,
    value,
    benchmark,
    gap,
    reason: `${metric} is ${formatGap(gap)} the benchmark of ${benchmark} — significantly below (rule: below ${config.redThreshold} points is RED).`,
    calculationVersion: RAG_ENGINE_VERSION,
  };
}

function formatGap(gap: number): string {
  if (gap === 0) return "exactly at";
  return gap > 0 ? `+${gap} points above` : `${gap} points below`;
}

function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Accessible label pairing icon + text + value — never color alone (spec Phase 40). */
export function ragLabel(status: RAGStatus): { icon: string; text: string } {
  switch (status) {
    case "GREEN":
      return { icon: "✓", text: "GREEN" };
    case "AMBER":
      return { icon: "⚠", text: "AMBER" };
    case "RED":
      return { icon: "●", text: "RED" };
    default:
      return { icon: "—", text: "INSUFFICIENT DATA" };
  }
}
