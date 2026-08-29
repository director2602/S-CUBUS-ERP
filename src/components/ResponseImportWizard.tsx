"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResponseImportWizard({ examinationId }: { examinationId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "configure" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [questionColumns, setQuestionColumns] = useState<string[]>([]);
  const [otherColumns, setOtherColumns] = useState<string[]>([]);
  const [identifierColumn, setIdentifierColumn] = useState("");
  const [identifierType, setIdentifierType] = useState<"ROLL_NUMBER" | "SCID" | "SATHII_KEY">("ROLL_NUMBER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ studentsMatched: number; studentsNotFound: number; responsesGraded: number } | null>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("examinationId", examinationId);
    const res = await fetch("/api/responses/inspect", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to read file.");
      return;
    }
    setHeaders(data.headers);
    setRows(data.rows);
    setQuestionColumns(data.questionColumns);
    setOtherColumns(data.otherColumns);
    setIdentifierColumn(data.otherColumns[0] ?? "");
    setStep("configure");
  }

  async function handleCommit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/responses/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examinationId, identifierColumn, identifierType, questionColumns, rows }),
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
      <h2 className="font-medium text-slate-900">Import Student Responses</h2>
      <p className="text-xs text-slate-500">
        One row per student, one column per question (matched automatically by question number against the
        imported answer key). Requires the Question Paper to be imported first.
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

      {step === "configure" && (
        <>
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Matched {questionColumns.length} question columns against the answer key.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Student Identifier Column</label>
              <select className="input" value={identifierColumn} onChange={(e) => setIdentifierColumn(e.target.value)}>
                {otherColumns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Identifier Type</label>
              <select
                className="input"
                value={identifierType}
                onChange={(e) => setIdentifierType(e.target.value as typeof identifierType)}
              >
                <option value="ROLL_NUMBER">Roll Number</option>
                <option value="SCID">SCID</option>
                <option value="SATHII_KEY">SATHII KEY</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={loading || !identifierColumn} onClick={handleCommit}>
              {loading ? "Grading..." : `Import ${rows.length} Students' Responses`}
            </button>
            <button className="btn-secondary" onClick={() => setStep("upload")}>
              Back
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          ✅ {result.studentsMatched} students matched, {result.responsesGraded} responses graded
          {result.studentsNotFound > 0 && ` — ${result.studentsNotFound} students could not be matched.`}
        </div>
      )}
    </div>
  );
}
