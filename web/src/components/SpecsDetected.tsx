const specCategories = [
  {
    category: "CPU",
    fields: ["Model & generation", "Cores / threads", "Base & boost clock", "Cache"],
  },
  {
    category: "Memory",
    fields: ["Total GB", "Speed (MT/s)", "Channels", "DDR4 / DDR5"],
  },
  {
    category: "GPU",
    fields: ["Model & VRAM", "Driver version", "CUDA / DirectX", "Stress score"],
  },
  {
    category: "Storage",
    fields: ["NVMe vs SATA", "Capacity", "Seq. read/write", "SMART health"],
  },
  {
    category: "Network",
    fields: ["Upload / download", "Regional latency", "Open ports", "NAT class"],
  },
  {
    category: "System",
    fields: ["OS build", "Uptime reliability", "Thermal headroom", "Agent build"],
  },
];

export function SpecsDetected() {
  return (
    <section className="border-b border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="eyebrow">Telemetry</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Verified hardware profile
        </h2>
        <p className="mt-4 max-w-xl text-muted">
          Inventory on install, benchmark before listing, periodic re-checks to catch drift
          or misreporting.
        </p>
        <div className="mt-14 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {specCategories.map((cat) => (
            <div key={cat.category} className="pchub-panel bg-surface p-5">
              <h3 className="font-mono text-sm uppercase tracking-widest text-accent">
                {cat.category}
              </h3>
              <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                {cat.fields.map((field) => (
                  <li key={field} className="font-mono text-xs text-muted">
                    <span className="text-accent/60">—</span> {field}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
