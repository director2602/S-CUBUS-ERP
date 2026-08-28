import Link from "next/link";
import { db } from "@/db/client";
import { examinations, academicYears } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";

export default async function ExamsListPage({ params }: { params: { workspace: string } }) {
  await requireUser();
  const workspace = params.workspace.toUpperCase() as "EXAMS" | "SATHII";
  const exams = db.select().from(examinations).where(eq(examinations.workspace, workspace)).all();
  const years = db.select().from(academicYears).all();
  const yearById = new Map(years.map((y) => [y.id, y.label]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Examinations</h1>
        <Link href={`/w/${params.workspace}/exams/new`} className="btn-primary">
          + New Examination
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Academic Year</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {exams.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No examinations yet. Create your first one — subjects, codes and marking scheme are all
                  configured at creation time, nothing is hard-coded.
                </td>
              </tr>
            )}
            {exams.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <Link href={`/w/${params.workspace}/exams/${e.id}`} className="hover:text-scubus-blue">
                    {e.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{e.examType}</td>
                <td className="px-4 py-3 text-slate-600">{yearById.get(e.academicYearId) ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      e.status === "PUBLISHED" ? "badge-green" : e.status === "DRAFT" ? "badge-yellow" : "badge-slate"
                    }`}
                  >
                    {e.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/w/${params.workspace}/exams/${e.id}`} className="text-scubus-blue text-xs hover:underline">
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
