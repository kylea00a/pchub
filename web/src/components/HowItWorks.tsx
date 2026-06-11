const steps = [
  {
    step: "01",
    title: "Host installs agent",
    body: "A small Windows service installs in the background. No need to leave a window open — it starts on boot and talks to SkyPC over a secure channel.",
  },
  {
    step: "02",
    title: "Specs are read & tested",
    body: "The agent reads hardware (CPU cores, RAM speed, GPU, NVMe) and runs a short benchmark suite — similar to Vast.ai self-test — to build a verified profile.",
  },
  {
    step: "03",
    title: "Machine is listed",
    body: "The host sets price per minute and availability. The listing shows live specs, benchmark scores, latency to your region, and reliability rating.",
  },
  {
    step: "04",
    title: "Renter books a session",
    body: "A renter picks a desktop, adds balance, and starts a session. Billing ticks every minute while the remote desktop is active and reachable.",
  },
  {
    step: "05",
    title: "Isolated desktop spins up",
    body: "The agent provisions an isolated VM or container with reserved CPU/RAM (and GPU when available). The renter gets credentials or a browser stream.",
  },
  {
    step: "06",
    title: "Session ends & wipe",
    body: "When the renter stops or balance runs out, the session tears down, disk is wiped, and the host earns their share minus platform fee.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border bg-surface/30 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
        <p className="mt-4 max-w-2xl text-muted">
          End-to-end flow from install to payout. This is the product shape we&apos;re building toward.
        </p>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((item) => (
            <li
              key={item.step}
              className="rounded-2xl border border-border bg-background p-6"
            >
              <span className="font-mono text-xs text-accent">{item.step}</span>
              <h3 className="mt-3 font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
