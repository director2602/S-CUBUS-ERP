"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkCalculateScholarships } from "@/server/actions/scholarship";

export function CalculateScholarshipsButton({ examinationId }: { examinationId: string }) {
  const router = useRouter();
  const [tuitionFee, setTuitionFee] = useState("100000");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ calculated: number; topMerit: number; eligible: number; notEligible: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await bulkCalculateScholarships(examinationId, Number(tuitionFee) || 0);
      if (!res.ok) {
        setError(res.error ?? "Failed to calculate scholarships.");
        return;
      }
      setResult({
        calculated: res.calculated ?? 0,
        topMerit: res.topMerit ?? 0,
        eligible: res.eligible ?? 0,
        notEligible: res.notEligible ?? 0,
      });
      router.refresh();
    });
  }

  return (
    <div className="card p-6">
      <h2 className="font-medium text-slate-900 mb-1">Scholarship Calculation</h2>
      <p className="text-xs text-slate-400 mb-4">
        Applies the active SATHII scholarship policy (SES score + Top-3 Class Merit) to every result in this
        examination.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Tuition Fee (₹)</label>
          <input
            type="number"
            className="input w-40"
            value={tuitionFee}
            onChange={(e) => setTuitionFee(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={run} disabled={isPending}>
          {isPending ? "Calculating..." : "Calculate Scholarships"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {result && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
          <Stat label="Results Processed" value={result.calculated} />
          <Stat label="Top-3 Class Merit" value={result.topMerit} tone="green" />
          <Stat label="Eligible" value={result.eligible} />
          <Stat label="Not Eligible" value={result.notEligible} tone="amber" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" }) {
  const cls = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  return (
    <div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
