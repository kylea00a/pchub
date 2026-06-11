import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(__dirname, "..", "config.json");

export type AgentConfig = {
  apiUrl: string;
  pairingCode?: string;
  machineName?: string;
  machineCity: string;
  priceCents: number;
  heartbeatMs: number;
};

type FileConfig = {
  apiUrl?: string;
  pairingCode?: string;
  machineName?: string;
  machineCity?: string;
  priceCents?: number;
  heartbeatMs?: number;
};

function readFileConfig(): FileConfig {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as FileConfig;
  } catch {
    return {};
  }
}

export function loadAgentConfig(): AgentConfig {
  const file = readFileConfig();

  return {
    apiUrl: (process.env.SKYPC_API_URL ?? file.apiUrl ?? "http://localhost:4000").replace(
      /\/$/,
      ""
    ),
    pairingCode: process.env.SKYPC_PAIRING_CODE?.trim() || file.pairingCode?.trim(),
    machineName: process.env.SKYPC_MACHINE_NAME?.trim() || file.machineName?.trim(),
    machineCity:
      process.env.SKYPC_MACHINE_CITY?.trim() || file.machineCity?.trim() || "Manila",
    priceCents: Number(
      process.env.SKYPC_PRICE_CENTS ?? file.priceCents ?? 50
    ),
    heartbeatMs: Number(process.env.SKYPC_HEARTBEAT_MS ?? file.heartbeatMs ?? 30_000),
  };
}
