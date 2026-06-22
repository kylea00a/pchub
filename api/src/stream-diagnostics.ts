import { db, type MachineRow, type RentalRow } from "./db.js";
import { getSignalRoomStatus } from "./signal-rooms.js";
import { getStreamWakeState } from "./stream-signaling.js";

export type StreamDiagnosticCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type StreamDiagnostics = {
  rentalId: string;
  machineId: string;
  machineName: string;
  rentalStatus: string;
  host: {
    online: boolean;
    lastSeenSecondsAgo: number | null;
    status: string;
  };
  stream: {
    status: string;
    message: string | null;
    streamHostInstalled: boolean;
    streamHostRunning: boolean;
    updatedAt: string | null;
  };
  signaling: {
    hostInRoom: boolean;
    renterInRoom: boolean;
  };
  checks: StreamDiagnosticCheck[];
  hint: string;
};

function secondsSince(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 1000));
}

export function buildStreamDiagnostics(rental: RentalRow, machine: MachineRow): StreamDiagnostics {
  const lastSeenSecondsAgo = secondsSince(machine.last_seen_at);
  const hostOnline = lastSeenSecondsAgo != null && lastSeenSecondsAgo < 90;
  const streamHostInstalled = rental.stream_sunshine_installed === 1;
  const signaling = getSignalRoomStatus(rental.id);
  const streamHostRunning = signaling.hostInRoom;
  const wake = getStreamWakeState(rental.id);

  const checks: StreamDiagnosticCheck[] = [
    {
      id: "rental_active",
      label: "Rental session active",
      ok: rental.status === "active",
      detail: rental.status === "active" ? "Active" : `Status: ${rental.status}`,
    },
    {
      id: "host_online",
      label: "Host PC online (heartbeat)",
      ok: hostOnline,
      detail: hostOnline
        ? `Last seen ${lastSeenSecondsAgo}s ago`
        : lastSeenSecondsAgo != null
          ? `Last seen ${lastSeenSecondsAgo}s ago (stale)`
          : "No heartbeat recorded",
    },
    {
      id: "stream_host_installed",
      label: "StreamHost installed on host",
      ok: streamHostInstalled,
      detail: streamHostInstalled
        ? "Host reported PCHUB-StreamHost.exe"
        : "Host has not reported StreamHost yet",
    },
    {
      id: "host_signaling",
      label: "Host joined signaling room",
      ok: signaling.hostInRoom,
      detail: signaling.hostInRoom
        ? "PCHUB-StreamHost is connected to WebRTC signaling"
        : "Waiting for host to start PCHUB-StreamHost.exe",
    },
    {
      id: "renter_signaling",
      label: "Your browser in signaling room",
      ok: signaling.renterInRoom,
      detail: signaling.renterInRoom
        ? "Browser connected as renter"
        : "Click Connect to join signaling",
    },
    {
      id: "stream_ready",
      label: "Stream engine ready",
      ok: streamHostRunning,
      detail: streamHostRunning
        ? "Host is in signaling and ready for WebRTC"
        : wake.renterWaiting
          ? "Renter is waiting - wake signal sent to host agent"
          : "StreamHost not in signaling room",
    },
    {
      id: "wake_requested",
      label: "Wake signal sent to host",
      ok: !wake.renterWaiting || wake.streamWakeRequested,
      detail: wake.streamWakeRequested
        ? "Host agent should restart StreamHost on next poll"
        : wake.renterWaiting
          ? "Sending wake signal..."
          : "Not needed",
    },
  ];

  let hint = "All checks passed - WebRTC should connect shortly.";
  if (rental.status !== "active") {
    hint = "This rental is not active. Power on the PC from your dashboard first.";
  } else if (!hostOnline) {
    hint =
      "Host PC is offline. On the gaming PC, open PCHUB Host Status (or re-run RUN-PCHUB.cmd as Administrator).";
  } else if (!streamHostInstalled) {
    hint =
      "Host is online but StreamHost is missing. On the gaming PC: download a fresh zip from pchub.cloud/host, extract to C:\\PCHUB-Host, run RUN-PCHUB.cmd as Administrator.";
  } else if (!signaling.hostInRoom) {
    hint = wake.streamWakeRequested
      ? "Wake signal sent to host PC - StreamHost should restart within 10s. If still stuck after 30s, on the gaming PC run C:\\PCHUB-Host\\repair-streaming.ps1 as Administrator."
      : "Host agent is online but StreamHost has not joined signaling. On the gaming PC, open PowerShell as Administrator in C:\\PCHUB-Host and run: .\\repair-streaming.ps1";
  } else if (!signaling.renterInRoom) {
    hint = "Click Connect in this browser to join the signaling room.";
  } else if (signaling.hostInRoom && signaling.renterInRoom) {
    hint =
      "Both sides are in signaling. If video does not start, click Disconnect then Connect again. Check firewall on the host PC.";
  }

  return {
    rentalId: rental.id,
    machineId: machine.id,
    machineName: machine.name,
    rentalStatus: rental.status,
    host: {
      online: hostOnline,
      lastSeenSecondsAgo,
      status: machine.status,
    },
    stream: {
      status: rental.stream_status ?? "unknown",
      message: rental.stream_message,
      streamHostInstalled,
      streamHostRunning,
      updatedAt: rental.stream_updated_at,
    },
    signaling,
    checks,
    hint,
  };
}

export function getStreamDiagnosticsForRental(rentalId: string, renterProfileId: string) {
  const rental = db
    .prepare("SELECT * FROM rentals WHERE id = ? AND renter_profile_id = ?")
    .get(rentalId, renterProfileId) as RentalRow | undefined;
  if (!rental) return null;

  const machine = db
    .prepare("SELECT * FROM machines WHERE id = ?")
    .get(rental.machine_id) as MachineRow | undefined;
  if (!machine) return null;

  return buildStreamDiagnostics(rental, machine);
}
