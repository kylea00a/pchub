import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.join(__dirname, "..", "..", "agent");
const BUNDLE_ROOT = "SkyPC-Host-Agent";
const PS_AGENT_PATH = path.join(AGENT_ROOT, "windows-prod", "pchub-host.ps1");
const PROD_SCRIPTS = path.join(AGENT_ROOT, "windows-prod");

export type BundleConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName: string;
  machineCity: string;
  priceCents?: number;
};

function buildConfigJson(config: BundleConfig) {
  return JSON.stringify(
    {
      apiUrl: config.apiUrl,
      pairingCode: config.pairingCode,
      machineName: config.machineName,
      machineCity: config.machineCity,
      priceCents: config.priceCents ?? 50,
    },
    null,
    2
  );
}

function buildReadme(config: BundleConfig) {
  return `PCHUB Host Agent — one-click setup
========================================

1. Extract this zip to C:\\PCHUB-Host (Extract All — not Run)

2. Double-click PCHUB Install.bat ONCE
   - Click YES on the Windows administrator prompt (one time only)
   - Defender exclusion, registration, and agent start all run automatically

3. "PCHUB Host Status" appears on your taskbar (Online / Offline)

API: ${config.apiUrl}
Pairing code is in config.json (~30 min validity).
`;
}

function streamProductionBundle(
  archive: archiver.Archiver,
  config: BundleConfig
) {
  archive.file(PS_AGENT_PATH, { name: `${BUNDLE_ROOT}/pchub-host.ps1` });

  for (const script of [
    "PCHUB Install.bat",
    "SkyPC-Setup.bat",
    "Start PCHUB Agent.bat",
    "status-window.bat",
    "run-agent.bat",
    "stop-agent.bat",
    "allow-windows-defender.bat",
    "allow-windows-defender.ps1",
    "add-to-startup.bat",
  ]) {
    const full = path.join(PROD_SCRIPTS, script);
    if (fs.existsSync(full)) {
      archive.file(full, { name: `${BUNDLE_ROOT}/${script}` });
    }
  }

  archive.append(buildConfigJson(config), { name: `${BUNDLE_ROOT}/config.json` });
  archive.append(buildReadme(config), { name: `${BUNDLE_ROOT}/README.txt` });
}

export function streamWindowsAgentBundle(res: Response, config: BundleConfig) {
  if (!fs.existsSync(AGENT_ROOT)) {
    res.status(500).json({ error: "Agent package not found on server" });
    return;
  }

  if (!fs.existsSync(PS_AGENT_PATH)) {
    res.status(503).json({ error: "Host agent package not found on server." });
    return;
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="SkyPC-Host-Agent.zip"'
  );
  archive.on("error", (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);

  streamProductionBundle(archive, config);

  archive.finalize();
}
