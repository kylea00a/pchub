import { nanoid } from "nanoid";
import type { MachineRow, RentalRow } from "./db.js";
import { db } from "./db.js";

export const MOONLIGHT_LINKS = {
  windows: "https://moonlight-stream.org/",
  android: "https://play.google.com/store/apps/details?id=com.limelight",
  ios: "https://apps.apple.com/app/moonlight-game-streaming/id1000551566",
  mac: "https://moonlight-stream.org/",
} as const;

export function ensureSunshineCredentials(machine: MachineRow) {
  if (machine.sunshine_username && machine.sunshine_password) {
    return {
      username: machine.sunshine_username,
      password: machine.sunshine_password,
    };
  }

  const username = `pchub-${machine.id.slice(0, 8)}`;
  const password = nanoid(24);
  db.prepare(
    `UPDATE machines SET sunshine_username = ?, sunshine_password = ? WHERE id = ?`
  ).run(username, password, machine.id);

  return { username, password };
}

export function formatConnectInfo(rental: RentalRow) {
  if (rental.status !== "active") {
    return null;
  }

  const host =
    rental.stream_public_ip?.trim() ||
    rental.stream_local_ip?.trim() ||
    null;

  const pairStatus = rental.stream_pair_status ?? "idle";
  const steps = [
    "Install Moonlight on your phone, tablet, or PC (links below).",
    host
      ? `In Moonlight, add PC and enter ${host} (port ${rental.stream_port || 47989}).`
      : "Waiting for host to report connection address…",
    "Moonlight will show a 4-digit PIN — enter it below to pair (no host PC setup needed).",
    "After pairing, tap Desktop in Moonlight to start streaming.",
    "For internet access (not same WiFi), the host must forward UDP/TCP ports 47984, 47989, and 48010.",
  ];

  return {
    status: rental.stream_status,
    localIp: rental.stream_local_ip,
    publicIp: rental.stream_public_ip,
    host,
    port: rental.stream_port || 47989,
    httpsPort: rental.stream_https_port || 47990,
    message: rental.stream_message,
    sunshineInstalled: rental.stream_sunshine_installed === 1,
    updatedAt: rental.stream_updated_at,
    pairStatus,
    pairMessage: rental.stream_pair_message,
    moonlightLinks: MOONLIGHT_LINKS,
    steps,
  };
}
