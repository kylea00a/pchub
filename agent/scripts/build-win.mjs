import * as esbuild from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.join(__dirname, "..");
const distDir = path.join(agentRoot, "dist");
const bundlePath = path.join(distDir, "agent.cjs");
const exePath = path.join(distDir, "PCHUB-Agent.exe");

if (process.platform !== "win32") {
  console.error(
    "PCHUB-Agent.exe must be built on Windows (local) or via GitHub Actions (deploy workflow)."
  );
  console.error("Push to main — the deploy workflow builds the .exe on windows-latest.");
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

console.log("Bundling agent…");
await esbuild.build({
  entryPoints: [path.join(agentRoot, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: bundlePath,
  logLevel: "info",
});

console.log("Packaging Windows executable…");
execSync(
  `npx @yao-pkg/pkg "${bundlePath}" --targets node18-win-x64 --output "${exePath}" --compress GZip`,
  { stdio: "inherit", cwd: agentRoot, shell: true }
);

if (!fs.existsSync(exePath)) {
  throw new Error("Build failed — PCHUB-Agent.exe was not created");
}

const sizeMb = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1);
console.log(`Built ${exePath} (${sizeMb} MB)`);
