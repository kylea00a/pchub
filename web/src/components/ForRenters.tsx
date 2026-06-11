"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchMachines, powerOn, type Machine } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

function StatusBadge({ pc }: { pc: Machine }) {
  const online = pc.online;
  const rented = pc.status === "rented";
  return (
    <span
      className={`shrink-0 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
        online
          ? "border-emerald-400/50 text-emerald-400"
          : rented
            ? "border-amber-400/50 text-amber-400"
            : "border-border text-muted"
      }`}
    >
      {online ? "Online" : rented ? "In use" : "Offline"}
    </span>
  );
}

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
    <section id="for-renters" className="border-b border-border bg-surface/40 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Fleet</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Available nodes
            </h2>
            <p className="mt-4 max-w-xl text-muted">
              {isLoggedIn ? (
                <>
                  Power on from here or manage in your{" "}
                  <Link href="/dashboard" className="text-accent hover:underline">
                    console
                  </Link>
                  .
                </>
              ) : (
                <>
                  <Link href="/signup" className="text-accent hover:underline">
                    Create account
                  </Link>{" "}
                  to access the fleet.
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {isLoggedIn && (
              <Link href="/dashboard" className="pchub-btn-ghost px-4 py-2 text-[11px]">
                Console
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                load();
              }}
              className="pchub-btn-ghost px-4 py-2 text-[11px]"
            >
              Sync
            </button>
          </div>
        </div>

        {isLoggedIn && (
          <div className="pchub-panel mt-8 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={useCloudStorage && canUseCloud}
                disabled={!canUseCloud}
                onChange={(e) => setUseCloudStorage(e.target.checked)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="text-sm">
                <span className="font-mono text-xs uppercase tracking-widest text-foreground">
                  Personal cloud layer
                </span>
                {canUseCloud ? (
                  <span className="mt-1 block text-muted">Same files on every node you rent.</span>
                ) : (
                  <span className="mt-1 block text-muted">
                    <Link href="/storage" className="text-accent hover:underline">
                      Provision storage
                    </Link>{" "}
                    first.
                  </span>
                )}
              </span>
            </label>
          </div>
        )}

        {rentMessage && (
          <div className="mt-6 border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
            <p>{rentMessage}</p>
            <Link href="/dashboard" className="mt-2 inline-block font-mono text-xs uppercase tracking-widest text-accent">
              Open console →
            </Link>
          </div>
        )}

        {(loading || authLoading) && machines.length === 0 && (
          <p className="mt-10 font-mono text-sm text-muted">Scanning fleet…</p>
        )}

        {error && (
          <div className="mt-10 border border-red-500/40 bg-red-500/5 p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-red-400">
              Link failed
            </p>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </div>
        )}

        {!loading && !error && machines.length === 0 && (
          <div className="mt-10 border border-dashed border-border bg-background p-12 text-center">
            <p className="font-mono text-sm uppercase tracking-widest">No nodes online</p>
            <p className="mt-2 text-sm text-muted">
              <a href="/host" className="text-accent hover:underline">
                Deploy a host agent
              </a>{" "}
              to populate the fleet.
            </p>
          </div>
        )}

        <div className="mt-10 grid gap-px bg-border lg:grid-cols-3">
          {machines.map((pc) => (
            <article
              key={pc.id}
              className="pchub-panel pchub-corners flex flex-col bg-background p-6"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{pc.name}</h3>
                <StatusBadge pc={pc} />
              </div>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                {pc.city} · {pc.region}
                {pc.uploadMbps != null ? ` · ↑${pc.uploadMbps} Mbps` : ""}
              </p>

              <dl className="mt-5 flex-1 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="font-mono text-[10px] uppercase text-muted">CPU</dt>
                  <dd className="max-w-[55%] text-right text-xs">{pc.cpu}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-mono text-[10px] uppercase text-muted">RAM</dt>
                  <dd className="text-right text-xs">{pc.ram}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="font-mono text-[10px] uppercase text-muted">GPU</dt>
                  <dd className="max-w-[55%] text-right text-xs">{pc.gpu}</dd>
                </div>
                {pc.benchScore != null && (
                  <div className="flex justify-between gap-4 pt-2">
                    <dt className="font-mono text-[10px] uppercase text-muted">Bench</dt>
                    <dd className="font-mono text-accent">{pc.benchScore}/100</dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 flex items-end justify-between border-t border-border pt-4">
                <div>
                  <p className="font-mono text-2xl text-accent">{pc.priceFormatted}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
                    per min
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!pc.online || rentingId === pc.id}
                  onClick={() => handleRent(pc)}
                  className="pchub-btn-ghost px-4 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {!isLoggedIn
                    ? "Auth required"
                    : rentingId === pc.id
                      ? "Booting…"
                      : "Power on"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
