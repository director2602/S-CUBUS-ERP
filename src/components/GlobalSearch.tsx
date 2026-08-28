"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchStudents } from "@/server/actions/students";

export function GlobalSearch({ workspace }: { workspace: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const found = await searchStudents(value);
      setResults(found.map((s) => ({ id: s.id, name: s.name })));
      setOpen(true);
    });
  }

  return (
    <div className="relative w-full max-w-xs">
      <input
        className="input"
        placeholder="Search name, SCID, SATHII KEY, roll no..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full card max-h-72 overflow-auto">
          {isPending && <div className="px-3 py-2 text-xs text-slate-400">Searching...</div>}
          {!isPending && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No matching students.</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              onMouseDown={() => router.push(`/w/${workspace}/students/${r.id}`)}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
