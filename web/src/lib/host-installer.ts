export type HostInstallerConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName?: string;
  machineCity?: string;
  priceCents?: number;
};

export function buildConfigJson(config: HostInstallerConfig) {
  return JSON.stringify(
    {
      apiUrl: config.apiUrl,
      pairingCode: config.pairingCode,
      machineName: config.machineName ?? "My PC",
      machineCity: config.machineCity ?? "Manila",
      priceCents: config.priceCents ?? 50,
    },
    null,
    2
  );
}

export function buildReadme(config: HostInstallerConfig) {
  return `SkyPC Host Agent — quick setup
================================

1. Copy the entire SkyPC folder to your Windows PC (e.g. C:\\SkyPC)

2. Put config.json in the agent\\ folder:
   ${config.apiUrl}
   pairing code: ${config.pairingCode}

3. Run ONCE: agent\\windows\\install-once.bat

4. Double-click: agent\\windows\\Start SkyPC Agent.vbs
   (runs in background — no terminal)

5. Optional: agent\\windows\\add-to-startup.bat
   (starts agent when Windows boots)

Logs: agent\\agent.log
Stop: Task Manager → end "Node.js" for this project, or reboot.

Production version will be a single .exe installer — no Node.js needed.
`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadWindowsAgentBundle(config: HostInstallerConfig) {
  const res = await fetch(`${config.apiUrl.replace(/\/$/, "")}/api/host/windows-bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: config.pairingCode,
      machineName: config.machineName ?? "My PC",
      machineCity: config.machineCity ?? "Manila",
      priceCents: config.priceCents ?? 50,
      apiUrl: config.apiUrl,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "SkyPC-Host-Agent.zip";
  a.click();
  URL.revokeObjectURL(url);
}
