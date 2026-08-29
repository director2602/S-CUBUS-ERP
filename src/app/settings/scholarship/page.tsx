"use client";

import { useEffect, useState } from "react";
import { getActivePolicy, updateActivePolicy } from "@/server/actions/scholarship";

interface PolicyState {
  marksWeight: number;
  percentileWeight: number;
  maxScholarshipPercent: number;
  top3Enabled: boolean;
  top3Percent: number;
  minPercentage: number | null;
  minPercentile: number | null;
  minMarks: number | null;
  defaultTuitionFee: number;
}

interface Slab {
  minScore: number;
  maxScore: number | null;
  scholarshipPercent: number;
}

export default function ScholarshipPolicyPage() {
  const [policyName, setPolicyName] = useState("");
  const [policyVersion, setPolicyVersion] = useState(1);
  const [state, setState] = useState<PolicyState | null>(null);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function refresh() {
    const { policy, slabs: s } = await getActivePolicy();
    setPolicyName(policy.name);
    setPolicyVersion(policy.version);
    setState({
      marksWeight: policy.marksWeight,
      percentileWeight: policy.percentileWeight,
      maxScholarshipPercent: policy.maxScholarshipPercent,
      top3Enabled: policy.top3Enabled,
      top3Percent: policy.top3Percent,
      minPercentage: policy.minPercentage,
      minPercentile: policy.minPercentile,
      minMarks: policy.minMarks,
      defaultTuitionFee: policy.defaultTuitionFee,
    });
    setSlabs(s.map((x) => ({ minScore: x.minScore, maxScore: x.maxScore, scholarshipPercent: x.scholarshipPercent })));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSave() {
    if (!state) return;
    setSaving(true);
    setMessage(null);
    const result = await updateActivePolicy(state);
    setSaving(false);
    if (!result.ok) {
      setMessage({ type: "error", text: result.error ?? "Failed to save." });
      return;
    }
    setMessage({ type: "success", text: "Policy saved." });
    refresh();
  }

  if (!state) {
    return <div className="text-sm text-slate-400">Loading policy...</div>;
  }

  const weightsValid = Math.abs(state.marksWeight + state.percentileWeight - 1) < 0.001;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">SATHII Scholarship Policy</h1>
        <p className="text-sm text-slate-500 mt-1">
          {policyName} — version {policyVersion}. Changes apply to future scholarship calculations; results
          already calculated keep the policy version they were computed under.
        </p>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      )}

      <div className="card p-6 space-y-4">
        <h2 className="font-medium text-slate-900">Scholarship Eligibility Score (SES) Weights</h2>
        <p className="text-xs text-slate-500">SES = Marks Weight × Percentage + Percentile Weight × Percentile. Must add up to 100%.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Marks Weight (%)</label>
            <input
              type="number"
              className="input"
              value={Math.round(state.marksWeight * 100)}
              onChange={(e) => setState({ ...state, marksWeight: Number(e.target.value) / 100 })}
            />
          </div>
          <div>
            <label className="label">Percentile Weight (%)</label>
            <input
              type="number"
              className="input"
              value={Math.round(state.percentileWeight * 100)}
              onChange={(e) => setState({ ...state, percentileWeight: Number(e.target.value) / 100 })}
            />
          </div>
        </div>
        {!weightsValid && <p className="text-xs text-red-600">Weights currently sum to {Math.round((state.marksWeight + state.percentileWeight) * 100)}% — must equal 100%.</p>}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-medium text-slate-900">Top-3 Class Merit</h2>
        <p className="text-xs text-slate-500">The top 3 eligible students of each class receive this scholarship, overriding the standard SES calculation.</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.top3Enabled}
            onChange={(e) => setState({ ...state, top3Enabled: e.target.checked })}
          />
          Enable Top-3 Class Merit rule
        </label>
        {state.top3Enabled && (
          <div>
            <label className="label">Top-3 Scholarship (%)</label>
            <input
              type="number"
              className="input w-32"
              value={state.top3Percent}
              onChange={(e) => setState({ ...state, top3Percent: Number(e.target.value) })}
            />
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-medium text-slate-900">Eligibility Minimums (optional)</h2>
        <p className="text-xs text-slate-500">Leave blank for no minimum. Students below any set minimum are marked Not Eligible.</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Min Percentage</label>
            <input
              type="number"
              className="input"
              value={state.minPercentage ?? ""}
              onChange={(e) => setState({ ...state, minPercentage: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Min Percentile</label>
            <input
              type="number"
              className="input"
              value={state.minPercentile ?? ""}
              onChange={(e) => setState({ ...state, minPercentile: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Min Marks</label>
            <input
              type="number"
              className="input"
              value={state.minMarks ?? ""}
              onChange={(e) => setState({ ...state, minMarks: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-medium text-slate-900">Maximum Scholarship &amp; Default Tuition Fee</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Max Scholarship (%)</label>
            <input
              type="number"
              className="input"
              value={state.maxScholarshipPercent}
              onChange={(e) => setState({ ...state, maxScholarshipPercent: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label">Default Tuition Fee (₹)</label>
            <input
              type="number"
              className="input"
              value={state.defaultTuitionFee}
              onChange={(e) => setState({ ...state, defaultTuitionFee: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-medium text-slate-900 mb-1">SES Scholarship Slabs</h2>
        <p className="text-xs text-slate-500 mb-4">
          Current slabs (read-only in this view — contact support to adjust slab boundaries).
        </p>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 text-left">
            <tr>
              <th className="py-1">SES Range</th>
              <th className="py-1">Scholarship</th>
            </tr>
          </thead>
          <tbody>
            {slabs.map((s, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5">
                  {s.minScore <= -999999 ? "< " + (s.maxScore ?? "") : s.maxScore === null ? `≥ ${s.minScore}` : `${s.minScore} – ${s.maxScore}`}
                </td>
                <td className="py-1.5 font-medium">{s.scholarshipPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn-primary" onClick={handleSave} disabled={saving || !weightsValid}>
        {saving ? "Saving..." : "Save Policy"}
      </button>
    </div>
  );
}
