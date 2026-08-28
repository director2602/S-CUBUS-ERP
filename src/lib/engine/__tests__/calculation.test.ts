import { describe, it, expect } from "vitest";
import {
  computeMarksFromCounts,
  computeTotal,
  computePercentage,
  reconcile,
  computeRanks,
  computePercentiles,
  computeCohortStats,
  roundTo,
  type MarkingScheme,
} from "../calculation";

const scheme: MarkingScheme = {
  correctMarks: 4,
  wrongMarks: -1,
  unattemptedMarks: 0,
  negativeMarking: true,
  decimalPrecision: 2,
};

describe("computeMarksFromCounts (negative marking)", () => {
  it("applies correct/wrong/unattempted marks per scheme", () => {
    // 10 correct, 3 wrong, 2 unattempted => 10*4 + 3*(-1) + 2*0 = 37
    expect(computeMarksFromCounts(10, 3, 2, scheme)).toBe(37);
  });

  it("ignores wrong-answer penalty when negative marking is disabled", () => {
    const noNeg: MarkingScheme = { ...scheme, negativeMarking: false };
    expect(computeMarksFromCounts(10, 3, 2, noNeg)).toBe(40);
  });

  it("handles all-unattempted (no marks awarded or deducted)", () => {
    expect(computeMarksFromCounts(0, 0, 15, scheme)).toBe(0);
  });
});

describe("computeTotal", () => {
  it("sums subject-wise marks and rounds to precision", () => {
    expect(computeTotal([35.333, 40.667, 20], 2)).toBe(96);
  });

  it("returns 0 for an empty subject list (missing data)", () => {
    expect(computeTotal([], 2)).toBe(0);
  });
});

describe("computePercentage", () => {
  it("computes percentage of max marks", () => {
    expect(computePercentage(360, 720, 2)).toBe(50);
  });

  it("never divides by zero — returns 0 for zero max marks", () => {
    expect(computePercentage(10, 0, 2)).toBe(0);
  });
});

describe("reconcile (errata prevention)", () => {
  it("matches when calculated equals uploaded within tolerance", () => {
    const result = reconcile(141, 141);
    expect(result.match).toBe(true);
    expect(result.diff).toBe(0);
  });

  it("flags a mismatch rather than silently accepting it", () => {
    const result = reconcile(141, 145);
    expect(result.match).toBe(false);
    expect(result.diff).toBe(-4);
  });

  it("treats missing uploaded value as nothing to reconcile", () => {
    const result = reconcile(141, undefined);
    expect(result.match).toBe(true);
    expect(result.diff).toBeNull();
  });
});

describe("computeRanks (ties)", () => {
  it("assigns competition ranking with tie handling and skip-ahead", () => {
    const entries = [
      { id: "a", score: 90 },
      { id: "b", score: 90 },
      { id: "c", score: 80 },
      { id: "d", score: 70 },
    ];
    const ranks = computeRanks(entries);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(1);
    expect(ranks.get("c")).toBe(3); // skips rank 2 because two students tied at rank 1
    expect(ranks.get("d")).toBe(4);
  });

  it("handles a single student (no false leading/lagging claim)", () => {
    const ranks = computeRanks([{ id: "solo", score: 55 }]);
    expect(ranks.get("solo")).toBe(1);
  });
});

describe("computePercentiles", () => {
  it("computes percentile as share of cohort scoring strictly below", () => {
    const entries = [
      { id: "a", score: 100 },
      { id: "b", score: 80 },
      { id: "c", score: 60 },
      { id: "d", score: 40 },
    ];
    const pct = computePercentiles(entries);
    expect(pct.get("a")).toBe(75); // 3 of 4 below
    expect(pct.get("d")).toBe(0); // none below
  });

  it("gives ties the same percentile", () => {
    const entries = [
      { id: "a", score: 50 },
      { id: "b", score: 50 },
      { id: "c", score: 10 },
    ];
    const pct = computePercentiles(entries);
    expect(pct.get("a")).toBe(pct.get("b"));
  });

  it("returns 100 for a lone student rather than dividing by zero", () => {
    const pct = computePercentiles([{ id: "solo", score: 42 }]);
    expect(pct.get("solo")).toBe(100);
  });

  it("returns an empty map for no data", () => {
    expect(computePercentiles([]).size).toBe(0);
  });
});

describe("computeCohortStats", () => {
  it("computes mean/median/min/max/stdDev/topper", () => {
    const stats = computeCohortStats([10, 20, 30, 40, 50]);
    expect(stats).not.toBeNull();
    expect(stats!.mean).toBe(30);
    expect(stats!.median).toBe(30);
    expect(stats!.min).toBe(10);
    expect(stats!.max).toBe(50);
    expect(stats!.topper).toBe(50);
  });

  it("computes median correctly for even-length cohorts", () => {
    const stats = computeCohortStats([10, 20, 30, 40]);
    expect(stats!.median).toBe(25);
  });

  it("returns null rather than NaN/Infinity for an empty cohort", () => {
    expect(computeCohortStats([])).toBeNull();
  });
});

describe("roundTo", () => {
  it("rounds to the given decimal precision", () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(3.145, 2)).toBe(3.15);
  });
});
