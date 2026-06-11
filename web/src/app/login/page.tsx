"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";
import { setSession } from "@/lib/auth-session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user, token } = await login(email, password);
      setSession(token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="pchub-panel pchub-corners w-full max-w-md p-8">
        <p className="eyebrow">Authenticate</p>
        <h1 className="mt-2 text-2xl font-semibold">Operator login</h1>
        <p className="mt-2 text-sm text-muted">Access your fleet console.</p>

        {error && (
          <p className="mt-4 border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <label className="mt-6 block text-sm">
          <span className="eyebrow text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pchub-input mt-2"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="eyebrow text-muted">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pchub-input mt-2"
          />
        </label>

        <button type="submit" disabled={loading} className="pchub-btn-primary mt-8 w-full">
          {loading ? "Verifying…" : "Enter"}
        </button>

        <p className="mt-6 text-center text-sm text-muted">
          New operator?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Register
          </Link>
        </p>
        <p className="mt-2 text-center">
          <Link href="/" className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-accent">
            ← pchub.cloud
          </Link>
        </p>
      </form>
    </div>
  );
}
