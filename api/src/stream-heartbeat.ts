import { db, type RentalRow } from "./db.js";
import { streamableStatusSql } from "./rental-session.js";

function nowIso() {
  return new Date().toISOString();
}

/** Host heartbeats during an active rental — promote stream status without a separate POST. */
export function promoteStreamOnHostHeartbeat(machineId: string) {
  const rental = db
    .prepare(
      `SELECT * FROM rentals WHERE machine_id = ? AND status IN ${streamableStatusSql()} ORDER BY started_at DESC LIMIT 1`
    )
    .get(machineId) as RentalRow | undefined;

  if (!rental) return;

  if (rental.stream_sunshine_running === 1 && rental.stream_status === "ready") {
    return;
  }

  db.prepare(
    `UPDATE rentals SET
      stream_status = 'starting',
      stream_message = 'Host is starting the stream engine for this rental...',
      stream_sunshine_installed = 1,
      stream_sunshine_running = 0,
      stream_ports_open = 0,
      stream_connect_mode = COALESCE(stream_connect_mode, 'webrtc'),
      stream_updated_at = ?
    WHERE id = ?`
  ).run(nowIso(), rental.id);
}
