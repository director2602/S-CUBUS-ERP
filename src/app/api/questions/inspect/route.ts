import { NextRequest, NextResponse } from "next/server";
import { parseWorkbook, fingerprintBuffer } from "@/lib/engine/workbook";
import { suggestColumnMapping, type TemplateFieldDef } from "@/lib/engine/templateMatch";
import { requireRole } from "@/lib/session";

const QUESTION_FIELD_DEFS: TemplateFieldDef[] = [
  { targetField: "QUESTION_NUMBER", sourceAliases: ["Question Number", "Q No", "Question No", "QNo", "Q"], required: true },
  { targetField: "CORRECT_OPTION", sourceAliases: ["Correct Option", "Correct Answer", "Answer", "Key"], required: true },
  { targetField: "SUBJECT", sourceAliases: ["Subject"], required: false },
  { targetField: "CHAPTER", sourceAliases: ["Chapter"], required: false },
  { targetField: "TOPIC", sourceAliases: ["Topic"], required: false },
];

export async function POST(req: NextRequest) {
  try {
    await requireRole("RESULT_OPERATOR");
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "A file is required." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseWorkbook(buffer);
    } catch {
      return NextResponse.json({ error: "The uploaded file could not be read." }, { status: 400 });
    }
    const dataSheet = parsed.sheets.find((s) => s.rows.length > 0) ?? parsed.sheets[0];
    if (!dataSheet || dataSheet.rows.length === 0) {
      return NextResponse.json({ error: "No data rows were found in the uploaded file." }, { status: 400 });
    }

    const suggestions = suggestColumnMapping(dataSheet.headers, QUESTION_FIELD_DEFS);

    return NextResponse.json({
      fingerprint: fingerprintBuffer(buffer),
      fileName: file.name,
      headers: dataSheet.headers,
      rows: dataSheet.rows,
      rowCount: dataSheet.rows.length,
      suggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to inspect the uploaded file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
