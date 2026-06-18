import type { MachineRow, RentalRow } from "./db.js";

export function formatPchubConnect(rental: RentalRow, _machine: MachineRow) {
  if (rental.status !== "active") {
    return null;
  }

  const streamHostInstalled = rental.stream_sunshine_installed === 1;
  const streamHostRunning = rental.stream_sunshine_running === 1;
  const connectMode = rental.stream_connect_mode || "webrtc";

  const streamReady = streamHostInstalled && streamHostRunning;
  const ready = streamReady;

  let message = rental.stream_message;
  if (!streamHostInstalled) {
    message = "Host is updating — PCHUB StreamHost not installed yet. Reinstall from pchub.cloud/host.";
  } else if (!streamHostRunning) {
    message = "Host is starting the stream engine for this rental…";
  } else if (!message) {
    message = "Ready — open PCHUB Renter and click Connect.";
  }

  const steps = [
    "Download and install PCHUB Renter (Windows).",
    "Log in with your pchub.cloud account.",
    "Start your rental, then click Connect in the renter app.",
    "Click the video panel to capture keyboard and mouse.",
  ];

  return {
    provider: "pchub" as const,
    status: ready ? "ready" : rental.stream_status || "pending",
    connectMode,
    message,
    streamHostInstalled,
    streamHostRunning,
    ready,
    streamReady,
    updatedAt: rental.stream_updated_at,
    steps,
  };
}
