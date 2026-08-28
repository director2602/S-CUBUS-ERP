import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { normalizeRows, buildExamConfig, commitImport, recordImportErrors, type ColumnMapping } from "@/server/import";
import { validateImportRows } from "@/lib/engine/importValidation";
import { writeAuditLog } from "@/server/audit";
import { z } from "zod";

const bodySchema = z.object({
  examinationId: z.string(),
  templateId: z.string(),
  mapping: z.record(z.union([z.object({ targetField: z.string(), subjectName: z.string().nullable().optional() }), z.null()])),
  rows: z.array(z.record(z.unknown())),
  fileName: z.string(),
  sheetName: z.string().nullable(),
  fingerprint: z.string(),
  importOnlyValid: z.boolean().default(true),
  force: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const user = await requireRole("RESULT_OPERATOR");
  const body = bodySchema.parse(await req.json());

  // Defense in depth: re-validate server-side rather than trusting the
  // client's earlier /validate call (spec §11 — never silently import
  // invalid data).
  const normalized = normalizeRows(body.rows, body.mapping as ColumnMapping);
  const config = await buildExamConfig(body.examinationId, body.templateId);
  const result = validateImportRows(normalized, config);

  const rowsToImport = body.importOnlyValid
    ? result.validatedRows.filter((r) => r.errors.length === 0)
    : result.validatedRows;

  if (rowsToImport.length === 0) {
    return NextResponse.json({ error: "No valid rows to import.", validation: result }, { status: 400 });
  }

  const commitResult = await commitImport({
    examinationId: body.examinationId,
    templateId: body.templateId,
    uploadedById: user.id,
    fileName: body.fileName,
    sheetName: body.sheetName,
    fingerprint: body.fingerprint,
    rows: rowsToImport,
    totalRowCount: normalized.length,
    errorRowCount: result.rowsWithErrors,
    force: body.force,
  });

  if (commitResult.duplicateImport) {
    return NextResponse.json(
      {
        error: "This exact file has already been imported for this examination. Re-upload with force=true to proceed anyway.",
        duplicateImport: true,
      },
      { status: 409 }
    );
  }

  await recordImportErrors(commitResult.importJobId, result.allErrors);

  await writeAuditLog({
    userId: user.id,
    action: "IMPORT",
    entityType: "Examination",
    entityId: body.examinationId,
    newValue: { fileName: body.fileName, imported: commitResult.imported, importJobId: commitResult.importJobId },
  });

  return NextResponse.json({ ...commitResult, validation: result });
}
