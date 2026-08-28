import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook, fingerprintBuffer } from "../workbook";

function makeBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseWorkbook", () => {
  it("skips a single-cell title row and finds the real header row", () => {
    const buffer = makeBuffer([
      ["NEET Mock Test 5 - Result Sheet"],
      ["Student Name", "Roll No", "Total"],
      ["Aarav Sharma", "R001", 570],
    ]);
    const parsed = parseWorkbook(buffer);
    expect(parsed.sheets[0].headers).toEqual(["Student Name", "Roll No", "Total"]);
    expect(parsed.sheets[0].rows).toHaveLength(1);
    expect(parsed.sheets[0].rows[0]["Student Name"]).toBe("Aarav Sharma");
  });

  it("treats the first row as headers when there is no title row", () => {
    const buffer = makeBuffer([
      ["Student Name", "Roll No"],
      ["Priya Nair", "R002"],
    ]);
    const parsed = parseWorkbook(buffer);
    expect(parsed.sheets[0].headers).toEqual(["Student Name", "Roll No"]);
    expect(parsed.sheets[0].rows).toHaveLength(1);
  });

  it("returns empty rows for a completely empty sheet without throwing", () => {
    const buffer = makeBuffer([]);
    const parsed = parseWorkbook(buffer);
    expect(parsed.sheets[0].rows).toEqual([]);
  });

  it("parses a plain CSV file the same way as Excel", () => {
    const csvBuffer = Buffer.from(
      "Student Name,Roll No,Total\nAarav Sharma,R001,570\nPriya Nair,R002,650\n"
    );
    const parsed = parseWorkbook(csvBuffer);
    expect(parsed.sheets[0].headers).toEqual(["Student Name", "Roll No", "Total"]);
    expect(parsed.sheets[0].rows).toHaveLength(2);
    expect(parsed.sheets[0].rows[0]["Student Name"]).toBe("Aarav Sharma");
    expect(parsed.sheets[0].rows[1]["Roll No"]).toBe("R002");
  });
});

describe("fingerprintBuffer", () => {
  it("produces a stable hash for identical content", () => {
    const a = Buffer.from("hello world");
    const b = Buffer.from("hello world");
    expect(fingerprintBuffer(a)).toBe(fingerprintBuffer(b));
  });

  it("produces different hashes for different content", () => {
    const a = Buffer.from("hello world");
    const b = Buffer.from("hello there");
    expect(fingerprintBuffer(a)).not.toBe(fingerprintBuffer(b));
  });
});
