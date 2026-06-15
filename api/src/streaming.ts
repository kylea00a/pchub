import type { RentalRow } from "./db.js";
import { db, type MachineRow } from "./db.js";
import { formatMoonlightConnect } from "./moonlight.js";

export function formatConnectInfo(rental: RentalRow) {
  const machine = db
    .prepare("SELECT * FROM machines WHERE id = ?")
    .get(rental.machine_id) as MachineRow | undefined;
  if (!machine) {
    return null;
  }
  return formatMoonlightConnect(rental, machine);
}
