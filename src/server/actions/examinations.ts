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
import { requireRole, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

/** Parses "Physics:180, Chemistry:180, Biology:360" into subject rows. */
function parseSubjectsInput(raw: string): { name: string; maxMarks: number }[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, marks] = entry.split(":").map((p) => p.trim());
      const maxMarks = Number(marks);
      if (!name || Number.isNaN(maxMarks)) {
        throw new Error(`Could not parse subject "${entry}". Use format "Name:MaxMarks".`);
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

export async function createExamination(formData: FormData) {
  const user = await requireRole("RESULT_OPERATOR");

  const name = z.string().min(2).parse(formData.get("name"));
  const shortName = (formData.get("shortName") as string) || null;
  const workspace = z.enum(["EXAMS", "SATHII"]).parse(formData.get("workspace"));
  const academicYearId = z.string().min(1).parse(formData.get("academicYearId"));
  const examType = z.string().min(1).parse(formData.get("examType"));

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
    throw new Error("At least one subject is required, e.g. Physics:180, Chemistry:180");
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
  return exam;
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
