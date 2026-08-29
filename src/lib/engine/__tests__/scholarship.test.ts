import { describe, it, expect } from "vitest";
import {
  computeSES,
  resolveSlab,
  calculateScholarship,
  validatePolicyWeights,
  DEFAULT_SATHII_POLICY,
  DEFAULT_SATHII_SLABS,
  type ScholarshipInput,
} from "../scholarship";

describe("computeSES", () => {
  it("matches the spec §6 worked example exactly (86%, percentile 94 -> SES 88.4)", () => {
    expect(computeSES(86, 94, 0.7, 0.3)).toBe(88.4);
  });
});

describe("validatePolicyWeights", () => {
  it("accepts weights summing to 1.0", () => {
    expect(validatePolicyWeights(0.7, 0.3)).toBe(true);
    expect(validatePolicyWeights(0.8, 0.2)).toBe(true);
    expect(validatePolicyWeights(0.5, 0.5)).toBe(true);
  });
  it("rejects weights that do not sum to 1.0", () => {
    expect(validatePolicyWeights(0.7, 0.4)).toBe(false);
    expect(validatePolicyWeights(0.5, 0.3)).toBe(false);
  });
});

describe("resolveSlab (spec §8 default slabs)", () => {
  it.each([
    [95, 100], [97, 100],
    [90, 90], [94.99, 90],
    [85, 75], [89.99, 75],
    [80, 60], [84.99, 60],
    [75, 50], [79.99, 50],
    [70, 40], [74.99, 40],
    [65, 30], [69.99, 30],
    [60, 20], [64.99, 20],
    [55, 10], [59.99, 10],
    [54.99, 0], [0, 0],
  ])("SES %s -> %s%%", (ses, expectedPct) => {
    const slab = resolveSlab(ses, DEFAULT_SATHII_SLABS);
    expect(slab?.scholarshipPercent).toBe(expectedPct);
  });
});

function baseInput(overrides: Partial<ScholarshipInput> = {}): ScholarshipInput {
  return {
    marks: 0,
    maximumMarks: 100,
    percentile: null,
    classRank: null,
    tuitionFee: 100000,
    policy: DEFAULT_SATHII_POLICY,
    ...overrides,
  };
}

describe("calculateScholarship — spec §59 SES test cases", () => {
  // TEST 1: Marks=95, Percentile=97 -> SES 95.6 -> 100%
  it("TEST 1: 95 marks, percentile 97 -> 100%", () => {
    const r = calculateScholarship(baseInput({ marks: 95, percentile: 97 }));
    expect(r.sesScore).toBe(95.6);
    expect(r.scholarshipPercentage).toBe(100);
  });

  // TEST 2: Marks=92, Percentile=90 -> SES 91.4 -> 90%
  it("TEST 2: 92 marks, percentile 90 -> 90%", () => {
    const r = calculateScholarship(baseInput({ marks: 92, percentile: 90 }));
    expect(r.sesScore).toBe(91.4);
    expect(r.scholarshipPercentage).toBe(90);
  });

  // TEST 3: Marks=86, Percentile=94 -> SES 88.4 -> 75%
  it("TEST 3: 86 marks, percentile 94 -> 75%", () => {
    const r = calculateScholarship(baseInput({ marks: 86, percentile: 94 }));
    expect(r.sesScore).toBe(88.4);
    expect(r.scholarshipPercentage).toBe(75);
  });

  // TEST 4: Marks=81, Percentile=80 -> SES 80.7 -> 60%
  it("TEST 4: 81 marks, percentile 80 -> 60%", () => {
    const r = calculateScholarship(baseInput({ marks: 81, percentile: 80 }));
    expect(r.sesScore).toBe(80.7);
    expect(r.scholarshipPercentage).toBe(60);
  });

  // TEST 5: Marks=76, Percentile=75 -> SES 75.7 -> 50%
  it("TEST 5: 76 marks, percentile 75 -> 50%", () => {
    const r = calculateScholarship(baseInput({ marks: 76, percentile: 75 }));
    expect(r.sesScore).toBe(75.7);
    expect(r.scholarshipPercentage).toBe(50);
  });

  // TEST 6: Marks=70, Percentile=70 -> SES 70 -> 40%
  it("TEST 6: 70 marks, percentile 70 -> 40%", () => {
    const r = calculateScholarship(baseInput({ marks: 70, percentile: 70 }));
    expect(r.sesScore).toBe(70);
    expect(r.scholarshipPercentage).toBe(40);
  });

  // TEST 7: Marks=65, Percentile=65 -> SES 65 -> 30%
  it("TEST 7: 65 marks, percentile 65 -> 30%", () => {
    const r = calculateScholarship(baseInput({ marks: 65, percentile: 65 }));
    expect(r.sesScore).toBe(65);
    expect(r.scholarshipPercentage).toBe(30);
  });

  // TEST 8: Marks=60, Percentile=60 -> SES 60 -> 20%
  it("TEST 8: 60 marks, percentile 60 -> 20%", () => {
    const r = calculateScholarship(baseInput({ marks: 60, percentile: 60 }));
    expect(r.sesScore).toBe(60);
    expect(r.scholarshipPercentage).toBe(20);
  });

  // TEST 9: Marks=55, Percentile=55 -> SES 55 -> 10%
  it("TEST 9: 55 marks, percentile 55 -> 10%", () => {
    const r = calculateScholarship(baseInput({ marks: 55, percentile: 55 }));
    expect(r.sesScore).toBe(55);
    expect(r.scholarshipPercentage).toBe(10);
  });

  // TEST 10: Marks=50, Percentile=50 -> SES 50 -> 0%
  it("TEST 10: 50 marks, percentile 50 -> 0%", () => {
    const r = calculateScholarship(baseInput({ marks: 50, percentile: 50 }));
    expect(r.sesScore).toBe(50);
    expect(r.scholarshipPercentage).toBe(0);
    expect(r.scholarshipCategory).toBe("NO_SCHOLARSHIP");
  });
});

describe("calculateScholarship — spec §60-62 Top-3 class merit tests", () => {
  it("TEST 60: class rank 1-3 each get 100%, rank 4 gets normal calculation", () => {
    const rank1 = calculateScholarship(baseInput({ marks: 60, percentile: 60, classRank: 1 }));
    const rank2 = calculateScholarship(baseInput({ marks: 60, percentile: 60, classRank: 2 }));
    const rank3 = calculateScholarship(baseInput({ marks: 60, percentile: 60, classRank: 3 }));
    const rank4 = calculateScholarship(baseInput({ marks: 60, percentile: 60, classRank: 4 }));

    expect(rank1.scholarshipPercentage).toBe(100);
    expect(rank1.scholarshipCategory).toBe("TOP_3_CLASS_MERIT");
    expect(rank2.scholarshipPercentage).toBe(100);
    expect(rank3.scholarshipPercentage).toBe(100);
    // Rank 4 falls through to normal SES scholarship (SES=60 -> 20%)
    expect(rank4.scholarshipCategory).toBe("SES_SCHOLARSHIP");
    expect(rank4.scholarshipPercentage).toBe(20);
  });

  it("TEST 61: Top-3 overrides a lower SES scholarship (class rank 2, SES 82 -> would be 60%, but Top-3 wins with 100%)", () => {
    // marks=82.7, percentile=81.5 approx gives SES~82; use direct values matching SES=82
    const r = calculateScholarship(baseInput({ marks: 82, percentile: 82, classRank: 2 }));
    expect(r.scholarshipCategory).toBe("TOP_3_CLASS_MERIT");
    expect(r.scholarshipPercentage).toBe(100);
  });

  it("TEST 62: class rank 10 (not Top-3), SES 88 -> normal 75% scholarship", () => {
    // Choose marks/percentile so SES lands at 88: 0.7*x + 0.3*y = 88
    const r = calculateScholarship(baseInput({ marks: 88, percentile: 88, classRank: 10 }));
    expect(r.scholarshipCategory).toBe("SES_SCHOLARSHIP");
    expect(r.scholarshipPercentage).toBe(75);
  });

  it("does not award Top-3 to a disqualified student (spec §13)", () => {
    const r = calculateScholarship(baseInput({ marks: 60, percentile: 60, classRank: 1, isDisqualified: true }));
    expect(r.scholarshipCategory).toBe("DISQUALIFIED");
    expect(r.scholarshipPercentage).toBe(0);
  });
});

describe("calculateScholarship — spec §63-65 tuition tests", () => {
  it("TEST 63: 75% scholarship on ₹100,000 tuition -> ₹75,000 scholarship, ₹25,000 net", () => {
    const r = calculateScholarship(baseInput({ marks: 86, percentile: 94, tuitionFee: 100000 }));
    expect(r.scholarshipPercentage).toBe(75);
    expect(r.scholarshipAmount).toBe(75000);
    expect(r.netTuitionFee).toBe(25000);
  });

  it("TEST 64: Top-3 on ₹100,000 tuition -> full ₹100,000 waiver, ₹0 net", () => {
    const r = calculateScholarship(baseInput({ marks: 60, percentile: 60, classRank: 1, tuitionFee: 100000 }));
    expect(r.scholarshipAmount).toBe(100000);
    expect(r.netTuitionFee).toBe(0);
  });

  it("TEST 65: zero tuition fee never produces a negative or NaN result", () => {
    const r = calculateScholarship(baseInput({ marks: 95, percentile: 97, tuitionFee: 0 }));
    expect(r.scholarshipAmount).toBe(0);
    expect(r.netTuitionFee).toBe(0);
  });
});

describe("calculateScholarship — spec §66 invalid data tests", () => {
  it("blocks when maximum marks is zero", () => {
    const r = calculateScholarship(baseInput({ marks: 10, maximumMarks: 0 }));
    expect(r.eligibilityStatus).toBe("BLOCKED");
  });

  it("blocks when marks is negative", () => {
    const r = calculateScholarship(baseInput({ marks: -5 }));
    expect(r.eligibilityStatus).toBe("BLOCKED");
  });

  it("blocks when percentile is over 100", () => {
    const r = calculateScholarship(baseInput({ marks: 80, percentile: 150 }));
    expect(r.eligibilityStatus).toBe("BLOCKED");
  });

  it("scholarship percentage is always capped at the policy maximum", () => {
    const cappedPolicy = { ...DEFAULT_SATHII_POLICY, maxScholarshipPercent: 80 };
    const r = calculateScholarship(baseInput({ marks: 95, percentile: 97, policy: cappedPolicy }));
    expect(r.scholarshipPercentage).toBeLessThanOrEqual(80);
  });
});

describe("calculateScholarship — eligibility and incomplete data", () => {
  it("marks NOT_ELIGIBLE when below a configured minimum percentage", () => {
    const strictPolicy = { ...DEFAULT_SATHII_POLICY, minPercentage: 50 };
    const r = calculateScholarship(baseInput({ marks: 30, percentile: 60, policy: strictPolicy }));
    expect(r.eligibilityStatus).toBe("NOT_ELIGIBLE");
    expect(r.scholarshipPercentage).toBe(0);
    expect(r.ineligibilityReason).toContain("below the minimum");
  });

  it("never fabricates a percentile — marks INCOMPLETE instead when percentile is missing", () => {
    const r = calculateScholarship(baseInput({ marks: 80, percentile: null }));
    expect(r.eligibilityStatus).toBe("INCOMPLETE");
    expect(r.scholarshipCategory).toBe("INCOMPLETE");
  });

  it("every result includes a human-readable explanation (spec §27, §53, §76)", () => {
    const r = calculateScholarship(baseInput({ marks: 86, percentile: 94 }));
    expect(r.explanation.length).toBeGreaterThan(0);
  });
});
