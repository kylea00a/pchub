import * as esbuild from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.join(__dirname, "..");
const distDir = path.join(agentRoot, "dist");
const bundlePath = path.join(distDir, "pchub-host.js");
const runtimeDir = path.join(distDir, "runtime");
const nodeExePath = path.join(runtimeDir, "node.exe");

const NODE_VERSION = "20.18.0";
const NODE_ZIP = `node-v${NODE_VERSION}-win-x64.zip`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ZIP}`;

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(runtimeDir, { recursive: true });

console.log("Bundling agent…");
await esbuild.build({
  entryPoints: [path.join(agentRoot, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: bundlePath,
  logLevel: "info",
});

const zipPath = path.join(distDir, NODE_ZIP);

console.log(`Downloading Node.js ${NODE_VERSION} for Windows…`);
await download(NODE_URL, zipPath);

console.log("Extracting node.exe…");
if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${distDir}' -Force"`,
    { stdio: "inherit" }
  );
  const extracted = path.join(distDir, `node-v${NODE_VERSION}-win-x64`, "node.exe");
  if (fs.existsSync(extracted)) {
    fs.copyFileSync(extracted, nodeExePath);
    fs.rmSync(path.join(distDir, `node-v${NODE_VERSION}-win-x64`), {
      recursive: true,
      force: true,
    });
  }
} else {
  try {
    execSync(
      `unzip -o -j "${zipPath}" "node-v${NODE_VERSION}-win-x64/node.exe" -d "${runtimeDir}"`,
      { stdio: "inherit" }
    );
  } catch {
    extractNodeExeWithPython(zipPath, nodeExePath, NODE_VERSION);
  }
}

fs.rmSync(zipPath, { force: true });

if (!fs.existsSync(bundlePath) || !fs.existsSync(nodeExePath)) {
  throw new Error("Release build failed — pchub-host.js or runtime/node.exe missing");
}

const nodeMb = (fs.statSync(nodeExePath).size / 1024 / 1024).toFixed(1);
const bundleKb = (fs.statSync(bundlePath).size / 1024).toFixed(0);
console.log(`Release ready: pchub-host.js (${bundleKb} KB) + runtime/node.exe (${nodeMb} MB)`);

function extractNodeExeWithPython(zipPath, nodeExePath, version) {
  const pyFile = path.join(path.dirname(nodeExePath), "_extract_node.py");
  const entry = `node-v${version}-win-x64/node.exe`;
  fs.writeFileSync(
    pyFile,
    `import os, shutil, zipfile

zip_path = ${JSON.stringify(zipPath)}
entry = ${JSON.stringify(entry)}
dest = ${JSON.stringify(nodeExePath)}
tmpdir = os.path.join(os.path.dirname(dest), "_node_extract")
os.makedirs(tmpdir, exist_ok=True)
with zipfile.ZipFile(zip_path) as zf:
    zf.extract(entry, tmpdir)
shutil.move(os.path.join(tmpdir, entry), dest)
shutil.rmtree(tmpdir, ignore_errors=True)
`
  );
  execSync(`python3 "${pyFile}"`, { stdio: "inherit" });
  fs.rmSync(pyFile, { force: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const next = res.headers.location;
          if (!next) {
            reject(new Error(`Redirect without location for ${url}`));
            return;
          }
          res.resume();
          download(next, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode}) ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      })
      .on("error", reject);
  });
}
