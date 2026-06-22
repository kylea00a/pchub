import { db } from "./db.js";
import { getSignalRoomStatus } from "./signal-rooms.js";

function nowIso() {
  return new Date().toISOString();
}

/** Host joined the WebRTC signaling room — stream engine is actually live. */
export function markStreamReadyOnHostSignal(rentalId: string) {
  db.prepare(
    `UPDATE rentals SET
      stream_status = 'ready',
      stream_message = 'Ready - click Connect in browser or PCHUB Renter.',
      stream_sunshine_installed = 1,
      stream_sunshine_running = 1,
      stream_ports_open = 1,
      stream_connect_mode = COALESCE(stream_connect_mode, 'webrtc'),
      stream_wake_requested_at = NULL,
      stream_updated_at = ?
    WHERE id = ?`
  ).run(nowIso(), rentalId);
}

/** Host left signaling or crashed — clear stale running state. */
export function markStreamHostLeftSignal(rentalId: string) {
  db.prepare(
    `UPDATE rentals SET
      stream_status = 'starting',
      stream_message = 'Stream engine disconnected - restarting when renter connects...',
      stream_sunshine_running = 0,
      stream_ports_open = 0,
      stream_updated_at = ?
    WHERE id = ?`
  ).run(nowIso(), rentalId);
}

/** Renter joined signaling without host — poke host agent to start/restart StreamHost. */
export function requestStreamWakeOnRenterJoin(rentalId: string) {
  const signaling = getSignalRoomStatus(rentalId);
  if (signaling.hostInRoom) return;

  db.prepare(
    `UPDATE rentals SET
      stream_wake_requested_at = ?,
      stream_status = 'starting',
      stream_message = 'Renter waiting - host should start StreamHost...',
      stream_sunshine_running = 0,
      stream_ports_open = 0,
      stream_updated_at = ?
    WHERE id = ?`
  ).run(nowIso(), nowIso(), rentalId);
}

export function getStreamWakeState(rentalId: string) {
  const row = db
    .prepare(
      `SELECT stream_wake_requested_at, stream_sunshine_running FROM rentals WHERE id = ?`
    )
    .get(rentalId) as
    | { stream_wake_requested_at: string | null; stream_sunshine_running: number }
    | undefined;

  const signaling = getSignalRoomStatus(rentalId);
  return {
    renterWaiting: signaling.renterInRoom && !signaling.hostInRoom,
    hostInSignaling: signaling.hostInRoom,
    streamWakeRequested: !!row?.stream_wake_requested_at,
    streamWakeRequestedAt: row?.stream_wake_requested_at ?? null,
  };
}

/** Stream start directive for host heartbeat/session polling. */
export function getHostStreamDirective(machineId: string) {
  const rental = db
    .prepare(
      `SELECT id FROM rentals WHERE machine_id = ? AND status IN ('active') ORDER BY started_at DESC LIMIT 1`
    )
    .get(machineId) as { id: string } | undefined;
  if (!rental) return null;

  syncStreamRunningWithSignaling(rental.id);
  const wake = getStreamWakeState(rental.id);
  if (wake.hostInSignaling) return null;

  return {
    action: wake.renterWaiting || wake.streamWakeRequested ? ("restart" as const) : ("start" as const),
    rentalId: rental.id,
    renterWaiting: wake.renterWaiting,
    force: wake.renterWaiting || wake.streamWakeRequested,
  };
}

/** Keep DB in sync when host is not in signaling but DB says running. */
export function syncStreamRunningWithSignaling(rentalId: string) {
  const signaling = getSignalRoomStatus(rentalId);
  if (signaling.hostInRoom) return;

  const row = db
    .prepare(`SELECT stream_sunshine_running FROM rentals WHERE id = ?`)
    .get(rentalId) as { stream_sunshine_running: number } | undefined;
  if (row?.stream_sunshine_running === 1) {
    markStreamHostLeftSignal(rentalId);
  }
}
