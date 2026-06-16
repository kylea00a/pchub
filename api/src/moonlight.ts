import type { MachineRow, RentalRow } from "./db.js";

export const MOONLIGHT_LINKS = {
  windows: "https://moonlight-stream.org/downloads/",
  android: "https://play.google.com/store/apps/details?id=com.limelight",
  ios: "https://apps.apple.com/app/moonlight-game-streaming/id1000551566",
  mac: "https://moonlight-stream.org/downloads/",
} as const;

export function formatMoonlightConnect(rental: RentalRow, machine: MachineRow) {
  if (rental.status !== "active") {
    return null;
  }

  const localIp = rental.stream_local_ip?.trim() || null;
  const publicIp = rental.stream_public_ip?.trim() || null;
  const port = rental.stream_port || 47989;
  const installed = rental.stream_sunshine_installed === 1;
  const running = rental.stream_sunshine_running === 1;
  const portsOpen = rental.stream_ports_open === 1;
  const connectMode = rental.stream_connect_mode || "pending";
  const pairStatus = rental.stream_pair_status || "idle";
  const paired = pairStatus === "paired";

  let recommendedHost: string | null = null;
  let message = rental.stream_message;

  if (publicIp && portsOpen) {
    recommendedHost = publicIp;
    if (!message) {
      message =
        "Add your host public IP in Moonlight (IP only, no :port). Make sure your router port forwarding is set up.";
    }
  } else if (localIp && rental.stream_status === "ready_local") {
    recommendedHost = localIp;
    if (!message) {
      message = `Same WiFi: use ${localIp} in Moonlight. For internet, set router port forwarding first.`;
    }
  }

  const streamReady =
    installed &&
    running &&
    portsOpen &&
    Boolean(recommendedHost) &&
    (rental.stream_status === "ready" || rental.stream_status === "ready_local");

  const ready = streamReady && paired;

  const steps = [
    "Install Moonlight on your phone, Mac, or PC (free).",
    recommendedHost
      ? `In Moonlight, Add PC → enter ${recommendedHost} (no port number).`
      : "Waiting for host PC to finish Sunshine setup…",
    "Moonlight shows a 4-digit PIN — enter it below to pair.",
    "Tap the desktop in Moonlight to stream. Optimized for games (H.264/HEVC).",
  ];

  if (!installed) {
    message = "Host PC is installing Sunshine for low-latency streaming…";
  } else if (!running || !portsOpen) {
    message =
      message ||
      "Waiting for internet access. Start Sunshine and set up router port forwarding for Moonlight ports.";
  } else if (!recommendedHost) {
    message = "Waiting for host public IP + port forwarding…";
  } else if (!paired && pairStatus === "pending") {
    message = "Enter the Moonlight PIN below to pair this session.";
  } else if (paired) {
    message = "Paired — open your desktop in Moonlight to play.";
  }

  return {
    provider: "moonlight" as const,
    status: ready ? "ready" : rental.stream_status || "pending",
    host: recommendedHost,
    port,
    localIp,
    publicIp,
    recommendedHost,
    connectMode,
    message,
    sunshineInstalled: installed,
    sunshineRunning: running,
    portsOpen,
    pairStatus,
    pairMessage: rental.stream_pair_message,
    ready,
    streamReady,
    updatedAt: rental.stream_updated_at,
    moonlightLinks: MOONLIGHT_LINKS,
    steps,
  };
}
