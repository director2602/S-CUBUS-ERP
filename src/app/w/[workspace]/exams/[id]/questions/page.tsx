import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { examinations, questions, studentResponses, resultRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { computeQuestionStats, computeChapterStats, type ResponseRow } from "@/lib/engine/questionAnalysis";
import { QuestionImportWizard } from "@/components/QuestionImportWizard";
import { ResponseImportWizard } from "@/components/ResponseImportWizard";

export default async function QuestionAnalysisPage({
  params,
}: {
  params: { workspace: string; id: string };
}) {
  await requireUser();
  const exam = db.select().from(examinations).where(eq(examinations.id, params.id)).get();
  if (!exam) notFound();

  const examQuestions = db.select().from(questions).where(eq(questions.examinationId, exam.id)).all();
  const questionById = new Map(examQuestions.map((q) => [q.id, q]));

  const allResults = db.select().from(resultRecords).where(eq(resultRecords.examinationId, exam.id)).all();
  const resultIds = new Set(allResults.map((r) => r.id));

  const allResponses = db.select().from(studentResponses).all().filter((r) => resultIds.has(r.resultRecordId));

  const responseRows: ResponseRow[] = allResponses
    .map((r) => {
      const q = questionById.get(r.questionId);
      if (!q) return null;
      return { questionNumber: q.questionNumber, chapter: q.chapter, topic: q.topic, isCorrect: r.isCorrect };
    })
    .filter((r): r is ResponseRow => r !== null);

  const questionStats = computeQuestionStats(responseRows, allResults.length);
  const chapterStats = computeChapterStats(responseRows);

  const hasQuestions = examQuestions.length > 0;
  const hasResponses = allResponses.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Question Analysis — {exam.name}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {examQuestions.length} question{examQuestions.length === 1 ? "" : "s"} imported ·{" "}
            {hasResponses ? `${allResponses.length} responses graded` : "no responses imported yet"}
          </p>
        </div>
        <Link href={`/w/${params.workspace}/exams/${exam.id}`} className="btn-secondary text-sm">
          ← Back to Examination
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <QuestionImportWizard examinationId={exam.id} />
        <ResponseImportWizard examinationId={exam.id} />
      </div>

      {hasQuestions && hasResponses && (
        <>
          <section className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-medium text-slate-900">Question-wise Analysis</h2>
              <p className="text-xs text-slate-400 mt-0.5">Accuracy is % correct among students who attempted; attempt rate is % of all students.</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">Question</th>
                  <th className="px-4 py-2">Chapter</th>
                  <th className="px-4 py-2">Correct</th>
                  <th className="px-4 py-2">Wrong</th>
                  <th className="px-4 py-2">Unattempted</th>
                  <th className="px-4 py-2">Accuracy</th>
                  <th className="px-4 py-2">Attempt Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questionStats.map((q) => (
                  <tr key={q.questionNumber} className={q.accuracy < 30 ? "bg-red-50/40" : ""}>
                    <td className="px-4 py-2 font-medium">{q.questionNumber}</td>
                    <td className="px-4 py-2 text-slate-500">{q.chapter ?? "—"}</td>
                    <td className="px-4 py-2 text-emerald-600">{q.correctCount}</td>
                    <td className="px-4 py-2 text-red-600">{q.wrongCount}</td>
                    <td className="px-4 py-2 text-slate-400">{q.unattemptedCount}</td>
                    <td className="px-4 py-2">{q.accuracy}%</td>
                    <td className="px-4 py-2">{q.attemptRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {chapterStats.length > 0 && (
            <section className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-medium text-slate-900">Chapter-wise Analysis</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2">Chapter</th>
                    <th className="px-4 py-2">Questions</th>
                    <th className="px-4 py-2">Correct</th>
                    <th className="px-4 py-2">Wrong</th>
                    <th className="px-4 py-2">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chapterStats.map((c) => (
                    <tr key={c.chapter}>
                      <td className="px-4 py-2 font-medium">{c.chapter}</td>
                      <td className="px-4 py-2 text-slate-500">{c.questionCount}</td>
                      <td className="px-4 py-2 text-emerald-600">{c.correctCount}</td>
                      <td className="px-4 py-2 text-red-600">{c.wrongCount}</td>
                      <td className="px-4 py-2">{c.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </div>
  );
}
