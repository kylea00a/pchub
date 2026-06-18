"use client";

import { useEffect, useState } from "react";
import type { ConnectInfo } from "@/lib/api";
import { RENTER_INSTALLER_ZIP } from "@/lib/host-installer";

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready",
  starting: "Starting stream",
  needs_stream_host: "Updating host",
  idle: "Waiting",
};

function isWindowsClient() {
  if (typeof navigator === "undefined") return true;
  return /Win/i.test(navigator.userAgent) || /Windows/i.test(navigator.platform);
}

export function ConnectPanel({
  connect,
}: {
  connect: ConnectInfo;
  rentalId: string;
  onPaired?: () => void;
}) {
  const [windowsClient, setWindowsClient] = useState(true);
  useEffect(() => {
    setWindowsClient(isWindowsClient());
  }, []);

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

      {!windowsClient && (
        <p className="mt-3 border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200/90">
          PCHUB Renter is <strong>Windows only</strong> (no Mac app yet). You can power on
          rentals from this Mac, but you need a Windows PC to download Renter and connect to
          the stream.
        </p>
      )}

      {windowsClient ? (
        <a
          href={RENTER_INSTALLER_ZIP}
          className="mt-4 inline-block pchub-btn-primary px-4 py-2 text-[11px] font-medium text-background"
        >
          Download PCHUB Renter
        </a>
      ) : (
        <p className="mt-4 text-xs text-muted">
          Open this page on a Windows PC to download PCHUB Renter.
        </p>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-4 text-xs text-muted">
        {connect.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {connect.ready && windowsClient && (
        <p className="mt-3 text-xs text-emerald-400">
          Stream host is live — open PCHUB Renter and click Connect.
        </p>
      )}

      {!connect.ready && connect.status === "pending" && (
        <p className="mt-3 text-xs text-muted">
          The gaming PC is starting its stream engine for your rental. This usually takes under a
          minute after power on.
        </p>
      )}
    </div>
  );
}
