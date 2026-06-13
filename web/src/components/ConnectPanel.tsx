"use client";

import type { ConnectInfo } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "Preparing",
  ready: "Ready to connect",
  needs_remote: "Setting up remote desktop",
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

export function ConnectPanel({ connect }: { connect: ConnectInfo }) {
  const statusLabel = STATUS_LABELS[connect.status] ?? connect.status;
  const isReady = connect.ready && Boolean(connect.rustdeskId && connect.password);

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

      {isReady ? (
        <dl className="mt-4 space-y-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">
              PC ID
            </dt>
            <dd className="mt-1 font-mono text-lg tracking-widest text-foreground">
              {connect.rustdeskId}
              <CopyButton value={connect.rustdeskId!} label="ID" />
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Session password
            </dt>
            <dd className="mt-1 font-mono text-lg tracking-widest text-accent">
              {connect.password}
              <CopyButton value={connect.password!} label="password" />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Waiting for the host PC to finish setup. Keep the agent running on the gaming PC.
        </p>
      )}

      <ol className="mt-4 list-decimal space-y-1 pl-4 text-xs text-muted">
        {connect.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["Web client", connect.downloadLinks.web],
            ["Windows / Mac", connect.downloadLinks.windows],
            ["Android", connect.downloadLinks.android],
            ["iOS", connect.downloadLinks.ios],
          ] as const
        ).map(([label, href]) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-accent hover:bg-accent/10"
          >
            RustDesk {label}
          </a>
        ))}
      </div>
    </div>
  );
}
