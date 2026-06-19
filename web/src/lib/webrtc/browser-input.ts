import {
  keyEvent,
  mouseButton,
  mouseMove,
  mouseRelMode,
  mouseRelMove,
  mouseWheel,
  sendInput,
} from "./input-protocol";
import { scanCodeForKey } from "./scan-codes";

type Letterbox = {
  renderW: number;
  renderH: number;
  offsetX: number;
  offsetY: number;
};

function letterbox(
  containerW: number,
  containerH: number,
  streamW: number,
  streamH: number
): Letterbox {
  const streamAspect = streamW / streamH;
  const elemAspect = containerW / containerH;
  if (streamAspect > elemAspect) {
    const renderW = containerW;
    const renderH = containerW / streamAspect;
    return { renderW, renderH, offsetX: 0, offsetY: (containerH - renderH) / 2 };
  }
  const renderH = containerH;
  const renderW = containerH * streamAspect;
  return { renderW, renderH, offsetX: (containerW - renderW) / 2, offsetY: 0 };
}

function mapPointer(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  streamW: number,
  streamH: number
): { nx: number; ny: number } | null {
  if (streamW <= 0 || streamH <= 0) return null;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const box = letterbox(rect.width, rect.height, streamW, streamH);
  const x = localX - box.offsetX;
  const y = localY - box.offsetY;
  if (x < 0 || y < 0 || x > box.renderW || y > box.renderH) return null;
  return { nx: x / box.renderW, ny: y / box.renderH };
}

export class BrowserInputCapture {
  private channel: RTCDataChannel | null = null;
  private surface: HTMLElement | null = null;
  private streamW = 0;
  private streamH = 0;
  private relativeMouse = false;
  private lastX = 0;
  private lastY = 0;
  private enabled = false;

  private onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
  private onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
  private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
  private onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
  private onWheel = (e: WheelEvent) => this.handleWheel(e);
  private onContextMenu = (e: Event) => e.preventDefault();

  attach(surface: HTMLElement, channel: RTCDataChannel) {
    this.detach();
    this.surface = surface;
    this.channel = channel;
    this.enabled = true;
    surface.tabIndex = 0;
    surface.addEventListener("keydown", this.onKeyDown);
    surface.addEventListener("keyup", this.onKeyUp);
    surface.addEventListener("mousemove", this.onMouseMove);
    surface.addEventListener("mousedown", this.onMouseDown);
    surface.addEventListener("mouseup", this.onMouseUp);
    surface.addEventListener("wheel", this.onWheel, { passive: false });
    surface.addEventListener("contextmenu", this.onContextMenu);
  }

  detach() {
    this.enabled = false;
    this.relativeMouse = false;
    if (this.surface) {
      this.surface.removeEventListener("keydown", this.onKeyDown);
      this.surface.removeEventListener("keyup", this.onKeyUp);
      this.surface.removeEventListener("mousemove", this.onMouseMove);
      this.surface.removeEventListener("mousedown", this.onMouseDown);
      this.surface.removeEventListener("mouseup", this.onMouseUp);
      this.surface.removeEventListener("wheel", this.onWheel);
      this.surface.removeEventListener("contextmenu", this.onContextMenu);
    }
    this.surface = null;
    this.channel = null;
  }

  setStreamSize(width: number, height: number) {
    this.streamW = width;
    this.streamH = height;
  }

  focus() {
    this.surface?.focus();
  }

  private handleKey(e: KeyboardEvent, down: boolean) {
    if (!this.enabled || !this.channel) return;
    const mapped = scanCodeForKey(e.code);
    if (!mapped) return;
    e.preventDefault();
    sendInput(this.channel, keyEvent(mapped.scan, down, mapped.extended));
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.enabled || !this.channel || !this.surface) return;
    const rect = this.surface.getBoundingClientRect();

    if (this.relativeMouse) {
      const dx = Math.max(-32768, Math.min(32767, Math.round(e.movementX)));
      const dy = Math.max(-32768, Math.min(32767, Math.round(e.movementY)));
      if (dx !== 0 || dy !== 0) {
        sendInput(this.channel, mouseRelMove(dx, dy));
      }
      return;
    }

    const mapped = mapPointer(e.clientX, e.clientY, rect, this.streamW, this.streamH);
    if (!mapped) return;
    sendInput(this.channel, mouseMove(mapped.nx, mapped.ny));
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.enabled || !this.channel || !this.surface) return;
    e.preventDefault();
    this.focus();
    const rect = this.surface.getBoundingClientRect();
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (e.button === 2 && !this.relativeMouse) {
      this.relativeMouse = true;
      sendInput(this.channel, mouseRelMode(true));
    }

    const mapped = mapPointer(e.clientX, e.clientY, rect, this.streamW, this.streamH);
    if (mapped) sendInput(this.channel, mouseMove(mapped.nx, mapped.ny));
    sendInput(this.channel, mouseButton(e.button, true));
  }

  private handleMouseUp(e: MouseEvent) {
    if (!this.enabled || !this.channel) return;
    e.preventDefault();
    sendInput(this.channel, mouseButton(e.button, false));
    if (e.button === 2 && this.relativeMouse) {
      this.relativeMouse = false;
      sendInput(this.channel, mouseRelMode(false));
    }
  }

  private handleWheel(e: WheelEvent) {
    if (!this.enabled || !this.channel) return;
    e.preventDefault();
    const delta = Math.max(-32768, Math.min(32767, Math.round(-e.deltaY)));
    sendInput(this.channel, mouseWheel(delta));
  }
}
