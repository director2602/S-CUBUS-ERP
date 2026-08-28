import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/session";
import { GlobalSearch } from "@/components/GlobalSearch";
import { SignOutButton } from "@/components/SignOutButton";
import { notFound } from "next/navigation";

const WORKSPACES = ["exams", "sathii"] as const;

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspace: string };
}) {
  const user = await requireUser();
  if (!WORKSPACES.includes(params.workspace as (typeof WORKSPACES)[number])) notFound();

  const other = params.workspace === "exams" ? "sathii" : "exams";
  const otherLabel = other === "exams" ? "EXAMS" : "SATHII";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-scubus-navy text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-16">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="h-9 w-9 rounded-lg bg-white flex items-center justify-center overflow-hidden p-1">
              <Image
                src="/branding/scubus-master-logo.png"
                alt="S-CUBUS"
                width={36}
                height={36}
                className="object-contain"
                priority
              />
            </div>
            <span className="font-semibold hidden sm:inline">S-CUBUS ERP</span>
            {params.workspace === "sathii" && (
              <>
                <span className="text-white/30 hidden sm:inline">+</span>
                <div className="h-8 w-8 rounded-md bg-white flex items-center justify-center overflow-hidden p-0.5 hidden sm:flex">
                  <Image
                    src="/branding/sathii-logo.png"
                    alt="SATHII"
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                </div>
              </>
            )}
          </Link>

          <nav className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
            <Link
              href="/w/exams"
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                params.workspace === "exams" ? "bg-white text-scubus-navy" : "text-white/80 hover:text-white"
              }`}
            >
              EXAMS
            </Link>
            <Link
              href="/w/sathii"
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                params.workspace === "sathii" ? "bg-white text-scubus-navy" : "text-white/80 hover:text-white"
              }`}
            >
              SATHII
            </Link>
          </nav>

          <div className="flex-1 flex justify-center">
            <GlobalSearch workspace={params.workspace} />
          </div>

          <div className="flex items-center gap-4 shrink-0 text-sm">
            <Link href="/settings/structure" className="text-white/80 hover:text-white hidden md:inline">
              Settings
            </Link>
            <span className="text-white/60 hidden lg:inline">
              {user.name} · {user.role}
            </span>
            <span className="text-white/80"><SignOutButtonWrapper /></span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-4 text-sm">
          <Link href={`/w/${params.workspace}`} className="text-white/80 hover:text-white">
            Dashboard
          </Link>
          <Link href={`/w/${params.workspace}/exams`} className="text-white/80 hover:text-white">
            Examinations
          </Link>
          <Link href={`/w/${params.workspace}/students`} className="text-white/80 hover:text-white">
            Students
          </Link>
          <span className="text-white/40 ml-auto text-xs hidden sm:inline">
            Switch to {otherLabel} anytime — same student &amp; analytics engine
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>
      <footer className="text-center text-xs text-slate-400 py-4">
        S-CUBUS CAREER PRIVATE LIMITED — Examination Result &amp; Analytics ERP
      </footer>
    </div>
  );
}

// Server layouts can't use client hooks directly; small wrapper keeps the
// sign-out button interactive without turning the whole shell into a client
// component (which would forfeit the async requireUser() call above).
function SignOutButtonWrapper() {
  return <SignOutButton />;
}
