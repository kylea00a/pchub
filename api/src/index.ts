import cors from "cors";
import express from "express";
import net from "node:net";
import http from "node:http";
import { nanoid } from "nanoid";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ensureDefaultAdmin,
  getOrCreateRenterProfile,
  getRenterProfileByUserId,
  getUserByEmail,
  hashPassword,
  signToken,
  toAuthUser,
  verifyPassword,
  verifyToken,
} from "./auth.js";
import { db, type InventoryRow, type MachineRow, type RenterProfileRow, type RentalRow } from "./db.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "./middleware.js";
import {
  resolveWindowsBundleConfig,
  sendHostConfigJson,
  streamWindowsAgentBundle,
} from "./host-bundle.js";
import { formatConnectInfo } from "./streaming.js";
import {
  applyTunnelPeer,
  buildClientTunnelConfig,
  enableStreamRelay,
  ensureMachineTunnel,
  getStreamRelayHost,
  recordTunnelHandshake,
} from "./tunnel.js";
import {
  ensureRustDeskPassword,
  getRustDeskServerConfig,
} from "./rustdesk.js";
import {
  STORAGE_PLANS,
  getPlan,
  getUsedBytes,
  listFileContents,
  saveFiles,
  storageBackendLabel,
  type FileUpload,
} from "./storage/index.js";

const PORT = Number(process.env.PORT ?? 4000);
const ONLINE_WINDOW_MS = 90_000;

const app = express();
app.use(cors());

const SPEED_TEST_BYTES = 2 * 1024 * 1024;
const speedTestPayload = Buffer.alloc(SPEED_TEST_BYTES, 0);

function nowIso() {
  return new Date().toISOString();
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}

function authAgent(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing agent token" });
    return;
  }
  const machine = db
    .prepare("SELECT * FROM machines WHERE agent_token = ?")
    .get(token) as MachineRow | undefined;
  if (!machine) {
    res.status(401).json({ error: "Invalid agent token" });
    return;
  }
  (req as express.Request & { machine: MachineRow }).machine = machine;
  next();
}

app.get("/api/agents/speed-test/download", authAgent, (_req, res) => {
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", String(SPEED_TEST_BYTES));
  res.setHeader("Cache-Control", "no-store");
  res.send(speedTestPayload);
});

app.post(
  "/api/agents/speed-test/upload",
  express.raw({ type: "application/octet-stream", limit: "10mb" }),
  authAgent,
  (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body.length : 0;
    if (bytes < SPEED_TEST_BYTES * 0.9) {
      res.status(400).json({ error: "Payload too small for speed test" });
      return;
    }
    res.json({ ok: true, bytes });
  }
);

app.use(express.json({ limit: "25mb" }));

type SignalRole = "host" | "renter";
type SignalConn = { ws: WebSocket; role: SignalRole; rentalId: string; machineId?: string; userId?: string };
type SignalRoom = { host?: SignalConn; renter?: SignalConn };
const SIGNAL_ROOMS = new Map<string, SignalRoom>();

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function wsSend(ws: WebSocket, payload: unknown) {
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function closeWith(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // ignore
  }
}

function getRoom(rentalId: string) {
  const existing = SIGNAL_ROOMS.get(rentalId);
  if (existing) return existing;
  const created: SignalRoom = {};
  SIGNAL_ROOMS.set(rentalId, created);
  return created;
}

function otherPeer(room: SignalRoom, role: SignalRole) {
  return role === "host" ? room.renter?.ws : room.host?.ws;
}

async function authorizeSignalJoin(opts: {
  role: SignalRole;
  rentalId: string;
  token: string;
}): Promise<{ ok: true; machineId?: string; userId?: string } | { ok: false; status: number; error: string }> {
  const { role, rentalId, token } = opts;
  if (!rentalId) return { ok: false, status: 400, error: "rentalId required" };
  if (!token) return { ok: false, status: 401, error: "token required" };

  if (role === "host") {
    const machine = db
      .prepare("SELECT * FROM machines WHERE agent_token = ?")
      .get(token) as MachineRow | undefined;
    if (!machine) return { ok: false, status: 401, error: "Invalid host token" };
    const rental = db
      .prepare("SELECT * FROM rentals WHERE id = ? AND machine_id = ? AND status = 'active'")
      .get(rentalId, machine.id) as RentalRow | undefined;
    if (!rental) return { ok: false, status: 404, error: "Active rental not found for host" };
    return { ok: true, machineId: machine.id };
  }

  // renter
  const user = verifyToken(token);
  if (!user) return { ok: false, status: 401, error: "Invalid or expired session" };
  const profile = profileForUser(user.id);
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND renter_profile_id = ? AND status = 'active'")
    .get(rentalId, profile.id) as RentalRow | undefined;
  if (!rental) return { ok: false, status: 404, error: "Active rental not found for renter" };
  return { ok: true, userId: user.id };
}

function refreshProfileUsage(profileId: string) {
  const used = getUsedBytes(profileId);
  db.prepare(`UPDATE renter_profiles SET storage_used_bytes = ? WHERE id = ?`).run(
    used,
    profileId
  );
  return used;
}

function formatRenter(profile: RenterProfileRow) {
  const plan = getPlan(profile.storage_plan);
  const used = refreshProfileUsage(profile.id);
  const quota = profile.storage_quota_bytes;
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return {
    id: profile.id,
    displayName: profile.display_name,
    storagePlan: profile.storage_plan,
    planName: plan?.name ?? "Ephemeral",
    quotaBytes: quota,
    quotaGb: plan?.quotaGb ?? 0,
    usedBytes: used,
    usedFormatted: formatBytes(used),
    quotaFormatted: quota > 0 ? formatBytes(quota) : "—",
    usagePercent: pct,
    priceFormatted: plan?.priceFormatted ?? "Free",
    cloudRegion: "ap-southeast-1 (Singapore)",
    storageBackend: storageBackendLabel(),
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

type RentalWithMachine = RentalRow & {
  machine_name: string;
  machine_city?: string;
};

function rentalMinutes(row: RentalWithMachine) {
  const started = new Date(row.started_at).getTime();
  if (row.status === "active") {
    return Math.max(0, Math.ceil((Date.now() - started) / 60_000));
  }
  if (row.minutes_billed > 0) return row.minutes_billed;
  if (row.ended_at) {
    return Math.max(1, Math.ceil((new Date(row.ended_at).getTime() - started) / 60_000));
  }
  return 0;
}

function profileForUser(userId: string) {
  return getOrCreateRenterProfile(userId, "Renter");
}

function startRentalLogic(
  machineId: string,
  renterProfileId: string,
  usePersonalStorage: boolean
) {
  const machine = db
    .prepare("SELECT * FROM machines WHERE id = ?")
    .get(machineId) as MachineRow | undefined;
  if (!machine) throw new Error("Machine not found");
  if (!isOnline(machine.last_seen_at)) throw new Error("Machine is offline");
  if (machine.status === "rented") throw new Error("Machine already in use");

  let personalStorage = false;
  let syncStatus = "idle";
  let syncMessage: string | null = null;

  if (usePersonalStorage) {
    const profile = db
      .prepare("SELECT * FROM renter_profiles WHERE id = ?")
      .get(renterProfileId) as RenterProfileRow | undefined;
    if (!profile) throw new Error("Profile not found");
    const plan = getPlan(profile.storage_plan);
    if (!plan || plan.quotaBytes === 0) {
      throw new Error("Choose a personal storage plan before using cloud save.");
    }
    personalStorage = true;
    syncStatus = "pulling";
    syncMessage = "Downloading your personal files from cloud to this session…";
  }

  const rentalId = nanoid(12);
  const connectPassword = nanoid(12);
  db.prepare(
    `INSERT INTO rentals (
      id, machine_id, status, price_per_minute_cents, started_at, minutes_billed,
      renter_profile_id, personal_storage, sync_status, sync_message,
      stream_status, stream_message, stream_pair_status, connect_password
    ) VALUES (?, ?, 'active', ?, ?, 0, ?, ?, ?, ?, 'pending', ?, 'idle', ?)`
  ).run(
    rentalId,
    machine.id,
    machine.price_per_minute_cents,
    nowIso(),
    renterProfileId,
    personalStorage ? 1 : 0,
    syncStatus,
    syncMessage,
    "Preparing your remote desktop session…",
    connectPassword
  );
  db.prepare(`UPDATE machines SET status = 'rented' WHERE id = ?`).run(machine.id);

  const fileCount = personalStorage ? listFileContents(renterProfileId).length : 0;
  return {
    rentalId,
    machineId: machine.id,
    machineName: machine.name,
    status: "active",
    pricePerMinuteCents: machine.price_per_minute_cents,
    personalStorage,
    syncStatus,
    syncMessage,
    cloudFiles: fileCount,
    power: "on",
    message: personalStorage
      ? `PC turned on. Syncing ${fileCount} file(s) from cloud.`
      : "PC turned on (ephemeral session).",
  };
}

function endRentalLogic(rentalId: string) {
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ?")
    .get(rentalId) as RentalRow | undefined;
  if (!rental) throw new Error("Rental not found");
  if (rental.status !== "active") throw new Error("Rental is not active");

  const started = new Date(rental.started_at).getTime();
  const minutes = Math.max(1, Math.ceil((Date.now() - started) / 60_000));
  const totalCents = minutes * rental.price_per_minute_cents;

  db.prepare(
    `UPDATE rentals SET status = 'ended', ended_at = ?, minutes_billed = ? WHERE id = ?`
  ).run(nowIso(), minutes, rental.id);

  if (rental.personal_storage === 1) {
    db.prepare(
      `UPDATE rentals SET sync_status = 'pushing', sync_message = ? WHERE id = ?`
    ).run("Uploading your changes to cloud, then wiping host…", rental.id);
  }

  db.prepare(`UPDATE machines SET status = 'online' WHERE id = ?`).run(rental.machine_id);

  return {
    rentalId: rental.id,
    minutesBilled: minutes,
    totalCents,
    totalFormatted: `₱${(totalCents / 100).toFixed(2)}`,
    syncStatus: rental.personal_storage === 1 ? "pushing" : "idle",
    power: "off",
    message:
      rental.personal_storage === 1
        ? "PC turned off. Saving personal files to cloud."
        : "PC turned off.",
  };
}

function buildDashboard(profile: RenterProfileRow) {
  const activeRows = db
    .prepare(
      `SELECT r.*, m.name as machine_name, m.city as machine_city
       FROM rentals r
       JOIN machines m ON m.id = r.machine_id
       WHERE r.renter_profile_id = ? AND r.status = 'active'
       ORDER BY r.started_at DESC`
    )
    .all(profile.id) as RentalWithMachine[];

  const historyRows = db
    .prepare(
      `SELECT r.*, m.name as machine_name, m.city as machine_city
       FROM rentals r
       JOIN machines m ON m.id = r.machine_id
       WHERE r.renter_profile_id = ? AND r.status = 'ended'
       ORDER BY r.ended_at DESC
       LIMIT 20`
    )
    .all(profile.id) as RentalWithMachine[];

  const active = activeRows.map(formatRental);
  const history = historyRows.map(formatRental);
  const runningPerMinuteCents = active.reduce((s, r) => s + r.pricePerMinuteCents, 0);
  const runningEstimatedCents = active.reduce((s, r) => s + r.estimatedTotalCents, 0);
  const lifetimeSpentCents = history.reduce((s, r) => s + r.estimatedTotalCents, 0);

  return {
    profile: formatRenter(profile),
    summary: {
      activeSessions: active.length,
      runningPerMinuteCents,
      runningPerMinuteFormatted: `₱${(runningPerMinuteCents / 100).toFixed(2)}/min`,
      runningEstimatedCents,
      runningEstimatedFormatted: `₱${(runningEstimatedCents / 100).toFixed(2)}`,
      lifetimeSpentCents,
      lifetimeSpentFormatted: `₱${(lifetimeSpentCents / 100).toFixed(2)}`,
    },
    activeSessions: active,
    history,
  };
}

function formatRental(row: RentalWithMachine) {
  const minutes = rentalMinutes(row);
  const totalCents = minutes * row.price_per_minute_cents;
  const started = new Date(row.started_at).getTime();
  return {
    rentalId: row.id,
    machineId: row.machine_id,
    machineName: row.machine_name,
    machineCity: row.machine_city ?? "—",
    status: row.status,
    personalStorage: row.personal_storage === 1,
    syncStatus: row.sync_status,
    syncMessage: row.sync_message,
    pricePerMinuteCents: row.price_per_minute_cents,
    priceFormatted: `₱${(row.price_per_minute_cents / 100).toFixed(2)}/min`,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    minutesBilled: minutes,
    estimatedTotalCents: totalCents,
    estimatedTotalFormatted: `₱${(totalCents / 100).toFixed(2)}`,
    elapsedSeconds: row.status === "active" ? Math.floor((Date.now() - started) / 1000) : null,
    connect: formatConnectInfo(row),
  };
}

function formatMachine(
  machine: MachineRow,
  inventory: InventoryRow | undefined,
  online: boolean
) {
  const price = machine.price_per_minute_cents / 100;
  return {
    id: machine.id,
    name: machine.name,
    city: machine.city,
    region: machine.region,
    online,
    status: online ? machine.status : "offline",
    verified: machine.verified === 1,
    pricePerMinute: price,
    priceFormatted: `₱${price.toFixed(2)}`,
    cpu: inventory?.cpu ?? "—",
    ram: inventory?.ram ?? "—",
    gpu: inventory?.gpu ?? "—",
    disk: inventory?.disk ?? "—",
    os: inventory?.os ?? "—",
    uploadMbps: inventory?.upload_mbps ?? null,
    downloadMbps: inventory?.download_mbps ?? null,
    benchScore: inventory?.bench_score ?? null,
    lastSeenAt: machine.last_seen_at,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: nowIso() });
});

app.post("/api/pairing-codes", (_req, res) => {
  const code = nanoid(8).toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  db.prepare(
    `INSERT INTO pairing_codes (code, used, expires_at, created_at) VALUES (?, 0, ?, ?)`
  ).run(code, expiresAt, nowIso());
  res.json({ code, expiresAt, expiresInMinutes: 30 });
});

function serveWindowsBundle(
  res: express.Response,
  code: string,
  opts: {
    machineName?: string;
    machineCity?: string;
    priceCents?: number;
    apiUrl?: string;
  }
) {
  const pairing = db
    .prepare("SELECT * FROM pairing_codes WHERE code = ?")
    .get(code.trim().toUpperCase()) as
    | { code: string; used: number; expires_at: string }
    | undefined;

  const resolved = resolveWindowsBundleConfig(pairing, {
    ...opts,
    defaultApiUrl:
      process.env.PUBLIC_API_URL?.replace(/\/$/, "") || `http://localhost:${PORT}`,
  });

  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  void streamWindowsAgentBundle(res, resolved);
}

function serveHostConfig(
  res: express.Response,
  code: string,
  opts: {
    machineName?: string;
    machineCity?: string;
    priceCents?: number;
    apiUrl?: string;
  }
) {
  const pairing = db
    .prepare("SELECT * FROM pairing_codes WHERE code = ?")
    .get(code.trim().toUpperCase()) as
    | { code: string; used: number; expires_at: string }
    | undefined;

  const resolved = resolveWindowsBundleConfig(pairing, {
    ...opts,
    defaultApiUrl:
      process.env.PUBLIC_API_URL?.replace(/\/$/, "") || `http://localhost:${PORT}`,
  });

  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  sendHostConfigJson(res, resolved);
}

app.get("/api/host/config.json", (req, res) => {
  const code = (req.query.code as string | undefined)?.trim();
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const priceCents = Number(req.query.priceCents);
  serveHostConfig(res, code, {
    machineName: req.query.machineName as string | undefined,
    machineCity: req.query.machineCity as string | undefined,
    priceCents: Number.isFinite(priceCents) ? priceCents : undefined,
    apiUrl: req.query.apiUrl as string | undefined,
  });
});

app.get("/api/host/windows-bundle", (req, res) => {
  const code = (req.query.code as string | undefined)?.trim();
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const priceCents = Number(req.query.priceCents);
  serveWindowsBundle(res, code, {
    machineName: req.query.machineName as string | undefined,
    machineCity: req.query.machineCity as string | undefined,
    priceCents: Number.isFinite(priceCents) ? priceCents : undefined,
    apiUrl: req.query.apiUrl as string | undefined,
  });
});

app.post("/api/host/windows-bundle", (req, res) => {
  const { code, machineName, machineCity, priceCents, apiUrl } = req.body as {
    code?: string;
    machineName?: string;
    machineCity?: string;
    priceCents?: number;
    apiUrl?: string;
  };

  if (!code?.trim()) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  serveWindowsBundle(res, code, { machineName, machineCity, priceCents, apiUrl });
});

app.post("/api/agents/register", (req, res) => {
  const { pairingCode, hostname, name, city, pricePerMinuteCents } = req.body as {
    pairingCode?: string;
    hostname?: string;
    name?: string;
    city?: string;
    pricePerMinuteCents?: number;
  };

  if (!pairingCode?.trim()) {
    res.status(400).json({ error: "pairingCode is required" });
    return;
  }

  const pairing = db
    .prepare("SELECT * FROM pairing_codes WHERE code = ?")
    .get(pairingCode.trim().toUpperCase()) as
    | { code: string; used: number; expires_at: string }
    | undefined;

  if (!pairing) {
    res.status(404).json({ error: "Invalid pairing code" });
    return;
  }
  if (pairing.used === 1) {
    res.status(409).json({ error: "Pairing code already used" });
    return;
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: "Pairing code expired" });
    return;
  }

  const id = nanoid(12);
  const agentToken = nanoid(32);
  const sunshineUsername = `pchub-${id.slice(0, 8)}`;
  const sunshinePassword = nanoid(24);
  const rustdeskPassword = nanoid(16);
  const displayName = name?.trim() || hostname?.trim() || `PC-${id.slice(0, 6)}`;
  const machineCity = city?.trim() || "Manila";
  const priceCents = Number.isFinite(pricePerMinuteCents)
    ? Math.max(1, Math.round(pricePerMinuteCents!))
    : 50;

  db.prepare(
    `INSERT INTO machines (
      id, agent_token, name, hostname, city, price_per_minute_cents,
      verified, status, last_seen_at, created_at,
      sunshine_username, sunshine_password, rustdesk_password
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 'online', ?, ?, ?, ?, ?)`
  ).run(
    id,
    agentToken,
    displayName,
    hostname ?? null,
    machineCity,
    priceCents,
    nowIso(),
    nowIso(),
    sunshineUsername,
    sunshinePassword,
    rustdeskPassword
  );

  db.prepare(
    `UPDATE pairing_codes SET used = 1, machine_id = ? WHERE code = ?`
  ).run(id, pairing.code);

  const machine = db.prepare("SELECT * FROM machines WHERE id = ?").get(id) as MachineRow;
  ensureMachineTunnel(machine);
  applyTunnelPeer(machine);

  res.status(201).json({
    machineId: id,
    agentToken,
    name: displayName,
    city: machineCity,
    pricePerMinuteCents: priceCents,
    sunshineUsername,
    sunshinePassword,
    rustdeskPassword,
  });
});

app.post("/api/agents/rejoin", (req, res) => {
  const { pairingCode, hostname } = req.body as {
    pairingCode?: string;
    hostname?: string;
  };

  if (!pairingCode?.trim()) {
    res.status(400).json({ error: "pairingCode is required" });
    return;
  }

  const pairing = db
    .prepare("SELECT * FROM pairing_codes WHERE code = ?")
    .get(pairingCode.trim().toUpperCase()) as
    | { code: string; used: number; machine_id: string | null; expires_at: string }
    | undefined;

  if (!pairing) {
    res.status(404).json({ error: "Invalid pairing code" });
    return;
  }
  if (pairing.used !== 1 || !pairing.machine_id) {
    res.status(400).json({ error: "Pairing code is not linked to a registered PC yet" });
    return;
  }

  const machine = db
    .prepare("SELECT * FROM machines WHERE id = ?")
    .get(pairing.machine_id) as MachineRow | undefined;
  if (!machine) {
    res.status(404).json({ error: "Registered PC not found" });
    return;
  }

  if (hostname?.trim() && machine.hostname && machine.hostname !== hostname.trim()) {
    db.prepare(`UPDATE machines SET hostname = ? WHERE id = ?`).run(
      hostname.trim(),
      machine.id
    );
  }

  const rustdeskPassword = ensureRustDeskPassword(machine);
  ensureMachineTunnel(machine);
  applyTunnelPeer(machine);
  db.prepare(`UPDATE machines SET last_seen_at = ?, status = 'online' WHERE id = ?`).run(
    nowIso(),
    machine.id
  );

  res.json({
    machineId: machine.id,
    agentToken: machine.agent_token,
    name: machine.name,
    city: machine.city,
    pricePerMinuteCents: machine.price_per_minute_cents,
    sunshineUsername: machine.sunshine_username,
    sunshinePassword: machine.sunshine_password,
    rustdeskPassword,
    restored: true,
  });
});

app.post("/api/agents/heartbeat", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const { status } = req.body as { status?: string };
  const nextStatus =
    status === "rented" || status === "online" || status === "idle"
      ? status
      : "online";

  db.prepare(
    `UPDATE machines SET last_seen_at = ?, status = ? WHERE id = ?`
  ).run(nowIso(), nextStatus, machine.id);

  res.json({ ok: true, machineId: machine.id, status: nextStatus });
});

app.post("/api/agents/inventory", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const body = req.body as {
    cpu?: string;
    ram?: string;
    gpu?: string;
    disk?: string;
    os?: string;
    uploadMbps?: number;
    downloadMbps?: number;
    benchScore?: number;
    raw?: Record<string, unknown>;
  };

  db.prepare(
    `INSERT INTO machine_inventory (
      machine_id, cpu, ram, gpu, disk, os,
      upload_mbps, download_mbps, bench_score, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(machine_id) DO UPDATE SET
      cpu = excluded.cpu,
      ram = excluded.ram,
      gpu = excluded.gpu,
      disk = excluded.disk,
      os = excluded.os,
      upload_mbps = excluded.upload_mbps,
      download_mbps = excluded.download_mbps,
      bench_score = excluded.bench_score,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at`
  ).run(
    machine.id,
    body.cpu ?? null,
    body.ram ?? null,
    body.gpu ?? null,
    body.disk ?? null,
    body.os ?? null,
    body.uploadMbps ?? null,
    body.downloadMbps ?? null,
    body.benchScore ?? null,
    body.raw ? JSON.stringify(body.raw) : null,
    nowIso()
  );

  db.prepare(`UPDATE machines SET last_seen_at = ? WHERE id = ?`).run(
    nowIso(),
    machine.id
  );

  res.json({ ok: true, machineId: machine.id });
});

app.get("/api/machines", (_req, res) => {
  const machines = db.prepare("SELECT * FROM machines ORDER BY created_at DESC").all() as MachineRow[];
  const inventoryStmt = db.prepare("SELECT * FROM machine_inventory WHERE machine_id = ?");

  const list = machines.map((machine) => {
    const inventory = inventoryStmt.get(machine.id) as InventoryRow | undefined;
    const online = isOnline(machine.last_seen_at);
    return formatMachine(machine, inventory, online);
  });

  res.json({ machines: list, count: list.length });
});

app.get("/api/machines/:id", (req, res) => {
  const machine = db
    .prepare("SELECT * FROM machines WHERE id = ?")
    .get(req.params.id) as MachineRow | undefined;
  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }
  const inventory = db
    .prepare("SELECT * FROM machine_inventory WHERE machine_id = ?")
    .get(machine.id) as InventoryRow | undefined;
  const online = isOnline(machine.last_seen_at);
  res.json(formatMachine(machine, inventory, online));
});

app.get("/api/storage/plans", (_req, res) => {
  res.json({
    plans: STORAGE_PLANS,
    cloudRegion: "Singapore (DO Spaces — production)",
    note: "Speed depends on your internet upload/download, not cloud distance.",
  });
});

// ——— Auth ———
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body as {
    email?: string;
    password?: string;
    name?: string;
  };
  if (!email?.trim() || !password || password.length < 6) {
    res.status(400).json({ error: "Email and password (6+ chars) required" });
    return;
  }
  if (getUserByEmail(email)) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const id = nanoid(12);
  const passwordHash = await hashPassword(password);
  const displayName = name?.trim() || email.split("@")[0];
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, 'user', ?)`
  ).run(id, email.toLowerCase().trim(), passwordHash, displayName, nowIso());

  const user = toAuthUser({
    id,
    email: email.toLowerCase().trim(),
    name: displayName,
    role: "user",
  });
  getOrCreateRenterProfile(user.id, displayName);
  const token = signToken(user);
  res.status(201).json({ user, token });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const row = getUserByEmail(email);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const user = toAuthUser(row);
  getOrCreateRenterProfile(user.id, user.name);
  res.json({ user, token: signToken(user) });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const profile = profileForUser(user.id);
  res.json({ user, profile: formatRenter(profile) });
});

// ——— User dashboard (main site) ———
app.get("/api/me/dashboard", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const profile = profileForUser(user.id);
  res.json(buildDashboard(profile));
});

app.patch("/api/me/profile", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { displayName } = req.body as { displayName?: string };
  const profile = profileForUser(user.id);
  if (displayName?.trim()) {
    db.prepare(`UPDATE renter_profiles SET display_name = ? WHERE id = ?`).run(
      displayName.trim(),
      profile.id
    );
  }
  const updated = db
    .prepare("SELECT * FROM renter_profiles WHERE id = ?")
    .get(profile.id) as RenterProfileRow;
  res.json(formatRenter(updated));
});

app.patch("/api/me/plan", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { planId } = req.body as { planId?: string };
  if (!planId) {
    res.status(400).json({ error: "planId is required" });
    return;
  }
  const plan = getPlan(planId);
  if (!plan) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }
  const profile = profileForUser(user.id);
  const used = refreshProfileUsage(profile.id);
  if (plan.quotaBytes > 0 && used > plan.quotaBytes) {
    res.status(409).json({
      error: `You're using ${formatBytes(used)} — delete files or pick a larger plan.`,
    });
    return;
  }
  db.prepare(
    `UPDATE renter_profiles SET storage_plan = ?, storage_quota_bytes = ? WHERE id = ?`
  ).run(plan.id, plan.quotaBytes, profile.id);
  const updated = db
    .prepare("SELECT * FROM renter_profiles WHERE id = ?")
    .get(profile.id) as RenterProfileRow;
  res.json(formatRenter(updated));
});

app.post("/api/me/files", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { path: filePath, contentBase64 } = req.body as {
    path?: string;
    contentBase64?: string;
  };
  if (!filePath?.trim() || !contentBase64) {
    res.status(400).json({ error: "path and contentBase64 required" });
    return;
  }
  const profile = profileForUser(user.id);
  if (profile.storage_quota_bytes === 0) {
    res.status(400).json({ error: "Select a storage plan first" });
    return;
  }
  try {
    saveFiles(
      profile.id,
      [{ path: filePath.trim(), contentBase64 }],
      profile.storage_quota_bytes
    );
    refreshProfileUsage(profile.id);
  } catch (err) {
    res.status(413).json({ error: err instanceof Error ? err.message : "Save failed" });
    return;
  }
  res.status(201).json({ ok: true, path: filePath });
});

app.post("/api/me/power/on", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { machineId, usePersonalStorage } = req.body as {
    machineId?: string;
    usePersonalStorage?: boolean;
  };
  if (!machineId) {
    res.status(400).json({ error: "machineId is required" });
    return;
  }
  const profile = profileForUser(user.id);
  try {
    const result = startRentalLogic(machineId, profile.id, Boolean(usePersonalStorage));
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start";
    const code = msg.includes("not found") ? 404 : msg.includes("offline") ? 409 : 400;
    res.status(code).json({ error: msg });
  }
});

app.post("/api/me/power/off", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { rentalId } = req.body as { rentalId?: string };
  if (!rentalId) {
    res.status(400).json({ error: "rentalId is required" });
    return;
  }
  const profile = profileForUser(user.id);
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND renter_profile_id = ?")
    .get(rentalId, profile.id) as RentalRow | undefined;
  if (!rental || rental.status !== "active") {
    res.status(404).json({ error: "Active rental not found" });
    return;
  }
  res.json(endRentalLogic(rentalId));
});

// ——— Admin (admin.skypc.ph subdomain) ———
app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  const machines = db.prepare("SELECT COUNT(*) as c FROM machines").get() as { c: number };
  const activeRentals = db
    .prepare("SELECT COUNT(*) as c FROM rentals WHERE status = 'active'")
    .get() as { c: number };

  const machineList = db.prepare("SELECT * FROM machines ORDER BY created_at DESC LIMIT 50").all() as MachineRow[];
  const inventoryStmt = db.prepare("SELECT * FROM machine_inventory WHERE machine_id = ?");
  const rentals = db
    .prepare(
      `SELECT r.*, m.name as machine_name, u.email as renter_email
       FROM rentals r
       JOIN machines m ON m.id = r.machine_id
       LEFT JOIN renter_profiles p ON p.id = r.renter_profile_id
       LEFT JOIN users u ON u.id = p.user_id
       ORDER BY r.started_at DESC LIMIT 30`
    )
    .all();

  res.json({
    stats: {
      users: users.c,
      machines: machines.c,
      activeRentals: activeRentals.c,
    },
    machines: machineList.map((m) => {
      const inv = inventoryStmt.get(m.id) as InventoryRow | undefined;
      return formatMachine(m, inv, isOnline(m.last_seen_at));
    }),
    rentals,
  });
});

app.post("/api/rentals", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const { machineId, usePersonalStorage } = req.body as {
    machineId?: string;
    usePersonalStorage?: boolean;
  };
  if (!machineId) {
    res.status(400).json({ error: "machineId is required" });
    return;
  }
  const profile = profileForUser(user.id);
  try {
    res.status(201).json(startRentalLogic(machineId, profile.id, Boolean(usePersonalStorage)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    res.status(400).json({ error: msg });
  }
});

app.post("/api/rentals/:id/end", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const profile = profileForUser(user.id);
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND renter_profile_id = ?")
    .get(req.params.id, profile.id) as RentalRow | undefined;
  if (!rental) {
    res.status(404).json({ error: "Rental not found" });
    return;
  }
  try {
    res.json(endRentalLogic(rental.id));
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

app.get("/api/rentals/:id", (req, res) => {
  const rental = db
    .prepare(
      `SELECT r.*, m.name as machine_name, m.city as machine_city FROM rentals r
       JOIN machines m ON m.id = r.machine_id WHERE r.id = ?`
    )
    .get(req.params.id) as RentalWithMachine | undefined;
  if (!rental) {
    res.status(404).json({ error: "Rental not found" });
    return;
  }
  res.json(formatRental(rental));
});

app.get("/api/me/rentals/:id/connect", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const profile = profileForUser(user.id);
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND renter_profile_id = ?")
    .get(req.params.id, profile.id) as RentalRow | undefined;
  if (!rental || rental.status !== "active") {
    res.status(404).json({ error: "Active rental not found" });
    return;
  }
  res.json(formatConnectInfo(rental));
});

app.post("/api/me/rentals/:id/pair", requireAuth, (req, res) => {
  const user = (req as AuthedRequest).user;
  const profile = profileForUser(user.id);
  const { pin, clientName } = req.body as { pin?: string; clientName?: string };

  const cleanedPin = pin?.trim().replace(/\D/g, "");
  if (!cleanedPin || cleanedPin.length !== 4) {
    res.status(400).json({ error: "Enter the 4-digit PIN shown in Moonlight." });
    return;
  }

  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND renter_profile_id = ?")
    .get(req.params.id, profile.id) as RentalRow | undefined;
  if (!rental || rental.status !== "active") {
    res.status(404).json({ error: "Active rental not found" });
    return;
  }

  const name = clientName?.trim() || profile.display_name || "PCHUB renter";
  db.prepare(
    `UPDATE rentals SET
      stream_pair_pin = ?,
      stream_pair_client_name = ?,
      stream_pair_status = 'pending',
      stream_pair_message = 'Sending PIN to host PC…'
    WHERE id = ?`
  ).run(cleanedPin, name, rental.id);

  const updated = db
    .prepare("SELECT * FROM rentals WHERE id = ?")
    .get(rental.id) as RentalRow;
  res.json(formatConnectInfo(updated));
});

app.get("/api/agents/rustdesk/config", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const password = ensureRustDeskPassword(machine);
  const { relayHost, publicKey, configured } = getRustDeskServerConfig();
  res.json({ relayHost, publicKey, password, configured });
});

app.post("/api/agents/remote", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const { rentalId, status, message, rustdeskId } = req.body as {
    rentalId?: string;
    status?: string;
    message?: string;
    rustdeskId?: string;
  };

  if (!rentalId) {
    res.status(400).json({ error: "rentalId required" });
    return;
  }

  const rental = db
    .prepare(
      "SELECT * FROM rentals WHERE id = ? AND machine_id = ? AND status = 'active'"
    )
    .get(rentalId, machine.id) as RentalRow | undefined;
  if (!rental) {
    res.status(404).json({ error: "Active rental not found" });
    return;
  }

  if (rustdeskId?.trim()) {
    db.prepare(`UPDATE machines SET rustdesk_id = ? WHERE id = ?`).run(
      rustdeskId.trim(),
      machine.id
    );
  }

  db.prepare(
    `UPDATE rentals SET
      stream_status = ?,
      stream_message = ?,
      stream_updated_at = ?,
      stream_connect_mode = 'relay'
    WHERE id = ?`
  ).run(status ?? "pending", message ?? null, nowIso(), rentalId);

  res.json({ ok: true });
});

app.post("/api/agents/rustdesk/id", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const { rustdeskId } = req.body as { rustdeskId?: string };
  if (!rustdeskId?.trim()) {
    res.status(400).json({ error: "rustdeskId required" });
    return;
  }
  db.prepare(`UPDATE machines SET rustdesk_id = ? WHERE id = ?`).run(rustdeskId.trim(), machine.id);
  res.json({ ok: true });
});

app.get("/api/agents/streaming/config", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  res.json({
    sunshineUsername: machine.sunshine_username,
    sunshinePassword: machine.sunshine_password,
    relayHost: getStreamRelayHost(),
    configured: Boolean(machine.sunshine_username && machine.sunshine_password),
  });
});

app.get("/api/agents/tunnel/config", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const fresh = db.prepare("SELECT * FROM machines WHERE id = ?").get(machine.id) as MachineRow;
  ensureMachineTunnel(fresh);
  applyTunnelPeer(fresh);
  const config = buildClientTunnelConfig(fresh);
  res.json({
    configured: Boolean(config),
    relayHost: getStreamRelayHost(),
    tunnelIp: fresh.wg_tunnel_ip,
    config: config ?? null,
  });
});

app.post("/api/agents/tunnel/heartbeat", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const { connected } = req.body as { connected?: boolean };
  if (connected) {
    recordTunnelHandshake(machine.id);
    const fresh = db.prepare("SELECT * FROM machines WHERE id = ?").get(machine.id) as MachineRow;
    const ok = enableStreamRelay(fresh);
    if (!ok) {
      // This most commonly fails if the API process doesn't have permission to run iptables.
      // We still record the handshake so "tunnel up" is tracked, but relay will not work.
      res.json({ ok: true, relayConfigured: false });
      return;
    }
  }
  res.json({ ok: true, relayConfigured: true });
});

app.post("/api/agents/streaming", authAgent, async (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const {
    rentalId,
    status,
    localIp,
    publicIp,
    port,
    httpsPort,
    pin,
    message,
    sunshineInstalled,
    sunshineRunning,
    portsOpen,
    connectMode,
    pairStatus,
    pairMessage,
  } = req.body as {
    rentalId?: string;
    status?: string;
    localIp?: string;
    publicIp?: string;
    port?: number;
    httpsPort?: number;
    pin?: string;
    message?: string;
    sunshineInstalled?: boolean;
    sunshineRunning?: boolean;
    portsOpen?: boolean;
    connectMode?: string;
    pairStatus?: string;
    pairMessage?: string | null;
  };

  if (!rentalId) {
    res.status(400).json({ error: "rentalId required" });
    return;
  }

  const rental = db
    .prepare(
      "SELECT * FROM rentals WHERE id = ? AND machine_id = ? AND status = 'active'"
    )
    .get(rentalId, machine.id) as RentalRow | undefined;
  if (!rental) {
    res.status(404).json({ error: "Active rental not found" });
    return;
  }

  // For direct-only mode, "ports open" must mean reachable from the public internet.
  // We validate TCP reachability from the server side (host router port-forwarding).
  let externallyReachable = false;
  const publicIpTrim = publicIp?.trim();
  const streamPort = port ?? 47989;
  if (publicIpTrim) {
    externallyReachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const done = (ok: boolean) => {
        try {
          socket.destroy();
        } catch { }
        resolve(ok);
      };
      socket.setTimeout(2500);
      socket.once("connect", () => done(true));
      socket.once("timeout", () => done(false));
      socket.once("error", () => done(false));
      socket.connect(streamPort, publicIpTrim);
    });
  }

  db.prepare(
    `UPDATE rentals SET
      stream_status = ?,
      stream_local_ip = ?,
      stream_public_ip = ?,
      stream_port = ?,
      stream_https_port = ?,
      stream_pin = ?,
      stream_message = ?,
      stream_sunshine_installed = ?,
      stream_sunshine_running = ?,
      stream_ports_open = ?,
      stream_connect_mode = ?,
      stream_updated_at = ?,
      stream_pair_status = COALESCE(?, stream_pair_status),
      stream_pair_message = COALESCE(?, stream_pair_message)
    WHERE id = ?`
  ).run(
    status ?? "pending",
    localIp ?? null,
    publicIp ?? null,
    streamPort,
    httpsPort ?? 47990,
    pin ?? null,
    message ?? null,
    sunshineInstalled ? 1 : 0,
    sunshineRunning ? 1 : 0,
    externallyReachable ? 1 : 0,
    connectMode ?? null,
    nowIso(),
    pairStatus ?? null,
    pairMessage ?? null,
    rentalId
  );

  if (pairStatus === "paired") {
    db.prepare(
      `UPDATE rentals SET stream_pair_pin = NULL, stream_pair_client_name = NULL WHERE id = ?`
    ).run(rentalId);
  }

  if (connectMode === "relay") {
    const fresh = db.prepare("SELECT * FROM machines WHERE id = ?").get(machine.id) as MachineRow;
    enableStreamRelay(fresh);
  }

  res.json({ ok: true });
});

app.get("/api/agents/session", authAgent, (req, res) => {
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const rental = db
    .prepare(
      `SELECT * FROM rentals WHERE machine_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`
    )
    .get(machine.id) as RentalRow | undefined;

  if (!rental) {
    res.json({ active: false });
    return;
  }

  const pairRequest =
    rental.stream_pair_pin && rental.stream_pair_status === "pending"
      ? {
          pin: rental.stream_pair_pin,
          clientName: rental.stream_pair_client_name || "PCHUB renter",
        }
      : null;

  res.json({
    active: true,
    rentalId: rental.id,
    personalStorage: rental.personal_storage === 1,
    syncStatus: rental.sync_status,
    syncMessage: rental.sync_message,
    renterProfileId: rental.renter_profile_id,
    connectPassword: rental.connect_password,
    sunshineUsername: machine.sunshine_username,
    sunshinePassword: machine.sunshine_password,
    pairRequest,
  });
});

app.get("/api/agents/storage/bundle", authAgent, (req, res) => {
  const rentalId = req.query.rentalId as string;
  if (!rentalId) {
    res.status(400).json({ error: "rentalId required" });
    return;
  }
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND machine_id = ?")
    .get(rentalId, machine.id) as RentalRow | undefined;
  if (!rental || rental.personal_storage !== 1 || !rental.renter_profile_id) {
    res.status(404).json({ error: "No personal storage rental" });
    return;
  }
  const files = listFileContents(rental.renter_profile_id);
  res.json({
    rentalId,
    profileId: rental.renter_profile_id,
    files,
    fileCount: files.length,
  });
});

app.post("/api/agents/storage/pull-complete", authAgent, (req, res) => {
  const { rentalId, fileCount } = req.body as { rentalId?: string; fileCount?: number };
  if (!rentalId) {
    res.status(400).json({ error: "rentalId required" });
    return;
  }
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND machine_id = ?")
    .get(rentalId, machine.id) as RentalRow | undefined;
  if (!rental) {
    res.status(404).json({ error: "Rental not found" });
    return;
  }
  db.prepare(
    `UPDATE rentals SET sync_status = 'ready', sync_message = ? WHERE id = ?`
  ).run(
    `Personal desktop ready (${fileCount ?? 0} files restored from cloud).`,
    rentalId
  );
  res.json({ ok: true, syncStatus: "ready" });
});

app.post("/api/agents/storage/push", authAgent, (req, res) => {
  const { rentalId, files } = req.body as {
    rentalId?: string;
    files?: FileUpload[];
  };
  if (!rentalId || !files) {
    res.status(400).json({ error: "rentalId and files required" });
    return;
  }
  const machine = (req as express.Request & { machine: MachineRow }).machine;
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND machine_id = ?")
    .get(rentalId, machine.id) as RentalRow | undefined;
  if (!rental || !rental.renter_profile_id) {
    res.status(404).json({ error: "Rental not found" });
    return;
  }
  const profile = db
    .prepare("SELECT * FROM renter_profiles WHERE id = ?")
    .get(rental.renter_profile_id) as RenterProfileRow;
  try {
    saveFiles(profile.id, files, profile.storage_quota_bytes);
    refreshProfileUsage(profile.id);
  } catch (err) {
    res.status(413).json({
      error: err instanceof Error ? err.message : "Storage save failed",
    });
    return;
  }
  db.prepare(
    `UPDATE rentals SET sync_status = 'synced', sync_message = ? WHERE id = ?`
  ).run("Personal files saved to cloud. Host session wiped.", rentalId);
  res.json({ ok: true, syncStatus: "synced", filesSaved: files.length });
});

app.get("/api/rentals", (_req, res) => {
  const rentals = db
    .prepare(
      `SELECT r.*, m.name as machine_name
       FROM rentals r
       JOIN machines m ON m.id = r.machine_id
       ORDER BY r.started_at DESC
       LIMIT 50`
    )
    .all();
  res.json({ rentals });
});

ensureDefaultAdmin();

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  try {
    const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/api/webrtc/signal") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } catch {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  let conn: SignalConn | null = null;

  ws.on("message", async (data) => {
    const text = typeof data === "string" ? data : data.toString("utf8");
    const msg = safeJsonParse(text) as any;
    if (!msg || typeof msg !== "object") return;

    if (!conn) {
      if (msg.type !== "join") {
        closeWith(ws, 1008, "join first");
        return;
      }
      const role = msg.role as SignalRole;
      const rentalId = typeof msg.rentalId === "string" ? msg.rentalId : "";
      const token = typeof msg.token === "string" ? msg.token : "";
      if (role !== "host" && role !== "renter") {
        closeWith(ws, 1008, "invalid role");
        return;
      }
      const auth = await authorizeSignalJoin({ role, rentalId, token });
      if (!auth.ok) {
        wsSend(ws, { type: "error", error: auth.error, status: auth.status });
        closeWith(ws, 1008, auth.error);
        return;
      }

      conn = {
        ws,
        role,
        rentalId,
        machineId: auth.machineId,
        userId: auth.userId,
      };

      const room = getRoom(rentalId);
      if (role === "host") {
        if (room.host?.ws && room.host.ws !== ws) closeWith(room.host.ws, 1012, "replaced");
        room.host = conn;
      } else {
        if (room.renter?.ws && room.renter.ws !== ws) closeWith(room.renter.ws, 1012, "replaced");
        room.renter = conn;
      }

      wsSend(ws, { type: "joined", role, rentalId });
      const peer = otherPeer(room, role);
      if (peer) {
        wsSend(peer, { type: "peer", status: "joined", role });
        wsSend(ws, { type: "peer", status: "joined", role: role === "host" ? "renter" : "host" });
      }
      return;
    }

    // forward signaling to the other peer in the room
    const room = SIGNAL_ROOMS.get(conn.rentalId);
    if (!room) return;
    const peer = otherPeer(room, conn.role);
    if (!peer) return;

    if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
      wsSend(peer, { ...msg, from: conn.role });
    }
  });

  ws.on("close", () => {
    if (!conn) return;
    const room = SIGNAL_ROOMS.get(conn.rentalId);
    if (!room) return;
    if (conn.role === "host" && room.host?.ws === ws) room.host = undefined;
    if (conn.role === "renter" && room.renter?.ws === ws) room.renter = undefined;
    const peer = conn.role === "host" ? room.renter?.ws : room.host?.ws;
    if (peer) wsSend(peer, { type: "peer", status: "left", role: conn.role });
    if (!room.host && !room.renter) SIGNAL_ROOMS.delete(conn.rentalId);
  });
});

server.listen(PORT, () => {
  console.log(`SkyPC API running at http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`WebRTC signal: ws://localhost:${PORT}/api/webrtc/signal`);
});
