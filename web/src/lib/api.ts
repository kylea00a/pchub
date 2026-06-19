import { authHeaders, clearSession, type SessionUser } from "./auth-session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);

const AGENT_API_URL = (
  process.env.NEXT_PUBLIC_AGENT_API_URL ?? API_URL
).replace(/\/$/, "");

export type Machine = {
  id: string;
  name: string;
  city: string;
  region: string;
  online: boolean;
  status: string;
  verified: boolean;
  pricePerMinute: number;
  priceFormatted: string;
  cpu: string;
  ram: string;
  gpu: string;
  disk: string;
  os: string;
  uploadMbps: number | null;
  downloadMbps: number | null;
  benchScore: number | null;
  lastSeenAt: string | null;
};

export type StoragePlan = {
  id: string;
  name: string;
  quotaGb: number;
  quotaBytes: number;
  priceMonthlyCents: number;
  priceFormatted: string;
  description: string;
};

export type RenterProfile = {
  id: string;
  displayName: string;
  storagePlan: string;
  planName: string;
  quotaBytes: number;
  quotaGb: number;
  usedBytes: number;
  usedFormatted: string;
  quotaFormatted: string;
  usagePercent: number;
  priceFormatted: string;
  cloudRegion: string;
  storageBackend: string;
};

export type Rental = {
  rentalId: string;
  machineId: string;
  machineName: string;
  machineCity?: string;
  status: string;
  pricePerMinuteCents: number;
  priceFormatted?: string;
  personalStorage?: boolean;
  syncStatus?: string;
  syncMessage?: string | null;
  cloudFiles?: number;
  message?: string;
  power?: string;
  startedAt?: string;
  endedAt?: string | null;
  minutesBilled?: number;
  estimatedTotalCents?: number;
  estimatedTotalFormatted?: string;
  elapsedSeconds?: number | null;
  connect?: ConnectInfo | null;
};

export type ConnectInfo = {
  provider: "pchub";
  status: string;
  connectMode: string;
  message: string | null;
  streamHostInstalled: boolean;
  streamHostRunning: boolean;
  ready: boolean;
  streamReady: boolean;
  updatedAt: string | null;
  steps: string[];
};

export type DashboardSummary = {
  activeSessions: number;
  runningPerMinuteCents: number;
  runningPerMinuteFormatted: string;
  runningEstimatedCents: number;
  runningEstimatedFormatted: string;
  lifetimeSpentCents: number;
  lifetimeSpentFormatted: string;
};

export type Dashboard = {
  profile: RenterProfile;
  summary: DashboardSummary;
  activeSessions: Rental[];
  history: Rental[];
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export function getApiUrl() {
  return API_URL;
}

export function getAgentApiUrl() {
  return AGENT_API_URL;
}

export async function login(email: string, password: string) {
  return apiFetch<{ user: SessionUser; token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string, name: string) {
  return apiFetch<{ user: SessionUser; token: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export async function fetchMe() {
  return apiFetch<{ user: SessionUser; profile: RenterProfile }>("/api/auth/me");
}

export async function fetchMachines() {
  return apiFetch<{ machines: Machine[]; count: number }>("/api/machines");
}

export async function createPairingCode() {
  return apiFetch<{ code: string; expiresAt: string }>("/api/pairing-codes", {
    method: "POST",
  });
}

export async function fetchStoragePlans() {
  return apiFetch<{ plans: StoragePlan[]; cloudRegion: string; note: string }>(
    "/api/storage/plans"
  );
}

export async function fetchDashboard() {
  return apiFetch<Dashboard>("/api/me/dashboard");
}

export async function updateRenterPlan(planId: string) {
  return apiFetch<RenterProfile>("/api/me/plan", {
    method: "PATCH",
    body: JSON.stringify({ planId }),
  });
}

export async function powerOn(machineId: string, usePersonalStorage: boolean) {
  return apiFetch<Rental>("/api/me/power/on", {
    method: "POST",
    body: JSON.stringify({ machineId, usePersonalStorage }),
  });
}

export async function powerOff(rentalId: string) {
  return apiFetch<{
    rentalId: string;
    totalFormatted: string;
    power: string;
    message?: string;
  }>("/api/me/power/off", {
    method: "POST",
    body: JSON.stringify({ rentalId }),
  });
}

export async function submitMoonlightPair(
  rentalId: string,
  pin: string,
  clientName?: string
) {
  return apiFetch<ConnectInfo>(`/api/me/rentals/${rentalId}/pair`, {
    method: "POST",
    body: JSON.stringify({ pin, clientName }),
  });
}

export async function startRental(machineId: string, usePersonalStorage: boolean) {
  return apiFetch<Rental>("/api/rentals", {
    method: "POST",
    body: JSON.stringify({ machineId, usePersonalStorage }),
  });
}

export async function endRental(rentalId: string) {
  return apiFetch<{ rentalId: string; totalFormatted: string; message?: string }>(
    `/api/rentals/${rentalId}/end`,
    { method: "POST" }
  );
}

export type WebRtcConfig = {
  signalUrl: string;
  stunServers: string[];
  iceServers: Array<{ urls: string; username?: string; credential?: string }>;
  turnEnabled?: boolean;
};

export async function prepareBrowserStream(rentalId: string) {
  return apiFetch<{
    rentalId: string;
    machineId: string;
    webrtc: WebRtcConfig;
    message?: string;
  }>(`/api/me/rentals/${rentalId}/stream/connect`, { method: "POST" });
}

export async function uploadCloudFile(path: string, contentBase64: string) {
  return apiFetch<{ ok: boolean }>("/api/me/files", {
    method: "POST",
    body: JSON.stringify({ path, contentBase64 }),
  });
}
