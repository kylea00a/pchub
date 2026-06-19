/** Route WebRTC signaling through the same site origin when on pchub.cloud. */
export function normalizeSignalUrl(signalUrl: string): string {
  if (typeof window === "undefined") return signalUrl;
  try {
    const target = new URL(signalUrl);
    const site = window.location;
    if (site.protocol !== "https:" && site.protocol !== "http:") return signalUrl;
    if (!site.hostname.endsWith("pchub.cloud")) return signalUrl;
    const proto = site.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${site.host}${target.pathname}`;
  } catch {
    return signalUrl;
  }
}
