"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  name: string;
  type: string;
  version: number;
}
interface TemplateField {
  id: string;
  targetField: string;
  subjectName: string | null;
  sourceAliases: string[];
  required: boolean;
}
interface Suggestion {
  sourceColumn: string;
  matchedField: TemplateField | null;
  confidence: "exact" | "fuzzy" | "none";
}
interface ValidatedRow {
  rowNumber: number;
  studentName?: string | null;
  rollNumber?: string | null;
  calculatedTotal: number;
  calculatedPercentage: number;
  totalMismatch: boolean;
  errors: { errorType: string; message: string; field?: string }[];
}
interface ValidationResult {
  validatedRows: ValidatedRow[];
  rowsWithErrors: number;
  cleanRows: number;
  allErrors: { rowNumber: number; errorType: string; message: string }[];
}

type Mapping = Record<string, { targetField: string; subjectName?: string | null } | null>;

const STEPS = ["Template", "Upload", "Map", "Validate", "Import"] as const;

export default function ImportWizardPage({ params }: { params: { workspace: string; id: string } }) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [fingerprint, setFingerprint] = useState("");
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [detectedExamName, setDetectedExamName] = useState<string | null>(null);
  const [isDuplicateUpload, setIsDuplicateUpload] = useState(false);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const TARGET_FIELDS = [
    "STUDENT_NAME",
    "SCID",
    "SATHII_KEY",
    "ROLL_NUMBER",
    "CLASS",
    "BATCH",
    "CODE",
    "TOTAL_MARKS",
    "PERCENTAGE",
    "SUBJECT_MARKS",
    "IGNORE",
  ];

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => setTemplates((data.templates ?? []).filter((t: Template) => t.type === "RESULT")));
  }, []);

  async function handleUpload() {
    if (!file || !templateId) return;
    setUploading(true);
    setInspectError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("templateId", templateId);
    fd.append("examinationId", params.id);
    const res = await fetch("/api/import/inspect", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) {
      setInspectError(data.error ?? "Failed to read the file.");
      return;
    }
    setHeaders(data.headers);
    setRawRows(data.rows);
    setSuggestions(data.suggestions);
    setFingerprint(data.fingerprint);
    setSheetName(data.chosenSheet);
    setDetectedExamName(data.detectedExamName);
    setIsDuplicateUpload(data.isDuplicateUpload);

    const initialMapping: Mapping = {};
    for (const s of data.suggestions as Suggestion[]) {
      initialMapping[s.sourceColumn] = s.matchedField
        ? { targetField: s.matchedField.targetField, subjectName: s.matchedField.subjectName }
        : null;
    }
    setMapping(initialMapping);
    setStep(2);
  }

  async function handleValidate() {
    setValidating(true);
    const res = await fetch("/api/import/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examinationId: params.id, templateId, mapping, rows: rawRows }),
    });
    const data = await res.json();
    setValidating(false);
    setValidation(data);
    setStep(3);
  }

  async function handleCommit(importOnlyValid: boolean) {
    setCommitting(true);
    setCommitError(null);
    const res = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        examinationId: params.id,
        templateId,
        mapping,
        rows: rawRows,
        fileName: file?.name ?? "upload.xlsx",
        sheetName,
        fingerprint,
        importOnlyValid,
      }),
    });
    const data = await res.json();
    setCommitting(false);
    if (!res.ok) {
      setCommitError(data.error ?? "Import failed.");
      return;
    }
    setCommitResult(data);
    setStep(4);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Import Results</h1>
        <button className="btn-secondary text-sm" onClick={() => router.push(`/w/${params.workspace}/exams/${params.id}`)}>
          ← Back to Examination
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s} className={`px-3 py-1.5 rounded-full ${i === step ? "bg-scubus-navy text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-medium text-slate-900">Select a Result Template</h2>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">
              No Result templates found yet. Create one first under{" "}
              <a href="/settings/templates/new" className="text-scubus-blue underline">
                Settings → Templates
              </a>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => (
                <label key={t.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="template"
                    checked={templateId === t.id}
                    onChange={() => setTemplateId(t.id)}
                  />
                  <span className="text-sm">
                    {t.name} <span className="text-slate-400">v{t.version}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <button className="btn-primary" disabled={!templateId} onClick={() => setStep(1)}>
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-medium text-slate-900">Upload Excel or CSV</h2>
          <p className="text-xs text-slate-500 -mt-2">
            Accepted formats: Excel (.xlsx, .xls) or CSV (.csv)
          </p>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-8 cursor-pointer hover:border-scubus-blue hover:bg-slate-50 transition-colors">
            <span className="text-sm text-slate-600">
              {file ? (
                <span className="font-medium text-scubus-navy">{file.name}</span>
              ) : (
                "Click to choose a .xlsx, .xls, or .csv file"
              )}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          {inspectError && <p className="text-sm text-red-600">{inspectError}</p>}
          <div className="flex gap-3">
            <button className="btn-primary" disabled={!file || uploading} onClick={handleUpload}>
              {uploading ? "Reading file..." : "Inspect File"}
            </button>
            <button className="btn-secondary" onClick={() => setStep(0)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card p-6 space-y-4">
          <h2 className="font-medium text-slate-900">Map Columns</h2>
          {detectedExamName && (
            <p className="text-xs text-slate-500">Detected likely exam reference in file: “{detectedExamName}”</p>
          )}
          {isDuplicateUpload && (
            <p className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">
              ⚠ This exact file appears to have already been imported for this examination. You can still
              proceed — the system will require an explicit override to avoid duplicate results.
            </p>
          )}
          <p className="text-xs text-slate-400">{rawRows.length} rows detected. Override any suggestion below.</p>
          <div className="max-h-96 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2">Source Column</th>
                  <th className="px-3 py-2">Maps To</th>
                  <th className="px-3 py-2">Subject (if applicable)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {headers.map((h) => {
                  const current = mapping[h];
                  return (
                    <tr key={h}>
                      <td className="px-3 py-2 font-medium text-slate-700">{h}</td>
                      <td className="px-3 py-2">
                        <select
                          className="input py-1"
                          value={current?.targetField ?? "IGNORE"}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [h]:
                                e.target.value === "IGNORE"
                                  ? null
                                  : { targetField: e.target.value, subjectName: current?.subjectName ?? null },
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
                      <td className="px-3 py-2">
                        {current?.targetField === "SUBJECT_MARKS" && (
                          <input
                            className="input py-1"
                            placeholder="e.g. Physics"
                            value={current.subjectName ?? ""}
                            onChange={(e) =>
                              setMapping((m) => ({
                                ...m,
                                [h]: { targetField: "SUBJECT_MARKS", subjectName: e.target.value },
                              }))
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button className="btn-primary" disabled={validating} onClick={handleValidate}>
              {validating ? "Validating..." : "Preview & Validate"}
            </button>
            <button className="btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 3 && validation && (
        <div className="card p-6 space-y-4">
          <h2 className="font-medium text-slate-900">Validation Results</h2>
          <div className="flex gap-4 text-sm">
            <span className="badge badge-green">{validation.cleanRows} clean</span>
            <span className="badge badge-red">{validation.rowsWithErrors} with errors</span>
          </div>

          {validation.allErrors.length > 0 && (
            <div className="max-h-72 overflow-auto border border-red-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-red-50 text-left sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {validation.allErrors.slice(0, 200).map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">{e.rowNumber}</td>
                      <td className="px-3 py-1.5">
                        <span className="badge badge-red">{e.errorType}</span>
                      </td>
                      <td className="px-3 py-1.5 text-slate-600">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {commitError && <p className="text-sm text-red-600">{commitError}</p>}

          <div className="flex gap-3 flex-wrap">
            <button
              className="btn-primary"
              disabled={committing || validation.cleanRows === 0}
              onClick={() => handleCommit(true)}
            >
              {committing ? "Importing..." : `Import ${validation.cleanRows} Valid Rows`}
            </button>
            <button className="btn-secondary" onClick={() => setStep(2)}>
              Back to Mapping
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Only clean rows are imported by default — invalid rows are skipped, not silently forced through.
            Fix mapping or source data and re-validate to include them.
          </p>
        </div>
      )}

      {step === 4 && commitResult && (
        <div className="card p-6 space-y-4 text-center">
          <div className="text-3xl">✅</div>
          <h2 className="font-medium text-slate-900">Import Complete</h2>
          <p className="text-sm text-slate-600">
            {commitResult.imported} result{commitResult.imported === 1 ? "" : "s"} imported and validated. Rank
            and percentile have been recalculated for the whole cohort.
          </p>
          <button
            className="btn-primary"
            onClick={() => router.push(`/w/${params.workspace}/exams/${params.id}`)}
          >
            View Examination
          </button>
        </div>
      )}
    </div>
  );
}
