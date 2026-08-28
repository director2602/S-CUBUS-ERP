"use client";

import { useEffect, useState, useTransition } from "react";
import { listUsers, createUserAccount, setUserActive, updateUserRole } from "@/server/actions/users";
import { MAX_USERS } from "@/lib/constants";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string | null;
}

const ROLES = ["OWNER", "ADMIN", "RESULT_OPERATOR", "FACULTY", "VIEWER"];

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const data = await listUsers();
    setRows(data as UserRow[]);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setError(null);
    try {
      await createUserAccount(formData);
      await refresh();
      (document.getElementById("new-user-form") as HTMLFormElement)?.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  function toggleActive(id: string, active: boolean) {
    startTransition(async () => {
      try {
        await setUserActive(id, active);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update user.");
      }
    });
  }

  function changeRole(id: string, role: string) {
    startTransition(async () => {
      try {
        await updateUserRole(id, role);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update role.");
      }
    });
  }

  const atLimit = rows.length >= MAX_USERS;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} of {MAX_USERS} user accounts used.
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((u) => (
              <tr key={u.id} className={!u.active ? "opacity-50" : ""}>
                <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    className="input py-1 text-xs w-40"
                    value={u.role}
                    disabled={isPending}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.active ? "badge-green" : "badge-slate"}`}>
                    {u.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="text-xs text-scubus-blue hover:underline disabled:opacity-40"
                    disabled={isPending || u.role === "OWNER"}
                    onClick={() => toggleActive(u.id, !u.active)}
                  >
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-6 max-w-lg">
        <h2 className="font-medium text-slate-900 mb-4">Add User</h2>
        {atLimit ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You've reached the {MAX_USERS}-user limit. Deactivate or remove an existing user to add a new
            one.
          </p>
        ) : (
          <form id="new-user-form" action={handleCreate} className="space-y-4">
            <div>
              <label className="label">Full Name *</label>
              <input name="name" className="input" required />
            </div>
            <div>
              <label className="label">Email *</label>
              <input name="email" type="email" className="input" required />
            </div>
            <div>
              <label className="label">Temporary Password *</label>
              <input name="password" type="password" className="input" minLength={8} required />
            </div>
            <div>
              <label className="label">Role *</label>
              <select name="role" className="input" defaultValue="VIEWER" required>
                {ROLES.filter((r) => r !== "OWNER").map((r) => (
                  <option key={r} value={r}>
                    {r.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? "Creating..." : "Create User"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
