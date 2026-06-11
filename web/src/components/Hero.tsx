export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="glow-orb pointer-events-none absolute inset-0" />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          dePIN desktop marketplace — overview prototype
        </div>
        <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          Rent real PCs by the minute.
          <span className="block text-accent">Earn while your desktop sits idle.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          SkyPC connects PC owners with people who need a full remote desktop — gaming,
          dev, design, or everyday Windows. A lightweight agent runs in the background,
          benchmarks your hardware, and spins up an isolated session when someone rents.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="#host-agent"
            className="rounded-xl bg-accent px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-accent-dim"
          >
            Install host agent
          </a>
          <a
            href="#for-renters"
            className="rounded-xl border border-border bg-surface px-6 py-3 text-sm font-medium transition-colors hover:border-accent/40 hover:bg-surface-elevated"
          >
            Find a desktop
          </a>
        </div>
        <dl className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            { label: "Billing", value: "Per minute" },
            { label: "Isolation", value: "VM / container" },
            { label: "Agent", value: "Background" },
            { label: "Specs", value: "Auto-tested" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-surface/60 p-4">
              <dt className="text-xs uppercase tracking-wider text-muted">{stat.label}</dt>
              <dd className="mt-1 text-lg font-medium">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
