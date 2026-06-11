const pillars = [
  {
    title: "Hosts (PC owners)",
    description:
      "Install the SkyPC agent once. It inventories your CPU, RAM, GPU, disk, and network — then keeps running quietly in the background, reporting health and availability.",
    points: ["Set your price per minute", "Choose idle-only or shared mode", "Get paid when sessions run"],
  },
  {
    title: "Renters (tenants)",
    description:
      "Search verified machines by specs, latency, and price. Connect to a full remote desktop — billed only for active minutes, not idle promises.",
    points: ["Filter by RAM, GPU, region", "Pay by the minute", "Full Windows desktop access"],
  },
  {
    title: "Platform",
    description:
      "Matchmaking, verification, billing, and secure session setup. Like Vast.ai for GPUs — but for complete desktop experiences.",
    points: ["Automated self-tests", "Usage ledger every minute", "Ratings & reliability scores"],
  },
];

export function Overview() {
  return (
    <section id="overview" className="border-b border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Platform overview</h2>
        <p className="mt-4 max-w-2xl text-muted">
          Three sides of one marketplace. Hosts supply idle compute; renters consume it;
          SkyPC handles trust, isolation, and payments.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-accent/30"
            >
              <h3 className="text-lg font-medium">{pillar.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{pillar.description}</p>
              <ul className="mt-5 space-y-2">
                {pillar.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
