export type HostInstallerConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName?: string;
  machineCity?: string;
  priceCents?: number;
};

export const STATIC_HOST_AGENT_ZIP = "/downloads/PCHUB-Host-Agent.zip";

export function buildHostConfigQuery(config: HostInstallerConfig) {
  const params = new URLSearchParams({
    code: config.pairingCode,
    machineName: config.machineName ?? "My Gaming PC",
    machineCity: config.machineCity ?? "Manila",
    apiUrl: config.apiUrl.replace(/\/$/, ""),
  });
  if (config.priceCents != null) {
    params.set("priceCents", String(config.priceCents));
  }
  return params.toString();
}

export function buildHostConfigDownloadUrl(config: HostInstallerConfig) {
  return `/api/host/config.json?${buildHostConfigQuery(config)}`;
}

export function buildWindowsBundleDownloadUrl(config: HostInstallerConfig) {
  return `/api/host/windows-bundle?${buildHostConfigQuery(config)}`;
}

export function buildWindowsDownloadCommands(
  siteOrigin: string,
  config: HostInstallerConfig
) {
  const zipUrl = `${siteOrigin}${STATIC_HOST_AGENT_ZIP}`;
  const configUrl = `${siteOrigin}${buildHostConfigDownloadUrl(config)}`;
  return `mkdir C:\\PCHUB-Host 2>nul
curl -L -o "%USERPROFILE%\\Downloads\\PCHUB-Host-Agent.zip" "${zipUrl}"
curl -L -o "C:\\PCHUB-Host\\config.json" "${configUrl}"
echo Extract the zip to C:\\PCHUB-Host, then run RUN-PCHUB.cmd`;
}

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
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
