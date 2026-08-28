"use server";

import { db } from "@/db/client";
import { academicYears, centres, classes, batches } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function createAcademicYear(formData: FormData) {
  const user = await requireRole("ADMIN");
  const label = z.string().min(2).parse(formData.get("label"));
  const row = db.insert(academicYears).values({ label }).returning().get();
  await writeAuditLog({ userId: user.id, action: "CREATE", entityType: "AcademicYear", entityId: row.id, newValue: row });
  revalidatePath("/settings/structure");
  return row;
}

export async function createCentre(formData: FormData) {
  const user = await requireRole("ADMIN");
  const name = z.string().min(2).parse(formData.get("name"));
  const code = z.string().min(1).parse(formData.get("code")).toUpperCase();
  const row = db.insert(centres).values({ name, code }).returning().get();
  await writeAuditLog({ userId: user.id, action: "CREATE", entityType: "Centre", entityId: row.id, newValue: row });
  revalidatePath("/settings/structure");
  return row;
}

export async function createClass(formData: FormData) {
  const user = await requireRole("ADMIN");
  const name = z.string().min(1).parse(formData.get("name"));
  const workspace = z.enum(["EXAMS", "SATHII"]).parse(formData.get("workspace"));
  const row = db.insert(classes).values({ name, workspace }).returning().get();
  await writeAuditLog({ userId: user.id, action: "CREATE", entityType: "Class", entityId: row.id, newValue: row });
  revalidatePath("/settings/structure");
  return row;
}

export async function createBatch(formData: FormData) {
  const user = await requireRole("ADMIN");
  const name = z.string().min(1).parse(formData.get("name"));
  const classId = z.string().min(1).parse(formData.get("classId"));
  const academicYearId = z.string().min(1).parse(formData.get("academicYearId"));
  const row = db.insert(batches).values({ name, classId, academicYearId }).returning().get();
  await writeAuditLog({ userId: user.id, action: "CREATE", entityType: "Batch", entityId: row.id, newValue: row });
  revalidatePath("/settings/structure");
  return row;
}

export async function archiveBatch(batchId: string, archived: boolean) {
  const user = await requireRole("ADMIN");
  const before = db.select().from(batches).where(eq(batches.id, batchId)).get();
  db.update(batches).set({ archived }).where(eq(batches.id, batchId)).run();
  await writeAuditLog({
    userId: user.id,
    action: archived ? "ARCHIVE" : "RESTORE",
    entityType: "Batch",
    entityId: batchId,
    oldValue: before,
  });
  revalidatePath("/settings/structure");
}

export async function listStructure() {
  return {
    years: db.select().from(academicYears).all(),
    centres: db.select().from(centres).all(),
    classes: db.select().from(classes).all(),
    batches: db.select().from(batches).all(),
  };
}
