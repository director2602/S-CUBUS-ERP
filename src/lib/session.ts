import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

type SessionUser = { id: string; name?: string | null; email?: string | null; role: string };

/**
 * True once we've confirmed the session's user id still exists (and is
 * active) in the current database. On a fresh deploy the free-tier
 * database resets and gets brand new row ids — a browser holding an old
 * login session would otherwise pass authentication (the JWT itself is
 * still validly signed) but then fail confusingly on any DB write that
 * references that stale user id (e.g. the audit log's foreign key).
 */
function userStillExists(id: string): boolean {
  const row = db.select({ id: users.id, active: users.active }).from(users).where(eq(users.id, id)).get();
  return Boolean(row?.active);
}

/** For Server Components / pages: bounce to login if the session is dead. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;
  if (!user || !userStillExists(user.id)) redirect("/login");
  return user;
}

export async function requireRole(minimum: string) {
  const { roleAtLeast } = await import("@/lib/auth");
  const user = await requireUser();
  if (!roleAtLeast(user.role, minimum as never)) {
    throw new Error(`This action requires ${minimum} role or higher.`);
  }
  return user;
}

/**
 * For Server Actions that return a structured { ok, error } result rather
 * than throwing/redirecting — a mid-action redirect() doesn't make sense
 * when the caller is going to render its own error state. Throws a plain,
 * friendly Error instead, which those actions' own try/catch turns into
 * a clean { ok: false, error } response.
 */
export async function requireRoleAction(minimum: string): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;
  if (!user || !userStillExists(user.id)) {
    throw new Error("Your session has expired (often because the demo database was recently reset). Please refresh the page and sign in again.");
  }
  const { roleAtLeast } = await import("@/lib/auth");
  if (!roleAtLeast(user.role, minimum as never)) {
    throw new Error(`This action requires ${minimum} role or higher.`);
  }
  return user;
}
