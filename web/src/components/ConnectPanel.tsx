"use client";

import { useState } from "react";
import type { ConnectInfo } from "@/lib/api";
import { submitMoonlightPair } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready",
  ready_local: "Ready (local)",
  needs_sunshine: "Installing Sunshine",
  sunshine_stopped: "Starting Sunshine",
  firewall_blocked: "Fixing firewall",
};

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value)}
      className="ml-2 border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10"
    >
      Copy {label}
    </button>
  );
}

export function ConnectPanel({
  connect,
  rentalId,
  onPaired,
}: {
  connect: ConnectInfo;
  rentalId: string;
  onPaired?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const statusLabel = STATUS_LABELS[connect.status] ?? connect.status;
  const host = connect.recommendedHost ?? connect.host;
  const showHost = Boolean(host);

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setPairError(null);
    setPairing(true);
    try {
      await submitMoonlightPair(rentalId, pin);
      setPin("");
      onPaired?.();
    } catch (err) {
      setPairError(err instanceof Error ? err.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  return (
    <div className="mt-4 border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
          Moonlight streaming
        </p>
        <span
          className={`font-mono text-[10px] uppercase tracking-widest ${
            connect.ready ? "text-emerald-400" : connect.streamReady ? "text-amber-400" : "text-muted"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {connect.message && (
        <p className="mt-2 text-xs text-muted">{connect.message}</p>
      )}

      {showHost && (
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Moonlight PC address
            </dt>
            <dd className="mt-1 font-mono text-lg tracking-widest text-foreground">
              {host}
              <CopyButton value={host!} label="IP" />
            </dd>
            <p className="mt-1 text-[10px] text-muted">
              Enter IP only in Moonlight — no port number.
              {connect.connectMode === "direct" && " Internet (router port forwarding required)."}
            </p>
          </div>
        </dl>
      )}

      {connect.pairStatus === "paired" ? (
        <p className="mt-3 text-xs text-emerald-400">
          Paired — open your desktop in Moonlight to play.
        </p>
      ) : (
        <form onSubmit={handlePair} className="mt-4 space-y-2">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-muted">
            Moonlight PIN (4 digits)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              className="w-24 border border-border bg-background px-3 py-2 font-mono text-lg tracking-widest"
              disabled={pairing || !connect.streamReady}
            />
            <button
              type="submit"
              disabled={pairing || pin.length !== 4 || !connect.streamReady}
              className="border border-accent px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10 disabled:opacity-40"
            >
              {pairing ? "Pairing…" : "Pair"}
            </button>
          </div>
          {pairError && <p className="text-xs text-red-400">{pairError}</p>}
          {connect.pairMessage && (
            <p className="text-xs text-muted">{connect.pairMessage}</p>
          )}
        </form>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-4 text-xs text-muted">
        {connect.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["Windows / Mac", connect.moonlightLinks.mac],
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
