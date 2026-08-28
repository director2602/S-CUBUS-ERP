import Link from "next/link";
import { db } from "@/db/client";
import { students, studentIdentifiers } from "@/db/schema";
import { requireUser } from "@/lib/session";

export default async function StudentsPage({ params }: { params: { workspace: string } }) {
  await requireUser();
  const allStudents = db.select().from(students).all();
  const allIdentifiers = db.select().from(studentIdentifiers).all();

  const idsByStudent = new Map<string, { type: string; value: string }[]>();
  for (const id of allIdentifiers) {
    const list = idsByStudent.get(id.studentId) ?? [];
    list.push({ type: id.type, value: id.value });
    idsByStudent.set(id.studentId, list);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Students</h1>
        <Link href={`/w/${params.workspace}/students/new`} className="btn-primary">
          + Add Student
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">SCID</th>
              <th className="px-4 py-3">SATHII KEY</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allStudents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No students yet. Add one manually or import a Student Master file from an examination.
                </td>
              </tr>
            )}
            {allStudents.map((s) => {
              const ids = idsByStudent.get(s.id) ?? [];
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link href={`/w/${params.workspace}/students/${s.id}`} className="hover:text-scubus-blue">
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ids.find((i) => i.type === "SCID")?.value ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ids.find((i) => i.type === "SATHII_KEY")?.value ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/w/${params.workspace}/students/${s.id}`} className="text-scubus-blue text-xs hover:underline">
                      Student 360 →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
