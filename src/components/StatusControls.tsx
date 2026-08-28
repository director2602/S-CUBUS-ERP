"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateExamStatus } from "@/server/actions/examinations";

export function StatusControls({
  examId,
  status,
  hasMismatches,
}: {
  examId: string;
  status: string;
  hasMismatches: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setStatus(next: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    if (next === "PUBLISHED" && hasMismatches) {
      setError("Cannot publish: unresolved mismatched results exist. Review and correct them first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      await updateExamStatus(examId, next);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex gap-2">
        {status !== "PUBLISHED" && (
          <button className="btn-primary" disabled={isPending} onClick={() => setStatus("PUBLISHED")}>
            Publish
          </button>
        )}
        {status === "PUBLISHED" && (
          <button className="btn-secondary" disabled={isPending} onClick={() => setStatus("ARCHIVED")}>
            Archive
          </button>
        )}
        {status !== "DRAFT" && (
          <button className="btn-secondary" disabled={isPending} onClick={() => setStatus("DRAFT")}>
            Revert to Draft
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
