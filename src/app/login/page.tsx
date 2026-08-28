"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("owner@scubus.in");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-scubus-navy to-scubus-blue px-4">
      <div className="w-full max-w-sm card p-8">
        <div className="text-center mb-6">
          <div className="mx-auto h-16 w-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden p-1.5">
            <Image
              src="/branding/scubus-master-logo.png"
              alt="S-CUBUS"
              width={56}
              height={56}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">S-CUBUS ERP</h1>
          <p className="text-sm text-slate-500">Examination Result & Analytics System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-xs text-slate-400 text-center">
          Seeded owner login: owner@scubus.in / ChangeMe123!
        </p>
      </div>
    </div>
  );
}
