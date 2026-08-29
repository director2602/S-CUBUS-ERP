import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import {
  resultRecords,
  students,
  studentIdentifiers,
  examinations,
  examRegistrations,
  subjectResults,
  subjects,
  questions,
  studentResponses,
  scholarshipResults,
} from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { computeCohortStats } from "@/lib/engine/calculation";
import { computeChapterStats, computeStudentQuestionSummary, type ResponseRow } from "@/lib/engine/questionAnalysis";
import { buildStudentReportPdf, bufferFromDoc } from "@/server/reportPdf";

export async function GET(_req: NextRequest, { params }: { params: { resultRecordId: string } }) {
  try {
    await requireUser();

    const result = db.select().from(resultRecords).where(eq(resultRecords.id, params.resultRecordId)).get();
    if (!result) return NextResponse.json({ error: "Result not found." }, { status: 404 });

    const student = db.select().from(students).where(eq(students.id, result.studentId)).get();
    const exam = db.select().from(examinations).where(eq(examinations.id, result.examinationId)).get();
    if (!student || !exam) return NextResponse.json({ error: "Data not found." }, { status: 404 });

    const identifiers = db.select().from(studentIdentifiers).where(eq(studentIdentifiers.studentId, student.id)).all();
    const scid = identifiers.find((i) => i.type === "SCID")?.value ?? null;
    const sathiiKey = identifiers.find((i) => i.type === "SATHII_KEY")?.value ?? null;

    const subjectRows = db.select().from(subjectResults).where(eq(subjectResults.resultRecordId, result.id)).all();
    const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, exam.id)).all();
    const subjectData = subjectRows.map((sr) => {
      const def = examSubjects.find((s) => s.id === sr.subjectId);
      return { name: def?.name ?? "Unknown", marks: sr.marksObtained, maxMarks: def?.maxMarks ?? 0 };
    });

    // Previous result for this student, in the same workspace, before this one.
    const allMyResults = db
      .select()
      .from(resultRecords)
      .where(eq(resultRecords.studentId, student.id))
      .all()
      .filter((r) => r.id !== result.id)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    const previous = allMyResults.filter((r) => (r.createdAt ?? "") < (result.createdAt ?? "")).pop();
    let previousResult = null;
    if (previous) {
      const prevExam = db.select().from(examinations).where(eq(examinations.id, previous.examinationId)).get();
      previousResult = prevExam
        ? { examName: prevExam.name, total: previous.totalMarksCalculated, percentage: previous.percentageCalculated }
        : null;
    }

    // Cohort comparison.
    const registration = db.select().from(examRegistrations).where(eq(examRegistrations.id, result.examRegistrationId)).get();
    const allExamResults = db.select().from(resultRecords).where(eq(resultRecords.examinationId, exam.id)).all();
    const allRegs = db.select().from(examRegistrations).where(eq(examRegistrations.examinationId, exam.id)).all();
    const regById = new Map(allRegs.map((r) => [r.id, r]));
    const avg = (arr: typeof allExamResults) => (arr.length ? arr.reduce((a, r) => a + r.totalMarksCalculated, 0) / arr.length : null);
    const overall = computeCohortStats(allExamResults.map((r) => r.totalMarksCalculated));
    const classAvg = registration?.classId
      ? avg(allExamResults.filter((r) => regById.get(r.examRegistrationId)?.classId === registration.classId))
      : null;
    const batchAvg = registration?.batchId
      ? avg(allExamResults.filter((r) => regById.get(r.examRegistrationId)?.batchId === registration.batchId))
      : null;

    // Question-level data, if imported.
    const examQuestions = db.select().from(questions).where(eq(questions.examinationId, exam.id)).all();
    const questionById = new Map(examQuestions.map((q) => [q.id, q]));
    const myResponses = db.select().from(studentResponses).where(eq(studentResponses.resultRecordId, result.id)).all();

    let questionSummary = null;
    let chapterStats: { chapter: string; accuracy: number }[] = [];
    if (myResponses.length > 0) {
      questionSummary = computeStudentQuestionSummary(myResponses.map((r) => ({ isCorrect: r.isCorrect, marksAwarded: r.marksAwarded })));
      const responseRows: ResponseRow[] = myResponses
        .map((r) => {
          const q = questionById.get(r.questionId);
          if (!q) return null;
          return { questionNumber: q.questionNumber, chapter: q.chapter, topic: q.topic, isCorrect: r.isCorrect };
        })
        .filter((r): r is ResponseRow => r !== null);
      chapterStats = computeChapterStats(responseRows).map((c) => ({ chapter: c.chapter, accuracy: c.accuracy }));
    }

    // Scholarship, if calculated.
    const scholarship = db.select().from(scholarshipResults).where(eq(scholarshipResults.resultRecordId, result.id)).get();

    const doc = buildStudentReportPdf({
      studentName: student.name,
      scid,
      sathiiKey,
      examName: exam.name,
      total: result.totalMarksCalculated,
      percentage: result.percentageCalculated,
      rank: result.rank,
      percentile: result.percentile,
      subjects: subjectData,
      previousResult,
      cohort: { classAvg, batchAvg, cohortAvg: overall?.mean ?? null, topper: overall?.topper ?? null },
      questionSummary,
      chapterStats,
      scholarship: scholarship
        ? {
            category: scholarship.scholarshipCategory,
            percentage: scholarship.scholarshipPercentage,
            tuitionFee: scholarship.tuitionFee,
            scholarshipAmount: scholarship.scholarshipAmount,
            netTuitionFee: scholarship.netTuitionFee,
            explanation: scholarship.explanation,
          }
        : null,
      generatedAt: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    });

    const buffer = await bufferFromDoc(doc);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${student.name.replace(/[^a-z0-9]/gi, "_")}_${exam.shortName || exam.name}_Report.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
