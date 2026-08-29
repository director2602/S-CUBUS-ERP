import { describe, it, expect } from "vitest";
import { suggestColumnMapping, detectExamNameFromCells, type TemplateFieldDef } from "../templateMatch";

const fields: TemplateFieldDef[] = [
  { targetField: "STUDENT_NAME", sourceAliases: ["Student Name", "Name", "Candidate Name"], required: true },
  { targetField: "ROLL_NUMBER", sourceAliases: ["Roll No", "Roll Number", "RollNo"], required: true },
  { targetField: "SCID", sourceAliases: ["SCID"], required: false },
  { targetField: "SUBJECT_MARKS", subjectName: "Physics", sourceAliases: ["Physics", "PHY"], required: false },
];

describe("suggestColumnMapping", () => {
  it("matches exact aliases (case/space insensitive)", () => {
    const result = suggestColumnMapping(["roll no", "SCID"], fields);
    expect(result[0].matchedField?.targetField).toBe("ROLL_NUMBER");
    expect(result[0].confidence).toBe("exact");
    expect(result[1].matchedField?.targetField).toBe("SCID");
  });

  it("falls back to fuzzy matching for near-miss headers", () => {
    const result = suggestColumnMapping(["Candidate Name (Full)"], fields);
    expect(result[0].matchedField?.targetField).toBe("STUDENT_NAME");
    expect(result[0].confidence).toBe("fuzzy");
  });

  it("returns no match for unrecognized columns rather than guessing wrong", () => {
    const result = suggestColumnMapping(["Random Column XYZ"], fields);
    expect(result[0].matchedField).toBeNull();
    expect(result[0].confidence).toBe("none");
  });

  it("maps subject-specific columns to the correct subject field", () => {
    const result = suggestColumnMapping(["PHY"], fields);
    expect(result[0].matchedField?.subjectName).toBe("Physics");
  });

  it("does not falsely match 'Centre Code' to the exam paper-code field (real-world false positive)", () => {
    const codeFields: TemplateFieldDef[] = [
      { targetField: "CODE", sourceAliases: ["Set Code", "Paper Code", "Test Code", "Exam Code"], required: false },
    ];
    const result = suggestColumnMapping(["Centre Code"], codeFields);
    // Centre Code is metadata about the physical centre, not an exam
    // paper/set code — it must not be auto-selected as CODE.
    expect(result[0].matchedField).toBeNull();
  });

  it("does not falsely match 'Centre Rank' to any field", () => {
    const rankFields: TemplateFieldDef[] = [
      { targetField: "RANK", sourceAliases: ["Student Rank", "Overall Rank"], required: false },
    ];
    const result = suggestColumnMapping(["Centre Rank"], rankFields);
    expect(result[0].matchedField).toBeNull();
  });

  it("still matches a genuinely specific paper-code column", () => {
    const codeFields: TemplateFieldDef[] = [
      { targetField: "CODE", sourceAliases: ["Set Code", "Paper Code", "Test Code"], required: false },
    ];
    const result = suggestColumnMapping(["Test Code"], codeFields);
    expect(result[0].matchedField?.targetField).toBe("CODE");
  });
});

describe("detectExamNameFromCells", () => {
  it("detects a likely exam name from header cells", () => {
    const name = detectExamNameFromCells(["S-CUBUS", "NEET Mock Test 5 - Result", "Roll No"]);
    expect(name).toBe("NEET Mock Test 5 - Result");
  });

  it("returns null when nothing exam-like is present", () => {
    const name = detectExamNameFromCells(["Roll No", "Name", "Marks"]);
    expect(name).toBeNull();
  });
});
