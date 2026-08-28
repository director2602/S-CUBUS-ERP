import Link from "next/link";
import { db } from "@/db/client";
import { examinations, students, resultRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

const WS_LABEL: Record<string, string> = { exams: "EXAMS", sathii: "SATHII" };

export default async function WorkspaceDashboard({ params }: { params: { workspace: string } }) {
  await requireUser();
  const workspace = params.workspace.toUpperCase() as "EXAMS" | "SATHII";

  const exams = db.select().from(examinations).where(eq(examinations.workspace, workspace)).all();
  const published = exams.filter((e) => e.status === "PUBLISHED").length;
  const draft = exams.filter((e) => e.status === "DRAFT").length;

  const allStudents = db.select().from(students).all();
  const resultCount = exams.length
    ? db.select().from(resultRecords).all().filter((r) => exams.some((e) => e.id === r.examinationId)).length
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{WS_LABEL[params.workspace]} Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {params.workspace === "sathii"
              ? "Scholarship examinations, eligibility and distribution."
              : "Centre & session examinations — NEET, JEE, Foundation, mocks and more."}
          </p>
        </div>
        <Link href={`/w/${params.workspace}/exams/new`} className="btn-primary">
          + New Examination
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Examinations" value={exams.length} />
        <StatCard label="Published" value={published} tone="green" />
        <StatCard label="Draft" value={draft} tone="yellow" />
        <StatCard label="Result Records" value={resultCount} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-3">Recent Examinations</h2>
          {exams.length === 0 ? (
            <p className="text-sm text-slate-400">
              No examinations yet.{" "}
              <Link href={`/w/${params.workspace}/exams/new`} className="text-scubus-blue underline">
                Create one
              </Link>{" "}
              to get started.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {exams.slice(0, 6).map((e) => (
                <li key={e.id} className="py-2 flex items-center justify-between text-sm">
                  <Link href={`/w/${params.workspace}/exams/${e.id}`} className="text-slate-800 hover:text-scubus-blue">
                    {e.name}
                  </Link>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-3">Leading / Lagging</h2>
          <p className="text-sm text-slate-400">
            Longitudinal momentum tracking (leading/lagging, quadrant groups) requires at least two
            published results per student and is planned for the analytics phase (Phase 6–7 of the
            build). Nothing is fabricated here in the meantime.
          </p>
          <p className="text-xs text-slate-400 mt-3">
            {allStudents.length} student{allStudents.length === 1 ? "" : "s"} currently on file across the
            organisation.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "green" | "yellow" }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className={`text-xs mt-1 ${tone === "green" ? "text-emerald-600" : tone === "yellow" ? "text-amber-600" : "text-slate-500"}`}>
        {label}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "PUBLISHED" ? "badge-green" : status === "DRAFT" ? "badge-yellow" : "badge-slate";
  return <span className={`badge ${cls}`}>{status}</span>;
}
