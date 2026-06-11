import { authHeaders, clearSession } from "./auth-session";
import type { SessionUser } from "./auth-session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);

export type AdminOverview = {
  stats: {
    users: number;
    machines: number;
    activeRentals: number;
  };
  machines: Array<{
    id: string;
    name: string;
    city: string;
    online: boolean;
    status: string;
    priceFormatted: string;
  }>;
  rentals: Array<{
    id: string;
    machine_name: string;
    renter_email: string | null;
    status: string;
    started_at: string;
    ended_at: string | null;
    total_cents: number;
  }>;
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
  if (res.status === 401) clearSession();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function login(email: string, password: string) {
  return apiFetch<{ user: SessionUser; token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchAdminOverview() {
  return apiFetch<AdminOverview>("/api/admin/overview");
}
