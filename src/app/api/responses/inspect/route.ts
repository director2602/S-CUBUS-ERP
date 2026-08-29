import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { questions } from "@/db/schema";
import { parseWorkbook, fingerprintBuffer } from "@/lib/engine/workbook";
import { requireRole } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    await requireRole("RESULT_OPERATOR");
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const examinationId = formData.get("examinationId") as string | null;
    if (!file || !examinationId) {
      return NextResponse.json({ error: "file and examinationId are required." }, { status: 400 });
    }

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

    const examQuestions = db.select().from(questions).where(eq(questions.examinationId, examinationId)).all();
    if (examQuestions.length === 0) {
      return NextResponse.json(
        { error: "Import the Question Paper / Answer Key for this exam first — responses need to match against known question numbers." },
        { status: 400 }
      );
    }
    const knownQuestionNumbers = new Set(examQuestions.map((q) => q.questionNumber.trim().toLowerCase()));

    // Every header that matches a known question number is a question
    // column; everything else is a candidate identifier column.
    const questionColumns = dataSheet.headers.filter((h) => knownQuestionNumbers.has(h.trim().toLowerCase()));
    const otherColumns = dataSheet.headers.filter((h) => !knownQuestionNumbers.has(h.trim().toLowerCase()));

    return NextResponse.json({
      fingerprint: fingerprintBuffer(buffer),
      fileName: file.name,
      headers: dataSheet.headers,
      rows: dataSheet.rows,
      rowCount: dataSheet.rows.length,
      questionColumns,
      otherColumns,
      totalKnownQuestions: examQuestions.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to inspect the uploaded file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
