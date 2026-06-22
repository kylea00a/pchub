import { INPUT_CHANNEL_LABEL } from "./input-protocol";
import { IcePayload, SignalingClient, SignalMessage } from "./signaling-client";

function normalizeRemoteIceCandidate(payload: IcePayload): RTCIceCandidateInit | null {
  let line = payload.candidate?.trim();
  if (!line) return null;

  if (line.startsWith("a=")) line = line.slice(2);
  if (!line.startsWith("candidate:")) {
    if (line.includes(" typ ")) line = `candidate:${line}`;
    else return null;
  }

  const init: RTCIceCandidateInit = { candidate: line };
  const mid = payload.sdpMid?.trim();
  if (mid) {
    init.sdpMid = mid;
    if (payload.sdpMLineIndex != null && payload.sdpMLineIndex >= 0) {
      init.sdpMLineIndex = Number(payload.sdpMLineIndex);
    }
  }
  return init;
}

async function addIceCandidateSafe(
  pc: RTCPeerConnection,
  init: RTCIceCandidateInit
): Promise<void> {
  try {
    await pc.addIceCandidate(init);
    return;
  } catch {
    if (!init.candidate) throw new Error("missing candidate");
    await pc.addIceCandidate({ candidate: init.candidate });
  }
}

export type IceServerConfig = {
  urls: string;
  username?: string;
  credential?: string;
};

export type StreamSessionHandlers = {
  onLog?: (line: string) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onVideoStream?: (stream: MediaStream) => void;
  onInputChannel?: (channel: RTCDataChannel) => void;
  onSignalingJoined?: () => void;
  onPeerJoined?: (role: string) => void;
  onPeerLeft?: (role: string) => void;
};

export class PchubStreamSession {
  private pc: RTCPeerConnection | null = null;
  private signal: SignalingClient | null = null;
  private negotiationStarted = false;
  private inputChannel: RTCDataChannel | null = null;
  private disposed = false;
  private pendingRemoteIce: RTCIceCandidateInit[] = [];

  constructor(
    private readonly rentalId: string,
    private readonly token: string,
    private readonly signalUrl: string,
    private readonly iceServers: IceServerConfig[],
    private readonly handlers: StreamSessionHandlers = {}
  ) {}

  private pendingPeerJoin = false;

  async start(): Promise<void> {
    this.setupPeer();
    this.signal = new SignalingClient(this.signalUrl, this.rentalId, this.token);
    this.signal.setHandlers({
      onLog: (line) => this.log(line),
      onMessage: (msg) => this.handleSignal(msg),
    });
    await this.signal.connect();
    if (this.pendingPeerJoin && !this.negotiationStarted) {
      this.pendingPeerJoin = false;
      this.negotiationStarted = true;
      void this.startNegotiation();
    }
  }

  private setupPeer() {
    const servers: RTCIceServer[] = this.iceServers.map((s) => ({
      urls: s.urls,
      username: s.username,
      credential: s.credential,
    }));

    this.pc = new RTCPeerConnection({ iceServers: servers });

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState ?? "closed";
      this.log(`WebRTC: ${state}`);
      this.handlers.onConnectionState?.(state);
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState ?? "closed";
      this.log(`ICE: ${state}`);
    };

    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || !this.signal) return;
      this.signal.sendIce({
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      });
    };

    this.pc.ontrack = (ev) => {
      if (ev.track.kind === "video" || ev.track.kind === "audio") {
        this.handlers.onVideoStream?.(ev.streams[0] ?? new MediaStream([ev.track]));
      }
    };

    this.inputChannel = this.pc.createDataChannel(INPUT_CHANNEL_LABEL);
    this.wireInputChannel(this.inputChannel);

    this.pc.addTransceiver("video", { direction: "recvonly" });
    this.pc.addTransceiver("audio", { direction: "recvonly" });
  }

  private wireInputChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      this.log("Input channel open");
      this.handlers.onInputChannel?.(channel);
    };
    channel.onclose = () => this.log("Input channel closed");
  }

  private handleSignal(msg: SignalMessage) {
    if (msg.type === "joined") {
      this.log(`Signaling joined (${msg.role ?? "renter"})`);
      this.handlers.onSignalingJoined?.();
      return;
    }
    if (msg.type === "peer" && msg.status === "joined" && !this.negotiationStarted) {
      if (!this.pc) {
        this.pendingPeerJoin = true;
        this.log("Host is ready — starting WebRTC…");
        this.handlers.onPeerJoined?.(msg.role ?? "host");
        return;
      }
      this.negotiationStarted = true;
      this.handlers.onPeerJoined?.(msg.role ?? "host");
      void this.startNegotiation();
      return;
    }
    if (msg.type === "peer" && msg.status === "left") {
      this.log(`Peer left (${msg.role ?? "host"})`);
      this.handlers.onPeerLeft?.(msg.role ?? "host");
      return;
    }
    if (msg.type === "answer" && msg.sdp) {
      void this.applyAnswer(msg.sdp);
      return;
    }
    if (msg.type === "ice" && msg.candidate) {
      void this.addRemoteIce(msg.candidate);
    }
    if (msg.type === "error") {
      this.log(`Signal error: ${msg.error}`);
    }
  }

  private async startNegotiation() {
    if (!this.pc || !this.signal) return;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (offer.sdp) {
        this.signal.sendOffer(offer.sdp);
        this.log("Sent WebRTC offer");
      }
    } catch (err) {
      this.log(`Offer failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  private async applyAnswer(sdp: string) {
    if (!this.pc) return;
    try {
      await this.pc.setRemoteDescription({ type: "answer", sdp });
      this.log("Applied remote answer");
      await this.flushPendingRemoteIce();
    } catch (err) {
      this.log(`Answer failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  private async flushPendingRemoteIce() {
    if (!this.pc) return;
    const queued = this.pendingRemoteIce.splice(0);
    let applied = 0;
    for (const candidate of queued) {
      try {
        await addIceCandidateSafe(this.pc, candidate);
        applied++;
      } catch (err) {
        this.log(`ICE add failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }
    if (applied > 0) {
      this.log(`Applied ${applied} queued ICE candidate(s)`);
    }
  }

  private async addRemoteIce(candidate: IcePayload) {
    if (!this.pc) return;
    const init = normalizeRemoteIceCandidate(candidate);
    if (!init) return;
    if (!this.pc.remoteDescription) {
      this.pendingRemoteIce.push(init);
      return;
    }
    try {
      await addIceCandidateSafe(this.pc, init);
    } catch (err) {
      this.log(`ICE add failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  private log(line: string) {
    this.handlers.onLog?.(line);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.inputChannel?.close();
    } catch {
      // ignore
    }
    try {
      this.pc?.close();
    } catch {
      // ignore
    }
    this.signal?.close();
    this.pendingRemoteIce = [];
    this.pc = null;
    this.signal = null;
    this.inputChannel = null;
  }
}
