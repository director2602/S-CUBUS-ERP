"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createExamination } from "@/server/actions/examinations";
import { listStructure } from "@/server/actions/structure";

export default function NewExaminationPage({ params }: { params: { workspace: string } }) {
  const router = useRouter();
  const [years, setYears] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [negativeMarking, setNegativeMarking] = useState(true);

  useEffect(() => {
    listStructure().then((s) => setYears(s.years));
  }, []);

  async function action(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const result = await createExamination(formData);
      if (!result.ok || !result.examId) {
        setError(result.error ?? "Failed to create examination.");
        setLoading(false);
        return;
      }
      router.push(`/w/${result.workspace ?? params.workspace}/exams/${result.examId}`);
    } catch {
      setError("Something went wrong creating the examination. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">New Examination</h1>
      <form action={action} className="card p-6 space-y-5">
        <input type="hidden" name="workspace" value={params.workspace.toUpperCase()} />

        <div>
          <label className="label">Examination Name *</label>
          <input name="name" className="input" placeholder="e.g. NEET Mock Test 5" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Short Name</label>
            <input name="shortName" className="input" placeholder="e.g. NEET-M5" />
          </div>
          <div>
            <label className="label">Exam Type *</label>
            <input name="examType" className="input" placeholder="NEET / JEE / Foundation / Mock / Weekly..." required />
          </div>
        </div>

        <div>
          <label className="label">Academic Year *</label>
          <select name="academicYearId" className="input" required>
            <option value="">Select year...</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
          {years.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              No academic years configured yet — add one in Settings → Organisation Structure first.
            </p>
          )}
        </div>

        <div>
          <label className="label">Subjects * — format: Name:MaxMarks, comma separated</label>
          <input name="subjects" className="input" placeholder="Physics:180, Chemistry:180, Biology:360" required />
        </div>

        <div>
          <label className="label">Exam Codes — comma separated (optional)</label>
          <input name="codes" className="input" placeholder="A, B, C" />
        </div>

        <fieldset className="border border-slate-200 rounded-lg p-4">
          <legend className="text-sm font-medium text-slate-700 px-1">Marking Scheme</legend>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <label className="label">Correct Marks</label>
              <input name="correctMarks" type="number" step="0.01" defaultValue={4} className="input" />
            </div>
            <div>
              <label className="label">Wrong Marks</label>
              <input name="wrongMarks" type="number" step="0.01" defaultValue={-1} className="input" />
            </div>
            <div>
              <label className="label">Unattempted Marks</label>
              <input name="unattemptedMarks" type="number" step="0.01" defaultValue={0} className="input" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              name="negativeMarking"
              id="negativeMarking"
              checked={negativeMarking}
              onChange={(e) => setNegativeMarking(e.target.checked)}
            />
            <label htmlFor="negativeMarking" className="text-sm text-slate-700">
              Negative marking applies
            </label>
          </div>
          <div className="mt-3">
            <label className="label">Decimal Precision</label>
            <input name="decimalPrecision" type="number" defaultValue={2} className="input w-24" />
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Creating..." : "Create Examination"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
