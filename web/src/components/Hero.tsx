export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="mesh-bg pointer-events-none absolute inset-0" />
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="inline-flex items-center gap-3 border border-accent/30 bg-accent/5 px-4 py-1.5">
          <span className="h-2 w-2 bg-accent shadow-[0_0_12px_var(--accent)] animate-pulse" />
          <span className="eyebrow text-[10px]">Philippines dePIN · live on pchub.cloud</span>
        </div>
        <h1 className="mt-8 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
          Bare-metal desktops.
          <span className="mt-2 block text-gradient">Rented by the minute.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
          PCHUB connects verified host machines to renters who need full Windows power —
          gaming, dev, design. Agents run silent. Sessions spin up isolated. You pay only
          for active compute.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <a href="#host-agent" className="pchub-btn-primary">
            Deploy agent
          </a>
          <a href="#for-renters" className="pchub-btn-ghost">
            Browse fleet
          </a>
        </div>
        <dl className="mt-16 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { label: "Billing", value: "Per minute" },
            { label: "Isolation", value: "VM layer" },
            { label: "Agent", value: "Background" },
            { label: "Verify", value: "Auto bench" },
          ].map((stat) => (
            <div key={stat.label} className="pchub-panel pchub-corners bg-surface p-5">
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="mt-2 font-mono text-lg text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
