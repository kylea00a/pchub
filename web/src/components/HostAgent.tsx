export function HostAgent() {
  return (
    <section id="host-agent" className="border-b border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <p className="eyebrow">Host layer</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Silent agent. Full isolation.
            </h2>
            <p className="mt-4 leading-relaxed text-muted">
              The PCHUB agent is a background service — like a launcher daemon. Boot-time
              start, minimal idle CPU, heavy work only during benchmarks or active rentals.
            </p>

            <div className="mt-8 space-y-px bg-border">
              <div className="pchub-panel p-5">
                <h3 className="font-mono text-xs uppercase tracking-widest text-accent">
                  Idle state
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  <li>▸ Heartbeat every 30s — online & healthy</li>
                  <li>▸ Light inventory refresh</li>
                  <li>▸ Awaits session commands from control plane</li>
                  <li>▸ No impact on daily PC use</li>
                </ul>
              </div>

              <div className="pchub-panel border-l-emerald-400/80 p-5" style={{ borderLeftColor: "rgb(52 211 153)" }}>
                <h3 className="font-mono text-xs uppercase tracking-widest text-emerald-400">
                  Owner + renter coexist
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Renters never touch your Windows login or files. The agent spins an
                  isolated VM with reserved cores and RAM. You keep the host OS; they get a
                  shadow desktop.
                </p>
              </div>

              <div className="pchub-panel border-l-amber-400/80 p-5" style={{ borderLeftColor: "rgb(251 191 36)" }}>
                <h3 className="font-mono text-xs uppercase tracking-widest text-amber-400">
                  GPU routing
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Consumer GPUs need idle-only or dedicated-session modes. Enterprise
                  partitioning (MIG, SR-IOV) on the roadmap for pro hosts.
                </p>
              </div>
            </div>
          </div>

          <div className="pchub-panel pchub-corners border-l-accent-violet bg-surface-elevated p-6 font-mono text-sm">
            <p className="eyebrow text-accent-violet">Stack diagram</p>
            <pre className="mt-4 overflow-x-auto text-[12px] leading-relaxed text-muted">
{`┌─────────────────────────────────────────┐
│  HOST WINDOWS — your daily OS           │
├─────────────────────────────────────────┤
│  PCHUB AGENT (background)               │
│  specs · bench · orchestration          │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  RENTER VM (session only)       │    │
│  │  isolated user · wiped on end   │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  HARDWARE: CPU · RAM · GPU · NVMe       │
└─────────────────────────────────────────┘`}
            </pre>

            <div className="mt-6 grid gap-px bg-border sm:grid-cols-2">
              {[
                { mode: "Idle-only", desc: "List when AFK. Full node to renter." },
                { mode: "Shared", desc: "VM alongside you. Capped resources." },
              ].map((m) => (
                <div key={m.mode} className="bg-background p-3">
                  <p className="text-[10px] uppercase tracking-widest text-accent">{m.mode}</p>
                  <p className="mt-1 text-xs text-muted">{m.desc}</p>
                </div>
              ))}
            </div>

            <a href="/host" className="pchub-btn-primary mt-6 w-full">
              Initialize host
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
