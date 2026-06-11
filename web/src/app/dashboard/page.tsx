"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  fetchDashboard,
  fetchMachines,
  powerOff,
  powerOn,
  type Dashboard,
  type Machine,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout, isLoggedIn } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [useCloud, setUseCloud] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      setError(null);
      const [dash, listing] = await Promise.all([fetchDashboard(), fetchMachines()]);
      setDashboard(dash);
      setMachines(listing.machines);
      if (dash.profile.storagePlan === "none") setUseCloud(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      router.replace("/login");
      return;
    }
    if (isLoggedIn) load();
  }, [authLoading, isLoggedIn, load, router]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [isLoggedIn, load]);

  async function turnOff(rentalId: string) {
    setBusy(rentalId);
    try {
      await powerOff(rentalId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to turn off");
    } finally {
      setBusy(null);
    }
  }

  async function turnOn(machineId: string) {
    setBusy(machineId);
    try {
      await powerOn(
        machineId,
        useCloud && dashboard?.profile.storagePlan !== "none"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to turn on");
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || (!isLoggedIn && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  const activeMachineIds = new Set(dashboard?.activeSessions.map((s) => s.machineId));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← SkyPC
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user?.email}</span>
            <button type="button" onClick={logout} className="text-muted hover:text-foreground">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold">My dashboard</h1>
        <p className="mt-2 text-muted">
          Turn PCs on or off. Rent multiple machines — each session is billed per minute.
        </p>

        {error && (
          <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {dashboard && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-4">
              {[
                { label: "Active PCs", value: String(dashboard.summary.activeSessions) },
                { label: "Running cost", value: dashboard.summary.runningPerMinuteFormatted },
                { label: "Est. total", value: dashboard.summary.runningEstimatedFormatted },
                {
                  label: "Cloud storage",
                  value: `${dashboard.profile.usedFormatted} / ${dashboard.profile.quotaFormatted}`,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-border bg-surface p-5">
                  <p className="text-xs uppercase tracking-wider text-muted">{s.label}</p>
                  <p className="mt-2 text-lg font-semibold">{s.value}</p>
                </div>
              ))}
            </div>

            <section className="mt-10">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-medium">Your PCs — powered on</h2>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={useCloud}
                    disabled={dashboard.profile.storagePlan === "none"}
                    onChange={(e) => setUseCloud(e.target.checked)}
                  />
                  Cloud storage on new sessions
                </label>
              </div>

              {dashboard.activeSessions.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No PCs running. Turn one on below.</p>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {dashboard.activeSessions.map((session) => (
                    <article
                      key={session.rentalId}
                      className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{session.machineName}</h3>
                          <p className="text-sm text-muted">
                            {session.machineCity} · {session.priceFormatted}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                          ON
                        </span>
                      </div>
                      {session.syncMessage && (
                        <p className="mt-2 text-xs text-muted">{session.syncMessage}</p>
                      )}
                      <p className="mt-3 text-sm">
                        Running{" "}
                        {session.elapsedSeconds != null
                          ? formatDuration(session.elapsedSeconds)
                          : "—"}{" "}
                        · {session.estimatedTotalFormatted}
                      </p>
                      <button
                        type="button"
                        disabled={busy === session.rentalId}
                        onClick={() => turnOff(session.rentalId)}
                        className="mt-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                      >
                        {busy === session.rentalId ? "Turning off…" : "Turn off"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium">Available PCs — turn on</h2>
              <p className="mt-1 text-sm text-muted">
                <Link href="/#for-renters" className="text-accent hover:underline">
                  Browse all
                </Link>
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {machines
                  .filter((m) => m.online && !activeMachineIds.has(m.id))
                  .map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
                    >
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted">
                          {m.city} · {m.priceFormatted}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy === m.id}
                        onClick={() => turnOn(m.id)}
                        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
                      >
                        {busy === m.id ? "…" : "Turn on"}
                      </button>
                    </div>
                  ))}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium">Recent sessions</h2>
              {dashboard.history.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No history yet.</p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-surface text-muted">
                      <tr>
                        <th className="px-4 py-3">PC</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Total</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.history.map((row) => (
                        <tr key={row.rentalId} className="border-b border-border/60">
                          <td className="px-4 py-3">{row.machineName}</td>
                          <td className="px-4 py-3">{row.minutesBilled} min</td>
                          <td className="px-4 py-3">{row.estimatedTotalFormatted}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={busy === row.machineId}
                              onClick={() => turnOn(row.machineId!)}
                              className="text-accent hover:underline disabled:opacity-50"
                            >
                              Turn on again
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="mt-10 flex gap-3">
              <Link href="/storage" className="rounded-lg border border-border px-4 py-2 text-sm">
                Cloud storage
              </Link>
              <Link href="/#for-renters" className="rounded-lg border border-border px-4 py-2 text-sm">
                Browse marketplace
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
