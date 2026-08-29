"use server";

import { db } from "@/db/client";
import {
  examinations,
  subjects,
  examCodes,
  academicYears,
  brandingProfiles,
  resultTemplates,
} from "@/db/schema";
import { requireRoleAction, requireRole, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

/**
 * Parses a subjects string into { name, maxMarks } rows. Accepts either
 * "Name:MaxMarks" or "Name MaxMarks" (colon optional) per entry, comma
 * separated, e.g. "Physics:180, Chemistry 180, Biology:360".
 */
function parseSubjectsInput(raw: string): { name: string; maxMarks: number }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      let name: string | undefined;
      let marksRaw: string | undefined;

      if (entry.includes(":")) {
        [name, marksRaw] = entry.split(":").map((p) => p.trim());
      } else {
        // Fall back to splitting on the last run of whitespace, so
        // "Physics 180" also works, not just "Physics:180".
        const match = entry.match(/^(.*\S)\s+(\S+)$/);
        if (match) {
          name = match[1].trim();
          marksRaw = match[2].trim();
        }
      }

      const maxMarks = Number(marksRaw);
      if (!name || marksRaw === undefined || Number.isNaN(maxMarks) || maxMarks <= 0) {
        throw new Error(
          `Could not read "${entry}" as a subject. Use "Name:MaxMarks" or "Name MaxMarks", e.g. "Physics:180".`
        );
      }
      return { name, maxMarks };
    });
}

function parseCodesInput(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export interface CreateExaminationResult {
  ok: boolean;
  error?: string;
  examId?: string;
  workspace?: string;
}

/**
 * Returns a structured result instead of throwing. Server Action error
 * *messages* are normally forwarded to the client by Next.js, but relying
 * on exception propagation across the server/client RSC boundary has
 * proven fragile in practice — a plain return value removes all ambiguity.
 */
export async function createExamination(formData: FormData): Promise<CreateExaminationResult> {
  try {
    const user = await requireRoleAction("RESULT_OPERATOR");

    const name = z.string().min(2, "Examination name is required.").parse(formData.get("name"));
    const shortName = (formData.get("shortName") as string) || null;
    const workspace = z.enum(["EXAMS", "SATHII"]).parse(formData.get("workspace"));
    const academicYearId = z
      .string()
      .min(1, "Please select an academic year.")
      .parse(formData.get("academicYearId"));
    const examType = z.string().min(1, "Exam type is required.").parse(formData.get("examType"));

    const correctMarks = Number(formData.get("correctMarks") ?? 4);
    const wrongMarks = Number(formData.get("wrongMarks") ?? -1);
    const unattemptedMarks = Number(formData.get("unattemptedMarks") ?? 0);
    const negativeMarking = formData.get("negativeMarking") === "on";
    const decimalPrecision = Number(formData.get("decimalPrecision") ?? 2);

    const subjectsRaw = (formData.get("subjects") as string) ?? "";
    const codesRaw = (formData.get("codes") as string) ?? "";
    const parsedSubjects = parseSubjectsInput(subjectsRaw);
    const parsedCodes = parseCodesInput(codesRaw);

    if (parsedSubjects.length === 0) {
      return { ok: false, error: 'At least one subject is required, e.g. "Physics:180, Chemistry:180".' };
    }

    const existingYear = db.select().from(academicYears).where(eq(academicYears.id, academicYearId)).get();
    if (!existingYear) {
      return { ok: false, error: "That academic year no longer exists. Please refresh and pick another." };
    }

    const exam = db
      .insert(examinations)
      .values({
        name,
        shortName,
        workspace,
        academicYearId,
        examType,
        correctMarks,
        wrongMarks,
        unattemptedMarks,
        negativeMarking,
        decimalPrecision,
        status: "DRAFT",
      })
      .returning()
      .get();

    for (const s of parsedSubjects) {
      db.insert(subjects).values({ examinationId: exam.id, name: s.name, maxMarks: s.maxMarks }).run();
    }
    for (const code of parsedCodes.length ? parsedCodes : ["DEFAULT"]) {
      db.insert(examCodes).values({ examinationId: exam.id, code }).run();
    }

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entityType: "Examination",
      entityId: exam.id,
      newValue: { name, workspace, examType },
    });

    revalidatePath(`/w/${workspace.toLowerCase()}/exams`);
    return { ok: true, examId: exam.id, workspace: workspace.toLowerCase() };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create examination." };
  }
}

export async function listExaminations(workspace: "EXAMS" | "SATHII") {
  await requireUser();
  return db.select().from(examinations).where(eq(examinations.workspace, workspace)).all();
}

export async function getExaminationFull(examinationId: string) {
  await requireUser();
  const exam = db.select().from(examinations).where(eq(examinations.id, examinationId)).get();
  if (!exam) return null;
  const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, examinationId)).all();
  const codes = db.select().from(examCodes).where(eq(examCodes.examinationId, examinationId)).all();
  const year = db.select().from(academicYears).where(eq(academicYears.id, exam.academicYearId)).get();
  const branding = exam.brandingProfileId
    ? db.select().from(brandingProfiles).where(eq(brandingProfiles.id, exam.brandingProfileId)).get()
    : null;
  return { exam, subjects: examSubjects, codes, year, branding };
}

export async function updateExamStatus(examinationId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const user = await requireRole("ADMIN");
  const before = db.select().from(examinations).where(eq(examinations.id, examinationId)).get();
  db.update(examinations).set({ status, updatedAt: new Date().toISOString() }).where(eq(examinations.id, examinationId)).run();
  await writeAuditLog({
    userId: user.id,
    action: `STATUS_${status}`,
    entityType: "Examination",
    entityId: examinationId,
    oldValue: { status: before?.status },
    newValue: { status },
  });
  revalidatePath(`/w`);
}

export async function assignBranding(examinationId: string, brandingProfileId: string | null) {
  const user = await requireRole("ADMIN");
  db.update(examinations)
    .set({ brandingProfileId })
    .where(eq(examinations.id, examinationId))
    .run();
  await writeAuditLog({
    userId: user.id,
    action: "UPDATE_BRANDING",
    entityType: "Examination",
    entityId: examinationId,
    newValue: { brandingProfileId },
  });
  revalidatePath(`/w`);
}

export async function listActiveResultTemplates() {
  await requireUser();
  return db
    .select()
    .from(resultTemplates)
    .where(and(eq(resultTemplates.type, "RESULT"), eq(resultTemplates.isActive, true)))
    .all();
}
