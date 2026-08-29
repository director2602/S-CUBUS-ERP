import { db, sqlite } from "@/db/client";
import {
  examinations,
  subjects,
  examCodes,
  classes,
  batches,
  students,
  studentIdentifiers,
  examRegistrations,
  resultRecords,
  subjectResults,
  importJobs,
  importErrors,
  resultTemplates,
  templateFields,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  validateImportRows,
  type NormalizedImportRow,
  type ExamConfigForValidation,
  type ValidatedRow,
} from "@/lib/engine/importValidation";
import { computeRanks, computePercentiles } from "@/lib/engine/calculation";

export type ColumnMapping = Record<
  string,
  { targetField: string; subjectName?: string | null } | null
>;

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isNaN(n) ? null : n;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function normalizeRows(
  rawRows: Record<string, unknown>[],
  mapping: ColumnMapping
): NormalizedImportRow[] {
  return rawRows.map((raw, i) => {
    const row: NormalizedImportRow = {
      rowNumber: i + 2, // +1 for header row, +1 for 1-indexing
      subjectMarks: {},
    };

    for (const [column, target] of Object.entries(mapping)) {
      if (!target) continue;
      const value = raw[column];
      switch (target.targetField) {
        case "STUDENT_NAME":
          row.studentName = str(value);
          break;
        case "SCID":
          row.scid = str(value);
          break;
        case "SATHII_KEY":
          row.sathiiKey = str(value);
          break;
        case "ROLL_NUMBER":
          row.rollNumber = str(value);
          break;
        case "CLASS":
          row.className = str(value);
          break;
        case "BATCH":
          row.batchName = str(value);
          break;
        case "CODE":
          row.examCode = str(value)?.toUpperCase() ?? null;
          break;
        case "TOTAL_MARKS":
          row.uploadedTotal = parseNumber(value);
          break;
        case "PERCENTAGE":
          row.uploadedPercentage = parseNumber(value);
          break;
        case "SUBJECT_MARKS":
          if (target.subjectName) {
            row.subjectMarks[target.subjectName] = parseNumber(value);
          }
          break;
        default:
          break;
      }
    }
    return row;
  });
}

export async function buildExamConfig(
  examinationId: string,
  templateId: string
): Promise<ExamConfigForValidation> {
  const exam = db.select().from(examinations).where(eq(examinations.id, examinationId)).get();
  if (!exam) throw new Error("Examination not found");

  const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, examinationId)).all();
  const codes = db.select().from(examCodes).where(eq(examCodes.examinationId, examinationId)).all();
  const workspaceClasses = db.select().from(classes).where(eq(classes.workspace, exam.workspace)).all();

  const fields = db.select().from(templateFields).where(eq(templateFields.templateId, templateId)).all();
  const requireScid = fields.some((f) => f.targetField === "SCID" && f.required);
  const requireSathiiKey = fields.some((f) => f.targetField === "SATHII_KEY" && f.required);

  return {
    scheme: {
      correctMarks: exam.correctMarks,
      wrongMarks: exam.wrongMarks,
      unattemptedMarks: exam.unattemptedMarks,
      negativeMarking: exam.negativeMarking,
      decimalPrecision: exam.decimalPrecision,
    },
    subjects: examSubjects.map((s) => ({ name: s.name, maxMarks: s.maxMarks })),
    knownClassNames: workspaceClasses.map((c) => c.name),
    knownCodes: codes.map((c) => c.code),
    requireScid,
    requireSathiiKey,
  };
}

export interface CommitResult {
  importJobId: string;
  imported: number;
  skipped: number;
  duplicateImport: boolean;
}

/**
 * Transactionally imports validated rows: finds-or-creates students by
 * permanent identifiers (never by name alone), creates exam registrations
 * (preserving roll number/class/batch/code history), writes result
 * records with full provenance, then recalculates rank & percentile for
 * the entire exam cohort so figures stay internally consistent.
 */
export async function commitImport(params: {
  examinationId: string;
  templateId: string;
  uploadedById: string;
  fileName: string;
  sheetName: string | null;
  fingerprint: string;
  rows: ValidatedRow[]; // only rows the caller has decided to import
  totalRowCount: number;
  errorRowCount: number;
  force?: boolean;
}): Promise<CommitResult> {
  const existingJob = db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.examinationId, params.examinationId), eq(importJobs.fingerprint, params.fingerprint)))
    .get();

  const duplicateImport = Boolean(existingJob && existingJob.status === "IMPORTED");
  if (duplicateImport && !params.force) {
    return { importJobId: existingJob!.id, imported: 0, skipped: params.rows.length, duplicateImport: true };
  }

  const template = db.select().from(resultTemplates).where(eq(resultTemplates.id, params.templateId)).get();
  if (!template) throw new Error("Template not found");

  const job = db
    .insert(importJobs)
    .values({
      examinationId: params.examinationId,
      templateId: params.templateId,
      uploadedById: params.uploadedById,
      fileName: params.fileName,
      sheetName: params.sheetName,
      fingerprint: params.fingerprint,
      status: "UPLOADED",
      totalRows: params.totalRowCount,
      validRows: params.rows.length,
      errorRows: params.errorRowCount,
    })
    .returning()
    .get();

  const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, params.examinationId)).all();
  const subjectByName = new Map(examSubjects.map((s) => [s.name.trim().toLowerCase(), s]));
  const codes = db.select().from(examCodes).where(eq(examCodes.examinationId, params.examinationId)).all();
  const codeByValue = new Map(codes.map((c) => [c.code, c]));
  const exam = db.select().from(examinations).where(eq(examinations.id, params.examinationId)).get()!;
  const workspaceClasses = db.select().from(classes).where(eq(classes.workspace, exam.workspace)).all();
  const classByName = new Map(workspaceClasses.map((c) => [c.name, c]));

  let imported = 0;

  const run = sqlite.transaction(() => {
    for (const row of params.rows) {
      // --- find-or-create student by permanent identifier only ---------
      let studentId: string | null = null;
      if (row.scid) {
        const existing = db
          .select()
          .from(studentIdentifiers)
          .where(and(eq(studentIdentifiers.type, "SCID"), eq(studentIdentifiers.value, row.scid)))
          .get();
        studentId = existing?.studentId ?? null;
      }
      if (!studentId && row.sathiiKey) {
        const existing = db
          .select()
          .from(studentIdentifiers)
          .where(and(eq(studentIdentifiers.type, "SATHII_KEY"), eq(studentIdentifiers.value, row.sathiiKey)))
          .get();
        studentId = existing?.studentId ?? null;
      }

      if (!studentId) {
        const created = db
          .insert(students)
          .values({ name: row.studentName || "Unnamed Student" })
          .returning()
          .get();
        studentId = created.id;
        if (row.scid) {
          db.insert(studentIdentifiers).values({ studentId, type: "SCID", value: row.scid }).run();
        }
        if (row.sathiiKey) {
          db.insert(studentIdentifiers)
            .values({ studentId, type: "SATHII_KEY", value: row.sathiiKey })
            .run();
        }
      }

      const classRow = row.className ? classByName.get(row.className) : undefined;
      const codeRow = row.examCode ? codeByValue.get(row.examCode) : undefined;

      let batchId: string | null = null;
      if (row.batchName && classRow) {
        const existingBatch = db
          .select()
          .from(batches)
          .where(and(eq(batches.name, row.batchName), eq(batches.classId, classRow.id)))
          .get();
        batchId = existingBatch?.id ?? null;
      }

      // --- find-or-create exam registration (roll number = session id) --
      let registration = db
        .select()
        .from(examRegistrations)
        .where(
          and(
            eq(examRegistrations.examinationId, params.examinationId),
            eq(examRegistrations.rollNumber, row.rollNumber!)
          )
        )
        .get();

      if (!registration) {
        registration = db
          .insert(examRegistrations)
          .values({
            examinationId: params.examinationId,
            studentId,
            rollNumber: row.rollNumber!,
            classId: classRow?.id ?? null,
            batchId,
            examCodeId: codeRow?.id ?? null,
          })
          .returning()
          .get();
      }

      // --- create or update the result record (versioned) ---------------
      const existingResult = db
        .select()
        .from(resultRecords)
        .where(eq(resultRecords.examRegistrationId, registration.id))
        .get();

      const resultValues = {
        examinationId: params.examinationId,
        studentId,
        examRegistrationId: registration.id,
        status: "VALIDATED" as const,
        totalMarksUploaded: row.uploadedTotal ?? null,
        totalMarksCalculated: row.calculatedTotal,
        percentageCalculated: row.calculatedPercentage,
        mismatchFlag: row.totalMismatch || row.percentageMismatch,
        mismatchDetail:
          row.totalMismatch || row.percentageMismatch
            ? `Uploaded total=${row.uploadedTotal ?? "n/a"}, calculated=${row.calculatedTotal}`
            : null,
        sourceImportJobId: job.id,
        sourceRow: row.rowNumber,
        updatedAt: new Date().toISOString(),
      };

      let resultRecordId: string;
      if (existingResult) {
        resultRecordId = existingResult.id;
        db.update(resultRecords)
          .set({ ...resultValues, version: existingResult.version + 1 })
          .where(eq(resultRecords.id, existingResult.id))
          .run();
        db.delete(subjectResults).where(eq(subjectResults.resultRecordId, existingResult.id)).run();
      } else {
        const created = db.insert(resultRecords).values(resultValues).returning().get();
        resultRecordId = created.id;
      }

      for (const [subjectName, marks] of Object.entries(row.subjectMarks)) {
        const subjectRow = subjectByName.get(subjectName.trim().toLowerCase());
        if (!subjectRow || marks === null) continue;
        db.insert(subjectResults)
          .values({ resultRecordId, subjectId: subjectRow.id, marksObtained: marks })
          .run();
      }

      imported += 1;
    }

    // --- recompute rank & percentile for the WHOLE exam cohort ----------
    const allResults = db
      .select()
      .from(resultRecords)
      .where(eq(resultRecords.examinationId, params.examinationId))
      .all();
    const entries = allResults.map((r) => ({ id: r.id, score: r.totalMarksCalculated }));
    const ranks = computeRanks(entries);
    const percentiles = computePercentiles(entries);
    for (const r of allResults) {
      db.update(resultRecords)
        .set({ rank: ranks.get(r.id) ?? null, percentile: percentiles.get(r.id) ?? null })
        .where(eq(resultRecords.id, r.id))
        .run();
    }

    db.update(importJobs)
      .set({ status: "IMPORTED", importedAt: new Date().toISOString() })
      .where(eq(importJobs.id, job.id))
      .run();
  });

  run();

  return { importJobId: job.id, imported, skipped: params.rows.length - imported, duplicateImport: false };
}

export async function recordImportErrors(importJobId: string, errors: { rowNumber: number; field?: string; errorType: string; message: string; rawValue?: string }[]) {
  for (const e of errors) {
    db.insert(importErrors)
      .values({
        importJobId,
        rowNumber: e.rowNumber,
        field: e.field ?? null,
        errorType: e.errorType as never,
        message: e.message,
        rawValue: e.rawValue ?? null,
      })
      .run();
  }
}
