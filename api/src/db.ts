import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "skypc.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    agent_token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    hostname TEXT,
    city TEXT NOT NULL DEFAULT 'Manila',
    region TEXT NOT NULL DEFAULT 'PH',
    price_per_minute_cents INTEGER NOT NULL DEFAULT 50,
    verified INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'offline',
    last_seen_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS machine_inventory (
    machine_id TEXT PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
    cpu TEXT,
    ram TEXT,
    gpu TEXT,
    disk TEXT,
    os TEXT,
    upload_mbps REAL,
    download_mbps REAL,
    bench_score INTEGER,
    raw_json TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pairing_codes (
    code TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0,
    machine_id TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rentals (
    id TEXT PRIMARY KEY,
    machine_id TEXT NOT NULL REFERENCES machines(id),
    status TEXT NOT NULL DEFAULT 'active',
    price_per_minute_cents INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    minutes_billed INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS renter_profiles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT 'Renter',
    storage_plan TEXT NOT NULL DEFAULT 'none',
    storage_quota_bytes INTEGER NOT NULL DEFAULT 0,
    storage_used_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

const profileColumns = db.prepare("PRAGMA table_info(renter_profiles)").all() as { name: string }[];
if (!profileColumns.some((c) => c.name === "user_id")) {
  db.exec(`ALTER TABLE renter_profiles ADD COLUMN user_id TEXT`);
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_renter_profiles_user_id
  ON renter_profiles(user_id)
  WHERE user_id IS NOT NULL
`);

const rentalColumns = db.prepare("PRAGMA table_info(rentals)").all() as { name: string }[];
const rentalColNames = new Set(rentalColumns.map((c) => c.name));

if (!rentalColNames.has("renter_profile_id")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN renter_profile_id TEXT`);
}
if (!rentalColNames.has("personal_storage")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN personal_storage INTEGER NOT NULL DEFAULT 0`);
}
if (!rentalColNames.has("sync_status")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'idle'`);
}
if (!rentalColNames.has("sync_message")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN sync_message TEXT`);
}
if (!rentalColNames.has("stream_status")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_status TEXT NOT NULL DEFAULT 'idle'`);
}
if (!rentalColNames.has("stream_local_ip")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_local_ip TEXT`);
}
if (!rentalColNames.has("stream_public_ip")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_public_ip TEXT`);
}
if (!rentalColNames.has("stream_port")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_port INTEGER NOT NULL DEFAULT 47989`);
}
if (!rentalColNames.has("stream_https_port")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_https_port INTEGER NOT NULL DEFAULT 47990`);
}
if (!rentalColNames.has("stream_pin")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_pin TEXT`);
}
if (!rentalColNames.has("stream_message")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_message TEXT`);
}
if (!rentalColNames.has("stream_sunshine_installed")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_sunshine_installed INTEGER NOT NULL DEFAULT 0`);
}
if (!rentalColNames.has("stream_updated_at")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_updated_at TEXT`);
}
if (!rentalColNames.has("stream_pair_pin")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_pair_pin TEXT`);
}
if (!rentalColNames.has("stream_pair_client_name")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_pair_client_name TEXT`);
}
if (!rentalColNames.has("stream_pair_status")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_pair_status TEXT NOT NULL DEFAULT 'idle'`);
}
if (!rentalColNames.has("stream_pair_message")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_pair_message TEXT`);
}
if (!rentalColNames.has("stream_connect_mode")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_connect_mode TEXT`);
}
if (!rentalColNames.has("stream_sunshine_running")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_sunshine_running INTEGER NOT NULL DEFAULT 0`);
}
if (!rentalColNames.has("stream_ports_open")) {
  db.exec(`ALTER TABLE rentals ADD COLUMN stream_ports_open INTEGER NOT NULL DEFAULT 0`);
}

const machineColumns = db.prepare("PRAGMA table_info(machines)").all() as { name: string }[];
const machineColNames = new Set(machineColumns.map((c) => c.name));
if (!machineColNames.has("sunshine_username")) {
  db.exec(`ALTER TABLE machines ADD COLUMN sunshine_username TEXT`);
}
if (!machineColNames.has("sunshine_password")) {
  db.exec(`ALTER TABLE machines ADD COLUMN sunshine_password TEXT`);
}

export type RenterProfileRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  storage_plan: string;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  created_at: string;
};

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: string;
};

export type RentalRow = {
  id: string;
  machine_id: string;
  status: string;
  price_per_minute_cents: number;
  started_at: string;
  ended_at: string | null;
  minutes_billed: number;
  renter_profile_id: string | null;
  personal_storage: number;
  sync_status: string;
  sync_message: string | null;
  stream_status: string;
  stream_local_ip: string | null;
  stream_public_ip: string | null;
  stream_port: number;
  stream_https_port: number;
  stream_pin: string | null;
  stream_message: string | null;
  stream_sunshine_installed: number;
  stream_updated_at: string | null;
  stream_pair_pin: string | null;
  stream_pair_client_name: string | null;
  stream_pair_status: string;
  stream_pair_message: string | null;
  stream_connect_mode: string | null;
  stream_sunshine_running: number;
  stream_ports_open: number;
};

export type MachineRow = {
  id: string;
  agent_token: string;
  name: string;
  hostname: string | null;
  city: string;
  region: string;
  price_per_minute_cents: number;
  verified: number;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  sunshine_username: string | null;
  sunshine_password: string | null;
};

export type InventoryRow = {
  machine_id: string;
  cpu: string | null;
  ram: string | null;
  gpu: string | null;
  disk: string | null;
  os: string | null;
  upload_mbps: number | null;
  download_mbps: number | null;
  bench_score: number | null;
  raw_json: string | null;
  updated_at: string;
};
