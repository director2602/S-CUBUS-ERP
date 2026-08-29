import { describe, it, expect } from "vitest";
import { validateStudentImportRows, type NormalizedStudentRow } from "../studentImport";

describe("validateStudentImportRows", () => {
  it("passes a clean row with no errors", () => {
    const rows: NormalizedStudentRow[] = [{ rowNumber: 2, name: "Aarav Sharma", scid: "SC001" }];
    const result = validateStudentImportRows(rows);
    expect(result.cleanRows).toBe(1);
    expect(result.rowsWithErrors).toBe(0);
  });

  it("flags a missing name", () => {
    const rows: NormalizedStudentRow[] = [{ rowNumber: 2, name: "", scid: "SC001" }];
    const result = validateStudentImportRows(rows);
    expect(result.allErrors.some((e) => e.errorType === "MISSING_NAME")).toBe(true);
  });

  it("flags duplicate SCIDs within the same file", () => {
    const rows: NormalizedStudentRow[] = [
      { rowNumber: 2, name: "Aarav Sharma", scid: "SC001" },
      { rowNumber: 3, name: "Different Person", scid: "SC001" },
    ];
    const result = validateStudentImportRows(rows);
    expect(result.allErrors.some((e) => e.errorType === "DUPLICATE_SCID_IN_FILE")).toBe(true);
  });

  it("flags duplicate SATHII KEYs within the same file", () => {
    const rows: NormalizedStudentRow[] = [
      { rowNumber: 2, name: "A", sathiiKey: "SK1" },
      { rowNumber: 3, name: "B", sathiiKey: "SK1" },
    ];
    const result = validateStudentImportRows(rows);
    expect(result.allErrors.some((e) => e.errorType === "DUPLICATE_SATHII_KEY_IN_FILE")).toBe(true);
  });

  it("allows rows with no SCID or SATHII KEY at all (name-only students)", () => {
    const rows: NormalizedStudentRow[] = [{ rowNumber: 2, name: "No ID Student" }];
    const result = validateStudentImportRows(rows);
    expect(result.cleanRows).toBe(1);
  });

  it("counts clean vs error rows correctly across a mixed batch", () => {
    const rows: NormalizedStudentRow[] = [
      { rowNumber: 2, name: "Good", scid: "SC001" },
      { rowNumber: 3, name: "", scid: "SC002" },
      { rowNumber: 4, name: "Also Good", scid: "SC003" },
    ];
    const result = validateStudentImportRows(rows);
    expect(result.cleanRows).toBe(2);
    expect(result.rowsWithErrors).toBe(1);
  });
});
