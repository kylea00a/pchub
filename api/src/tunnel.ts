import { execSync } from "node:child_process";
import { db, type MachineRow } from "./db.js";

const WG_INTERFACE = process.env.WG_INTERFACE || "wg-pchub";
const WG_SUBNET = process.env.WG_SUBNET || "10.66.66";
const WG_SERVER_IP = `${WG_SUBNET}.1`;
const STREAM_RELAY_HOST = process.env.STREAM_RELAY_HOST || "165.22.242.51";

const GAMESTREAM_PORTS_TCP = [47984, 47989, 47990, 48010];
const GAMESTREAM_PORTS_UDP = [47998, 47999, 48000, 48010];

export function getStreamRelayHost() {
  return process.env.STREAM_RELAY_HOST?.trim() || STREAM_RELAY_HOST;
}

function wgAvailable() {
  try {
    execSync("wg --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function generateKeyPair() {
  const privateKey = execSync("wg genkey", { encoding: "utf8" }).trim();
  const publicKey = execSync(`printf '%s' '${privateKey}' | wg pubkey`, {
    encoding: "utf8",
    shell: "/bin/bash",
  }).trim();
  return { privateKey, publicKey };
}

function nextTunnelOctet() {
  const rows = db
    .prepare(
      `SELECT wg_tunnel_ip FROM machines WHERE wg_tunnel_ip IS NOT NULL ORDER BY wg_tunnel_ip`
    )
    .all() as { wg_tunnel_ip: string }[];

  const used = new Set(
    rows.map((r) => Number.parseInt(r.wg_tunnel_ip.split(".")[3] || "0", 10))
  );
  for (let i = 2; i < 254; i++) {
    if (!used.has(i)) return `${WG_SUBNET}.${i}`;
  }
  throw new Error("No free tunnel IPs");
}

export function ensureMachineTunnel(machine: MachineRow) {
  let privateKey = machine.wg_private_key;
  let publicKey = machine.wg_public_key;
  let tunnelIp = machine.wg_tunnel_ip;

  if (!privateKey || !publicKey || !tunnelIp) {
    if (!wgAvailable()) {
      return null;
    }
    const keys = generateKeyPair();
    privateKey = keys.privateKey;
    publicKey = keys.publicKey;
    tunnelIp = nextTunnelOctet();
    db.prepare(
      `UPDATE machines SET wg_private_key = ?, wg_public_key = ?, wg_tunnel_ip = ? WHERE id = ?`
    ).run(privateKey, publicKey, tunnelIp, machine.id);
  }

  return { privateKey, publicKey, tunnelIp };
}

export function machineTunnelReady(machine: MachineRow) {
  return recentHandshake(machine.wg_last_handshake_at);
}

function recentHandshake(last: string | null) {
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < 120_000;
}

export function buildClientTunnelConfig(machine: MachineRow) {
  const tunnel = ensureMachineTunnel(machine);
  if (!tunnel) {
    return null;
  }

  const serverPublicKey = process.env.WG_SERVER_PUBLIC_KEY?.trim();
  const endpoint = process.env.WG_ENDPOINT?.trim() || `${getStreamRelayHost()}:51820`;
  if (!serverPublicKey) {
    return null;
  }

  return `[Interface]
PrivateKey = ${tunnel.privateKey}
Address = ${tunnel.tunnelIp}/32
DNS = 1.1.1.1

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${endpoint}
AllowedIPs = ${WG_SERVER_IP}/32
PersistentKeepalive = 25
`;
}

export function applyTunnelPeer(machine: MachineRow) {
  if (!wgAvailable() || !machine.wg_public_key || !machine.wg_tunnel_ip) {
    return false;
  }
  try {
    execSync(
      `wg set ${WG_INTERFACE} peer ${machine.wg_public_key} allowed-ips ${machine.wg_tunnel_ip}/32`,
      { stdio: "ignore" }
    );
    return true;
  } catch {
    return false;
  }
}

export function enableStreamRelay(machine: MachineRow) {
  if (!machine.wg_tunnel_ip) return false;
  const hostIp = machine.wg_tunnel_ip;

  try {
    for (const port of GAMESTREAM_PORTS_TCP) {
      execSync(
        `iptables -t nat -C PREROUTING -p tcp --dport ${port} -j DNAT --to-destination ${hostIp}:${port} 2>/dev/null || ` +
          `iptables -t nat -A PREROUTING -p tcp --dport ${port} -j DNAT --to-destination ${hostIp}:${port}`,
        { shell: "/bin/bash" }
      );
      execSync(
        `iptables -t nat -C POSTROUTING -p tcp -d ${hostIp} --dport ${port} -j MASQUERADE 2>/dev/null || ` +
          `iptables -t nat -A POSTROUTING -p tcp -d ${hostIp} --dport ${port} -j MASQUERADE`,
        { shell: "/bin/bash" }
      );
    }
    for (const port of GAMESTREAM_PORTS_UDP) {
      execSync(
        `iptables -t nat -C PREROUTING -p udp --dport ${port} -j DNAT --to-destination ${hostIp}:${port} 2>/dev/null || ` +
          `iptables -t nat -A PREROUTING -p udp --dport ${port} -j DNAT --to-destination ${hostIp}:${port}`,
        { shell: "/bin/bash" }
      );
      execSync(
        `iptables -t nat -C POSTROUTING -p udp -d ${hostIp} --dport ${port} -j MASQUERADE 2>/dev/null || ` +
          `iptables -t nat -A POSTROUTING -p udp -d ${hostIp} --dport ${port} -j MASQUERADE`,
        { shell: "/bin/bash" }
      );
    }
    return true;
  } catch {
    return false;
  }
}

export function recordTunnelHandshake(machineId: string) {
  db.prepare(`UPDATE machines SET wg_last_handshake_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    machineId
  );
}
