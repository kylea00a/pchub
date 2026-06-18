"use client";

import type { ConnectInfo } from "@/lib/api";
import { RENTER_INSTALLER_MSI } from "@/lib/host-installer";

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready",
  starting: "Starting stream",
  needs_stream_host: "Updating host",
  idle: "Waiting",
};

export function ConnectPanel({
  connect,
}: {
  connect: ConnectInfo;
  rentalId: string;
  onPaired?: () => void;
}) {
  const statusLabel = STATUS_LABELS[connect.status] ?? connect.status;

  return (
    <div className="mt-4 border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
          PCHUB streaming
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

      <a
        href={RENTER_INSTALLER_MSI}
        className="mt-4 inline-block pchub-btn-primary px-4 py-2 text-[11px] font-medium text-background"
      >
        Download PCHUB Renter
      </a>

      <ol className="mt-4 list-decimal space-y-1 pl-4 text-xs text-muted">
        {connect.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {connect.ready && (
        <p className="mt-3 text-xs text-emerald-400">
          Stream host is live — open PCHUB Renter and click Connect.
        </p>
      )}
    </div>
  );
}
