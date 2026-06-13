import { nanoid } from "nanoid";
import type { MachineRow, RentalRow } from "./db.js";
import { db } from "./db.js";

export const MOONLIGHT_LINKS = {
  windows: "https://moonlight-stream.org/",
  android: "https://play.google.com/store/apps/details?id=com.limelight",
  ios: "https://apps.apple.com/app/moonlight-game-streaming/id1000551566",
  mac: "https://moonlight-stream.org/",
} as const;

export const STREAM_PORTS_NOTE =
  "TCP 47984, 47989, 48010 and UDP 5353, 47998-48010 to the host LAN IP (e.g. 192.168.1.3).";

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

  const localIp = rental.stream_local_ip?.trim() || null;
  const publicIp = rental.stream_public_ip?.trim() || null;
  const pairStatus = rental.stream_pair_status ?? "idle";
  const connectMode = rental.stream_connect_mode ?? "unknown";
  const portsOpen = rental.stream_ports_open === 1;
  const sunshineRunning = rental.stream_sunshine_running === 1;

  const recommendedIp =
    connectMode === "local" && localIp ? localIp : localIp ?? publicIp;

  const steps = [
    "Install Moonlight on your device (links below).",
    recommendedIp
      ? `In Moonlight → Add PC → enter only ${recommendedIp} (no :port suffix).`
      : "Waiting for host to report connection address…",
    "Moonlight shows a 4-digit PIN — enter it in the form below.",
    "After pairing, open Desktop in Moonlight.",
  ];

  if (localIp && publicIp) {
    steps.push(
      `Same WiFi: use ${localIp}. Away from host WiFi: use ${publicIp} only if the host router forwards ${STREAM_PORTS_NOTE}`
    );
  }

  let internetWarning: string | null = null;
  if (publicIp && connectMode === "local") {
    internetWarning = `The Internet address (${publicIp}) often fails without router port forwarding to ${localIp ?? "the host PC"}. Try Same WiFi first, or ask the host to forward streaming ports.`;
  } else if (rental.stream_status === "firewall_blocked") {
    internetWarning =
      "Host firewall is blocking Sunshine. The owner should re-run RUN-PCHUB.cmd on the gaming PC.";
  } else if (rental.stream_status === "sunshine_stopped") {
    internetWarning = "Sunshine is not running on the host PC. Re-run RUN-PCHUB.cmd on the gaming PC.";
  }

  return {
    status: rental.stream_status,
    localIp,
    publicIp,
    recommendedIp,
    host: recommendedIp,
    port: rental.stream_port || 47989,
    httpsPort: rental.stream_https_port || 47990,
    message: rental.stream_message,
    sunshineInstalled: rental.stream_sunshine_installed === 1,
    sunshineRunning,
    portsOpen,
    connectMode,
    updatedAt: rental.stream_updated_at,
    pairStatus,
    pairMessage: rental.stream_pair_message,
    internetWarning,
    moonlightLinks: MOONLIGHT_LINKS,
    steps,
  };
}
