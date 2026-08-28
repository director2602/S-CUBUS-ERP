import * as XLSX from "xlsx";
import crypto from "crypto";

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[]; // header -> cell value
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: ParsedSheet[];
  allCellText: string[]; // flattened text, used for exam-name detection
}

/**
 * Parse an uploaded workbook (xlsx/xls/csv) into normalized sheets with
 * header rows detected. Never throws on malformed data — malformed sheets
 * come back with zero rows so the caller can surface a clear error
 * (spec §33) instead of crashing.
 */
export function parseWorkbook(buffer: Buffer): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: ParsedSheet[] = [];
  const allCellText: string[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    if (matrix.length === 0) {
      sheets.push({ name, headers: [], rows: [] });
      continue;
    }

    // Header row = first row with more than one populated cell. A single
    // populated cell (e.g. a title like "NEET Mock Test 5 - Result Sheet")
    // is treated as a title/caption row and skipped, not mistaken for a
    // one-column header.
    const nonEmptyCount = (row: unknown) =>
      Array.isArray(row) ? row.filter((c) => c !== null && String(c).trim() !== "").length : 0;

    let headerRowIndex = matrix.findIndex((row) => nonEmptyCount(row) > 1);
    if (headerRowIndex === -1) {
      // Fall back to the first non-empty row if nothing has 2+ cells.
      headerRowIndex = matrix.findIndex((row) => nonEmptyCount(row) > 0);
    }
    if (headerRowIndex === -1) {
      sheets.push({ name, headers: [], rows: [] });
      continue;
    }

    const rawHeaders = matrix[headerRowIndex] as unknown[];
    const headers = rawHeaders.map((h, i) =>
      h === null || String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim()
    );

    const dataRows = matrix.slice(headerRowIndex + 1).filter(
      (row) => Array.isArray(row) && row.some((c) => c !== null && String(c).trim() !== "")
    );

    const rows: Record<string, unknown>[] = dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        obj[h] = (row as unknown[])[i] ?? null;
      });
      return obj;
    });

    sheets.push({ name, headers, rows });

    for (const row of matrix.slice(0, Math.min(matrix.length, 15))) {
      for (const cell of row as unknown[]) {
        if (typeof cell === "string") allCellText.push(cell);
      }
    }
  }

  return { sheetNames: workbook.SheetNames, sheets, allCellText };
}

/** Stable content fingerprint used for import idempotency (spec §36). */
export function fingerprintBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
