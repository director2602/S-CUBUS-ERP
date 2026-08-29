"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Suggestion {
  sourceColumn: string;
  matchedField: { targetField: string } | null;
  confidence: "exact" | "fuzzy" | "none";
}
interface ValidatedRow {
  rowNumber: number;
  name?: string | null;
  scid?: string | null;
  sathiiKey?: string | null;
  errors: { errorType: string; message: string }[];
}
interface ValidationResult {
  validatedRows: ValidatedRow[];
  cleanRows: number;
  rowsWithErrors: number;
  allErrors: { rowNumber: number; errorType: string; message: string }[];
}

type Mapping = Record<string, { targetField: string } | null>;

const STEPS = ["Upload", "Map", "Import"] as const;
const TARGET_FIELDS = ["STUDENT_NAME", "SCID", "SATHII_KEY", "IGNORE"];

export default function StudentBulkImportPage({ params }: { params: { workspace: string } }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [usedOcr, setUsedOcr] = useState(false);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});

  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skippedExisting: number; skippedInvalid: number; validation: ValidationResult } | null>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setInspectError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/students/bulk-import/inspect", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setInspectError(data.error ?? "Failed to read the file.");
      return;
    }
    setHeaders(data.headers);
    setRawRows(data.rows);
    setUsedOcr(Boolean(data.usedOcr));

    const initialMapping: Mapping = {};
    for (const s of data.suggestions as Suggestion[]) {
      initialMapping[s.sourceColumn] = s.matchedField ? { targetField: s.matchedField.targetField } : null;
    }
    setMapping(initialMapping);
    setStep(1);
  }

  async function handleCommit() {
    setCommitting(true);
    setCommitError(null);
    const res = await fetch("/api/students/bulk-import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping, rows: rawRows }),
    });
    const data = await res.json();
    setCommitting(false);
    if (!res.ok) {
      setCommitError(data.error ?? "Import failed.");
      return;
    }
    setResult(data);
    setStep(2);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Bulk Upload Students</h1>
        <button className="btn-secondary text-sm" onClick={() => router.push(`/w/${params.workspace}/students`)}>
          ← Back to Students
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`px-3 py-1.5 rounded-full ${i === step ? "bg-scubus-navy text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
          >
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-medium text-slate-900">Upload Excel, CSV, or a Photo</h2>
          <p className="text-xs text-slate-500 -mt-2">
            Works with a Student Master spreadsheet, or a clear photo of a printed student list (read via
            OCR). Only Name, SCID, and SATHII KEY are picked up — existing students (matched by SCID or
            SATHII KEY) are skipped, never duplicated or overwritten.
          </p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-8 cursor-pointer hover:border-scubus-blue hover:bg-slate-50 transition-colors">
            <span className="text-sm text-slate-600">
              {file ? <span className="font-medium text-scubus-navy">{file.name}</span> : "Click to choose a file or photo"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,text/csv,image/*,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          {inspectError && <p className="text-sm text-red-600">{inspectError}</p>}
          <button className="btn-primary" disabled={!file || uploading} onClick={handleUpload}>
            {uploading ? "Reading file..." : "Inspect File"}
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-medium text-slate-900">Map Columns</h2>
          {usedOcr && (
            <p className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">
              📷 Read via OCR from a photo — please double-check names and IDs carefully before importing.
            </p>
          )}
          <p className="text-xs text-slate-400">{rawRows.length} rows detected.</p>
          <div className="max-h-80 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2">Source Column</th>
                  <th className="px-3 py-2">Maps To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {headers.map((h) => (
                  <tr key={h}>
                    <td className="px-3 py-2 font-medium text-slate-700">{h}</td>
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
          {commitError && <p className="text-sm text-red-600">{commitError}</p>}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={committing} onClick={handleCommit}>
              {committing ? "Importing..." : "Import Students"}
            </button>
            <button className="btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 2 && result && (
        <div className="card p-6 space-y-4 text-center">
          <div className="text-3xl">✅</div>
          <h2 className="font-medium text-slate-900">Import Complete</h2>
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <div className="text-xl font-semibold text-emerald-600">{result.created}</div>
              <div className="text-slate-500">New students created</div>
            </div>
            <div>
              <div className="text-xl font-semibold text-slate-600">{result.skippedExisting}</div>
              <div className="text-slate-500">Already existed, skipped</div>
            </div>
            {result.skippedInvalid > 0 && (
              <div>
                <div className="text-xl font-semibold text-red-600">{result.skippedInvalid}</div>
                <div className="text-slate-500">Skipped (errors)</div>
              </div>
            )}
          </div>
          {result.validation.allErrors.length > 0 && (
            <div className="max-h-52 overflow-auto border border-red-200 rounded-lg text-left">
              <table className="w-full text-xs">
                <thead className="bg-red-50 text-left sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {result.validation.allErrors.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{e.rowNumber}</td>
                      <td className="px-3 py-1.5 text-slate-600">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn-primary" onClick={() => router.push(`/w/${params.workspace}/students`)}>
            View Students
          </button>
        </div>
      )}
    </div>
  );
}
