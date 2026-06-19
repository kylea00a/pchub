export const INPUT_CHANNEL_LABEL = "pchub-input";

export const OpMouseMove = 1;
export const OpMouseDown = 2;
export const OpMouseUp = 3;
export const OpMouseWheel = 4;
export const OpKeyDown = 5;
export const OpKeyUp = 6;
export const OpMouseRelMove = 7;
export const OpMouseRelOn = 8;
export const OpMouseRelOff = 9;

function writeF32(view: DataView, offset: number, value: number) {
  view.setFloat32(offset, value, true);
}

function writeI16(view: DataView, offset: number, value: number) {
  view.setInt16(offset, value, true);
}

export function mouseMove(nx: number, ny: number): Uint8Array {
  const buf = new ArrayBuffer(9);
  const view = new DataView(buf);
  view.setUint8(0, OpMouseMove);
  writeF32(view, 1, nx);
  writeF32(view, 5, ny);
  return new Uint8Array(buf);
}

export function mouseButton(button: number, down: boolean): Uint8Array {
  return new Uint8Array([down ? OpMouseDown : OpMouseUp, button]);
}

export function mouseWheel(delta: number): Uint8Array {
  const buf = new ArrayBuffer(3);
  const view = new DataView(buf);
  view.setUint8(0, OpMouseWheel);
  writeI16(view, 1, delta);
  return new Uint8Array(buf);
}

export function mouseRelMode(enabled: boolean): Uint8Array {
  return new Uint8Array([enabled ? OpMouseRelOn : OpMouseRelOff]);
}

export function mouseRelMove(dx: number, dy: number): Uint8Array {
  const buf = new ArrayBuffer(5);
  const view = new DataView(buf);
  view.setUint8(0, OpMouseRelMove);
  writeI16(view, 1, dx);
  writeI16(view, 3, dy);
  return new Uint8Array(buf);
}

export function keyEvent(scanCode: number, down: boolean, extended = false): Uint8Array {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint8(0, down ? OpKeyDown : OpKeyUp);
  view.setUint16(1, scanCode, true);
  view.setUint8(3, extended ? 1 : 0);
  return new Uint8Array(buf);
}

export function sendInput(channel: RTCDataChannel | null, packet: Uint8Array) {
  if (!channel || channel.readyState !== "open") return;
  try {
    const copy = new Uint8Array(packet.byteLength);
    copy.set(packet);
    channel.send(copy.buffer);
  } catch {
    // channel closed
  }
}
