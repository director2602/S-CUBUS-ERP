import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return session.user as { id: string; name?: string | null; email?: string | null; role: string };
}

export async function requireRole(minimum: string) {
  const { roleAtLeast } = await import("@/lib/auth");
  const user = await requireUser();
  if (!roleAtLeast(user.role, minimum as never)) {
    throw new Error(`This action requires ${minimum} role or higher.`);
  }
  return user;
}
