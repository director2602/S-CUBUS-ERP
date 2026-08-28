"use server";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireRole, requireUser } from "@/lib/session";
import { writeAuditLog } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { MAX_USERS } from "@/lib/constants";

export async function listUsers() {
  await requireUser();
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, createdAt: users.createdAt })
    .from(users)
    .all();
}

export async function createUserAccount(formData: FormData) {
  const actor = await requireRole("ADMIN");

  const existingCount = db.select().from(users).all().length;
  if (existingCount >= MAX_USERS) {
    throw new Error(`User limit reached (${MAX_USERS} max). Deactivate or remove a user before adding a new one.`);
  }

  const name = z.string().min(2, "Name is required").parse(formData.get("name"));
  const email = z
    .string()
    .email("Enter a valid email")
    .parse(formData.get("email"))
    .toLowerCase()
    .trim();
  const password = z.string().min(8, "Password must be at least 8 characters").parse(formData.get("password"));
  const role = z
    .enum(["OWNER", "ADMIN", "RESULT_OPERATOR", "FACULTY", "VIEWER"])
    .parse(formData.get("role"));

  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) throw new Error(`A user with email "${email}" already exists.`);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = db
    .insert(users)
    .values({ name, email, passwordHash, role })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role })
    .get();

  await writeAuditLog({
    userId: actor.id,
    action: "CREATE",
    entityType: "User",
    entityId: user.id,
    newValue: { name, email, role },
  });

  revalidatePath("/settings/users");
  return user;
}

export async function setUserActive(userId: string, active: boolean) {
  const actor = await requireRole("ADMIN");
  const target = db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) throw new Error("User not found.");
  if (target.role === "OWNER" && !active) {
    throw new Error("The Owner account cannot be deactivated.");
  }

  db.update(users).set({ active }).where(eq(users.id, userId)).run();
  await writeAuditLog({
    userId: actor.id,
    action: active ? "ACTIVATE" : "DEACTIVATE",
    entityType: "User",
    entityId: userId,
    oldValue: { active: target.active },
    newValue: { active },
  });
  revalidatePath("/settings/users");
}

export async function updateUserRole(userId: string, role: string) {
  const actor = await requireRole("OWNER");
  const target = db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) throw new Error("User not found.");

  db.update(users).set({ role }).where(eq(users.id, userId)).run();
  await writeAuditLog({
    userId: actor.id,
    action: "UPDATE_ROLE",
    entityType: "User",
    entityId: userId,
    oldValue: { role: target.role },
    newValue: { role },
  });
  revalidatePath("/settings/users");
}
