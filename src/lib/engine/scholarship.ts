/**
 * S-CUBUS ERP — Scholarship Engine (SATHII)
 *
 * A pure, deterministic calculation engine, independent of the UI, per the
 * SATHII 2027 Complete Scholarship Engine specification. Same input + same
 * policy version = same result, always.
 *
 * Formulas implemented (spec §6, §8, §10-14, §19-23):
 *   SES = marksWeight * percentage + percentileWeight * percentile
 *   Slab lookup: highest matching [minScore, maxScore) band
 *   Top-3-of-class merit overrides SES scholarship when eligible
 *   Scholarship Amount = MIN(tuitionFee * pct, tuitionFee), never negative
 */

export const CALCULATION_VERSION = "SCHOLARSHIP_ENGINE_v1.0";

export type ScholarshipCategory =
  | "TOP_3_CLASS_MERIT"
  | "SES_SCHOLARSHIP"
  | "NO_SCHOLARSHIP"
  | "NOT_ELIGIBLE"
  | "DISQUALIFIED"
  | "INCOMPLETE";

export interface ScholarshipSlab {
  minScore: number;
  maxScore: number | null; // null = no upper bound
  scholarshipPercent: number;
}

export interface ScholarshipPolicy {
  marksWeight: number;
  percentileWeight: number;
  maxScholarshipPercent: number;
  top3Enabled: boolean;
  top3Percent: number;
  minPercentage: number | null;
  minPercentile: number | null;
  minMarks: number | null;
  slabs: ScholarshipSlab[];
}

export interface ScholarshipInput {
  marks: number;
  maximumMarks: number;
  percentile: number | null;
  classRank: number | null;
  tuitionFee: number;
  isDisqualified?: boolean;
  policy: ScholarshipPolicy;
}

export interface ScholarshipResult {
  percentage: number;
  sesScore: number | null;
  eligibilityStatus: "ELIGIBLE" | "NOT_ELIGIBLE" | "INCOMPLETE" | "BLOCKED";
  ineligibilityReason: string | null;
  scholarshipCategory: ScholarshipCategory;
  scholarshipPercentage: number;
  tuitionFee: number;
  scholarshipAmount: number;
  netTuitionFee: number;
  explanation: string;
  calculationVersion: string;
}

/** Round to 2 decimal places, avoiding floating-point noise. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Validate policy weights sum to 1.0 (spec §7). */
export function validatePolicyWeights(marksWeight: number, percentileWeight: number): boolean {
  return Math.abs(marksWeight + percentileWeight - 1) < 0.001;
}

/** SES = marksWeight * percentage + percentileWeight * percentile (spec §6). */
export function computeSES(percentage: number, percentile: number, marksWeight: number, percentileWeight: number): number {
  return round2(marksWeight * percentage + percentileWeight * percentile);
}

/** Finds the highest-priority matching slab for a given SES score (spec §8-9). */
export function resolveSlab(ses: number, slabs: ScholarshipSlab[]): ScholarshipSlab | null {
  const match = slabs.find((s) => ses >= s.minScore && (s.maxScore === null || ses < s.maxScore));
  return match ?? null;
}

/**
 * Full scholarship calculation for one student, following the pipeline in
 * spec §79: validate → percentage → SES → eligibility → Top-3 → slab →
 * priority → tuition → explanation.
 */
export function calculateScholarship(input: ScholarshipInput): ScholarshipResult {
  const { marks, maximumMarks, percentile, classRank, tuitionFee, policy } = input;

  // --- Invalid-data guards (spec §66) — calculation is blocked, not guessed ---
  if (maximumMarks <= 0) {
    return blocked("Maximum marks must be greater than zero.");
  }
  if (marks < 0) {
    return blocked("Marks cannot be negative.");
  }
  if (percentile !== null && (percentile < 0 || percentile > 100)) {
    return blocked("Percentile must be between 0 and 100.");
  }

  const percentage = round2((marks / maximumMarks) * 100);

  // --- Disqualification (highest priority, spec §12 priority 1) ---
  if (input.isDisqualified) {
    return {
      percentage,
      sesScore: null,
      eligibilityStatus: "NOT_ELIGIBLE",
      ineligibilityReason: "Student is disqualified.",
      scholarshipCategory: "DISQUALIFIED",
      scholarshipPercentage: 0,
      tuitionFee,
      scholarshipAmount: 0,
      netTuitionFee: round2(Math.max(tuitionFee, 0)),
      explanation: "Not eligible: student is disqualified.",
      calculationVersion: CALCULATION_VERSION,
    };
  }

  // --- Eligibility checks (spec §5, §49) ---
  const failures: string[] = [];
  if (policy.minPercentage !== null && percentage < policy.minPercentage) {
    failures.push(`percentage ${percentage}% is below the minimum ${policy.minPercentage}%`);
  }
  if (policy.minMarks !== null && marks < policy.minMarks) {
    failures.push(`marks ${marks} are below the minimum ${policy.minMarks}`);
  }
  if (policy.minPercentile !== null) {
    if (percentile === null) {
      return incomplete(percentage, "Percentile is required by this policy but is not available yet.");
    }
    if (percentile < policy.minPercentile) {
      failures.push(`percentile ${percentile} is below the minimum ${policy.minPercentile}`);
    }
  }
  if (failures.length > 0) {
    const reason = `Not eligible: ${failures.join("; ")}.`;
    return {
      percentage,
      sesScore: null,
      eligibilityStatus: "NOT_ELIGIBLE",
      ineligibilityReason: reason,
      scholarshipCategory: "NOT_ELIGIBLE",
      scholarshipPercentage: 0,
      tuitionFee,
      scholarshipAmount: 0,
      netTuitionFee: round2(Math.max(tuitionFee, 0)),
      explanation: reason,
      calculationVersion: CALCULATION_VERSION,
    };
  }

  // --- Top-3-of-class merit (spec §10-13, priority 2) ---
  if (policy.top3Enabled && classRank !== null && classRank <= 3) {
    const pct = Math.min(policy.top3Percent, policy.maxScholarshipPercent);
    const amount = round2(Math.min(tuitionFee * (pct / 100), tuitionFee));
    return {
      percentage,
      sesScore: percentile !== null ? computeSES(percentage, percentile, policy.marksWeight, policy.percentileWeight) : null,
      eligibilityStatus: "ELIGIBLE",
      ineligibilityReason: null,
      scholarshipCategory: "TOP_3_CLASS_MERIT",
      scholarshipPercentage: pct,
      tuitionFee,
      scholarshipAmount: amount,
      netTuitionFee: round2(Math.max(tuitionFee - amount, 0)),
      explanation: `Top ${classRank} in class — 100% tuition fee waiver under the Top-3 Class Merit rule.`,
      calculationVersion: CALCULATION_VERSION,
    };
  }

  // --- SES-based standard scholarship (spec §6, §8, priority 5) ---
  if (percentile === null) {
    return incomplete(percentage, "Percentile is not available yet, so the SES score cannot be calculated.");
  }

  const ses = computeSES(percentage, percentile, policy.marksWeight, policy.percentileWeight);
  const slab = resolveSlab(ses, policy.slabs);
  const pct = Math.min(slab?.scholarshipPercent ?? 0, policy.maxScholarshipPercent);
  const amount = round2(Math.min(tuitionFee * (pct / 100), tuitionFee));

  return {
    percentage,
    sesScore: ses,
    eligibilityStatus: "ELIGIBLE",
    ineligibilityReason: null,
    scholarshipCategory: pct > 0 ? "SES_SCHOLARSHIP" : "NO_SCHOLARSHIP",
    scholarshipPercentage: pct,
    tuitionFee,
    scholarshipAmount: amount,
    netTuitionFee: round2(Math.max(tuitionFee - amount, 0)),
    explanation:
      pct > 0
        ? `Scholarship awarded under SES score of ${ses.toFixed(2)} (${policy.marksWeight * 100}% marks + ${policy.percentileWeight * 100}% percentile).`
        : `SES score of ${ses.toFixed(2)} did not meet the minimum slab threshold for a scholarship.`,
    calculationVersion: CALCULATION_VERSION,
  };
}

function blocked(reason: string): ScholarshipResult {
  return {
    percentage: 0,
    sesScore: null,
    eligibilityStatus: "BLOCKED",
    ineligibilityReason: reason,
    scholarshipCategory: "NOT_ELIGIBLE",
    scholarshipPercentage: 0,
    tuitionFee: 0,
    scholarshipAmount: 0,
    netTuitionFee: 0,
    explanation: `Calculation blocked: ${reason}`,
    calculationVersion: CALCULATION_VERSION,
  };
}

function incomplete(percentage: number, reason: string): ScholarshipResult {
  return {
    percentage,
    sesScore: null,
    eligibilityStatus: "INCOMPLETE",
    ineligibilityReason: reason,
    scholarshipCategory: "INCOMPLETE",
    scholarshipPercentage: 0,
    tuitionFee: 0,
    scholarshipAmount: 0,
    netTuitionFee: 0,
    explanation: reason,
    calculationVersion: CALCULATION_VERSION,
  };
}

/** The SATHII 2027 default policy exactly as specified (spec §8, §75). */
export const DEFAULT_SATHII_SLABS: ScholarshipSlab[] = [
  { minScore: 95, maxScore: null, scholarshipPercent: 100 },
  { minScore: 90, maxScore: 95, scholarshipPercent: 90 },
  { minScore: 85, maxScore: 90, scholarshipPercent: 75 },
  { minScore: 80, maxScore: 85, scholarshipPercent: 60 },
  { minScore: 75, maxScore: 80, scholarshipPercent: 50 },
  { minScore: 70, maxScore: 75, scholarshipPercent: 40 },
  { minScore: 65, maxScore: 70, scholarshipPercent: 30 },
  { minScore: 60, maxScore: 65, scholarshipPercent: 20 },
  { minScore: 55, maxScore: 60, scholarshipPercent: 10 },
  { minScore: -Infinity, maxScore: 55, scholarshipPercent: 0 },
];

export const DEFAULT_SATHII_POLICY: ScholarshipPolicy = {
  marksWeight: 0.7,
  percentileWeight: 0.3,
  maxScholarshipPercent: 100,
  top3Enabled: true,
  top3Percent: 100,
  minPercentage: null,
  minPercentile: null,
  minMarks: null,
  slabs: DEFAULT_SATHII_SLABS,
};
