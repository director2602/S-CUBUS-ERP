import Link from "next/link";
import { requireUser } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-scubus-navy text-white">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-6">
          <Link href="/" className="font-semibold">
            ← S-CUBUS ERP
          </Link>
          <span className="text-white/60 text-sm">Settings</span>
          <span className="ml-auto text-sm text-white/60">
            {user.name} · {user.role}
          </span>
          <SignOutButton />
        </div>
        <div className="max-w-5xl mx-auto px-6 pb-3 flex gap-4 text-sm">
          <Link href="/settings/structure" className="text-white/80 hover:text-white">
            Organisation Structure
          </Link>
          <Link href="/settings/templates" className="text-white/80 hover:text-white">
            Templates
          </Link>
          <Link href="/settings/users" className="text-white/80 hover:text-white">
            Users
          </Link>
          <Link href="/settings/audit" className="text-white/80 hover:text-white">
            Audit Log
          </Link>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
