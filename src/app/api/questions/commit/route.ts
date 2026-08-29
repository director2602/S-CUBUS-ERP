import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { questions, subjects } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  examinationId: z.string(),
  mapping: z.record(z.union([z.object({ targetField: z.string() }), z.null()])),
  rows: z.array(z.record(z.unknown())),
});

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("RESULT_OPERATOR");
    const body = bodySchema.parse(await req.json());

    const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, body.examinationId)).all();
    const subjectByName = new Map(examSubjects.map((s) => [s.name.trim().toLowerCase(), s]));

    let created = 0;
    let updated = 0;
    const errors: { rowNumber: number; message: string }[] = [];

    for (const [i, raw] of body.rows.entries()) {
      const rowNumber = i + 2;
      let questionNumber: string | null = null;
      let correctOption: string | null = null;
      let subjectName: string | null = null;
      let chapter: string | null = null;
      let topic: string | null = null;

      for (const [column, target] of Object.entries(body.mapping)) {
        if (!target) continue;
        const value = raw[column];
        if (target.targetField === "QUESTION_NUMBER") questionNumber = str(value);
        if (target.targetField === "CORRECT_OPTION") correctOption = str(value);
        if (target.targetField === "SUBJECT") subjectName = str(value);
        if (target.targetField === "CHAPTER") chapter = str(value);
        if (target.targetField === "TOPIC") topic = str(value);
      }

      if (!questionNumber || !correctOption) {
        errors.push({ rowNumber, message: "Missing question number or correct option." });
        continue;
      }

      const subjectId = subjectName ? subjectByName.get(subjectName.toLowerCase())?.id ?? null : null;

      const existing = db
        .select()
        .from(questions)
        .where(and(eq(questions.examinationId, body.examinationId), eq(questions.questionNumber, questionNumber)))
        .get();

      if (existing) {
        db.update(questions)
          .set({ correctOption, subjectId, chapter, topic })
          .where(eq(questions.id, existing.id))
          .run();
        updated += 1;
      } else {
        db.insert(questions)
          .values({ examinationId: body.examinationId, questionNumber, correctOption, subjectId, chapter, topic })
          .run();
        created += 1;
      }
    }

    await writeAuditLog({
      userId: user.id,
      action: "IMPORT_QUESTIONS",
      entityType: "Examination",
      entityId: body.examinationId,
      newValue: { created, updated, errors: errors.length },
    });

    return NextResponse.json({ created, updated, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import questions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
