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

export function buildWindowsBundleDownloadUrl(config: HostInstallerConfig) {
  const params = new URLSearchParams({
    code: config.pairingCode,
    machineName: config.machineName ?? "My Gaming PC",
    machineCity: config.machineCity ?? "Manila",
    apiUrl: config.apiUrl.replace(/\/$/, ""),
  });
  if (config.priceCents != null) {
    params.set("priceCents", String(config.priceCents));
  }
  // Same-origin relative URL — avoids cross-subdomain download blocks in browsers.
  return `/api/host/windows-bundle?${params.toString()}`;
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
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
