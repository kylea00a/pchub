export type HostInstallerConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName?: string;
  machineCity?: string;
  priceCents?: number;
};

/** Single host installer — agent + StreamHost at C:\PCHUB-Host\ (published by MSI CI) */
export const HOST_INSTALLER_MSI = "/downloads/PCHUB-Host.msi";

/** Live host bootstrap until PCHUB-Host.msi is published */
export const HOST_INSTALLER_EXE = "/downloads/PCHUB-Host-Setup.exe?v=2026.06.18.2";

/** Renter streaming app (zip until MSI CI is green). */
export const RENTER_INSTALLER_ZIP = "/downloads/PCHUB-Renter.zip";

/** Future: WiX MSI when published */
export const RENTER_INSTALLER_MSI = "/downloads/PCHUB-Renter.msi";

/** Legacy bootstrap — prefer HOST_INSTALLER_MSI */
export const HOST_INSTALLER_CMD = "/downloads/PCHUB-Host-Setup.cmd?v=2026.06.10.9";
export const HOST_INSTALLER_PS1 = "/downloads/PCHUB-Host-Setup.ps1";

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
