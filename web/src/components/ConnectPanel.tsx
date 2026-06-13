"use client";

import type { ConnectInfo } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready to connect",
  needs_sunshine: "Sunshine required",
};

export function ConnectPanel({ connect }: { connect: ConnectInfo }) {
  const statusLabel = STATUS_LABELS[connect.status] ?? connect.status;
  const isReady = connect.status === "ready" && Boolean(connect.host);

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

      {connect.status === "needs_sunshine" && (
        <p className="mt-2 text-xs text-amber-300">
          Host PC: run <strong>RUN-INSTALL-SUNSHINE.cmd</strong> once, then keep
          the agent running.
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

      {connect.pin && (
        <p className="mt-3 font-mono text-lg tracking-widest text-foreground">
          PIN: {connect.pin}
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
