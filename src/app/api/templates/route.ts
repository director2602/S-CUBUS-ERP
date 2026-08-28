import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { resultTemplates, templateFields } from "@/db/schema";
import { requireRole, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { eq } from "drizzle-orm";
import { z } from "zod";

const fieldSchema = z.object({
  targetField: z.enum([
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
  ]),
  subjectName: z.string().optional().nullable(),
  sourceAliases: z.array(z.string()).min(1),
  required: z.boolean().default(false),
  calculated: z.boolean().default(false),
});

const createSchema = z.object({
  name: z.string().min(2),
  type: z.enum([
    "RESULT",
    "STUDENT_MASTER",
    "QUESTION_PAPER",
    "ANSWER_KEY",
    "STUDENT_RESPONSE",
    "SCHOLARSHIP",
    "REPORT",
    "BRANDING",
  ]),
  fields: z.array(fieldSchema).min(1),
  cloneFromId: z.string().optional().nullable(),
});

export async function GET() {
  await requireUser();
  const templates = db.select().from(resultTemplates).all();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const user = await requireRole("ADMIN");
  const body = createSchema.parse(await req.json());

  // Versioning: never overwrite a historical template used for published
  // results — creating with an existing name bumps the version instead.
  const existingVersions = db
    .select()
    .from(resultTemplates)
    .where(eq(resultTemplates.name, body.name))
    .all();
  const nextVersion = existingVersions.length
    ? Math.max(...existingVersions.map((t) => t.version)) + 1
    : 1;

  if (existingVersions.length > 0) {
    // Deactivate previous versions so exactly one active version is used
    // going forward, while old versions remain intact for historical exams.
    for (const v of existingVersions) {
      db.update(resultTemplates).set({ isActive: false }).where(eq(resultTemplates.id, v.id)).run();
    }
  }

  const template = db
    .insert(resultTemplates)
    .values({
      name: body.name,
      type: body.type,
      version: nextVersion,
      isActive: true,
      clonedFromId: body.cloneFromId ?? null,
      createdById: user.id,
    })
    .returning()
    .get();

  body.fields.forEach((f, order) => {
    db.insert(templateFields)
      .values({
        templateId: template.id,
        targetField: f.targetField,
        subjectName: f.subjectName ?? null,
        sourceAliases: JSON.stringify(f.sourceAliases),
        required: f.required,
        calculated: f.calculated,
        order,
      })
      .run();
  });

  await writeAuditLog({
    userId: user.id,
    action: "CREATE",
    entityType: "ResultTemplate",
    entityId: template.id,
    newValue: { name: body.name, version: nextVersion, type: body.type },
  });

  return NextResponse.json({ template });
}
