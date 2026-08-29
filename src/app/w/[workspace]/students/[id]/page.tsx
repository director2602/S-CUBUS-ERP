import Link from "next/link";
import { notFound } from "next/navigation";
import { db, sqlite } from "@/db/client";
import { computeQuestionStats, computeChapterStats, computeStudentQuestionSummary, type ResponseRow } from "@/lib/engine/questionAnalysis";
import {
  students,
  studentIdentifiers,
  centres,
  resultRecords,
  examinations,
  examRegistrations,
  subjectResults,
  subjects,
  classes,
  batches,
  examCodes,
  scholarshipResults,
  scholarshipPolicies,
  questions,
  studentResponses,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { computeCohortStats } from "@/lib/engine/calculation";
import { computeRAG, ragLabel, type RAGResult } from "@/lib/engine/rag";
import { PerformanceTrendChart, SubjectTrendChart } from "@/components/StudentTrendCharts";

export default async function Student360Page({
  params,
}: {
  params: { workspace: string; id: string };
}) {
  await requireUser();
  const student = db.select().from(students).where(eq(students.id, params.id)).get();
  if (!student) notFound();

  const identifiers = db.select().from(studentIdentifiers).where(eq(studentIdentifiers.studentId, params.id)).all();
  const centre = student.centreId ? db.select().from(centres).where(eq(centres.id, student.centreId)).get() : null;

  const myResults = db.select().from(resultRecords).where(eq(resultRecords.studentId, params.id)).all();

  // Attach examination + registration + subject-level detail to each result.
  const detailed = myResults
    .map((r) => {
      const exam = db.select().from(examinations).where(eq(examinations.id, r.examinationId)).get();
      const registration = db
        .select()
        .from(examRegistrations)
        .where(eq(examRegistrations.id, r.examRegistrationId))
        .get();
      const subjectRows = db
        .select({ marks: subjectResults.marksObtained, subjectId: subjectResults.subjectId })
        .from(subjectResults)
        .where(eq(subjectResults.resultRecordId, r.id))
        .all();
      const subjectDefs = exam
        ? db.select().from(subjects).where(eq(subjects.examinationId, exam.id)).all()
        : [];
      const subjectBreakdown = subjectRows.map((sr) => {
        const def = subjectDefs.find((d) => d.id === sr.subjectId);
        return { name: def?.name ?? "Unknown", marks: sr.marks, maxMarks: def?.maxMarks ?? 0 };
      });

      const klass = registration?.classId
        ? db.select().from(classes).where(eq(classes.id, registration.classId)).get()
        : null;
      const batch = registration?.batchId
        ? db.select().from(batches).where(eq(batches.id, registration.batchId)).get()
        : null;
      const code = registration?.examCodeId
        ? db.select().from(examCodes).where(eq(examCodes.id, registration.examCodeId)).get()
        : null;

      return { result: r, exam, registration, subjectBreakdown, klass, batch, code };
    })
    .filter((d) => d.exam)
    .filter((d) => d.exam!.workspace === params.workspace.toUpperCase())
    .sort((a, b) => (a.result.createdAt ?? "").localeCompare(b.result.createdAt ?? ""));

  const current = detailed[detailed.length - 1] ?? null;
  const previous = detailed.length >= 2 ? detailed[detailed.length - 2] : null;
  const hasBaseline = detailed.length < 2;

  // Cohort comparisons for the CURRENT result only.
  let cohortComparison: {
    overall: ReturnType<typeof computeCohortStats>;
    classAvg: number | null;
    batchAvg: number | null;
    codeAvg: number | null;
    topper: number | null;
  } | null = null;

  if (current?.exam) {
    const examId = current.exam.id;
    const allExamResults = db.select().from(resultRecords).where(eq(resultRecords.examinationId, examId)).all();
    const allRegs = db.select().from(examRegistrations).where(eq(examRegistrations.examinationId, examId)).all();
    const regById = new Map(allRegs.map((r) => [r.id, r]));

    const overall = computeCohortStats(allExamResults.map((r) => r.totalMarksCalculated));

    const sameClass = allExamResults.filter(
      (r) => regById.get(r.examRegistrationId)?.classId === current.registration?.classId
    );
    const sameBatch = allExamResults.filter(
      (r) => regById.get(r.examRegistrationId)?.batchId === current.registration?.batchId
    );
    const sameCode = allExamResults.filter(
      (r) => regById.get(r.examRegistrationId)?.examCodeId === current.registration?.examCodeId
    );

    const avg = (arr: typeof allExamResults) =>
      arr.length ? arr.reduce((a, r) => a + r.totalMarksCalculated, 0) / arr.length : null;

    cohortComparison = {
      overall,
      classAvg: current.registration?.classId ? avg(sameClass) : null,
      batchAvg: current.registration?.batchId ? avg(sameBatch) : null,
      codeAvg: current.registration?.examCodeId ? avg(sameCode) : null,
      topper: overall?.topper ?? null,
    };
  }

  // --- RAG (Red/Amber/Green): overall performance + per-subject, vs class average ---
  let overallRAG: RAGResult | null = null;
  const subjectRAGs: RAGResult[] = [];

  if (current?.exam && current.registration?.classId) {
    const classPercentageRows = sqlite
      .prepare(
        `SELECT rr.percentage_calculated as pct
         FROM result_records rr
         JOIN exam_registrations er ON er.id = rr.exam_registration_id
         WHERE rr.examination_id = ? AND er.class_id = ?`
      )
      .all(current.exam.id, current.registration.classId) as { pct: number }[];
    const classPercentages = classPercentageRows.map((r) => r.pct);
    const classAvgPercentage = classPercentages.length
      ? classPercentages.reduce((a, b) => a + b, 0) / classPercentages.length
      : null;

    overallRAG = computeRAG(
      "Overall Performance",
      current.result.percentageCalculated,
      classAvgPercentage !== null ? roundTo1(classAvgPercentage) : null,
      classPercentages.length
    );

    // Per-subject class average (% of max marks), scoped to the same class.
    const subjectAvgRows = sqlite
      .prepare(
        `SELECT sub.name as name, sub.max_marks as maxMarks, AVG(sr.marks_obtained) as avgMarks, COUNT(*) as n
         FROM subject_results sr
         JOIN subjects sub ON sub.id = sr.subject_id
         JOIN result_records rr ON rr.id = sr.result_record_id
         JOIN exam_registrations er ON er.id = rr.exam_registration_id
         WHERE rr.examination_id = ? AND er.class_id = ?
         GROUP BY sub.id`
      )
      .all(current.exam.id, current.registration.classId) as { name: string; maxMarks: number; avgMarks: number; n: number }[];
    const subjectAvgByName = new Map(subjectAvgRows.map((s) => [s.name, s]));

    for (const s of current.subjectBreakdown) {
      const classData = subjectAvgByName.get(s.name);
      const studentPct = s.maxMarks > 0 ? roundTo1((s.marks / s.maxMarks) * 100) : 0;
      const classPct = classData && classData.maxMarks > 0 ? roundTo1((classData.avgMarks / classData.maxMarks) * 100) : null;
      subjectRAGs.push(computeRAG(s.name, studentPct, classPct, classData?.n ?? 0));
    }
  }

  const scid = identifiers.find((i) => i.type === "SCID")?.value;
  const sathiiKey = identifiers.find((i) => i.type === "SATHII_KEY")?.value;

  // --- Trend chart data: every exam this student has a result for, in order ---
  const performanceTrend = detailed.map((d) => ({
    examLabel: d.exam!.shortName || d.exam!.name,
    percentage: d.result.percentageCalculated,
    percentile: d.result.percentile,
    rank: d.result.rank,
    total: d.result.totalMarksCalculated,
  }));

  const allSubjectNames = Array.from(
    new Set(detailed.flatMap((d) => d.subjectBreakdown.map((s) => s.name)))
  );
  const subjectTrend = detailed.map((d) => {
    const row: { examLabel: string; [subjectName: string]: string | number } = {
      examLabel: d.exam!.shortName || d.exam!.name,
    };
    for (const s of d.subjectBreakdown) {
      row[s.name] = s.maxMarks > 0 ? Math.round((s.marks / s.maxMarks) * 1000) / 10 : 0;
    }
    return row;
  });

  // --- Question-level analysis for the current result, if imported -------
  let questionSummary: ReturnType<typeof computeStudentQuestionSummary> | null = null;
  let chapterStatsForCurrent: { chapter: string; accuracy: number }[] = [];
  if (current) {
    const myResponses = db.select().from(studentResponses).where(eq(studentResponses.resultRecordId, current.result.id)).all();
    if (myResponses.length > 0) {
      questionSummary = computeStudentQuestionSummary(
        myResponses.map((r) => ({ isCorrect: r.isCorrect, marksAwarded: r.marksAwarded }))
      );
      const examQuestions = db.select().from(questions).where(eq(questions.examinationId, current.exam!.id)).all();
      const questionById = new Map(examQuestions.map((q) => [q.id, q]));
      const responseRows: ResponseRow[] = myResponses
        .map((r) => {
          const q = questionById.get(r.questionId);
          if (!q) return null;
          return { questionNumber: q.questionNumber, chapter: q.chapter, topic: q.topic, isCorrect: r.isCorrect };
        })
        .filter((r): r is ResponseRow => r !== null);
      chapterStatsForCurrent = computeChapterStats(responseRows).map((c) => ({ chapter: c.chapter, accuracy: c.accuracy }));
    }
  }

  // --- Scholarship (SATHII workspace only) --------------------------------
  // `current` is already guaranteed to belong to this workspace (see the
  // `.filter` on `detailed` above), but checking the exam's own workspace
  // field directly here — rather than the URL segment — keeps this correct
  // even if that upstream filtering logic ever changes.
  const scholarship =
    current?.exam?.workspace === "SATHII"
      ? db.select().from(scholarshipResults).where(eq(scholarshipResults.resultRecordId, current.result.id)).get()
      : null;
  const scholarshipPolicy = scholarship
    ? db.select().from(scholarshipPolicies).where(eq(scholarshipPolicies.id, scholarship.policyId)).get()
    : null;

  return (
    <div className="space-y-8">
      {/* Identity */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{student.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            {scid && <span className="badge badge-blue">SCID: {scid}</span>}
            {sathiiKey && <span className="badge badge-blue">SATHII KEY: {sathiiKey}</span>}
            {centre && <span className="badge badge-slate">Centre: {centre.name}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {current && (
            <a
              href={`/api/reports/student/${current.result.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary text-sm"
            >
              Download PDF Report
            </a>
          )}
          <Link href={`/w/${params.workspace}/students`} className="btn-secondary text-sm">
            ← Back to list
          </Link>
        </div>
      </div>

      {detailed.length === 0 && (
        <div className="card p-6 text-sm text-slate-500">
          No published results yet for this student in the {params.workspace.toUpperCase()} workspace.
        </div>
      )}

      {hasBaseline && detailed.length === 1 && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          Baseline — insufficient historical data. Only one result is available, so trend, leading/lagging
          and momentum cannot be shown yet.
        </div>
      )}

      {current && (
        <>
          {/* Current Result */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium text-slate-900">Current Result — {current.exam!.name}</h2>
              {overallRAG && <RAGBadge rag={overallRAG} />}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Metric label="Total Marks" value={current.result.totalMarksCalculated} />
              <Metric label="Percentage" value={`${current.result.percentageCalculated}%`} />
              <Metric label="Rank" value={current.result.rank ?? "—"} />
              <Metric label="Percentile" value={current.result.percentile ?? "—"} />
              <Metric
                label="Status"
                value={current.result.status}
                tone={current.result.status === "PUBLISHED" ? "green" : "yellow"}
              />
            </div>
            {overallRAG && overallRAG.status !== "INSUFFICIENT_DATA" && (
              <p className="text-xs text-slate-500 mb-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {overallRAG.reason}
              </p>
            )}
            {current.result.mismatchFlag && (
              <div className="mb-4 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
                ⚠ This result was flagged during import: {current.result.mismatchDetail}
              </div>
            )}
            <h3 className="text-sm font-medium text-slate-700 mb-2">Subject Analysis</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 text-left">
                <tr>
                  <th className="py-1">Subject</th>
                  <th className="py-1">Marks</th>
                  <th className="py-1">Max</th>
                  <th className="py-1">%</th>
                  <th className="py-1">RAG</th>
                </tr>
              </thead>
              <tbody>
                {current.subjectBreakdown.map((s) => {
                  const rag = subjectRAGs.find((r) => r.metric === s.name);
                  return (
                    <tr key={s.name} className="border-t border-slate-100">
                      <td className="py-1.5">{s.name}</td>
                      <td className="py-1.5">{s.marks}</td>
                      <td className="py-1.5 text-slate-400">{s.maxMarks}</td>
                      <td className="py-1.5">{s.maxMarks ? ((s.marks / s.maxMarks) * 100).toFixed(1) : "—"}%</td>
                      <td className="py-1.5">{rag && <RAGBadge rag={rag} compact />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Question-level analysis */}
          {questionSummary ? (
            <section className="card p-6">
              <h2 className="font-medium text-slate-900 mb-4">Question-wise Performance</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric label="Correct" value={questionSummary.correctCount} tone="green" />
                <Metric label="Wrong" value={questionSummary.wrongCount} />
                <Metric label="Unattempted" value={questionSummary.unattemptedCount} />
                <Metric label="Accuracy" value={`${questionSummary.accuracy}%`} />
              </div>
              {chapterStatsForCurrent.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-slate-700 mt-4 mb-2">Chapter-wise Accuracy</h3>
                  <div className="space-y-1.5">
                    {chapterStatsForCurrent.map((c) => (
                      <div key={c.chapter} className="flex items-center gap-3 text-xs">
                        <span className="w-32 truncate text-slate-600">{c.chapter}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${c.accuracy}%`,
                              backgroundColor: c.accuracy >= 60 ? "#1F9D55" : c.accuracy >= 35 ? "#FF8C00" : "#B42318",
                            }}
                          />
                        </div>
                        <span className="w-10 text-right text-slate-500">{c.accuracy}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="card p-6 text-sm text-slate-500">
              Question-by-question analysis unavailable — Question Paper and Response data haven't been
              imported for this examination yet. Import them from the exam's Question Analysis page.
            </section>
          )}

          {/* Previous Result */}
          {previous && (
            <section className="card p-6">
              <h2 className="font-medium text-slate-900 mb-4">Previous Result — {previous.exam!.name}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Metric label="Total Marks" value={previous.result.totalMarksCalculated} />
                <Metric label="Percentage" value={`${previous.result.percentageCalculated}%`} />
                <Metric label="Rank" value={previous.result.rank ?? "—"} />
                <Metric label="Percentile" value={previous.result.percentile ?? "—"} />
              </div>
              <ChangeIndicator
                label="Score change vs previous"
                delta={current.result.totalMarksCalculated - previous.result.totalMarksCalculated}
              />
            </section>
          )}

          {/* Cohort comparison */}
          {cohortComparison && (
            <section className="card p-6">
              <h2 className="font-medium text-slate-900 mb-4">Student vs Cohort</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Metric label="Student" value={current.result.totalMarksCalculated} tone="blue" />
                {cohortComparison.classAvg !== null && (
                  <Metric label="Class Average" value={cohortComparison.classAvg.toFixed(1)} />
                )}
                {cohortComparison.batchAvg !== null && (
                  <Metric label="Batch Average" value={cohortComparison.batchAvg.toFixed(1)} />
                )}
                {cohortComparison.codeAvg !== null && (
                  <Metric label="Code Average" value={cohortComparison.codeAvg.toFixed(1)} />
                )}
                {cohortComparison.overall && (
                  <Metric label="Cohort Average" value={cohortComparison.overall.mean} />
                )}
                {cohortComparison.topper !== null && (
                  <Metric label="Topper" value={cohortComparison.topper} tone="green" />
                )}
              </div>
            </section>
          )}

          {/* Cumulative performance / historical trend */}
          <section className="card p-6">
            <h2 className="font-medium text-slate-900 mb-1">Performance Trend</h2>
            <p className="text-xs text-slate-400 mb-2">Percentage &amp; percentile across every exam on record</p>
            <PerformanceTrendChart data={performanceTrend} />
          </section>

          {allSubjectNames.length > 0 && (
            <section className="card p-6">
              <h2 className="font-medium text-slate-900 mb-1">Subject Journey</h2>
              <p className="text-xs text-slate-400 mb-2">Each subject as % of its max marks, across every exam</p>
              <SubjectTrendChart data={subjectTrend} subjectNames={allSubjectNames} />
            </section>
          )}

          {/* Full exam history table */}
          <section className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-medium text-slate-900">Exam History ({detailed.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">Examination</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">%</th>
                  <th className="px-4 py-2">Rank</th>
                  <th className="px-4 py-2">Percentile</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...detailed].reverse().map((d) => (
                  <tr key={d.result.id} className={d.result.id === current.result.id ? "bg-scubus-blue/5" : ""}>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {d.exam!.name}
                      {d.result.id === current.result.id && (
                        <span className="badge badge-blue ml-2 text-[10px]">Latest</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{d.result.totalMarksCalculated}</td>
                    <td className="px-4 py-2">{d.result.percentageCalculated}%</td>
                    <td className="px-4 py-2">{d.result.rank ?? "—"}</td>
                    <td className="px-4 py-2">{d.result.percentile ?? "—"}</td>
                    <td className="px-4 py-2">
                      {d.result.mismatchFlag ? (
                        <span className="badge badge-red">Mismatch</span>
                      ) : (
                        <span className="badge badge-green">{d.result.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Leading/lagging & scholarship placeholders (never fabricated) */}
          <section className="grid md:grid-cols-2 gap-6">
            <div className="card p-6 text-sm text-slate-500">
              <h2 className="font-medium text-slate-900 mb-2">Leading / Lagging Status</h2>
              {hasBaseline
                ? "Baseline — insufficient historical data."
                : "Momentum scoring (growth, rank movement, consistency) is planned for Phase 6–7 and intentionally not fabricated here yet."}
            </div>
            {current.exam?.workspace === "SATHII" && (
              <div className="card p-6">
                <h2 className="font-medium text-slate-900 mb-3">Scholarship</h2>
                {!scholarship ? (
                  <p className="text-sm text-slate-500">
                    Not calculated yet — run "Calculate Scholarships" on this examination's page to generate
                    it.
                  </p>
                ) : scholarship.eligibilityStatus === "NOT_ELIGIBLE" ? (
                  <>
                    <span className="badge badge-slate mb-3 inline-block">NOT ELIGIBLE</span>
                    <p className="text-sm text-slate-600">{scholarship.ineligibilityReason}</p>
                  </>
                ) : scholarship.eligibilityStatus === "INCOMPLETE" ? (
                  <>
                    <span className="badge badge-yellow mb-3 inline-block">INCOMPLETE</span>
                    <p className="text-sm text-slate-600">{scholarship.ineligibilityReason}</p>
                  </>
                ) : (
                  <>
                    <span
                      className={`badge mb-3 inline-block ${
                        scholarship.scholarshipCategory === "TOP_3_CLASS_MERIT" ? "badge-green" : "badge-blue"
                      }`}
                    >
                      {scholarship.scholarshipCategory.replace(/_/g, " ")}
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <Metric label="Scholarship" value={`${scholarship.scholarshipPercentage}%`} tone="green" />
                      <Metric label="Tuition Fee" value={`₹${scholarship.tuitionFee.toLocaleString("en-IN")}`} />
                      <Metric label="Scholarship Amount" value={`₹${scholarship.scholarshipAmount.toLocaleString("en-IN")}`} />
                      <Metric label="Payable" value={`₹${scholarship.netTuitionFee.toLocaleString("en-IN")}`} tone="blue" />
                    </div>
                    <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <b>Why this scholarship?</b> {scholarship.explanation}
                      {scholarship.sesScore !== null && <> (SES score: {scholarship.sesScore.toFixed(2)})</>}
                    </div>
                    {scholarshipPolicy && (
                      <p className="text-[11px] text-slate-400 mt-2">
                        Policy: {scholarshipPolicy.name} v{scholarshipPolicy.version}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function roundTo1(n: number): number {
  return Math.round(n * 10) / 10;
}

function RAGBadge({ rag, compact }: { rag: RAGResult; compact?: boolean }) {
  const { icon, text } = ragLabel(rag.status);
  const cls =
    rag.status === "GREEN"
      ? "bg-emerald-100 text-emerald-800"
      : rag.status === "AMBER"
      ? "bg-amber-100 text-amber-800"
      : rag.status === "RED"
      ? "bg-red-100 text-red-800"
      : "bg-slate-100 text-slate-500";
  return (
    <span className={`badge ${cls}`} title={rag.reason}>
      {icon} {compact ? "" : text}
      {rag.gap !== null && !compact && ` (${rag.gap > 0 ? "+" : ""}${rag.gap})`}
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "blue" | "green" | "yellow";
}) {
  const toneClass =
    tone === "blue" ? "text-scubus-blue" : tone === "green" ? "text-emerald-600" : tone === "yellow" ? "text-amber-600" : "text-slate-900";
  return (
    <div>
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function ChangeIndicator({ label, delta }: { label: string; delta: number }) {
  const positive = delta > 0;
  const flat = delta === 0;
  return (
    <p className={`mt-3 text-sm ${flat ? "text-slate-500" : positive ? "text-emerald-600" : "text-red-600"}`}>
      {label}: {flat ? "No change" : `${positive ? "+" : ""}${delta.toFixed(2)}`}
    </p>
  );
}
