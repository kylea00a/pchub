"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchAdminOverview, type AdminOverview } from "@/lib/api";
import { clearSession, getToken, getUser } from "@/lib/auth-session";

export default function AdminDashboardPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    const user = getUser();
    if (!token || user?.role !== "admin") {
      router.replace("/login");
      return;
    }
    try {
      setError(null);
      const data = await fetchAdminOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      if (err instanceof Error && err.message.includes("401")) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (loading && !overview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  const user = getUser();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div>
            <p className="eyebrow text-accent-violet">PCHUB</p>
            <p className="font-mono text-xs uppercase tracking-widest">Ops console</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user?.email}</span>
            <button type="button" onClick={logout} className="text-muted hover:text-foreground">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {error && (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {overview && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Users", value: overview.stats.users },
                { label: "Machines", value: overview.stats.machines },
                { label: "Active rentals", value: overview.stats.activeRentals },
              ].map((s) => (
                <div key={s.label} className="pchub-panel border bg-surface p-5">
                  <p className="text-xs uppercase tracking-wider text-muted">{s.label}</p>
                  <p className="mt-2 text-3xl font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            <section className="mt-12">
              <h2 className="text-lg font-medium">Machines</h2>
              <div className="mt-4 overflow-x-auto pchub-panel border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface text-muted">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.machines.map((m) => (
                      <tr key={m.id} className="border-b border-border/60">
                        <td className="px-4 py-3">{m.name}</td>
                        <td className="px-4 py-3">{m.city}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              m.online ? "text-emerald-400" : "text-muted"
                            }
                          >
                            {m.online ? "Online" : m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{m.priceFormatted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-12">
              <h2 className="text-lg font-medium">Recent rentals</h2>
              <div className="mt-4 overflow-x-auto pchub-panel border">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-surface text-muted">
                    <tr>
                      <th className="px-4 py-3">PC</th>
                      <th className="px-4 py-3">Renter</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Started</th>
                      <th className="px-4 py-3">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.rentals.map((r) => (
                      <tr key={r.id} className="border-b border-border/60">
                        <td className="px-4 py-3">{r.machine_name}</td>
                        <td className="px-4 py-3">{r.renter_email ?? "—"}</td>
                        <td className="px-4 py-3">{r.status}</td>
                        <td className="px-4 py-3">
                          {new Date(r.started_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          ₱{(r.total_cents / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
