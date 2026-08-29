"use server";

import { db } from "@/db/client";
import { students, studentIdentifiers, centres } from "@/db/schema";
import { requireRoleAction, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { eq, or, like } from "drizzle-orm";
import { z } from "zod";

export interface CreateStudentResult {
  ok: boolean;
  error?: string;
  studentId?: string;
}

export async function createStudent(formData: FormData): Promise<CreateStudentResult> {
  try {
    const user = await requireRoleAction("RESULT_OPERATOR");

    const name = z.string().min(2, "Name is required").parse(formData.get("name"));
    const centreId = (formData.get("centreId") as string) || null;
    const scid = (formData.get("scid") as string)?.trim() || null;
    const sathiiKey = (formData.get("sathiiKey") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;

    if (scid) {
      const existing = db
        .select()
        .from(studentIdentifiers)
        .where(eq(studentIdentifiers.value, scid))
        .get();
      if (existing) return { ok: false, error: `SCID "${scid}" is already assigned to another student.` };
    }
    if (sathiiKey) {
      const existing = db
        .select()
        .from(studentIdentifiers)
        .where(eq(studentIdentifiers.value, sathiiKey))
        .get();
      if (existing) return { ok: false, error: `SATHII KEY "${sathiiKey}" is already assigned to another student.` };
    }

    const student = db
      .insert(students)
      .values({ name, centreId, phone })
      .returning()
      .get();

    if (scid) {
      db.insert(studentIdentifiers).values({ studentId: student.id, type: "SCID", value: scid }).run();
    }
    if (sathiiKey) {
      db.insert(studentIdentifiers)
        .values({ studentId: student.id, type: "SATHII_KEY", value: sathiiKey })
        .run();
    }

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entityType: "Student",
      entityId: student.id,
      newValue: { name, scid, sathiiKey },
    });

    revalidatePath("/w/exams/students");
    revalidatePath("/w/sathii/students");
    return { ok: true, studentId: student.id };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input." };
    }
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create student." };
  }
}

/** Global search across Name, SCID, SATHII KEY, Roll Number (spec §4). */
export async function searchStudents(query: string) {
  await requireUser();
  const q = query.trim();
  if (!q) return [];

  const byName = db
    .select()
    .from(students)
    .where(like(students.name, `%${q}%`))
    .limit(25)
    .all();

  const byIdentifier = db
    .select({ student: students })
    .from(studentIdentifiers)
    .innerJoin(students, eq(studentIdentifiers.studentId, students.id))
    .where(like(studentIdentifiers.value, `%${q}%`))
    .limit(25)
    .all()
    .map((r) => r.student);

  const merged = new Map(byName.map((s) => [s.id, s]));
  for (const s of byIdentifier) merged.set(s.id, s);

  return Array.from(merged.values());
}

export async function listStudents(centreId?: string) {
  await requireUser();
  const rows = centreId
    ? db.select().from(students).where(eq(students.centreId, centreId)).all()
    : db.select().from(students).all();
  return rows;
}

export async function getStudentFull(studentId: string) {
  await requireUser();
  const student = db.select().from(students).where(eq(students.id, studentId)).get();
  if (!student) return null;
  const identifiers = db
    .select()
    .from(studentIdentifiers)
    .where(eq(studentIdentifiers.studentId, studentId))
    .all();
  const centre = student.centreId
    ? db.select().from(centres).where(eq(centres.id, student.centreId)).get()
    : null;
  return { student, identifiers, centre };
}
