import { db } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { desc } from "drizzle-orm";

export default async function AuditLogPage() {
  await requireUser();
  const logs = db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200).all();
  const allUsers = db.select().from(users).all();
  const userById = new Map(allUsers.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Audit Log</h1>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No activity recorded yet.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">
                  {l.createdAt ? new Date(l.createdAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2">{l.userId ? userById.get(l.userId) ?? "Unknown" : "System"}</td>
                <td className="px-4 py-2">
                  <span className="badge badge-blue">{l.action}</span>
                </td>
                <td className="px-4 py-2 text-slate-600">{l.entityType}</td>
                <td className="px-4 py-2 text-xs text-slate-400 max-w-xs truncate">{l.newValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
