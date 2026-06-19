export type SignalMessage =
  | { type: "joined"; role: string; rentalId: string }
  | { type: "peer"; status: string; role?: string }
  | { type: "offer"; sdp: string; from?: string }
  | { type: "answer"; sdp: string; from?: string }
  | { type: "ice"; candidate: IcePayload; from?: string }
  | { type: "error"; error: string; status?: number };

export type IcePayload = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

export class SignalingClient {
  private ws: WebSocket | null = null;
  private onMessage?: (msg: SignalMessage) => void;
  private onLog?: (line: string) => void;

  constructor(
    private readonly signalUrl: string,
    private readonly rentalId: string,
    private readonly token: string
  ) {}

  setHandlers(handlers: {
    onMessage?: (msg: SignalMessage) => void;
    onLog?: (line: string) => void;
  }) {
    this.onMessage = handlers.onMessage;
    this.onLog = handlers.onLog;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.signalUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.log(`Connected ${this.signalUrl}`);
        ws.send(
          JSON.stringify({
            type: "join",
            role: "renter",
            rentalId: this.rentalId,
            token: this.token,
          })
        );
        this.log("Joined as renter");
        resolve();
      };

      ws.onerror = () => reject(new Error("Signaling connection failed"));
      ws.onclose = () => this.log("Signaling closed");

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as SignalMessage;
          this.onMessage?.(msg);
        } catch {
          this.log("Bad signal message");
        }
      };
    });
  }

  sendOffer(sdp: string) {
    this.send({ type: "offer", sdp });
  }

  sendAnswer(sdp: string) {
    this.send({ type: "answer", sdp });
  }

  sendIce(candidate: IcePayload) {
    this.send({ type: "ice", candidate });
  }

  private send(payload: object) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private log(line: string) {
    this.onLog?.(line);
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}
