import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { resultTemplates, templateFields } from "@/db/schema";
import { requireUser, requireRole } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireUser();
  const template = db.select().from(resultTemplates).where(eq(resultTemplates.id, params.id)).get();
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const fields = db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateId, params.id))
    .all()
    .map((f) => ({ ...f, sourceAliases: JSON.parse(f.sourceAliases) as string[] }));
  return NextResponse.json({ template, fields });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRole("ADMIN");
  const body = await req.json();
  if (typeof body.isActive === "boolean") {
    db.update(resultTemplates).set({ isActive: body.isActive }).where(eq(resultTemplates.id, params.id)).run();
  }
  return NextResponse.json({ ok: true, updatedBy: user.id });
}
