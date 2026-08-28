import { NextRequest, NextResponse } from "next/server";
import { parseWorkbook, fingerprintBuffer } from "@/lib/engine/workbook";
import { suggestColumnMapping, detectExamNameFromCells, type TemplateFieldDef } from "@/lib/engine/templateMatch";
import { db } from "@/db/client";
import { templateFields, importJobs } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  await requireRole("RESULT_OPERATOR");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const templateId = formData.get("templateId") as string | null;
  const examinationId = formData.get("examinationId") as string | null;

  if (!file || !templateId || !examinationId) {
    return NextResponse.json({ error: "file, templateId and examinationId are required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseWorkbook(buffer);
  } catch {
    return NextResponse.json({ error: "The uploaded file could not be read. It may be corrupted or in an unsupported format." }, { status: 400 });
  }

  const fingerprint = fingerprintBuffer(buffer);
  const dataSheet = parsed.sheets.find((s) => s.rows.length > 0) ?? parsed.sheets[0];

  if (!dataSheet || dataSheet.rows.length === 0) {
    return NextResponse.json({ error: "No data rows were found in the uploaded file." }, { status: 400 });
  }

  const fields = db.select().from(templateFields).where(eq(templateFields.templateId, templateId)).all();
  const fieldDefs: TemplateFieldDef[] = fields.map((f) => ({
    targetField: f.targetField,
    subjectName: f.subjectName,
    sourceAliases: JSON.parse(f.sourceAliases) as string[],
    required: f.required,
  }));

  const suggestions = suggestColumnMapping(dataSheet.headers, fieldDefs);
  const detectedExamName = detectExamNameFromCells(parsed.allCellText);

  const duplicateJob = db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.examinationId, examinationId), eq(importJobs.fingerprint, fingerprint)))
    .get();

  return NextResponse.json({
    fingerprint,
    fileName: file.name,
    sheetNames: parsed.sheetNames,
    chosenSheet: dataSheet.name,
    headers: dataSheet.headers,
    rows: dataSheet.rows,
    rowCount: dataSheet.rows.length,
    suggestions,
    detectedExamName,
    isDuplicateUpload: Boolean(duplicateJob && duplicateJob.status === "IMPORTED"),
  });
}
