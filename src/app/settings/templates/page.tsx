import Link from "next/link";
import { db } from "@/db/client";
import { resultTemplates } from "@/db/schema";
import { requireUser } from "@/lib/session";

export default async function TemplatesPage() {
  await requireUser();
  const templates = db.select().from(resultTemplates).all();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Result Templates</h1>
          <p className="text-sm text-slate-500">
            Define how uploaded Excel/CSV files map to normalized fields. Old versions are preserved for
            historical, already-published results.
          </p>
        </div>
        <Link href="/settings/templates/new" className="btn-primary">
          + New Template
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Version</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {templates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No templates yet.
                </td>
              </tr>
            )}
            {templates.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                <td className="px-4 py-3 text-slate-600">{t.type}</td>
                <td className="px-4 py-3 text-slate-600">v{t.version}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${t.isActive ? "badge-green" : "badge-slate"}`}>
                    {t.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
