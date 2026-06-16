/** Rental statuses that allow host streaming + WebRTC signaling. */
export const STREAMABLE_RENTAL_STATUSES = ["active", "admin_active"] as const;
export type StreamableRentalStatus = (typeof STREAMABLE_RENTAL_STATUSES)[number];

export function streamableStatusSql() {
  return `('active', 'admin_active')`;
}

export function isStreamableRentalStatus(status: string): status is StreamableRentalStatus {
  return (STREAMABLE_RENTAL_STATUSES as readonly string[]).includes(status);
}
