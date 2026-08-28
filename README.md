# S-CUBUS ERP — Examination Result & Analytics System

Built against `SCUBUS_ERP_Claude_Code_Master_Spec.md`, Phases 1–4:
architecture/auth/workspaces, student master + identity, the template-driven
import engine, and examination management + the calculation engine.

## Stack

- **Next.js 14** (App Router, TypeScript) — UI + server actions + API routes
- **Drizzle ORM + SQLite** (`better-sqlite3`) — chosen over Prisma because
  Prisma's engine binaries require network access to `binaries.prisma.sh`,
  which wasn't reachable in the build sandbox. Drizzle is pure JS/TS and
  needs no engine download; swapping the driver to Postgres later is a
  small, contained change (the schema shape carries over almost 1:1).
- **NextAuth** (credentials provider, JWT sessions, bcrypt password hashes)
- **Vitest** — 44 unit tests covering the calculation engine, import
  validation engine, template alias matching, and workbook parsing
- **xlsx** — Excel/CSV parsing
- **Tailwind CSS**

## Getting started

```bash
npm install
npm run db:push     # create/sync the SQLite schema
npm run db:seed     # seed an owner user, reference data, a starter template
npm run dev          # http://localhost:3000
```

Seeded login: **owner@scubus.in / ChangeMe123!** — change this password
immediately in any real deployment (there's no self-service password change
UI yet; update the `users` table or re-run a seed with a new hash).

```bash
npm test             # run the 44 unit tests
npm run build         # production build
npm start             # run the production build
```

## What's implemented (Phases 1–4 of the spec)

- **Auth & roles**: Owner / Admin / Result Operator / Faculty / Viewer,
  enforced server-side on every action and API route (never just hidden in
  the UI).
- **Two workspaces** (EXAMS, SATHII) sharing one schema, one calculation
  engine, one import pipeline — configuration-driven, not duplicated code.
- **Student identity**: SCID and SATHII KEY are the permanent unique keys;
  name is searchable but never used to merge or identify students. Roll
  numbers live on `exam_registrations` (per-exam/session), preserving
  historical batch/class/roll-number associations.
- **Global search** (name / SCID / SATHII KEY) → canonical Student 360 page
  showing identity, current & previous result, subject analysis, cohort
  comparison (class/batch/code/cohort averages, topper), and cumulative
  trend — all with explicit "insufficient data" messaging instead of
  fabricated charts when there's only one result.
- **Template engine**: create a Result Template, define arbitrary
  source-column aliases mapped to normalized fields (including dynamic,
  admin-defined subjects), mark fields required/optional. Creating a
  template with an existing name creates a new **version** rather than
  overwriting the one used by already-published results.
- **Import pipeline**: upload → parse (skips title rows, detects the real
  header row) → auto-suggest column mapping → manual override → validate
  → review errors → import only valid rows (or override) → transactional
  commit → automatic rank/percentile recalculation across the whole
  cohort → audit log entry. Re-uploading an unchanged file is blocked by a
  content-fingerprint idempotency check.
- **Calculation engine**: total, percentage, negative marking, competition
  ranking (correct tie handling), percentile, mean/median/stdev/min/max —
  all pure, documented, and unit-tested. Uploaded totals/percentages are
  independently reconciled and **flagged, never silently overwritten**, on
  mismatch.
- **Examination management**: dynamic subjects, codes, marking scheme
  (correct/wrong/unattempted marks, negative marking on/off, decimal
  precision) — all configured per exam, nothing hard-coded. Draft →
  Published → Archived status, with publish blocked while unresolved
  mismatches exist.
- **Audit log**: every create/status-change/import/login is recorded with
  actor, action, entity, and payload.

## Deliberately not yet built (see spec Phases 5–10)

The spec describes a multi-month build. To ship something genuinely
working rather than a shallow pass over 47 sections, this pass stops at a
solid Phase 1–4 core. Explicitly out of scope for this build:

- Question paper / answer key / student response import and
  question-level correct/wrong/unattempted analysis (Phase 5)
- Leading/lagging momentum scoring, quadrant groups, dynamic chart
  selection engine (Phase 6–7) — the Student 360 and exam pages show
  honest "not enough data yet" messages instead of fabricating this
  scoring
- SATHII scholarship rule engine and calculator (Phase 8) — intentionally
  not implemented since the spec itself says not to invent the formula
  until S-CUBUS approves the policy
- PDF/print report generation and report templates (Phase 9)
- Full data-quality dashboard, bulk report generation, intervention
  tracking, goals (Phase 10 and others)
- Server-side pagination on large result tables (currently caps at first
  100 rows — fine for a demo, needs proper pagination for thousands of
  students)

These are straightforward to add on top of this foundation — the schema
already has tables scaffolded for several of them (`branding_profiles`,
`result_corrections`, etc.) even where the UI doesn't exist yet.

## Project structure

```
src/
  db/               Drizzle schema, client, seed script
  lib/
    engine/         Calculation, import validation, template matching,
                     workbook parsing — pure, unit-tested business logic
    auth.ts         NextAuth config, role hierarchy
    session.ts      requireUser/requireRole helpers
  server/
    actions/        Server actions (students, examinations, structure)
    import.ts        Transactional import commit logic
    audit.ts         Audit log writer
  app/
    w/[workspace]/  EXAMS / SATHII workspace UI (dashboard, students,
                     examinations, import wizard)
    settings/        Templates, organisation structure, audit log
    api/             Import pipeline + templates REST endpoints
```

## Deploying

This is a standard Next.js app. For a real deployment:

1. Swap `DATABASE_URL` to a persistent path (or migrate the Drizzle driver
   to Postgres for multi-instance deployments — see `src/db/client.ts` and
   `src/db/schema.ts`; the table shapes need only minor dialect tweaks).
2. Set a strong `NEXTAUTH_SECRET` and the correct `NEXTAUTH_URL`.
3. Run `npm run build && npm start`, or deploy to any Node hosting
   platform (Vercel, Render, Railway, etc.) — no native-binary build step
   is required, unlike the Prisma approach this project moved away from.
4. Change the seeded owner password immediately.
