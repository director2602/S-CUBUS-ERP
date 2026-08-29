/**
 * S-CUBUS ERP — Template Matching
 *
 * Suggests a mapping from arbitrary source-file column headers to a
 * template's normalized target fields (spec §7). Suggestions are always
 * overridable by the user — nothing here auto-imports.
 */

export interface SuggestedAlias {
  targetField: string;
  subjectName?: string | null;
  defaultAliases: string[];
}

/** Built-in suggestions shown when creating a new template from blank. */
export const BUILT_IN_ALIAS_SUGGESTIONS: SuggestedAlias[] = [
  { targetField: "STUDENT_NAME", defaultAliases: ["student name", "name", "candidate name"] },
  { targetField: "SCID", defaultAliases: ["scid", "s.c.i.d", "student code id"] },
  { targetField: "SATHII_KEY", defaultAliases: ["sathii key", "sathii id", "sathiikey"] },
  { targetField: "ROLL_NUMBER", defaultAliases: ["roll no", "roll number", "rollno", "roll_no"] },
  { targetField: "CLASS", defaultAliases: ["class", "std", "standard"] },
  { targetField: "BATCH", defaultAliases: ["batch", "section"] },
  { targetField: "CODE", defaultAliases: ["set code", "paper code", "test code", "exam code", "booklet code"] },
  { targetField: "TOTAL_MARKS", defaultAliases: ["total", "total marks", "total score", "marks"] },
  { targetField: "PERCENTAGE", defaultAliases: ["percentage", "%", "percent"] },
  { targetField: "RANK", defaultAliases: ["student rank", "overall rank"] },
  { targetField: "PERCENTILE", defaultAliases: ["percentile", "%ile"] },
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_\-.]+/g, " ").trim();
}

export interface TemplateFieldDef {
  targetField: string;
  subjectName?: string | null;
  sourceAliases: string[]; // as configured on the template
  required: boolean;
}

export interface ColumnMappingSuggestion {
  sourceColumn: string;
  matchedField: TemplateFieldDef | null;
  confidence: "exact" | "fuzzy" | "none";
}

/**
 * For each column header found in an uploaded file, suggest the best
 * matching template field using exact then fuzzy (substring) matching
 * against configured aliases. The caller (UI) always lets the user
 * override the suggestion before anything is imported.
 */
export function suggestColumnMapping(
  sourceColumns: string[],
  templateFields: TemplateFieldDef[]
): ColumnMappingSuggestion[] {
  const normalizedFieldAliases = templateFields.map((field) => ({
    field,
    aliases: field.sourceAliases.map(normalizeHeader),
  }));

  return sourceColumns.map((sourceColumn) => {
    const normalized = normalizeHeader(sourceColumn);

    // Exact match first.
    const exact = normalizedFieldAliases.find((f) => f.aliases.includes(normalized));
    if (exact) {
      return { sourceColumn, matchedField: exact.field, confidence: "exact" as const };
    }

    // Fuzzy: alias is a substring of the header or vice versa.
    const fuzzy = normalizedFieldAliases.find((f) =>
      f.aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
    );
    if (fuzzy) {
      return { sourceColumn, matchedField: fuzzy.field, confidence: "fuzzy" as const };
    }

    return { sourceColumn, matchedField: null, confidence: "none" as const };
  });
}

/** Attempt to detect the examination name from likely header/title cells. */
export function detectExamNameFromCells(cells: string[]): string | null {
  const candidates = cells
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter((c) => c.length > 3 && c.length < 120);

  const keywordPattern = /(NEET|JEE|FOUNDATION|SATHII|MOCK|WEEKLY|TEST)/i;
  const match = candidates.find((c) => keywordPattern.test(c));
  return match ?? null;
}
