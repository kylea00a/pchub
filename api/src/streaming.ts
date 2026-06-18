import type { RentalRow } from "./db.js";
import { db, type MachineRow } from "./db.js";
import { formatPchubConnect } from "./pchub-connect.js";

export function formatConnectInfo(rental: RentalRow) {
  const machine = db
    .prepare("SELECT * FROM machines WHERE id = ?")
    .get(rental.machine_id) as MachineRow | undefined;
  if (!machine) {
    return null;
  }
  return formatPchubConnect(rental, machine);
}
