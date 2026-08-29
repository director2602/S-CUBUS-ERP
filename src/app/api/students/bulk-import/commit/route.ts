import { NextRequest, NextResponse } from "next/server";
import { db, sqlite } from "@/db/client";
import { students, studentIdentifiers } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { validateStudentImportRows, type NormalizedStudentRow } from "@/lib/engine/studentImport";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  mapping: z.record(z.union([z.object({ targetField: z.string() }), z.null()])),
  rows: z.array(z.record(z.unknown())),
});

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole("RESULT_OPERATOR");
    const body = bodySchema.parse(await req.json());

    const normalized: NormalizedStudentRow[] = body.rows.map((raw, i) => {
      const row: NormalizedStudentRow = { rowNumber: i + 2 };
      for (const [column, target] of Object.entries(body.mapping)) {
        if (!target) continue;
        const value = raw[column];
        if (target.targetField === "STUDENT_NAME") row.name = str(value);
        if (target.targetField === "SCID") row.scid = str(value);
        if (target.targetField === "SATHII_KEY") row.sathiiKey = str(value);
      }
      return row;
    });

    const validation = validateStudentImportRows(normalized);
    const rowsToImport = validation.validatedRows.filter((r) => r.errors.length === 0);

    let created = 0;
    let skippedExisting = 0;

    const run = sqlite.transaction(() => {
      for (const row of rowsToImport) {
        let existingId: string | null = null;

        if (row.scid) {
          const existing = db
            .select()
            .from(studentIdentifiers)
            .where(and(eq(studentIdentifiers.type, "SCID"), eq(studentIdentifiers.value, row.scid)))
            .get();
          existingId = existing?.studentId ?? null;
        }
        if (!existingId && row.sathiiKey) {
          const existing = db
            .select()
            .from(studentIdentifiers)
            .where(and(eq(studentIdentifiers.type, "SATHII_KEY"), eq(studentIdentifiers.value, row.sathiiKey)))
            .get();
          existingId = existing?.studentId ?? null;
        }

        if (existingId) {
          skippedExisting += 1;
          continue;
        }

        const student = db.insert(students).values({ name: row.name || "Unnamed Student" }).returning().get();
        if (row.scid) {
          db.insert(studentIdentifiers).values({ studentId: student.id, type: "SCID", value: row.scid }).run();
        }
        if (row.sathiiKey) {
          db.insert(studentIdentifiers)
            .values({ studentId: student.id, type: "SATHII_KEY", value: row.sathiiKey })
            .run();
        }
        created += 1;
      }
    });
    run();

    await writeAuditLog({
      userId: user.id,
      action: "BULK_IMPORT",
      entityType: "Student",
      newValue: { created, skippedExisting, totalRows: normalized.length },
    });

    return NextResponse.json({
      created,
      skippedExisting,
      skippedInvalid: validation.rowsWithErrors,
      validation,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk import failed unexpectedly.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
