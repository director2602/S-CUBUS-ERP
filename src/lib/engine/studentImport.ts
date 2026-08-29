/**
 * S-CUBUS ERP — Student Master bulk import
 *
 * A lighter-weight sibling to the result-import validation engine: no
 * exam, no marking scheme, just permanent student identity fields. Used
 * for bulk-adding/updating the student master list from Excel/CSV/OCR.
 */

export type StudentImportErrorType =
  | "MISSING_NAME"
  | "DUPLICATE_SCID_IN_FILE"
  | "DUPLICATE_SATHII_KEY_IN_FILE"
  | "INVALID_ROW";

export interface StudentImportRowError {
  rowNumber: number;
  field?: string;
  errorType: StudentImportErrorType;
  message: string;
}

export interface NormalizedStudentRow {
  rowNumber: number;
  name?: string | null;
  scid?: string | null;
  sathiiKey?: string | null;
}

export interface ValidatedStudentRow extends NormalizedStudentRow {
  errors: StudentImportRowError[];
}

export interface StudentImportValidationResult {
  validatedRows: ValidatedStudentRow[];
  cleanRows: number;
  rowsWithErrors: number;
  allErrors: StudentImportRowError[];
}

export function validateStudentImportRows(rows: NormalizedStudentRow[]): StudentImportValidationResult {
  const seenScids = new Map<string, number>();
  const seenSathiiKeys = new Map<string, number>();

  const validatedRows: ValidatedStudentRow[] = rows.map((row) => {
    const errors: StudentImportRowError[] = [];

    if (!row.name || row.name.trim() === "") {
      errors.push({
        rowNumber: row.rowNumber,
        field: "name",
        errorType: "MISSING_NAME",
        message: "Student name is required.",
      });
    }

    const scid = row.scid?.trim();
    if (scid) {
      if (seenScids.has(scid)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: "scid",
          errorType: "DUPLICATE_SCID_IN_FILE",
          message: `SCID "${scid}" also appears in row ${seenScids.get(scid)} of this file.`,
        });
      } else {
        seenScids.set(scid, row.rowNumber);
      }
    }

    const sathiiKey = row.sathiiKey?.trim();
    if (sathiiKey) {
      if (seenSathiiKeys.has(sathiiKey)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: "sathiiKey",
          errorType: "DUPLICATE_SATHII_KEY_IN_FILE",
          message: `SATHII KEY "${sathiiKey}" also appears in row ${seenSathiiKeys.get(sathiiKey)} of this file.`,
        });
      } else {
        seenSathiiKeys.set(sathiiKey, row.rowNumber);
      }
    }

    return { ...row, errors };
  });

  const allErrors = validatedRows.flatMap((r) => r.errors);
  const rowsWithErrors = validatedRows.filter((r) => r.errors.length > 0).length;

  return {
    validatedRows,
    cleanRows: validatedRows.length - rowsWithErrors,
    rowsWithErrors,
    allErrors,
  };
}
