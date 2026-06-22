import type { WebSocket } from "ws";

export type SignalRole = "host" | "renter" | "admin";

export type SignalConn = {
  ws: WebSocket;
  role: SignalRole;
  rentalId: string;
  machineId?: string;
  userId?: string;
};

export type SignalRoom = {
  host?: SignalConn;
  renter?: SignalConn;
};

const SIGNAL_ROOMS = new Map<string, SignalRoom>();

export function getSignalRoom(rentalId: string): SignalRoom {
  const existing = SIGNAL_ROOMS.get(rentalId);
  if (existing) return existing;
  const created: SignalRoom = {};
  SIGNAL_ROOMS.set(rentalId, created);
  return created;
}

export function getSignalRoomStatus(rentalId: string) {
  const room = SIGNAL_ROOMS.get(rentalId);
  return {
    hostInRoom: !!room?.host,
    renterInRoom: !!room?.renter,
  };
}

export function otherSignalPeer(room: SignalRoom, role: SignalRole) {
  if (role === "host") return room.renter?.ws;
  return room.host?.ws;
}

export function isClientSignalRole(role: SignalRole) {
  return role === "renter" || role === "admin";
}

export function clearSignalPeer(rentalId: string, conn: SignalConn, ws: WebSocket) {
  const room = SIGNAL_ROOMS.get(rentalId);
  if (!room) return null;
  if (conn.role === "host" && room.host?.ws === ws) room.host = undefined;
  if (isClientSignalRole(conn.role) && room.renter?.ws === ws) room.renter = undefined;
  if (!room.host && !room.renter) SIGNAL_ROOMS.delete(rentalId);
  return room;
}

export function getSignalRoomMap() {
  return SIGNAL_ROOMS;
}
