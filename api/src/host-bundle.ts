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
export const STATIC_BUNDLE_PATH = path.join(
  __dirname,
  "..",
  "..",
  "deploy",
  "downloads",
  "PCHUB-Host-Agent.zip"
);

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

const HOST_SCRIPTS = [
  "PCHUB-Setup.ps1",
  "RUN-PCHUB.cmd",
  "pchub-host.ps1",
  "pchub-api.ps1",
  "sunshine.ps1",
  "streaming.ps1",
  "tunnel.ps1",
  "Start PCHUB Agent.bat",
  "status-window.bat",
  "run-agent.bat",
  "stop-agent.bat",
  "allow-windows-defender.bat",
  "allow-windows-defender.ps1",
  "add-to-startup.bat",
] as const;

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

export function buildConfigJson(config: BundleConfig) {
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

function buildStartHereBundled() {
  return `PCHUB HOST - READ THIS FIRST
============================

DO NOT double-click files while still inside the zip file.
The black window will flash and close if you skip this step.

STEP 1 - EXTRACT
  Right-click PCHUB-Host-Agent.zip
  Choose "Extract All..."
  Folder: C:\\PCHUB-Host

STEP 2 - RUN SETUP (from the EXTRACTED folder)
  Open C:\\PCHUB-Host
  Double-click RUN-PCHUB.cmd
  Click YES when Windows asks for administrator

STEP 3 - DONE
  "PCHUB Host Status" appears on your taskbar
  Your PC shows Online at https://pchub.cloud

Your pairing code is already in config.json inside this folder.
`;
}

function buildReadmeBundled() {
  return `PCHUB Host Agent — one-click setup
========================================

1. Extract this zip to C:\\PCHUB-Host (Extract All — not Run)

2. Double-click RUN-PCHUB.cmd — click YES on the admin prompt

3. "PCHUB Host Status" appears on your taskbar (Online / Offline)

config.json with your pairing code is already included.
Moonlight streaming via PCHUB relay — no router setup needed.
`;
}

function bundlePath(name: string) {
  return BUNDLE_ROOT ? `${BUNDLE_ROOT}/${name}` : name;
}

function appendHostScripts(archive: archiver.Archiver) {
  for (const script of HOST_SCRIPTS) {
    const full = path.join(PROD_SCRIPTS, script);
    if (fs.existsSync(full)) {
      archive.file(full, { name: bundlePath(script) });
    }
  }
}

function createZipBuffer(
  append: (archive: archiver.Archiver) => void
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    append(archive);
    archive.finalize();
  });
}

export async function buildStaticHostBundle(outputPath = STATIC_BUNDLE_PATH) {
  if (!fs.existsSync(PS_AGENT_PATH)) {
    throw new Error(`Host agent not found at ${PS_AGENT_PATH}`);
  }

  const buffer = await createZipBuffer((archive) => {
    appendHostScripts(archive);
    archive.append(
      "Get the complete zip (with your pairing code) at https://pchub.cloud/host\n",
      { name: bundlePath("DOWNLOAD-FROM-WEBSITE.txt") }
    );
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return { path: outputPath, bytes: buffer.length };
}

function sendZipBuffer(res: Response, buffer: Buffer, filename: string) {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-transform");
  res.send(buffer);
}

export async function streamWindowsAgentBundle(res: Response, config: BundleConfig) {
  if (!fs.existsSync(AGENT_ROOT)) {
    res.status(500).json({ error: "Agent package not found on server" });
    return;
  }

  if (!fs.existsSync(PS_AGENT_PATH)) {
    res.status(503).json({ error: "Host agent package not found on server." });
    return;
  }

  try {
    const buffer = await createZipBuffer((archive) => {
      appendHostScripts(archive);
      archive.append(buildConfigJson(config), { name: bundlePath("config.json") });
      archive.append(buildReadmeBundled(), { name: bundlePath("README.txt") });
      archive.append(buildStartHereBundled(), { name: bundlePath("START-HERE.txt") });
    });
    sendZipBuffer(res, buffer, "PCHUB-Host-Agent.zip");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build zip";
    if (!res.headersSent) res.status(500).json({ error: message });
  }
}

export function sendHostConfigJson(res: Response, config: BundleConfig) {
  const body = buildConfigJson(config);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(Buffer.byteLength(body, "utf8")));
  res.setHeader("Content-Disposition", 'attachment; filename="config.json"');
  res.setHeader("Cache-Control", "private, no-store");
  res.send(body);
}
