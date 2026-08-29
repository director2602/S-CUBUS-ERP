import { NextRequest, NextResponse } from "next/server";
import { parseWorkbook, fingerprintBuffer } from "@/lib/engine/workbook";
import { extractTextFromImage, parseOcrTextToSheet, looksLikeImageFile } from "@/lib/engine/ocr";
import { suggestColumnMapping, type TemplateFieldDef } from "@/lib/engine/templateMatch";
import { requireRole } from "@/lib/session";

/**
 * Built-in field set for the Student Master bulk import — deliberately no
 * saved Template is required for this one, since name/SCID/SATHII KEY
 * cover the common case and asking someone to build a template first
 * would be unnecessary friction for what's usually a one-off bulk add.
 */
const STUDENT_FIELD_DEFS: TemplateFieldDef[] = [
  { targetField: "STUDENT_NAME", sourceAliases: ["Student Name", "Name", "Candidate Name", "Full Name"], required: true },
  { targetField: "SCID", sourceAliases: ["SCID", "S.C.I.D", "Student Code ID"], required: false },
  { targetField: "SATHII_KEY", sourceAliases: ["SATHII KEY", "SATHII Key", "SATHIIKEY", "SATHII ID"], required: false },
];

export async function POST(req: NextRequest) {
  try {
    await requireRole("RESULT_OPERATOR");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isImage = looksLikeImageFile(file.name, file.type);

    let dataSheet;
    let usedOcr = false;

    if (isImage) {
      usedOcr = true;
      let ocrText: string;
      try {
        ocrText = await extractTextFromImage(buffer);
      } catch {
        return NextResponse.json(
          { error: "Could not read text from this image. Try a clearer, well-lit photo of a typed sheet, or upload an Excel/CSV file instead." },
          { status: 400 }
        );
      }
      dataSheet = parseOcrTextToSheet(ocrText);
      if (dataSheet.rows.length === 0) {
        return NextResponse.json(
          { error: "No readable rows were found in the image. Try a sharper photo or scan." },
          { status: 400 }
        );
      }
    } else {
      let parsed;
      try {
        parsed = parseWorkbook(buffer);
      } catch {
        return NextResponse.json({ error: "The uploaded file could not be read. It may be corrupted or in an unsupported format." }, { status: 400 });
      }
      dataSheet = parsed.sheets.find((s) => s.rows.length > 0) ?? parsed.sheets[0];
      if (!dataSheet || dataSheet.rows.length === 0) {
        return NextResponse.json({ error: "No data rows were found in the uploaded file." }, { status: 400 });
      }
    }

    const suggestions = suggestColumnMapping(dataSheet.headers, STUDENT_FIELD_DEFS);

    return NextResponse.json({
      fingerprint: fingerprintBuffer(buffer),
      fileName: file.name,
      headers: dataSheet.headers,
      rows: dataSheet.rows,
      rowCount: dataSheet.rows.length,
      suggestions,
      usedOcr,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to inspect the uploaded file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
