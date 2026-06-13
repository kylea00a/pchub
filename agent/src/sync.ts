import fs from "node:fs";
import path from "node:path";
import { loadAgentConfig } from "./config.js";
import { getAgentRoot } from "./paths.js";

export const PERSONAL_LAYER_DIR = path.join(getAgentRoot(), ".personal-layer");

type SessionInfo = {
  active: boolean;
  rentalId?: string;
  personalStorage?: boolean;
  syncStatus?: string;
  renterProfileId?: string | null;
};

type FileBundle = {
  path: string;
  contentBase64: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const config = loadAgentConfig();
  const res = await fetch(`${config.apiUrl}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `API ${res.status}`);
  }
  return body;
}

export async function fetchSession(agentToken: string) {
  return apiFetch<SessionInfo>("/api/agents/session", {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
}

function writePersonalLayer(files: FileBundle[]) {
  if (fs.existsSync(PERSONAL_LAYER_DIR)) {
    fs.rmSync(PERSONAL_LAYER_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(PERSONAL_LAYER_DIR, { recursive: true });
  for (const file of files) {
    const dest = path.join(PERSONAL_LAYER_DIR, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(file.contentBase64, "base64"));
  }
}

function readPersonalLayer(): FileBundle[] {
  if (!fs.existsSync(PERSONAL_LAYER_DIR)) return [];
  const results: FileBundle[] = [];

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else {
        results.push({
          path: rel,
          contentBase64: fs.readFileSync(full).toString("base64"),
        });
      }
    }
  }

  walk(PERSONAL_LAYER_DIR, "");
  return results;
}

export async function handleStorageSync(agentToken: string) {
  const session = await fetchSession(agentToken);
  if (!session.active || !session.personalStorage || !session.rentalId) {
    return;
  }

  const { rentalId, syncStatus } = session;

  if (syncStatus === "pulling") {
    const bundle = await apiFetch<{ files: FileBundle[] }>(
      `/api/agents/storage/bundle?rentalId=${rentalId}`,
      { headers: { Authorization: `Bearer ${agentToken}` } }
    );
    writePersonalLayer(bundle.files);
    await apiFetch("/api/agents/storage/pull-complete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rentalId, fileCount: bundle.files.length }),
    });
    console.log(
      `Cloud storage: restored ${bundle.files.length} file(s) to personal layer (host temp only)`
    );
  }

  if (syncStatus === "pushing") {
    const files = readPersonalLayer();
    await apiFetch("/api/agents/storage/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rentalId, files }),
    });
    fs.rmSync(PERSONAL_LAYER_DIR, { recursive: true, force: true });
    console.log(`Cloud storage: pushed ${files.length} file(s) to cloud, wiped host copy`);
  }
}
