"use server";

import { db } from "@/db/client";
import {
  scholarshipPolicies,
  scholarshipSlabs,
  scholarshipResults,
  resultRecords,
  examRegistrations,
  examinations,
  subjects,
} from "@/db/schema";
import { requireRole, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import {
  calculateScholarship,
  validatePolicyWeights,
  DEFAULT_SATHII_POLICY,
  type ScholarshipPolicy as EngineScholarshipPolicy,
} from "@/lib/engine/scholarship";

/** Loads the active scholarship policy (creating the SATHII default if none exists yet). */
export async function getActivePolicy() {
  await requireUser();
  let policy = db.select().from(scholarshipPolicies).where(eq(scholarshipPolicies.status, "ACTIVE")).get();

  if (!policy) {
    policy = db
      .insert(scholarshipPolicies)
      .values({
        name: "SATHII Default Policy",
        version: 1,
        status: "ACTIVE",
        marksWeight: DEFAULT_SATHII_POLICY.marksWeight,
        percentileWeight: DEFAULT_SATHII_POLICY.percentileWeight,
        maxScholarshipPercent: DEFAULT_SATHII_POLICY.maxScholarshipPercent,
        top3Enabled: DEFAULT_SATHII_POLICY.top3Enabled,
        top3Percent: DEFAULT_SATHII_POLICY.top3Percent,
      })
      .returning()
      .get();
    for (const [i, slab] of DEFAULT_SATHII_POLICY.slabs.entries()) {
      db.insert(scholarshipSlabs)
        .values({
          policyId: policy.id,
          minScore: slab.minScore === -Infinity ? -999999 : slab.minScore,
          maxScore: slab.maxScore,
          scholarshipPercent: slab.scholarshipPercent,
          order: i,
        })
        .run();
    }
  }

  const slabs = db
    .select()
    .from(scholarshipSlabs)
    .where(eq(scholarshipSlabs.policyId, policy.id))
    .all()
    .sort((a, b) => a.order - b.order);

  return { policy, slabs };
}

function toEnginePolicy(policy: typeof scholarshipPolicies.$inferSelect, slabs: (typeof scholarshipSlabs.$inferSelect)[]): EngineScholarshipPolicy {
  return {
    marksWeight: policy.marksWeight,
    percentileWeight: policy.percentileWeight,
    maxScholarshipPercent: policy.maxScholarshipPercent,
    top3Enabled: policy.top3Enabled,
    top3Percent: policy.top3Percent,
    minPercentage: policy.minPercentage,
    minPercentile: policy.minPercentile,
    minMarks: policy.minMarks,
    slabs: slabs.map((s) => ({
      minScore: s.minScore <= -999999 ? -Infinity : s.minScore,
      maxScore: s.maxScore,
      scholarshipPercent: s.scholarshipPercent,
    })),
  };
}

const updatePolicySchema = z.object({
  marksWeight: z.number().min(0).max(1),
  percentileWeight: z.number().min(0).max(1),
  maxScholarshipPercent: z.number().min(0).max(100),
  top3Enabled: z.boolean(),
  top3Percent: z.number().min(0).max(100),
  minPercentage: z.number().nullable(),
  minPercentile: z.number().nullable(),
  minMarks: z.number().nullable(),
  defaultTuitionFee: z.number().min(0),
});

export interface UpdatePolicyResult {
  ok: boolean;
  error?: string;
}

export async function updateActivePolicy(input: z.infer<typeof updatePolicySchema>): Promise<UpdatePolicyResult> {
  try {
    const actor = await requireRole("OWNER");
    const parsed = updatePolicySchema.parse(input);

    if (!validatePolicyWeights(parsed.marksWeight, parsed.percentileWeight)) {
      return { ok: false, error: "Marks Weight and Percentile Weight must add up to exactly 100%." };
    }

    const { policy: current } = await getActivePolicy();

    db.update(scholarshipPolicies)
      .set({
        marksWeight: parsed.marksWeight,
        percentileWeight: parsed.percentileWeight,
        maxScholarshipPercent: parsed.maxScholarshipPercent,
        top3Enabled: parsed.top3Enabled,
        top3Percent: parsed.top3Percent,
        minPercentage: parsed.minPercentage,
        minPercentile: parsed.minPercentile,
        minMarks: parsed.minMarks,
        defaultTuitionFee: parsed.defaultTuitionFee,
      })
      .where(eq(scholarshipPolicies.id, current.id))
      .run();

    await writeAuditLog({
      userId: actor.id,
      action: "UPDATE_SCHOLARSHIP_POLICY",
      entityType: "ScholarshipPolicy",
      entityId: current.id,
      newValue: parsed,
    });

    revalidatePath("/settings/scholarship");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update policy." };
  }
}

export interface BulkCalculateResult {
  ok: boolean;
  error?: string;
  calculated?: number;
  topMerit?: number;
  eligible?: number;
  notEligible?: number;
}

/**
 * Calculates scholarships for every result in an examination. Class rank is
 * computed here (rank within students sharing the same class on this exam),
 * since it's a SATHII-specific ranking distinct from the overall exam rank.
 */
export async function bulkCalculateScholarships(examinationId: string, tuitionFee: number): Promise<BulkCalculateResult> {
  try {
    const actor = await requireRole("RESULT_OPERATOR");
    const { policy, slabs } = await getActivePolicy();
    const enginePolicy = toEnginePolicy(policy, slabs);

    const results = db.select().from(resultRecords).where(eq(resultRecords.examinationId, examinationId)).all();
    const registrations = db.select().from(examRegistrations).where(eq(examRegistrations.examinationId, examinationId)).all();
    const regById = new Map(registrations.map((r) => [r.id, r]));

    const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, examinationId)).all();
    const maximumMarks = examSubjects.reduce((acc, s) => acc + s.maxMarks, 0) || 1;

    // Class rank: rank within each class group by total marks (competition ranking).
    const byClass = new Map<string, typeof results>();
    for (const r of results) {
      const classId = regById.get(r.examRegistrationId)?.classId ?? "__none__";
      const list = byClass.get(classId) ?? [];
      list.push(r);
      byClass.set(classId, list);
    }
    const classRankByResultId = new Map<string, number>();
    for (const [, group] of byClass) {
      const sorted = [...group].sort((a, b) => b.totalMarksCalculated - a.totalMarksCalculated);
      let rank = 0, seen = 0, lastScore: number | null = null;
      for (const r of sorted) {
        seen += 1;
        if (lastScore === null || r.totalMarksCalculated !== lastScore) {
          rank = seen;
          lastScore = r.totalMarksCalculated;
        }
        classRankByResultId.set(r.id, rank);
      }
    }

    let topMerit = 0, eligible = 0, notEligible = 0;

    for (const r of results) {
      const classRank = classRankByResultId.get(r.id) ?? null;
      const calc = calculateScholarship({
        marks: r.totalMarksCalculated,
        maximumMarks,
        percentile: r.percentile,
        classRank,
        tuitionFee,
        policy: enginePolicy,
      });

      if (calc.scholarshipCategory === "TOP_3_CLASS_MERIT") topMerit += 1;
      if (calc.eligibilityStatus === "ELIGIBLE") eligible += 1;
      if (calc.eligibilityStatus === "NOT_ELIGIBLE") notEligible += 1;

      const existing = db.select().from(scholarshipResults).where(eq(scholarshipResults.resultRecordId, r.id)).get();
      const values = {
        resultRecordId: r.id,
        studentId: r.studentId,
        policyId: policy.id,
        percentage: calc.percentage,
        percentile: r.percentile,
        classRank,
        overallRank: r.rank,
        sesScore: calc.sesScore,
        eligibilityStatus: calc.eligibilityStatus,
        ineligibilityReason: calc.ineligibilityReason,
        scholarshipCategory: calc.scholarshipCategory,
        scholarshipPercentage: calc.scholarshipPercentage,
        tuitionFee: calc.tuitionFee,
        scholarshipAmount: calc.scholarshipAmount,
        netTuitionFee: calc.netTuitionFee,
        explanation: calc.explanation,
        calculationVersion: calc.calculationVersion,
        updatedAt: new Date().toISOString(),
      };

      if (existing) {
        db.update(scholarshipResults).set(values).where(eq(scholarshipResults.id, existing.id)).run();
      } else {
        db.insert(scholarshipResults).values(values).run();
      }
    }

    await writeAuditLog({
      userId: actor.id,
      action: "BULK_CALCULATE_SCHOLARSHIP",
      entityType: "Examination",
      entityId: examinationId,
      newValue: { calculated: results.length, topMerit, eligible, notEligible, policyId: policy.id },
    });

    revalidatePath(`/w/sathii/exams/${examinationId}`);
    return { ok: true, calculated: results.length, topMerit, eligible, notEligible };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Scholarship calculation failed." };
  }
}

export async function getScholarshipForResult(resultRecordId: string) {
  await requireUser();
  return db.select().from(scholarshipResults).where(eq(scholarshipResults.resultRecordId, resultRecordId)).get() ?? null;
}
