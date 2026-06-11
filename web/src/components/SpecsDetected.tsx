const specCategories = [
  {
    category: "CPU",
    fields: ["Model & generation", "Cores / threads", "Base & boost clock", "Cache"],
  },
  {
    category: "Memory",
    fields: ["Total GB", "Speed (MT/s)", "Channels (dual/quad)", "Type DDR4/DDR5"],
  },
  {
    category: "GPU",
    fields: ["Model & VRAM", "Driver version", "CUDA / DirectX", "Stress test score"],
  },
  {
    category: "Storage",
    fields: ["NVMe vs SATA", "Capacity", "Seq. read/write", "SMART health"],
  },
  {
    category: "Network",
    fields: ["Upload / download", "Latency to regions", "Open ports", "NAT type"],
  },
  {
    category: "System",
    fields: ["OS version", "Uptime reliability", "Thermal headroom", "Agent version"],
  },
];

export function SpecsDetected() {
  return (
    <section className="border-b border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl font-semibold tracking-tight">What the agent reads & tests</h2>
        <p className="mt-4 max-w-2xl text-muted">
          Inspired by Vast.ai&apos;s self-test: inventory on install, benchmarks before
          listing, and periodic re-checks to catch drift or misreporting.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specCategories.map((cat) => (
            <div
              key={cat.category}
              className="rounded-xl border border-border bg-surface p-5"
            >
              <h3 className="font-medium">{cat.category}</h3>
              <ul className="mt-3 space-y-1.5">
                {cat.fields.map((field) => (
                  <li key={field} className="text-sm text-muted">
                    {field}
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
