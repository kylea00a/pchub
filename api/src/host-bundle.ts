import archiver from "archiver";
import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.join(__dirname, "..", "..", "agent");
const BUNDLE_ROOT = "SkyPC-Host-Agent";

export type BundleConfig = {
  apiUrl: string;
  pairingCode: string;
  machineName: string;
  machineCity: string;
  priceCents?: number;
};

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

export function streamWindowsAgentBundle(res: Response, config: BundleConfig) {
  if (!fs.existsSync(AGENT_ROOT)) {
    res.status(500).json({ error: "Agent package not found on server" });
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

  addDir(archive, path.join(AGENT_ROOT, "src"), `${BUNDLE_ROOT}/src`);
  addDir(archive, path.join(AGENT_ROOT, "windows"), `${BUNDLE_ROOT}/windows`);

  for (const file of ["package.json", "tsconfig.json", "config.example.json"]) {
    const full = path.join(AGENT_ROOT, file);
    if (fs.existsSync(full)) {
      archive.file(full, { name: `${BUNDLE_ROOT}/${file}` });
    }
  }

  archive.append(
    JSON.stringify(
      {
        apiUrl: config.apiUrl,
        pairingCode: config.pairingCode,
        machineName: config.machineName,
        machineCity: config.machineCity,
        priceCents: config.priceCents ?? 50,
      },
      null,
      2
    ),
    { name: `${BUNDLE_ROOT}/config.json` }
  );

  archive.finalize();
}
