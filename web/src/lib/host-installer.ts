export type HostInstallerConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName?: string;
  machineCity?: string;
  priceCents?: number;
};

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

export function buildWindowsBundleDownloadUrl(config: HostInstallerConfig) {
  return `/api/host/windows-bundle?${buildHostConfigQuery(config)}`;
}

export function buildWindowsDownloadCommand(siteOrigin: string, config: HostInstallerConfig) {
  const zipUrl = `${siteOrigin}${buildWindowsBundleDownloadUrl(config)}`;
  return `curl -L -o "%USERPROFILE%\\Downloads\\PCHUB-Host-Agent.zip" "${zipUrl}"`;
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

export function downloadTextFile(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
