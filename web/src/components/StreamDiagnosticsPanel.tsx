"use client";

import type { StreamDiagnostics } from "@/lib/api";

type ClientDiag = {
  signalingJoined: boolean;
  peerJoined: boolean;
  webrtcState: string;
};

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span
        className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
          ok ? "bg-emerald-400" : "bg-amber-400"
        }`}
        aria-hidden
      />
      <div className="min-w-0">
        <p className={ok ? "text-foreground" : "text-amber-200"}>{label}</p>
        <p className="text-muted">{detail}</p>
      </div>
    </div>
  );
}

export function StreamDiagnosticsPanel({
  server,
  client,
  loading,
  error,
}: {
  server: StreamDiagnostics | null;
  client: ClientDiag;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-3 border border-border/60 bg-black/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
          Connection diagnostics
        </p>
        <span className="font-mono text-[10px] text-muted">
          {loading ? "Refreshing…" : "Auto-refresh 3s"}
        </span>
      </div>

      {error && <p className="mt-2 text-[10px] text-red-300">{error}</p>}

      {server && (
        <>
          <p className="mt-2 text-[10px] text-muted">
            Machine <span className="text-foreground">{server.machineName}</span> · rental{" "}
            <span className="font-mono text-foreground">{server.rentalId}</span>
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {server.checks.map((check) => (
              <CheckRow
                key={check.id}
                ok={check.ok}
                label={check.label}
                detail={check.detail}
              />
            ))}
            <CheckRow
              ok={client.signalingJoined}
              label="Browser signaling (local)"
              detail={
                client.signalingJoined
                  ? "WebSocket connected from this tab"
                  : "Not connected yet"
              }
            />
            <CheckRow
              ok={client.peerJoined}
              label="Host peer detected (local)"
              detail={
                client.peerJoined
                  ? "Received host-joined from signaling"
                  : "No host peer event yet"
              }
            />
            <CheckRow
              ok={client.webrtcState === "connected"}
              label="WebRTC peer connection"
              detail={client.webrtcState || "not started"}
            />
          </div>

          <p className="mt-3 border-t border-border/40 pt-2 text-[10px] text-foreground">
            <span className="font-mono uppercase tracking-widest text-accent">Hint: </span>
            {server.hint}
          </p>
        </>
      )}
    </div>
  );
}
