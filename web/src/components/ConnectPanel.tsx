"use client";

import { useState } from "react";
import { submitMoonlightPair, type ConnectInfo } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready to connect",
  ready_local: "Ready (same WiFi)",
  needs_sunshine: "Installing remote desktop",
  sunshine_stopped: "Sunshine not running",
  firewall_blocked: "Firewall blocking",
};

const PAIR_LABELS: Record<string, string> = {
  idle: "Not paired yet",
  pending: "Pairing…",
  pairing: "Pairing…",
  paired: "Paired",
  failed: "Pairing failed",
};

export function ConnectPanel({
  rentalId,
  connect,
  onPaired,
}: {
  rentalId: string;
  connect: ConnectInfo;
  onPaired?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = STATUS_LABELS[connect.status] ?? connect.status;
  const isReady =
    (connect.status === "ready" ||
      connect.status === "ready_local") &&
    Boolean(connect.recommendedIp) &&
    connect.portsOpen;
  const pairLabel = PAIR_LABELS[connect.pairStatus] ?? connect.pairStatus;
  const showPairForm =
    connect.pairStatus !== "paired" &&
    connect.pairStatus !== "pending" &&
    connect.pairStatus !== "pairing";

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitMoonlightPair(rentalId, pin, clientName || undefined);
      setPin("");
      onPaired?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
          Remote desktop
        </p>
        <span
          className={`font-mono text-[10px] uppercase tracking-widest ${
            isReady ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {connect.message && (
        <p className="mt-2 text-xs text-muted">{connect.message}</p>
      )}

      {connect.internetWarning && (
        <p className="mt-2 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {connect.internetWarning}
        </p>
      )}

      {connect.recommendedIp && (
        <p className="mt-3 font-mono text-sm text-foreground">
          Moonlight address:{" "}
          <span className="text-accent">{connect.recommendedIp}</span>
          <span className="text-muted"> (no :port)</span>
        </p>
      )}

      {(connect.localIp || connect.publicIp) && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {connect.localIp && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Same WiFi
              </dt>
              <dd className="mt-0.5 font-mono">
                {connect.localIp}:{connect.port}
              </dd>
            </div>
          )}
          {connect.publicIp && (
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Internet
              </dt>
              <dd className="mt-0.5 font-mono">
                {connect.publicIp}:{connect.port}
              </dd>
            </div>
          )}
        </dl>
      )}

      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">
        Moonlight pairing:{" "}
        <span
          className={
            connect.pairStatus === "paired" ? "text-emerald-400" : "text-foreground"
          }
        >
          {pairLabel}
        </span>
      </p>
      {connect.pairMessage && (
        <p className="mt-1 text-xs text-muted">{connect.pairMessage}</p>
      )}

      {showPairForm && isReady && (
        <form onSubmit={handlePair} className="mt-3 space-y-2">
          <label className="block text-xs text-muted">
            Device name (optional)
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="My iPhone"
              className="mt-1 w-full pchub-input font-mono text-sm"
            />
          </label>
          <label className="block text-xs text-muted">
            PIN from Moonlight (4 digits)
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              className="mt-1 w-full pchub-input font-mono text-lg tracking-widest"
              required
            />
          </label>
          {error && <p className="text-xs text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={busy || pin.length !== 4}
            className="pchub-btn-primary px-4 py-2 text-[10px] disabled:opacity-50"
          >
            {busy ? "Pairing…" : "Pair Moonlight"}
          </button>
        </form>
      )}

      {connect.pairStatus === "paired" && (
        <p className="mt-3 text-sm text-emerald-300">
          Open Moonlight and launch <strong>Desktop</strong> to connect.
        </p>
      )}

      <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-muted">
        {connect.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["Windows / Mac", connect.moonlightLinks.windows],
            ["Android", connect.moonlightLinks.android],
            ["iOS", connect.moonlightLinks.ios],
          ] as const
        ).map(([label, href]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10"
          >
            Moonlight {label}
          </a>
        ))}
      </div>
    </div>
  );
}
