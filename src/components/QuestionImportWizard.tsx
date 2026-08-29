"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Suggestion {
  sourceColumn: string;
  matchedField: { targetField: string } | null;
}

const TARGET_FIELDS = ["QUESTION_NUMBER", "CORRECT_OPTION", "SUBJECT", "CHAPTER", "TOPIC", "IGNORE"];

export function QuestionImportWizard({ examinationId }: { examinationId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "map" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, { targetField: string } | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: unknown[] } | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/questions/inspect", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to read file.");
      return;
    }
    setHeaders(data.headers);
    setRows(data.rows);
    const initial: Record<string, { targetField: string } | null> = {};
    for (const s of data.suggestions as Suggestion[]) {
      initial[s.sourceColumn] = s.matchedField ? { targetField: s.matchedField.targetField } : null;
    }
    setMapping(initial);
    setStep("map");
  }

  async function handleCommit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/questions/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examinationId, mapping, rows }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Import failed.");
      return;
    }
    setResult(data);
    setStep("done");
    router.refresh();
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-medium text-slate-900">Import Question Paper &amp; Answer Key</h2>
      <p className="text-xs text-slate-500">
        Needs at least a Question Number and Correct Option column. Chapter/Topic/Subject are optional but
        power the chapter-wise analysis below.
      </p>

      {step === "upload" && (
        <>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary" disabled={!file || loading} onClick={handleUpload}>
            {loading ? "Reading..." : "Inspect File"}
          </button>
        </>
      )}

      {step === "map" && (
        <>
          <div className="max-h-64 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2">Column</th>
                  <th className="px-3 py-2">Maps To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {headers.map((h) => (
                  <tr key={h}>
                    <td className="px-3 py-2 font-medium">{h}</td>
                    <td className="px-3 py-2">
                      <select
                        className="input py-1"
                        value={mapping[h]?.targetField ?? "IGNORE"}
                        onChange={(e) =>
                          setMapping((m) => ({
                            ...m,
                            [h]: e.target.value === "IGNORE" ? null : { targetField: e.target.value },
                          }))
                        }
                      >
                        {TARGET_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={loading} onClick={handleCommit}>
              {loading ? "Importing..." : `Import ${rows.length} Questions`}
            </button>
            <button className="btn-secondary" onClick={() => setStep("upload")}>
              Back
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          ✅ {result.created} questions created, {result.updated} updated
          {result.errors.length > 0 && `, ${result.errors.length} rows skipped.`}
        </div>
      )}
    </div>
  );
}
