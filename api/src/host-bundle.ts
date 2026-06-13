import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.join(__dirname, "..", "..", "agent");
const BUNDLE_ROOT = "SkyPC-Host-Agent";
const BUNDLE_PATH = path.join(AGENT_ROOT, "dist", "agent.cjs");
const NODE_EXE_PATH = path.join(AGENT_ROOT, "dist", "runtime", "node.exe");
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

function buildReadme(config: BundleConfig, packaged: boolean) {
  if (packaged) {
    return `PCHUB Host Agent
================

1. Extract this zip to a folder (e.g. Desktop\\SkyPC-Host-Agent)
   If Windows asks Extract or Run — choose Extract.

2. Double-click SkyPC-Setup.bat

3. Your PC should show Online at https://pchub.cloud within a minute.

Optional: add-to-startup.bat — runs agent when Windows starts
Logs: agent.log (same folder)

API: ${config.apiUrl}
Pairing code is already in config.json (expires in ~30 minutes).

No Node.js install required — runtime is included in this zip.
`;
  }

  return `PCHUB Host Agent (developer build)
==================================

Node.js LTS required: https://nodejs.org

Extract zip → run windows\\SkyPC-Setup.bat

API: ${config.apiUrl}
Pairing code: ${config.pairingCode}
`;
}

function addDir(archive: archiver.Archiver, dir: string, zipPath: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const dest = path.join(zipPath, entry.name).replace(/\\/g, "/");
    if (entry.name === "node_modules" || entry.name === ".agent-state.json" || entry.name === "agent.log") {
      continue;
    }
    if (entry.isDirectory()) {
      addDir(archive, full, dest);
    } else {
      archive.file(full, { name: dest });
    }
  }
}

function streamProductionBundle(
  archive: archiver.Archiver,
  config: BundleConfig
) {
  archive.file(BUNDLE_PATH, { name: `${BUNDLE_ROOT}/agent.cjs` });
  archive.file(NODE_EXE_PATH, { name: `${BUNDLE_ROOT}/runtime/node.exe` });

  for (const script of ["SkyPC-Setup.bat", "Start PCHUB Agent.vbs", "add-to-startup.bat"]) {
    const full = path.join(PROD_SCRIPTS, script);
    if (fs.existsSync(full)) {
      archive.file(full, { name: `${BUNDLE_ROOT}/${script}` });
    }
  }

  archive.append(buildConfigJson(config), { name: `${BUNDLE_ROOT}/config.json` });
  archive.append(buildReadme(config, true), { name: `${BUNDLE_ROOT}/README.txt` });
}

function streamDevBundle(archive: archiver.Archiver, config: BundleConfig) {
  addDir(archive, path.join(AGENT_ROOT, "src"), `${BUNDLE_ROOT}/src`);
  addDir(archive, path.join(AGENT_ROOT, "windows"), `${BUNDLE_ROOT}/windows`);

  for (const file of ["package.json", "tsconfig.json", "config.example.json"]) {
    const full = path.join(AGENT_ROOT, file);
    if (fs.existsSync(full)) {
      archive.file(full, { name: `${BUNDLE_ROOT}/${file}` });
    }
  }

  archive.append(buildConfigJson(config), { name: `${BUNDLE_ROOT}/config.json` });
  archive.append(buildReadme(config, false), { name: `${BUNDLE_ROOT}/README.txt` });
}

export function streamWindowsAgentBundle(res: Response, config: BundleConfig) {
  if (!fs.existsSync(AGENT_ROOT)) {
    res.status(500).json({ error: "Agent package not found on server" });
    return;
  }

  const packaged = fs.existsSync(BUNDLE_PATH) && fs.existsSync(NODE_EXE_PATH);

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

  if (packaged) {
    streamProductionBundle(archive, config);
  } else {
    streamDevBundle(archive, config);
  }

  archive.finalize();
}
