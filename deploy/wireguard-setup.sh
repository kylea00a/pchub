#!/usr/bin/env bash
# WireGuard relay for Moonlight/GameStream — run once on the Droplet (as root).
set -euo pipefail

WG_INTERFACE="${WG_INTERFACE:-wg-pchub}"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.66.66}"
WG_DIR="/etc/wireguard"
CONF="${WG_DIR}/${WG_INTERFACE}.conf"
SECRETS_FILE="${1:-/var/www/pchub/deploy/.production-secrets}"

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard wireguard-tools iptables

sysctl -w net.ipv4.ip_forward=1
grep -q 'net.ipv4.ip_forward=1' /etc/sysctl.conf 2>/dev/null || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

WAN_IF=$(ip -4 route show default | awk '{print $5; exit}')
if [ -z "$WAN_IF" ]; then
  echo "Could not detect WAN interface"
  exit 1
fi

mkdir -p "$WG_DIR"
chmod 700 "$WG_DIR"

if [ ! -f "$CONF" ]; then
  SERVER_PRIVATE=$(wg genkey)
  SERVER_PUBLIC=$(printf '%s' "$SERVER_PRIVATE" | wg pubkey)
  cat > "$CONF" <<EOF
[Interface]
Address = ${WG_SUBNET}.1/24
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIVATE}
PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${WAN_IF} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${WAN_IF} -j MASQUERADE
EOF
  chmod 600 "$CONF"
  echo "Created ${CONF}"
else
  SERVER_PUBLIC=$(grep -m1 '^PrivateKey' "$CONF" | awk '{print $3}' | wg pubkey)
fi

systemctl enable "wg-quick@${WG_INTERFACE}"
systemctl restart "wg-quick@${WG_INTERFACE}" || systemctl start "wg-quick@${WG_INTERFACE}"

STREAM_RELAY_HOST="${STREAM_RELAY_HOST:-165.22.242.51}"
WG_ENDPOINT="${STREAM_RELAY_HOST}:${WG_PORT}"

touch "$SECRETS_FILE"
grep -v '^WG_SERVER_PUBLIC_KEY=' "$SECRETS_FILE" > "${SECRETS_FILE}.tmp" 2>/dev/null || true
grep -v '^WG_ENDPOINT=' "$SECRETS_FILE".tmp > "${SECRETS_FILE}.tmp2" 2>/dev/null || true
grep -v '^STREAM_RELAY_HOST=' "${SECRETS_FILE}.tmp2" > "${SECRETS_FILE}.tmp3" 2>/dev/null || true
mv "${SECRETS_FILE}.tmp3" "$SECRETS_FILE"
rm -f "${SECRETS_FILE}.tmp" "${SECRETS_FILE}.tmp2"

{
  echo "WG_SERVER_PUBLIC_KEY=${SERVER_PUBLIC}"
  echo "WG_ENDPOINT=${WG_ENDPOINT}"
  echo "STREAM_RELAY_HOST=${STREAM_RELAY_HOST}"
} >> "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"

# GameStream ports for Moonlight (TCP + UDP)
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${WG_PORT}/udp" comment "PCHUB WireGuard" || true
  for p in 47984 47989 47990 48010; do
    ufw allow "${p}/tcp" comment "PCHUB GameStream" || true
    ufw allow "${p}/udp" comment "PCHUB GameStream" || true
  done
  for p in 47998 47999 48000; do
    ufw allow "${p}/udp" comment "PCHUB GameStream" || true
  done
fi

echo "WireGuard relay ready on ${WG_ENDPOINT}"
echo "Server public key: ${SERVER_PUBLIC}"
