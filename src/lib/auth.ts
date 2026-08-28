import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/server/audit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email.toLowerCase().trim()))
          .get();

        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        await writeAuditLog({
          userId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
        });

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as unknown as { role: string }).role;
        token.id = (user as unknown as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { role?: string; id?: string }).id = token.id as string;
      }
      return session;
    },
  },
};

export const ROLE_HIERARCHY = ["VIEWER", "FACULTY", "RESULT_OPERATOR", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLE_HIERARCHY)[number];

export function roleAtLeast(role: string | undefined, minimum: Role): boolean {
  const idx = ROLE_HIERARCHY.indexOf((role as Role) ?? "VIEWER");
  const minIdx = ROLE_HIERARCHY.indexOf(minimum);
  return idx >= minIdx;
}
