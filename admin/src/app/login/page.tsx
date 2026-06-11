"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";
import { setSession } from "@/lib/auth-session";

export default function AdminLoginPage() {
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
      if (user.role !== "admin") {
        setError("This account is not an admin. Use the main site to manage your PCs.");
        return;
      }
      setSession(token, user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-8"
      >
        <p className="text-xs uppercase tracking-wider text-muted">SkyPC operations</p>
        <h1 className="mt-2 text-2xl font-semibold">Admin sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Platform dashboard — users, machines, and rentals. Renter accounts use the main site.
        </p>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <label className="mt-6 block text-sm">
          <span className="text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-muted">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-accent py-2.5 text-sm font-medium text-background disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
