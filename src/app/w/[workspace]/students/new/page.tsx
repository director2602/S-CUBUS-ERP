"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStudent } from "@/server/actions/students";

export default function NewStudentPage({ params }: { params: { workspace: string } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function action(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const result = await createStudent(formData);
      if (!result.ok || !result.studentId) {
        setError(result.error ?? "Failed to create student.");
        setLoading(false);
        return;
      }
      router.push(`/w/${params.workspace}/students/${result.studentId}`);
    } catch {
      setError("Something went wrong creating the student. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Add Student</h1>
      <form action={action} className="card p-6 space-y-4">
        <div>
          <label className="label">Full Name *</label>
          <input name="name" className="input" required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">SCID</label>
            <input name="scid" className="input" placeholder="Centre-level unique ID" />
          </div>
          <div>
            <label className="label">SATHII KEY</label>
            <input name="sathiiKey" className="input" placeholder="If applicable" />
          </div>
        </div>
        <div>
          <label className="label">Phone</label>
          <input name="phone" className="input" />
        </div>
        <p className="text-xs text-slate-400">
          Name is searchable but never used as the unique identity key — SCID / SATHII KEY are.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Create Student"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
