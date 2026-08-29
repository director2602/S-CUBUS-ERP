/**
 * S-CUBUS ERP — Import Validation Engine
 *
 * Runs the pre-publication checks from spec §11 against mapped rows.
 * Never silently imports invalid data: every problem becomes a typed,
 * human-readable ImportError attached to a row number.
 */

import {
  computeTotal,
  computePercentage,
  reconcile,
  type MarkingScheme,
} from "./calculation";

export type ImportErrorType =
  | "DUPLICATE_ID"
  | "MISSING_ID"
  | "MISSING_ROLL_NUMBER"
  | "INVALID_MARKS"
  | "OUT_OF_RANGE_MARKS"
  | "TOTAL_MISMATCH"
  | "PERCENTAGE_MISMATCH"
  | "UNKNOWN_CLASS"
  | "UNKNOWN_CODE"
  | "UNKNOWN_SUBJECT"
  | "MISSING_REQUIRED_FIELD"
  | "OTHER";

export interface RowError {
  rowNumber: number;
  field?: string;
  errorType: ImportErrorType;
  message: string;
  rawValue?: string;
}

export interface NormalizedImportRow {
  rowNumber: number;
  studentName?: string | null;
  scid?: string | null;
  sathiiKey?: string | null;
  rollNumber?: string | null;
  className?: string | null;
  batchName?: string | null;
  examCode?: string | null;
  subjectMarks: Record<string, number | null>; // subjectName -> marks (null = unparsable)
  uploadedTotal?: number | null;
  uploadedPercentage?: number | null;
}

export interface ExamConfigForValidation {
  scheme: MarkingScheme;
  subjects: { name: string; maxMarks: number }[];
  knownClassNames: string[]; // empty array = don't validate class
  knownCodes: string[]; // empty array = don't validate code
  requireScid: boolean;
  requireSathiiKey: boolean;
}

export interface ValidatedRow extends NormalizedImportRow {
  calculatedTotal: number;
  calculatedPercentage: number;
  totalMismatch: boolean;
  percentageMismatch: boolean;
  errors: RowError[];
}

export interface ValidationResult {
  validatedRows: ValidatedRow[];
  rowsWithErrors: number;
  cleanRows: number;
  allErrors: RowError[];
}

export function validateImportRows(
  rows: NormalizedImportRow[],
  config: ExamConfigForValidation
): ValidationResult {
  // Case/whitespace-insensitive: "physics" typed while configuring the
  // exam should still match a "Physics" column from the file — the
  // original casing from config.subjects is used for max-marks lookup.
  const normalizeSubjectKey = (s: string) => s.trim().toLowerCase();
  const subjectsByNormalizedName = new Map(config.subjects.map((s) => [normalizeSubjectKey(s.name), s]));
  const maxTotal = config.subjects.reduce((acc, s) => acc + s.maxMarks, 0);

  const seenRollNumbers = new Map<string, number>(); // rollNumber -> first row seen
  const seenScids = new Map<string, number>();
  const seenSathiiKeys = new Map<string, number>();

  const validatedRows: ValidatedRow[] = rows.map((rawRow) => {
    const errors: RowError[] = [];

    // --- Identity checks -----------------------------------------------
    // Roll number identifies the exam *session*. Many internal/centre
    // tests never issue a separate roll number and just use the
    // student's permanent SCID or SATHII KEY instead — fall back to
    // whichever is present rather than hard-failing every row.
    const explicitRoll = rawRow.rollNumber ? String(rawRow.rollNumber).trim() : "";
    const fallbackId = (rawRow.scid || rawRow.sathiiKey || "")?.toString().trim() ?? "";
    const row: NormalizedImportRow = {
      ...rawRow,
      rollNumber: explicitRoll || fallbackId || rawRow.rollNumber,
    };

    if (!row.rollNumber || String(row.rollNumber).trim() === "") {
      errors.push({
        rowNumber: row.rowNumber,
        field: "rollNumber",
        errorType: "MISSING_ROLL_NUMBER",
        message: "No roll number, SCID, or SATHII KEY was found to identify this student for the exam session.",
      });
    } else {
      const key = String(row.rollNumber).trim();
      if (seenRollNumbers.has(key)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: "rollNumber",
          errorType: "DUPLICATE_ID",
          message: `Roll number "${key}" also appears in row ${seenRollNumbers.get(key)}.`,
          rawValue: key,
        });
      } else {
        seenRollNumbers.set(key, row.rowNumber);
      }
    }

    if (config.requireScid) {
      if (!row.scid || String(row.scid).trim() === "") {
        errors.push({
          rowNumber: row.rowNumber,
          field: "scid",
          errorType: "MISSING_ID",
          message: "SCID is required by this template but was not found in the row.",
        });
      } else {
        const key = String(row.scid).trim();
        if (seenScids.has(key)) {
          errors.push({
            rowNumber: row.rowNumber,
            field: "scid",
            errorType: "DUPLICATE_ID",
            message: `SCID "${key}" also appears in row ${seenScids.get(key)}.`,
            rawValue: key,
          });
        } else {
          seenScids.set(key, row.rowNumber);
        }
      }
    }

    if (config.requireSathiiKey) {
      if (!row.sathiiKey || String(row.sathiiKey).trim() === "") {
        errors.push({
          rowNumber: row.rowNumber,
          field: "sathiiKey",
          errorType: "MISSING_ID",
          message: "SATHII KEY is required by this template but was not found in the row.",
        });
      } else {
        const key = String(row.sathiiKey).trim();
        if (seenSathiiKeys.has(key)) {
          errors.push({
            rowNumber: row.rowNumber,
            field: "sathiiKey",
            errorType: "DUPLICATE_ID",
            message: `SATHII KEY "${key}" also appears in row ${seenSathiiKeys.get(key)}.`,
            rawValue: key,
          });
        } else {
          seenSathiiKeys.set(key, row.rowNumber);
        }
      }
    }

    if (!row.studentName || String(row.studentName).trim() === "") {
      errors.push({
        rowNumber: row.rowNumber,
        field: "studentName",
        errorType: "MISSING_REQUIRED_FIELD",
        message: "Student name is missing.",
      });
    }

    // --- Class / code checks --------------------------------------------
    if (
      config.knownClassNames.length > 0 &&
      row.className &&
      !config.knownClassNames.includes(row.className)
    ) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "className",
        errorType: "UNKNOWN_CLASS",
        message: `Class "${row.className}" is not configured for this examination.`,
        rawValue: row.className,
      });
    }

    if (
      config.knownCodes.length > 0 &&
      row.examCode &&
      !config.knownCodes.includes(row.examCode)
    ) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "examCode",
        errorType: "UNKNOWN_CODE",
        message: `Code "${row.examCode}" is not configured for this examination.`,
        rawValue: row.examCode,
      });
    }

    // --- Marks checks -----------------------------------------------------
    const cleanSubjectMarks: number[] = [];
    for (const [subjectName, marks] of Object.entries(row.subjectMarks)) {
      const subjectDef = subjectsByNormalizedName.get(normalizeSubjectKey(subjectName));
      if (!subjectDef) {
        errors.push({
          rowNumber: row.rowNumber,
          field: subjectName,
          errorType: "UNKNOWN_SUBJECT",
          message: `Subject "${subjectName}" is not configured for this examination.`,
        });
        continue;
      }
      if (marks === null || Number.isNaN(marks)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: subjectName,
          errorType: "INVALID_MARKS",
          message: `Marks for "${subjectName}" could not be read as a number.`,
        });
        continue;
      }
      const subjectMax = subjectDef.maxMarks;
      // Allow marks to go slightly below zero only when negative marking
      // is enabled (a subject's worst case is all-wrong).
      const subjectMin = config.scheme.negativeMarking ? -subjectMax : 0;
      if (marks > subjectMax || marks < subjectMin) {
        errors.push({
          rowNumber: row.rowNumber,
          field: subjectName,
          errorType: "OUT_OF_RANGE_MARKS",
          message: `Marks for "${subjectName}" (${marks}) fall outside the valid range [${subjectMin}, ${subjectMax}].`,
          rawValue: String(marks),
        });
        continue;
      }
      cleanSubjectMarks.push(marks);
    }

    // --- Independent recalculation (spec §11) ------------------------------
    const calculatedTotal = computeTotal(cleanSubjectMarks, config.scheme.decimalPrecision);
    const calculatedPercentage = computePercentage(
      calculatedTotal,
      maxTotal,
      config.scheme.decimalPrecision
    );

    const totalCheck = reconcile(calculatedTotal, row.uploadedTotal ?? null);
    if (!totalCheck.match) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "totalMarks",
        errorType: "TOTAL_MISMATCH",
        message: `Uploaded total (${row.uploadedTotal}) does not match the independently calculated total (${calculatedTotal}).`,
      });
    }

    const percentageCheck = reconcile(calculatedPercentage, row.uploadedPercentage ?? null, 0.1);
    if (!percentageCheck.match) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "percentage",
        errorType: "PERCENTAGE_MISMATCH",
        message: `Uploaded percentage (${row.uploadedPercentage}) does not match the independently calculated percentage (${calculatedPercentage}).`,
      });
    }

    return {
      ...row,
      calculatedTotal,
      calculatedPercentage,
      totalMismatch: !totalCheck.match,
      percentageMismatch: !percentageCheck.match,
      errors,
    };
  });

  const allErrors = validatedRows.flatMap((r) => r.errors);
  const rowsWithErrors = validatedRows.filter((r) => r.errors.length > 0).length;

  return {
    validatedRows,
    rowsWithErrors,
    cleanRows: validatedRows.length - rowsWithErrors,
    allErrors,
  };
}
