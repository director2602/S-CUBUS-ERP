"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUILT_IN_ALIAS_SUGGESTIONS } from "@/lib/engine/templateMatch";

interface FieldRow {
  targetField: string;
  subjectName: string;
  sourceAliases: string; // comma separated in the UI
  required: boolean;
}

const TARGET_FIELDS = [
  "STUDENT_NAME",
  "SCID",
  "SATHII_KEY",
  "ROLL_NUMBER",
  "CLASS",
  "BATCH",
  "CODE",
  "SUBJECT_MARKS",
  "TOTAL_MARKS",
  "PERCENTAGE",
  "RANK",
  "PERCENTILE",
  "CUSTOM",
];

function blankRow(): FieldRow {
  return { targetField: "STUDENT_NAME", subjectName: "", sourceAliases: "", required: false };
}

export default function NewTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("RESULT");
  const [fields, setFields] = useState<FieldRow[]>([blankRow()]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function startFromBuiltIns() {
    setFields(
      BUILT_IN_ALIAS_SUGGESTIONS.map((s) => ({
        targetField: s.targetField,
        subjectName: s.subjectName ?? "",
        sourceAliases: s.defaultAliases.join(", "),
        required: s.targetField === "STUDENT_NAME" || s.targetField === "ROLL_NUMBER",
      }))
    );
  }

  function updateField(i: number, patch: Partial<FieldRow>) {
    setFields((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name,
        type,
        fields: fields.map((f) => ({
          targetField: f.targetField,
          subjectName: f.targetField === "SUBJECT_MARKS" ? f.subjectName : null,
          sourceAliases: f.sourceAliases.split(",").map((a) => a.trim()).filter(Boolean),
          required: f.required,
        })),
      };
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to create template.");
      }
      router.push("/settings/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create template.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">New Result Template</h1>

      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Template Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Type *</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {["RESULT", "STUDENT_MASTER", "QUESTION_PAPER", "ANSWER_KEY", "STUDENT_RESPONSE", "SCHOLARSHIP", "REPORT", "BRANDING"].map(
                (t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="font-medium text-slate-900">Field Mapping</h2>
          <button type="button" className="btn-secondary text-xs" onClick={startFromBuiltIns}>
            Start from common aliases
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center border border-slate-200 rounded-lg p-3">
              <select
                className="input col-span-3 py-1"
                value={f.targetField}
                onChange={(e) => updateField(i, { targetField: e.target.value })}
              >
                {TARGET_FIELDS.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
              {f.targetField === "SUBJECT_MARKS" ? (
                <input
                  className="input col-span-2 py-1"
                  placeholder="Subject name"
                  value={f.subjectName}
                  onChange={(e) => updateField(i, { subjectName: e.target.value })}
                />
              ) : (
                <div className="col-span-2" />
              )}
              <input
                className="input col-span-5 py-1"
                placeholder="Accepted column names, comma separated"
                value={f.sourceAliases}
                onChange={(e) => updateField(i, { sourceAliases: e.target.value })}
              />
              <label className="col-span-1 flex items-center gap-1 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                />
                Req
              </label>
              <button
                type="button"
                className="col-span-1 text-xs text-red-500 hover:underline"
                onClick={() => setFields((rows) => rows.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary text-sm" onClick={() => setFields((r) => [...r, blankRow()])}>
          + Add Field
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button className="btn-primary" disabled={loading || !name} onClick={handleSubmit}>
            {loading ? "Saving..." : "Create Template"}
          </button>
          <button className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
