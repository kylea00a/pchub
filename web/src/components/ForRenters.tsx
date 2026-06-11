"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchMachines, powerOn, type Machine } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export function ForRenters() {
  const router = useRouter();
  const { isLoggedIn, profile, loading: authLoading } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [useCloudStorage, setUseCloudStorage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rentingId, setRentingId] = useState<string | null>(null);
  const [rentMessage, setRentMessage] = useState<string | null>(null);

  const storagePlan = profile?.storagePlan ?? "none";

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchMachines();
      setMachines(data.machines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load machines");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.storagePlan && profile.storagePlan !== "none") {
      setUseCloudStorage(true);
    }
  }, [profile?.storagePlan]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleRent(machine: Machine) {
    if (!machine.online) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setRentingId(machine.id);
    setRentMessage(null);
    try {
      const rental = await powerOn(
        machine.id,
        useCloudStorage && storagePlan !== "none"
      );
      setRentMessage(
        `${rental.machineName} is on. ${rental.syncMessage ?? rental.message ?? ""}`
      );
      await load();
    } catch (err) {
      setRentMessage(err instanceof Error ? err.message : "Failed to turn on");
    } finally {
      setRentingId(null);
    }
  }

  const canUseCloud = storagePlan !== "none";

  return (
    <section id="for-renters" className="border-b border-border bg-surface/30 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Browse desktops</h2>
            <p className="mt-4 max-w-xl text-muted">
              {isLoggedIn ? (
                <>
                  Turn a PC on from here or manage sessions in your{" "}
                  <Link href="/dashboard" className="text-accent hover:underline">
                    dashboard
                  </Link>
                  .
                </>
              ) : (
                <>
                  <Link href="/signup" className="text-accent hover:underline">
                    Sign up
                  </Link>{" "}
                  to rent PCs and manage them from your dashboard.
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {isLoggedIn && (
              <Link
                href="/dashboard"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            >
              Refresh
            </button>
          </div>
        </div>

        {isLoggedIn && (
          <div className="mt-6 rounded-xl border border-border bg-background p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={useCloudStorage && canUseCloud}
                disabled={!canUseCloud}
                onChange={(e) => setUseCloudStorage(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium">Use personal cloud storage</span>
                {canUseCloud ? (
                  <span className="block text-muted">Same files on every PC you rent.</span>
                ) : (
                  <span className="block text-muted">
                    <Link href="/storage" className="text-accent hover:underline">
                      Choose a storage plan
                    </Link>{" "}
                    first.
                  </span>
                )}
              </span>
            </label>
          </div>
        )}

        {rentMessage && (
          <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
            <p>{rentMessage}</p>
            <Link href="/dashboard" className="mt-2 inline-block font-medium text-accent hover:underline">
              Open dashboard →
            </Link>
          </div>
        )}

        {(loading || authLoading) && machines.length === 0 && (
          <p className="mt-10 text-muted">Loading machines from API…</p>
        )}

        {error && (
          <div className="mt-10 rounded-xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="font-medium text-red-300">API not reachable</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <p className="mt-3 text-sm text-muted">
              Start the API: <code className="text-foreground">npm run dev</code>
            </p>
          </div>
        )}

        {!loading && !error && machines.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-background p-10 text-center">
            <p className="text-lg font-medium">No PCs registered yet</p>
            <p className="mt-2 text-sm text-muted">
              Open <a href="/host" className="text-accent hover:underline">/host</a> to register a
              PC.
            </p>
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {machines.map((pc) => (
            <article
              key={pc.id}
              className="flex flex-col rounded-2xl border border-border bg-background p-6 transition-colors hover:border-accent/40"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{pc.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    pc.online
                      ? "bg-emerald-500/20 text-emerald-400"
                      : pc.status === "rented"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-zinc-500/20 text-zinc-400"
                  }`}
                >
                  {pc.online ? "Online" : pc.status === "rented" ? "In use" : "Offline"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {pc.city}, {pc.region}
                {pc.uploadMbps != null ? ` · ↑${pc.uploadMbps} Mbps` : ""}
              </p>

              <dl className="mt-5 flex-1 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">CPU</dt>
                  <dd className="max-w-[55%] text-right text-xs">{pc.cpu}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">RAM</dt>
                  <dd className="text-right">{pc.ram}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">GPU</dt>
                  <dd className="max-w-[55%] text-right text-xs">{pc.gpu}</dd>
                </div>
                {pc.benchScore != null && (
                  <div className="flex justify-between gap-4 border-t border-border pt-2">
                    <dt className="text-muted">Bench score</dt>
                    <dd>{pc.benchScore}/100</dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 flex items-end justify-between border-t border-border pt-4">
                <div>
                  <p className="text-2xl font-semibold text-accent">{pc.priceFormatted}</p>
                  <p className="text-xs text-muted">per minute</p>
                </div>
                <button
                  type="button"
                  disabled={!pc.online || rentingId === pc.id}
                  onClick={() => handleRent(pc)}
                  className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:border-accent/40 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {!isLoggedIn
                    ? "Sign in to rent"
                    : rentingId === pc.id
                      ? "Turning on…"
                      : "Turn on"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
