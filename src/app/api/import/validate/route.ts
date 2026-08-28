import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { normalizeRows, buildExamConfig, type ColumnMapping } from "@/server/import";
import { validateImportRows } from "@/lib/engine/importValidation";
import { z } from "zod";

const bodySchema = z.object({
  examinationId: z.string(),
  templateId: z.string(),
  mapping: z.record(z.union([z.object({ targetField: z.string(), subjectName: z.string().nullable().optional() }), z.null()])),
  rows: z.array(z.record(z.unknown())),
});

export async function POST(req: NextRequest) {
  await requireRole("RESULT_OPERATOR");
  const body = bodySchema.parse(await req.json());

  const normalized = normalizeRows(body.rows, body.mapping as ColumnMapping);
  const config = await buildExamConfig(body.examinationId, body.templateId);
  const result = validateImportRows(normalized, config);

  return NextResponse.json(result);
}
