import { describe, it, expect } from "vitest";
import { validateImportRows, type NormalizedImportRow, type ExamConfigForValidation } from "../importValidation";

const config: ExamConfigForValidation = {
  scheme: {
    correctMarks: 4,
    wrongMarks: -1,
    unattemptedMarks: 0,
    negativeMarking: true,
    decimalPrecision: 2,
  },
  subjects: [
    { name: "Physics", maxMarks: 180 },
    { name: "Chemistry", maxMarks: 180 },
    { name: "Biology", maxMarks: 360 },
  ],
  knownClassNames: ["Class 11", "Class 12"],
  knownCodes: ["A", "B"],
  requireScid: true,
  requireSathiiKey: false,
};

function row(overrides: Partial<NormalizedImportRow>): NormalizedImportRow {
  return {
    rowNumber: 2,
    studentName: "Test Student",
    scid: "SC001",
    rollNumber: "R001",
    className: "Class 11",
    examCode: "A",
    subjectMarks: { Physics: 140, Chemistry: 130, Biology: 300 },
    uploadedTotal: 570,
    ...overrides,
  };
}

describe("validateImportRows", () => {
  it("passes a fully clean row with no errors", () => {
    const result = validateImportRows([row({})], config);
    expect(result.rowsWithErrors).toBe(0);
    expect(result.validatedRows[0].calculatedTotal).toBe(570);
  });

  it("flags a missing roll number", () => {
    const result = validateImportRows([row({ rollNumber: "" })], config);
    expect(result.allErrors.some((e) => e.errorType === "MISSING_ROLL_NUMBER")).toBe(true);
  });

  it("flags duplicate roll numbers across rows", () => {
    const rows = [
      row({ rowNumber: 2, rollNumber: "R001", scid: "SC001" }),
      row({ rowNumber: 3, rollNumber: "R001", scid: "SC002" }),
    ];
    const result = validateImportRows(rows, config);
    expect(result.allErrors.some((e) => e.errorType === "DUPLICATE_ID" && e.field === "rollNumber")).toBe(true);
  });

  it("flags duplicate SCIDs across rows", () => {
    const rows = [
      row({ rowNumber: 2, rollNumber: "R001", scid: "SC001" }),
      row({ rowNumber: 3, rollNumber: "R002", scid: "SC001" }),
    ];
    const result = validateImportRows(rows, config);
    expect(result.allErrors.some((e) => e.errorType === "DUPLICATE_ID" && e.field === "scid")).toBe(true);
  });

  it("requires SCID when the template mandates it", () => {
    const result = validateImportRows([row({ scid: null })], config);
    expect(result.allErrors.some((e) => e.errorType === "MISSING_ID" && e.field === "scid")).toBe(true);
  });

  it("flags invalid (non-numeric) marks", () => {
    const result = validateImportRows(
      [row({ subjectMarks: { Physics: null, Chemistry: 130, Biology: 300 } })],
      config
    );
    expect(result.allErrors.some((e) => e.errorType === "INVALID_MARKS")).toBe(true);
  });

  it("flags out-of-range marks", () => {
    const result = validateImportRows(
      [row({ subjectMarks: { Physics: 999, Chemistry: 130, Biology: 300 } })],
      config
    );
    expect(result.allErrors.some((e) => e.errorType === "OUT_OF_RANGE_MARKS")).toBe(true);
  });

  it("flags an unknown subject not configured on the examination", () => {
    const result = validateImportRows(
      [row({ subjectMarks: { Physics: 140, Chemistry: 130, Biology: 300, Sanskrit: 50 } })],
      config
    );
    expect(result.allErrors.some((e) => e.errorType === "UNKNOWN_SUBJECT")).toBe(true);
  });

  it("flags an unknown class", () => {
    const result = validateImportRows([row({ className: "Class 99" })], config);
    expect(result.allErrors.some((e) => e.errorType === "UNKNOWN_CLASS")).toBe(true);
  });

  it("flags an unknown exam code", () => {
    const result = validateImportRows([row({ examCode: "Z" })], config);
    expect(result.allErrors.some((e) => e.errorType === "UNKNOWN_CODE")).toBe(true);
  });

  it("flags a total mismatch and never silently overwrites it", () => {
    const result = validateImportRows([row({ uploadedTotal: 999 })], config);
    const validated = result.validatedRows[0];
    expect(validated.totalMismatch).toBe(true);
    // The independently calculated value is preserved, not silently replaced
    // by the (wrong) uploaded value.
    expect(validated.calculatedTotal).toBe(570);
    expect(result.allErrors.some((e) => e.errorType === "TOTAL_MISMATCH")).toBe(true);
  });

  it("does not flag a total mismatch when no uploaded total is supplied", () => {
    const result = validateImportRows([row({ uploadedTotal: null })], config);
    expect(result.validatedRows[0].totalMismatch).toBe(false);
  });

  it("summarizes clean vs error row counts correctly", () => {
    const rows = [
      row({ rowNumber: 2, rollNumber: "R001", scid: "SC001" }),
      row({ rowNumber: 3, rollNumber: "", scid: "SC002" }),
    ];
    const result = validateImportRows(rows, config);
    expect(result.cleanRows).toBe(1);
    expect(result.rowsWithErrors).toBe(1);
  });
});
