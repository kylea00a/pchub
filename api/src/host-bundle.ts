import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.join(__dirname, "..", "..", "agent");
const BUNDLE_ROOT = "";
const PS_AGENT_PATH = path.join(AGENT_ROOT, "windows-prod", "pchub-host.ps1");
const PROD_SCRIPTS = path.join(AGENT_ROOT, "windows-prod");

export type BundleConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName: string;
  machineCity: string;
  priceCents?: number;
};

export type PairingRow = {
  code: string;
  used: number;
  expires_at: string;
};

export function resolveWindowsBundleConfig(
  pairing: PairingRow | undefined,
  opts: {
    machineName?: string;
    machineCity?: string;
    priceCents?: number;
    apiUrl?: string;
    defaultApiUrl: string;
  }
): BundleConfig | { error: string; status: number } {
  if (!pairing) {
    return { error: "Invalid pairing code", status: 404 };
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    return { error: "Pairing code expired — generate a new one", status: 410 };
  }

  const baseUrl =
    opts.apiUrl?.replace(/\/$/, "") ||
    opts.defaultApiUrl.replace(/\/$/, "") ||
    "http://localhost:4000";

  return {
    apiUrl: baseUrl,
    pairingCode: pairing.code,
    machineName: opts.machineName?.trim() || "My Gaming PC",
    machineCity: opts.machineCity?.trim() || "Manila",
    priceCents: Number.isFinite(opts.priceCents)
      ? Math.max(1, Math.round(opts.priceCents!))
      : 50,
  };
}

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

function buildStartHere(config: BundleConfig) {
  return `PCHUB HOST - READ THIS FIRST
============================

DO NOT double-click files while still inside the zip file.
The black window will flash and close if you skip this step.

STEP 1 - EXTRACT
  Right-click SkyPC-Host-Agent.zip
  Choose "Extract All..."
  Folder: C:\\PCHUB-Host

STEP 2 - RUN SETUP (from the EXTRACTED folder)
  Open C:\\PCHUB-Host
  Double-click RUN-PCHUB.cmd
  Click YES when Windows asks for administrator

STEP 3 - DONE
  "PCHUB Host Status" appears on your taskbar
  Your PC shows Online at https://pchub.cloud

API: ${config.apiUrl}
`;
}

function buildReadme(config: BundleConfig) {
  return `PCHUB Host Agent — one-click setup
========================================

1. Extract this zip to C:\\PCHUB-Host (Extract All — not Run)

2. Open C:\\PCHUB-Host and double-click RUN-PCHUB.cmd
   - Click YES on the one-time administrator prompt
   - Defender exclusion, registration, Sunshine install, and agent start all run automatically

3. "PCHUB Host Status" appears on your taskbar (Online / Offline)

Renters pair Moonlight from pchub.cloud — no localhost setup on your PC.

API: ${config.apiUrl}
Pairing code is in config.json (~30 min validity).
`;
}

function bundlePath(name: string) {
  return BUNDLE_ROOT ? `${BUNDLE_ROOT}/${name}` : name;
}

function streamProductionBundle(
  archive: archiver.Archiver,
  config: BundleConfig
) {
  archive.file(PS_AGENT_PATH, { name: bundlePath("pchub-host.ps1") });

  for (const script of [
    "sunshine.ps1",
    "streaming.ps1",
    "install-sunshine.ps1",
    "RUN-INSTALL-SUNSHINE.cmd",
    "PCHUB-Setup.ps1",
    "RUN-PCHUB.cmd",
    "rustdesk.ps1",
    "remote.ps1",
    "RUN-REPAIR-STREAMING.cmd",
    "repair-streaming.ps1",
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
      archive.file(full, { name: bundlePath(script) });
    }
  }

  archive.append(buildConfigJson(config), { name: bundlePath("config.json") });
  archive.append(buildReadme(config), { name: bundlePath("README.txt") });
  archive.append(buildStartHere(config), { name: bundlePath("START-HERE.txt") });
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
