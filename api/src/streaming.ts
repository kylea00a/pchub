import type { RentalRow } from "./db.js";

export const MOONLIGHT_LINKS = {
  windows: "https://moonlight-stream.org/",
  android: "https://play.google.com/store/apps/details?id=com.limelight",
  ios: "https://apps.apple.com/app/moonlight-game-streaming/id1000551566",
  mac: "https://moonlight-stream.org/",
} as const;

export function formatConnectInfo(rental: RentalRow) {
  if (rental.status !== "active") {
    return null;
  }

  const host =
    rental.stream_public_ip?.trim() ||
    rental.stream_local_ip?.trim() ||
    null;

  return {
    status: rental.stream_status,
    localIp: rental.stream_local_ip,
    publicIp: rental.stream_public_ip,
    host,
    port: rental.stream_port || 47989,
    httpsPort: rental.stream_https_port || 47990,
    pin: rental.stream_pin,
    message: rental.stream_message,
    sunshineInstalled: rental.stream_sunshine_installed === 1,
    updatedAt: rental.stream_updated_at,
    moonlightLinks: MOONLIGHT_LINKS,
    steps: [
      "Install Moonlight on your phone, tablet, or PC (links below).",
      host
        ? `Add PC: enter ${host} (port ${rental.stream_port || 47989}).`
        : "Waiting for host to report connection address…",
      "When Moonlight asks for a PIN, check the Sunshine window on the host PC or https://localhost:47990 on the gaming PC.",
      "For internet access (not same WiFi), the host must forward UDP/TCP ports 47984, 47989, and 48010 on their router.",
    ],
  };
}
