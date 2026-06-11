const steps = [
  {
    step: "01",
    title: "Agent deploy",
    body: "Lightweight Windows service on boot. Secure channel to PCHUB control plane — no open windows required.",
  },
  {
    step: "02",
    title: "Spec scan",
    body: "Hardware inventory plus uplink benchmark. CPU, GPU, NVMe, and upload Mbps verified before listing.",
  },
  {
    step: "03",
    title: "Fleet listing",
    body: "Host sets rate and region. Live card shows bench score, latency class, and availability state.",
  },
  {
    step: "04",
    title: "Session start",
    body: "Renter authenticates, selects a node, toggles power on. Meter starts when the desktop is reachable.",
  },
  {
    step: "05",
    title: "Isolated runtime",
    body: "Agent provisions reserved compute in an isolated VM or container. Stream credentials issued to renter.",
  },
  {
    step: "06",
    title: "Teardown",
    body: "Power off ends the meter. Ephemeral disk wiped. Optional personal layer syncs back to cloud.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border bg-surface/50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="eyebrow">Protocol</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Session lifecycle</h2>
        <p className="mt-4 max-w-xl text-muted">
          From agent install to payout — the end-to-end flow we ship on pchub.cloud.
        </p>
        <ol className="mt-14 grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((item) => (
            <li key={item.step} className="pchub-panel relative bg-background p-6">
              <span className="font-mono text-2xl font-bold text-accent/30">{item.step}</span>
              <h3 className="mt-2 font-medium">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
