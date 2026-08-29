import { describe, it, expect } from "vitest";
import { computeRAG, ragLabel, DEFAULT_RAG_CONFIG } from "../rag";

describe("computeRAG — spec worked examples", () => {
  it("Physics 82% vs class 71% (+11) -> GREEN", () => {
    const r = computeRAG("Physics", 82, 71, 10);
    expect(r.status).toBe("GREEN");
    expect(r.gap).toBe(11);
  });

  it("Chemistry 67% vs class 70% (-3) -> AMBER", () => {
    const r = computeRAG("Chemistry", 67, 70, 10);
    expect(r.status).toBe("AMBER");
    expect(r.gap).toBe(-3);
  });

  it("Biology 48% vs class 71% (-23) -> RED", () => {
    const r = computeRAG("Biology", 48, 71, 10);
    expect(r.status).toBe("RED");
    expect(r.gap).toBe(-23);
  });

  it("exactly at benchmark (gap = 0) is GREEN, not AMBER", () => {
    const r = computeRAG("Overall", 73, 73, 10);
    expect(r.status).toBe("GREEN");
    expect(r.gap).toBe(0);
  });
});

describe("computeRAG — threshold boundaries", () => {
  it("gap exactly at the red threshold (-15) is still AMBER, not RED", () => {
    const r = computeRAG("Metric", 55, 70, 10);
    expect(r.gap).toBe(-15);
    expect(r.status).toBe("AMBER");
  });

  it("gap just past the red threshold (-15.01) is RED", () => {
    const r = computeRAG("Metric", 54.99, 70, 10);
    expect(r.status).toBe("RED");
  });
});

describe("computeRAG — insufficient data (spec Phase 51)", () => {
  it("returns INSUFFICIENT_DATA when the benchmark sample is too small", () => {
    const r = computeRAG("Physics", 80, 75, 2, DEFAULT_RAG_CONFIG); // minSampleSize=3
    expect(r.status).toBe("INSUFFICIENT_DATA");
    expect(r.reason).toContain("observation");
  });

  it("returns INSUFFICIENT_DATA rather than crashing when there's no benchmark at all", () => {
    const r = computeRAG("Physics", 80, null, 0);
    expect(r.status).toBe("INSUFFICIENT_DATA");
    expect(r.gap).toBeNull();
  });

  it("does not fabricate a status for a zero-sample benchmark even if a value happens to be passed", () => {
    const r = computeRAG("Physics", 80, 75, 0);
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });
});

describe("computeRAG — configurability (spec: never hard-code thresholds)", () => {
  it("respects a custom green threshold", () => {
    const strictConfig = { greenThreshold: 5, redThreshold: -15, minSampleSize: 3 };
    // gap of +3 would be GREEN under default (>=0) but AMBER under a stricter +5 threshold
    const r = computeRAG("Physics", 78, 75, 10, strictConfig);
    expect(r.status).toBe("AMBER");
  });

  it("respects a custom red threshold", () => {
    const lenientConfig = { greenThreshold: 0, redThreshold: -30, minSampleSize: 3 };
    const r = computeRAG("Biology", 48, 71, 10, lenientConfig); // gap -23, would be RED by default
    expect(r.status).toBe("AMBER");
  });

  it("respects a custom minimum sample size", () => {
    const strictSample = { greenThreshold: 0, redThreshold: -15, minSampleSize: 10 };
    const r = computeRAG("Physics", 80, 75, 5, strictSample);
    expect(r.status).toBe("INSUFFICIENT_DATA");
  });
});

describe("computeRAG — every result is explainable (spec Phase 3, 71)", () => {
  it("always includes metric, value, benchmark, gap, and a non-empty reason", () => {
    const r = computeRAG("Physics", 82, 71, 10);
    expect(r.metric).toBe("Physics");
    expect(r.value).toBe(82);
    expect(r.benchmark).toBe(71);
    expect(r.reason.length).toBeGreaterThan(0);
    expect(r.calculationVersion).toBe("RAG_ENGINE_v1.0");
  });
});

describe("ragLabel — accessibility (spec Phase 40: never color alone)", () => {
  it("pairs every status with a distinct icon and text label", () => {
    expect(ragLabel("GREEN")).toEqual({ icon: "✓", text: "GREEN" });
    expect(ragLabel("AMBER")).toEqual({ icon: "⚠", text: "AMBER" });
    expect(ragLabel("RED")).toEqual({ icon: "●", text: "RED" });
    expect(ragLabel("INSUFFICIENT_DATA").text).toBe("INSUFFICIENT DATA");
  });
});
