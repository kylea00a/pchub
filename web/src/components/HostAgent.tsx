export function HostAgent() {
  return (
    <section id="host-agent" className="border-b border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">
              The host agent runs in the background
            </h2>
            <p className="mt-4 text-muted leading-relaxed">
              Yes — the SkyPC agent is a lightweight background service (like an antivirus
              or game launcher service). It starts on boot, uses minimal CPU when idle,
              and only does heavy work during benchmarks or when a renter is connected.
            </p>

            <div className="mt-8 space-y-6">
              <div className="rounded-xl border border-border bg-surface p-5">
                <h3 className="font-medium text-accent">What the agent does while idle</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  <li>• Heartbeat every 30s — &quot;I&apos;m online and healthy&quot;</li>
                  <li>• Light inventory refresh (RAM, thermals, disk space)</li>
                  <li>• Listens for &quot;start session&quot; commands from SkyPC</li>
                  <li>• Does not slow down normal PC use</li>
                </ul>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <h3 className="font-medium text-emerald-400">
                  Can the owner use their PC while it&apos;s rented?
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  <strong className="text-foreground">Yes, with isolation.</strong> When
                  someone rents your machine, they don&apos;t get your Windows login or your
                  files. The agent spins up a separate{" "}
                  <strong className="text-foreground">VM or container</strong> — a
                  &quot;shadow desktop&quot; with its own OS image, reserved CPU cores, and
                  reserved RAM. You keep using the host OS; the renter only sees their
                  isolated environment.
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                <h3 className="font-medium text-amber-400">GPU is the hard part</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  CPU and RAM split cleanly between host and VM. GPUs are trickier on
                  consumer hardware — most hosts will choose{" "}
                  <strong className="text-foreground">idle-only mode</strong> (rent when
                  you&apos;re away) or dedicate the GPU to the renter during active
                  sessions. High-end setups can use GPU partitioning (MIG, SR-IOV) later.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-elevated p-6 font-mono text-sm">
            <p className="text-xs uppercase tracking-wider text-muted">Host PC — layered view</p>
            <pre className="mt-4 overflow-x-auto leading-relaxed text-[13px]">
{`┌─────────────────────────────────────────┐
│  YOUR WINDOWS (host)                    │
│  Chrome, games, work — you use normally │
├─────────────────────────────────────────┤
│  SkyPC Agent (background service)       │
│  • specs • benchmarks • orchestration   │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  RENTER VM / CONTAINER          │    │
│  │  (only exists during rental)    │    │
│  │  • own Windows user / image     │    │
│  │  • reserved 8 cores, 16 GB RAM  │    │
│  │  • wiped when session ends      │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  Hardware: CPU · RAM · GPU · NVMe       │
└─────────────────────────────────────────┘`}
            </pre>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { mode: "Idle-only", desc: "List when AFK. Full machine for renter." },
                { mode: "Shared", desc: "VM runs alongside you. Capped resources." },
              ].map((m) => (
                <div key={m.mode} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs text-accent">{m.mode}</p>
                  <p className="mt-1 text-xs text-muted">{m.desc}</p>
                </div>
              ))}
            </div>

            <a
              href="/host"
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-accent py-3 text-sm font-medium text-background transition-colors hover:bg-accent-dim"
            >
              Set up host agent
            </a>
            <p className="mt-2 text-center text-xs text-muted">
              Double-click start on Windows · .exe installer coming later
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
