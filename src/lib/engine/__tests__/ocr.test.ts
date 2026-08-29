import { describe, it, expect } from "vitest";
import { parseOcrTextToSheet, looksLikeImageFile } from "../ocr";

describe("parseOcrTextToSheet", () => {
  it("splits OCR text into headers and rows using multi-space gaps", () => {
    const text = [
      "Student Name    Roll No    Total",
      "Aarav Sharma    R001       570",
      "Priya Nair      R002       650",
    ].join("\n");

    const sheet = parseOcrTextToSheet(text);
    expect(sheet.headers).toEqual(["Student Name", "Roll No", "Total"]);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0]["Student Name"]).toBe("Aarav Sharma");
    expect(sheet.rows[0]["Roll No"]).toBe("R001");
    expect(sheet.rows[1]["Total"]).toBe("650");
  });

  it("handles tab-separated OCR output too", () => {
    const text = "Name\tRoll\nTest Student\tR100";
    const sheet = parseOcrTextToSheet(text);
    expect(sheet.headers).toEqual(["Name", "Roll"]);
    expect(sheet.rows[0]["Name"]).toBe("Test Student");
  });

  it("returns empty headers/rows for blank OCR output rather than throwing", () => {
    const sheet = parseOcrTextToSheet("   \n\n  ");
    expect(sheet.headers).toEqual([]);
    expect(sheet.rows).toEqual([]);
  });

  it("fills missing trailing cells with null instead of misaligning columns", () => {
    const text = "Name    Roll    Total\nOnly Name Here";
    const sheet = parseOcrTextToSheet(text);
    expect(sheet.rows[0]["Name"]).toBe("Only Name Here");
    expect(sheet.rows[0]["Roll"]).toBeNull();
    expect(sheet.rows[0]["Total"]).toBeNull();
  });
});

describe("looksLikeImageFile", () => {
  it("recognizes common image extensions", () => {
    expect(looksLikeImageFile("result-sheet.jpg")).toBe(true);
    expect(looksLikeImageFile("result-sheet.PNG")).toBe(true);
    expect(looksLikeImageFile("scan.jpeg")).toBe(true);
  });

  it("recognizes image mime types even with an odd filename", () => {
    expect(looksLikeImageFile("upload", "image/png")).toBe(true);
  });

  it("does not flag spreadsheet files as images", () => {
    expect(looksLikeImageFile("results.xlsx")).toBe(false);
    expect(looksLikeImageFile("results.csv", "text/csv")).toBe(false);
  });
});
