"use client";

import { useEffect, useState } from "react";
import { createAcademicYear, createCentre, createClass, createBatch, listStructure } from "@/server/actions/structure";

interface Year { id: string; label: string }
interface Centre { id: string; name: string; code: string }
interface Class { id: string; name: string; workspace: string }
interface Batch { id: string; name: string; classId: string; academicYearId: string }

export default function StructurePage() {
  const [years, setYears] = useState<Year[]>([]);
  const [centres, setCentres] = useState<Centre[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const s = await listStructure();
    setYears(s.years);
    setCentres(s.centres);
    setClasses(s.classes);
    setBatches(s.batches);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function wrap(fn: (fd: FormData) => Promise<unknown>, fd: FormData, form: HTMLFormElement) {
    setError(null);
    try {
      await fn(fd);
      form.reset();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Organisation Structure</h1>
      <p className="text-sm text-slate-500 -mt-4">
        Academic years, centres, classes and batches are fully data-driven — none are hard-coded.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        <Panel title="Academic Years" items={years.map((y) => y.label)}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              wrap(createAcademicYear, fd, e.currentTarget);
            }}
          >
            <input name="label" className="input" placeholder="e.g. 2025-26" required />
            <button className="btn-primary shrink-0">Add</button>
          </form>
        </Panel>

        <Panel title="Centres" items={centres.map((c) => `${c.name} (${c.code})`)}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              wrap(createCentre, fd, e.currentTarget);
            }}
          >
            <input name="name" className="input" placeholder="Centre name" required />
            <input name="code" className="input w-28" placeholder="Code" required />
            <button className="btn-primary shrink-0">Add</button>
          </form>
        </Panel>

        <Panel title="Classes" items={classes.map((c) => `${c.name} — ${c.workspace}`)}>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              wrap(createClass, fd, e.currentTarget);
            }}
          >
            <input name="name" className="input" placeholder="e.g. Class 11" required />
            <select name="workspace" className="input w-32" required>
              <option value="EXAMS">EXAMS</option>
              <option value="SATHII">SATHII</option>
            </select>
            <button className="btn-primary shrink-0">Add</button>
          </form>
        </Panel>

        <Panel
          title="Batches"
          items={batches.map(
            (b) => `${b.name} — ${classes.find((c) => c.id === b.classId)?.name ?? "?"} / ${years.find((y) => y.id === b.academicYearId)?.label ?? "?"}`
          )}
        >
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              wrap(createBatch, fd, e.currentTarget);
            }}
          >
            <input name="name" className="input" placeholder="Batch name" required />
            <div className="flex gap-2">
              <select name="classId" className="input" required>
                <option value="">Class...</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select name="academicYearId" className="input" required>
                <option value="">Year...</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary self-start">Add</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, items, children }: { title: string; items: string[]; children: React.ReactNode }) {
  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-medium text-slate-900">{title}</h2>
      {children}
      <ul className="text-sm text-slate-600 space-y-1 max-h-40 overflow-auto">
        {items.length === 0 && <li className="text-slate-300">None yet</li>}
        {items.map((i, idx) => (
          <li key={idx} className="py-1 border-t border-slate-100 first:border-0">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
