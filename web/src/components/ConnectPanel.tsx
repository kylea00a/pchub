"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  rentalId,
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
  const canBrowserConnect = connect.ready || connect.status === "starting" || connect.status === "pending";

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

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/stream/${rentalId}`}
          className={`pchub-btn-primary px-4 py-2 text-[11px] font-medium text-background ${
            canBrowserConnect ? "" : "pointer-events-none opacity-50"
          }`}
          aria-disabled={!canBrowserConnect}
        >
          Connect in browser
        </Link>
        {windowsClient && (
          <a
            href={RENTER_INSTALLER_ZIP}
            className="pchub-btn-ghost border border-border px-4 py-2 text-[11px]"
          >
            Download Windows app
          </a>
        )}
      </div>

      {!windowsClient && (
        <p className="mt-3 text-xs text-muted">
          On Mac, use <strong className="text-foreground">Connect in browser</strong> — no install
          needed. The native Windows app is optional for lower latency on gaming PCs.
        </p>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-4 text-xs text-muted">
        <li>Power on your rental and wait until status shows Ready (or Preparing finishes).</li>
        <li>Click <strong className="text-foreground">Connect in browser</strong>.</li>
        <li>Click the video panel to capture keyboard and mouse.</li>
      </ol>

      {connect.ready && (
        <p className="mt-3 text-xs text-emerald-400">
          Stream host is live — open browser connect or use PCHUB Renter on Windows.
        </p>
      )}

      {!connect.ready && connect.status === "pending" && (
        <p className="mt-3 text-xs text-muted">
          The gaming PC is starting its stream engine. This usually takes under a minute.
        </p>
      )}
    </div>
  );
}
