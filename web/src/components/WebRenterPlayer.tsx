"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { prepareBrowserStream } from "@/lib/api";
import { getToken } from "@/lib/auth-session";
import { BrowserInputCapture } from "@/lib/webrtc/browser-input";
import { PchubStreamSession } from "@/lib/webrtc/stream-session";

type Props = {
  rentalId: string;
  machineName?: string;
};

export function WebRenterPlayer({ rentalId, machineName }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PchubStreamSession | null>(null);
  const inputRef = useRef<BrowserInputCapture | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("Idle");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`]);
  }, []);

  const disconnect = useCallback(() => {
    inputRef.current?.detach();
    inputRef.current = null;
    sessionRef.current?.dispose();
    sessionRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    mediaStreamRef.current = null;
    setConnected(false);
    setConnecting(false);
    setStatus("Disconnected");
  }, []);

  const connect = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Log in at pchub.cloud first.");
      return;
    }

    setError(null);
    setConnecting(true);
    setStatus("Preparing…");
    disconnect();

    try {
      const prep = await prepareBrowserStream(rentalId);
      const webrtc = prep.webrtc;
      appendLog(prep.message ?? "Starting browser stream…");

      const session = new PchubStreamSession(
        prep.rentalId,
        token,
        webrtc.signalUrl,
        webrtc.iceServers.length > 0
          ? webrtc.iceServers
          : webrtc.stunServers.map((url) => ({ urls: url })),
        {
          onLog: appendLog,
          onConnectionState: (state) => {
            setStatus(state);
            if (state === "connected") {
              setConnected(true);
              setConnecting(false);
            }
            if (state === "failed" || state === "closed") {
              setConnected(false);
              setConnecting(false);
            }
          },
          onVideoStream: (stream) => {
            if (!mediaStreamRef.current) {
              mediaStreamRef.current = stream;
            } else {
              for (const track of stream.getTracks()) {
                if (!mediaStreamRef.current.getTracks().some((t) => t.id === track.id)) {
                  mediaStreamRef.current.addTrack(track);
                }
              }
            }
            const video = videoRef.current;
            if (video && mediaStreamRef.current) {
              video.srcObject = mediaStreamRef.current;
              void video.play().catch(() => {});
              const track = mediaStreamRef.current.getVideoTracks()[0];
              if (track) {
                const settings = track.getSettings();
                const w = settings.width ?? video.videoWidth;
                const h = settings.height ?? video.videoHeight;
                if (w && h) inputRef.current?.setStreamSize(w, h);
              }
            }
          },
          onInputChannel: (channel) => {
            const surface = surfaceRef.current;
            if (!surface) return;
            if (!inputRef.current) inputRef.current = new BrowserInputCapture();
            inputRef.current.attach(surface, channel);
            inputRef.current.focus();
            appendLog("Click the video to capture keyboard and mouse.");
          },
        }
      );

      sessionRef.current = session;
      setStatus("Connecting signaling…");
      await session.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
      setConnecting(false);
      setStatus("Error");
      disconnect();
    }
  }, [appendLog, disconnect, rentalId]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onResize = () => {
      if (video.videoWidth && video.videoHeight) {
        inputRef.current?.setStreamSize(video.videoWidth, video.videoHeight);
      }
    };
    video.addEventListener("loadedmetadata", onResize);
    video.addEventListener("resize", onResize);
    return () => {
      video.removeEventListener("loadedmetadata", onResize);
      video.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0c] text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">
            PCHUB Browser Renter
          </p>
          <h1 className="text-sm font-medium">{machineName ?? "Remote session"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {status}
          </span>
          <Link
            href="/dashboard"
            className="pchub-btn-ghost px-3 py-1.5 text-[10px]"
          >
            Back
          </Link>
          {connected ? (
            <button
              type="button"
              onClick={disconnect}
              className="border border-red-500/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-red-400"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              disabled={connecting}
              onClick={() => void connect()}
              className="pchub-btn-primary px-3 py-1.5 text-[10px] disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="relative flex flex-1 items-center justify-center p-4">
        <div
          ref={surfaceRef}
          className="relative max-h-[calc(100vh-10rem)] w-full max-w-6xl overflow-hidden border border-border bg-black outline-none focus:border-accent/50"
          style={{ aspectRatio: "16 / 9" }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-full w-full object-contain"
          />
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-muted">
              {connecting ? "Waiting for host stream…" : "Click Connect to start"}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-border px-4 py-2">
        <p className="text-[10px] text-muted">
          Works in Chrome, Safari, and Edge on Mac and Windows. Right-click hold enables relative
          mouse for games.
        </p>
        {log.length > 0 && (
          <pre className="mt-2 max-h-24 overflow-y-auto font-mono text-[10px] text-muted">
            {log.join("\n")}
          </pre>
        )}
      </footer>
    </div>
  );
}
