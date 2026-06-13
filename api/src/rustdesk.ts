import { nanoid } from "nanoid";
import type { MachineRow, RentalRow } from "./db.js";
import { db } from "./db.js";

export const RUSTDESK_LINKS = {
  web: "https://rustdesk.com/web/",
  windows: "https://github.com/rustdesk/rustdesk/releases/latest",
  mac: "https://github.com/rustdesk/rustdesk/releases/latest",
  android: "https://play.google.com/store/apps/details?id=com.carriez.flutter_hbb",
  ios: "https://apps.apple.com/app/rustdesk-remote-desktop/id1581225015",
} as const;

export function getRustDeskServerConfig() {
  const relayHost = process.env.RUSTDESK_RELAY_HOST?.trim() || "relay.pchub.cloud";
  const publicKey = process.env.RUSTDESK_PUBLIC_KEY?.trim() || "";
  return { relayHost, publicKey, configured: Boolean(publicKey) };
}

export function ensureRustDeskPassword(machine: MachineRow) {
  if (machine.rustdesk_password) {
    return machine.rustdesk_password;
  }
  const password = nanoid(16);
  db.prepare(`UPDATE machines SET rustdesk_password = ? WHERE id = ?`).run(password, machine.id);
  return password;
}

export function formatRustDeskConnect(rental: RentalRow, machine: MachineRow) {
  if (rental.status !== "active") {
    return null;
  }

  const { relayHost, configured } = getRustDeskServerConfig();
  const rustdeskId = machine.rustdesk_id?.trim() || null;
  const password = rental.connect_password?.trim() || null;
  const ready = Boolean(rustdeskId && password && rental.stream_status === "ready");

  const steps = [
    "Install RustDesk (free) on your phone, Mac, or PC — or use the web client.",
    rustdeskId
      ? `Enter PC ID ${rustdeskId} and the session password below in RustDesk.`
      : "Waiting for host PC to register with PCHUB relay…",
    "Tap Connect. No IP addresses, port forwarding, or router settings needed.",
    "Traffic routes through PCHUB (~10–30 ms extra vs direct — works on any network).",
  ];

  let message: string | null = null;
  if (!configured) {
    message = "PCHUB relay is starting up. Try again in a few minutes.";
  } else if (!rustdeskId) {
    message = "Host PC is finishing remote desktop setup. Keep the agent running.";
  } else if (!password) {
    message = "Preparing your session password…";
  } else if (ready) {
    message = "Enter the ID and password in RustDesk to connect.";
  }

  return {
    provider: "rustdesk" as const,
    status: ready ? "ready" : rental.stream_status || "pending",
    rustdeskId,
    password,
    relayHost,
    message,
    ready,
    updatedAt: rental.stream_updated_at,
    downloadLinks: RUSTDESK_LINKS,
    steps,
  };
}
