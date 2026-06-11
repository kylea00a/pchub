const pillars = [
  {
    title: "Hosts",
    tag: "Supply",
    description:
      "Install the PCHUB agent once. It inventories CPU, GPU, RAM, disk, and uplink — then pulses health in the background.",
    points: ["Set price per minute", "Idle or dedicated mode", "Payout on active sessions"],
  },
  {
    title: "Renters",
    tag: "Demand",
    description:
      "Browse verified machines by spec, latency, and rate. Full remote desktop — billed only while you're connected.",
    points: ["Filter by GPU & region", "Minute-metered", "Personal cloud layer"],
  },
  {
    title: "Network",
    tag: "Control",
    description:
      "Matchmaking, verification, billing, and session orchestration. Trust layer for distributed desktop compute.",
    points: ["Automated self-tests", "Live usage ledger", "Reliability scoring"],
  },
];

export function Overview() {
  return (
    <section id="overview" className="border-b border-border py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="eyebrow">Architecture</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Three-node marketplace
        </h2>
        <p className="mt-4 max-w-xl text-muted">
          Hosts supply idle compute. Renters consume it. PCHUB handles trust, isolation,
          and payments.
        </p>
        <div className="mt-14 grid gap-px bg-border md:grid-cols-3">
          {pillars.map((pillar) => (
            <article
              key={pillar.title}
              className="pchub-panel pchub-corners pchub-panel-violet group p-8"
            >
              <span className="eyebrow text-accent-violet">{pillar.tag}</span>
              <h3 className="mt-3 text-xl font-medium">{pillar.title}</h3>
              <p className="mt-4 text-sm leading-relaxed text-muted">{pillar.description}</p>
              <ul className="mt-6 space-y-2 border-t border-border pt-6">
                {pillar.points.map((point) => (
                  <li key={point} className="flex items-center gap-3 font-mono text-xs text-muted">
                    <span className="text-accent">▸</span>
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
