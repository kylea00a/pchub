"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { register } from "@/lib/api";
import { setSession } from "@/lib/auth-session";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user, token } = await register(email, password, name);
      setSession(token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="pchub-panel pchub-corners w-full max-w-md p-8">
        <p className="eyebrow">Onboard</p>
        <h1 className="mt-2 text-2xl font-semibold">Create account</h1>
        <p className="mt-2 text-sm text-muted">Rent verified desktops across the Philippines.</p>

        {error && (
          <p className="mt-4 border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <label className="mt-6 block text-sm">
          <span className="eyebrow text-muted">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="pchub-input mt-2"
          />
        </label>
        <label className="mt-4 block text-sm">
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pchub-input mt-2"
          />
        </label>

        <button type="submit" disabled={loading} className="pchub-btn-primary mt-8 w-full">
          {loading ? "Provisioning…" : "Join network"}
        </button>

        <p className="mt-6 text-center text-sm text-muted">
          Have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
