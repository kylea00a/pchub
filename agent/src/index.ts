import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import si from "systeminformation";
import { loadAgentConfig } from "./config.js";
import { getAgentRoot } from "./paths.js";
import { measureNetworkSpeed } from "./speedtest.js";
import { handleStorageSync } from "./sync.js";

const STATE_PATH = path.join(getAgentRoot(), ".agent-state.json");

const config = loadAgentConfig();
const ONCE = process.argv.includes("--once");

type AgentState = {
  machineId: string;
  agentToken: string;
  name: string;
};

function loadState(): AgentState | null {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as AgentState;
  } catch {
    return null;
  }
}

function saveState(state: AgentState) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `API ${res.status} ${path}`);
  }
  return body;
}

async function register(): Promise<AgentState> {
  if (!config.pairingCode) {
    throw new Error(
      "Pairing code required. Download config.json from /host or set SKYPC_PAIRING_CODE."
    );
  }

  const hostname = os.hostname();
  const result = await apiFetch<{
    machineId: string;
    agentToken: string;
    name: string;
  }>("/api/agents/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairingCode: config.pairingCode,
      hostname,
      name: config.machineName ?? hostname,
      city: config.machineCity,
      pricePerMinuteCents: config.priceCents,
    }),
  });

  const state: AgentState = {
    machineId: result.machineId,
    agentToken: result.agentToken,
    name: result.name,
  };
  saveState(state);
  console.log(`Registered machine "${state.name}" (${state.machineId})`);
  return state;
}

function estimateBenchScore(cpuCores: number, memGb: number, hasGpu: boolean) {
  let score = Math.min(40, cpuCores * 4) + Math.min(35, memGb * 2);
  if (hasGpu) score += 20;
  return Math.min(100, Math.round(score));
}

async function collectInventory() {
  const [cpu, mem, osInfo, graphics, disks, fsSize] = await Promise.all([
    si.cpu(),
    si.mem(),
    si.osInfo(),
    si.graphics(),
    si.diskLayout(),
    si.fsSize(),
  ]);

  const mainDisk = disks[0];
  const mainFs = fsSize.sort((a, b) => b.size - a.size)[0];
  const gpu = graphics.controllers.find((g) => g.model) ?? graphics.controllers[0];
  const memGb = Math.round(mem.total / 1024 ** 3);
  const hasGpu = Boolean(gpu?.model && !/virtual|parallels|vmware/i.test(gpu.model));

  const cpuLabel = `${cpu.brand} ${cpu.speed}GHz · ${cpu.cores}c/${cpu.physicalCores}p`;
  const ramLabel = `${memGb} GB`;
  const gpuLabel = gpu?.vram
    ? `${gpu.model} (${Math.round(gpu.vram / 1024)} GB VRAM)`
    : gpu?.model ?? "Integrated";
  const diskLabel = mainDisk
    ? `${mainDisk.name || mainDisk.type} ${Math.round((mainFs?.size ?? mainDisk.size) / 1024 ** 3)} GB`
    : "Unknown";
  const osLabel = `${osInfo.distro || osInfo.platform} ${osInfo.release}`;

  const benchScore = estimateBenchScore(cpu.cores, memGb, hasGpu);

  return {
    cpu: cpuLabel,
    ram: ramLabel,
    gpu: gpuLabel,
    disk: diskLabel,
    os: osLabel,
    uploadMbps: null as number | null,
    downloadMbps: null as number | null,
    benchScore,
    raw: {
      cpu,
      mem: { total: mem.total },
      osInfo,
      graphics: graphics.controllers,
      disks: disks.map((d) => ({ name: d.name, type: d.type, size: d.size })),
    },
  };
}

async function postInventory(token: string, speeds?: { uploadMbps: number; downloadMbps: number }) {
  const inventory = await collectInventory();
  if (speeds) {
    inventory.uploadMbps = speeds.uploadMbps;
    inventory.downloadMbps = speeds.downloadMbps;
  }
  await apiFetch("/api/agents/inventory", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(inventory),
  });
  const speedLabel =
    inventory.uploadMbps != null
      ? ` | ↑${inventory.uploadMbps} ↓${inventory.downloadMbps} Mbps`
      : "";
  console.log(
    `Inventory updated — ${inventory.cpu} | ${inventory.ram} | ${inventory.gpu} | score ${inventory.benchScore}${speedLabel}`
  );
}

async function heartbeat(token: string) {
  await apiFetch("/api/agents/heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: "online" }),
  });
}

async function main() {
  const root = getAgentRoot();
  console.log(`SkyPC agent → ${config.apiUrl} (root: ${root})`);

  let state = loadState();
  if (!state) {
    state = await register();
  } else {
    console.log(`Using saved machine "${state.name}" (${state.machineId})`);
  }

  let speeds: { uploadMbps: number; downloadMbps: number } | undefined;
  try {
    console.log("Running network speed test (2 MB up/down)…");
    speeds = await measureNetworkSpeed(config.apiUrl, state.agentToken);
    console.log(`Speed: ↑${speeds.uploadMbps} Mbps upload, ↓${speeds.downloadMbps} Mbps download`);
  } catch (err) {
    console.warn("Speed test skipped:", err instanceof Error ? err.message : err);
  }

  await postInventory(state.agentToken, speeds);
  await heartbeat(state.agentToken);
  await handleStorageSync(state.agentToken).catch((err) => {
    console.error("Storage sync:", err instanceof Error ? err.message : err);
  });

  if (ONCE) {
    console.log("Single run complete (--once).");
    return;
  }

  console.log(`Heartbeat every ${config.heartbeatMs / 1000}s. Ctrl+C to stop.`);

  setInterval(async () => {
    try {
      await heartbeat(state!.agentToken);
      await handleStorageSync(state!.agentToken);
    } catch (err) {
      console.error("Heartbeat failed:", err instanceof Error ? err.message : err);
    }
  }, config.heartbeatMs);

  setInterval(async () => {
    try {
      await postInventory(state!.agentToken);
    } catch (err) {
      console.error("Inventory update failed:", err instanceof Error ? err.message : err);
    }
  }, 5 * 60_000);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
