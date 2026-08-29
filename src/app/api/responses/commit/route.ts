import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/db/client";
import {
  questions,
  studentResponses,
  resultRecords,
  examRegistrations,
  examinations,
  studentIdentifiers,
} from "@/db/schema";
import { requireRole } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { gradeResponse } from "@/lib/engine/questionAnalysis";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  examinationId: z.string(),
  identifierColumn: z.string(),
  identifierType: z.enum(["ROLL_NUMBER", "SCID", "SATHII_KEY"]),
  questionColumns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("RESULT_OPERATOR");
    const body = bodySchema.parse(await req.json());

    const exam = db.select().from(examinations).where(eq(examinations.id, body.examinationId)).get();
    if (!exam) return NextResponse.json({ error: "Examination not found." }, { status: 404 });

    const examQuestions = db.select().from(questions).where(eq(questions.examinationId, body.examinationId)).all();
    const questionByNumber = new Map(examQuestions.map((q) => [q.questionNumber.trim().toLowerCase(), q]));

    const scheme = {
      correctMarks: exam.correctMarks,
      wrongMarks: exam.wrongMarks,
      unattemptedMarks: exam.unattemptedMarks,
      negativeMarking: exam.negativeMarking,
      decimalPrecision: exam.decimalPrecision,
    };

    let studentsMatched = 0;
    let studentsNotFound = 0;
    let responsesGraded = 0;
    const notFoundIdentifiers: string[] = [];

    const run = sqlite.transaction(() => {
      for (const row of body.rows) {
        const idValue = String(row[body.identifierColumn] ?? "").trim();
        if (!idValue) continue;

        // Find the exam registration for this student in this exam.
        let registration;
        if (body.identifierType === "ROLL_NUMBER") {
          registration = db
            .select()
            .from(examRegistrations)
            .where(and(eq(examRegistrations.examinationId, body.examinationId), eq(examRegistrations.rollNumber, idValue)))
            .get();
        } else {
          const identifier = db
            .select()
            .from(studentIdentifiers)
            .where(and(eq(studentIdentifiers.type, body.identifierType), eq(studentIdentifiers.value, idValue)))
            .get();
          if (identifier) {
            registration = db
              .select()
              .from(examRegistrations)
              .where(and(eq(examRegistrations.examinationId, body.examinationId), eq(examRegistrations.studentId, identifier.studentId)))
              .get();
          }
        }

        if (!registration) {
          studentsNotFound += 1;
          if (notFoundIdentifiers.length < 20) notFoundIdentifiers.push(idValue);
          continue;
        }

        const resultRecord = db
          .select()
          .from(resultRecords)
          .where(eq(resultRecords.examRegistrationId, registration.id))
          .get();
        if (!resultRecord) {
          studentsNotFound += 1;
          continue;
        }

        studentsMatched += 1;

        for (const qCol of body.questionColumns) {
          const question = questionByNumber.get(qCol.trim().toLowerCase());
          if (!question) continue;

          const selected = row[qCol] !== undefined && row[qCol] !== null ? String(row[qCol]).trim() : null;
          const graded = gradeResponse(selected, question.correctOption, scheme);

          const existing = db
            .select()
            .from(studentResponses)
            .where(and(eq(studentResponses.resultRecordId, resultRecord.id), eq(studentResponses.questionId, question.id)))
            .get();

          const values = {
            resultRecordId: resultRecord.id,
            questionId: question.id,
            selectedOption: selected,
            isCorrect: graded.isCorrect,
            marksAwarded: graded.marksAwarded,
          };

          if (existing) {
            db.update(studentResponses).set(values).where(eq(studentResponses.id, existing.id)).run();
          } else {
            db.insert(studentResponses).values(values).run();
          }
          responsesGraded += 1;
        }
      }
    });
    run();

    await writeAuditLog({
      userId: user.id,
      action: "IMPORT_RESPONSES",
      entityType: "Examination",
      entityId: body.examinationId,
      newValue: { studentsMatched, studentsNotFound, responsesGraded },
    });

    return NextResponse.json({ studentsMatched, studentsNotFound, responsesGraded, notFoundIdentifiers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to import responses.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
