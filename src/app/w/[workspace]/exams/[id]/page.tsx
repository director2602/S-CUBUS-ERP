import Link from "next/link";
import { notFound } from "next/navigation";
import { db, sqlite } from "@/db/client";
import {
  examinations,
  subjects,
  examCodes,
  resultRecords,
  students,
  examRegistrations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { computeCohortStats } from "@/lib/engine/calculation";
import { StatusControls } from "@/components/StatusControls";
import { ScoreDistributionChart, SubjectAverageChart } from "@/components/ExamCharts";
import { CalculateScholarshipsButton } from "@/components/CalculateScholarshipsButton";

export default async function ExamDetailPage({
  params,
}: {
  params: { workspace: string; id: string };
}) {
  await requireUser();
  const exam = db.select().from(examinations).where(eq(examinations.id, params.id)).get();
  if (!exam) notFound();

  const examSubjects = db.select().from(subjects).where(eq(subjects.examinationId, exam.id)).all();
  const codes = db.select().from(examCodes).where(eq(examCodes.examinationId, exam.id)).all();
  const results = db.select().from(resultRecords).where(eq(resultRecords.examinationId, exam.id)).all();
  const registrations = db.select().from(examRegistrations).where(eq(examRegistrations.examinationId, exam.id)).all();
  const regById = new Map(registrations.map((r) => [r.id, r]));

  const stats = computeCohortStats(results.map((r) => r.totalMarksCalculated));
  const mismatches = results.filter((r) => r.mismatchFlag);

  const sortedResults = [...results].sort((a, b) => (a.rank ?? 999999) - (b.rank ?? 999999));
  const studentNames = new Map(
    db.select().from(students).all().map((s) => [s.id, s.name])
  );

  const maxTotal = examSubjects.reduce((a, s) => a + s.maxMarks, 0);

  // --- Chart data: score distribution + subject-wise averages ------------
  const distributionBuckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${i * 10 + 10}%`,
    count: 0,
  }));
  for (const r of results) {
    const idx = Math.min(9, Math.max(0, Math.floor(r.percentageCalculated / 10)));
    distributionBuckets[idx].count += 1;
  }

  const subjectAverageRows = sqlite
    .prepare(
      `SELECT sub.name as name, sub.max_marks as maxMarks, AVG(sr.marks_obtained) as avgMarks
       FROM subject_results sr
       JOIN subjects sub ON sub.id = sr.subject_id
       JOIN result_records rr ON rr.id = sr.result_record_id
       WHERE rr.examination_id = ?
       GROUP BY sub.id
       ORDER BY sub.name`
    )
    .all(exam.id) as { name: string; maxMarks: number; avgMarks: number }[];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{exam.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            <span className="badge badge-slate">{exam.examType}</span>
            <span
              className={`badge ${
                exam.status === "PUBLISHED" ? "badge-green" : exam.status === "DRAFT" ? "badge-yellow" : "badge-slate"
              }`}
            >
              {exam.status}
            </span>
            <span className="badge badge-blue">Max Total: {maxTotal}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex gap-2">
            <Link href={`/w/${params.workspace}/exams/${exam.id}/questions`} className="btn-secondary">
              Question Analysis
            </Link>
            <Link href={`/w/${params.workspace}/exams/${exam.id}/import`} className="btn-primary">
              Import Results
            </Link>
          </div>
          <StatusControls examId={exam.id} status={exam.status} hasMismatches={mismatches.length > 0} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-3">Subjects</h2>
          <ul className="text-sm space-y-1">
            {examSubjects.map((s) => (
              <li key={s.id} className="flex justify-between text-slate-600">
                <span>{s.name}</span>
                <span className="text-slate-400">{s.maxMarks}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-3">Marking Scheme</h2>
          <ul className="text-sm space-y-1 text-slate-600">
            <li>Correct: +{exam.correctMarks}</li>
            <li>Wrong: {exam.wrongMarks}</li>
            <li>Unattempted: {exam.unattemptedMarks}</li>
            <li>Negative marking: {exam.negativeMarking ? "Yes" : "No"}</li>
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-3">Codes</h2>
          <div className="flex flex-wrap gap-1.5">
            {codes.map((c) => (
              <span key={c.id} className="badge badge-slate">
                {c.code}
              </span>
            ))}
          </div>
        </div>
      </div>

      {mismatches.length > 0 && (
        <div className="card p-4 bg-red-50 border-red-200 text-sm text-red-700">
          ⚠ {mismatches.length} result{mismatches.length === 1 ? "" : "s"} flagged with a total/percentage
          mismatch against the uploaded file. These must be reviewed before publishing.
        </div>
      )}

      {stats && (
        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-4">Cohort Analysis</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <Metric label="Count" value={stats.count} />
            <Metric label="Mean" value={stats.mean} />
            <Metric label="Median" value={stats.median} />
            <Metric label="Std Dev" value={stats.stdDev} />
            <Metric label="Min" value={stats.min} />
            <Metric label="Topper" value={stats.topper} tone="green" />
          </div>
        </div>
      )}

      {stats && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="font-medium text-slate-900 mb-1">Score Distribution</h2>
            <p className="text-xs text-slate-400 mb-2">Number of students in each percentage band</p>
            <ScoreDistributionChart data={distributionBuckets} />
          </div>
          <div className="card p-6">
            <h2 className="font-medium text-slate-900 mb-1">Subject-wise Average</h2>
            <p className="text-xs text-slate-400 mb-2">Average marks scored per subject, as % of max</p>
            <SubjectAverageChart data={subjectAverageRows} />
          </div>
        </div>
      )}

      {exam.workspace !== params.workspace.toUpperCase() && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          ⚠ This examination belongs to the <b>{exam.workspace}</b> workspace, but you're viewing it via a{" "}
          <b>{params.workspace.toUpperCase()}</b> link. Some workspace-specific features (like Scholarship,
          which only applies to SATHII) may not show here as a result. Open it from the correct workspace's
          Examinations list instead.
        </div>
      )}

      {exam.workspace === "SATHII" && results.length > 0 && (
        <CalculateScholarshipsButton examinationId={exam.id} />
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-medium text-slate-900">Results ({results.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2">Rank</th>
              <th className="px-4 py-2">Student</th>
              <th className="px-4 py-2">Roll No</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">%</th>
              <th className="px-4 py-2">Percentile</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedResults.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No results imported yet.
                </td>
              </tr>
            )}
            {sortedResults.slice(0, 100).map((r) => {
              const reg = regById.get(r.examRegistrationId);
              return (
                <tr key={r.id} className={`hover:bg-slate-50 ${r.mismatchFlag ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-2 font-medium">{r.rank ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Link href={`/w/${params.workspace}/students/${r.studentId}`} className="text-scubus-blue hover:underline">
                      {studentNames.get(r.studentId) ?? "Unknown"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{reg?.rollNumber ?? "—"}</td>
                  <td className="px-4 py-2">{r.totalMarksCalculated}</td>
                  <td className="px-4 py-2">{r.percentageCalculated}%</td>
                  <td className="px-4 py-2">{r.percentile ?? "—"}</td>
                  <td className="px-4 py-2">
                    {r.mismatchFlag ? (
                      <span className="badge badge-red">Mismatch</span>
                    ) : (
                      <span className="badge badge-green">{r.status}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sortedResults.length > 100 && (
          <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
            Showing first 100 of {sortedResults.length} — server-side pagination planned for the analytics
            phase.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "green" }) {
  return (
    <div>
      <div className={`text-lg font-semibold ${tone === "green" ? "text-emerald-600" : "text-slate-900"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
