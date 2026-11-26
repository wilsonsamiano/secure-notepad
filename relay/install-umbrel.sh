#!/usr/bin/env bash
# MavPad relay installer for umbrelOS (or any Linux box with Docker).
# Run in the Umbrel terminal (Settings > Advanced settings > Terminal > umbrelOS):
#   curl -fsSL https://raw.githubusercontent.com/wilsonsamiano/secure-notepad/main/relay/install-umbrel.sh | bash
# Options (put before "bash"):  RELAY_NAME=umbrel-2  PEERS=wss://other-umbrel.ts.net  PUBLIC=no
# Re-running it updates the relay and keeps its stored data.
set -euo pipefail
BRANCH="${MAVPAD_BRANCH:-main}"
DIR="${MAVPAD_DIR:-$HOME/mavpad-relay}"
NAME="${RELAY_NAME:-umbrel-1}"
MODE=funnel; [ "${PUBLIC:-yes}" = "no" ] && MODE=serve
say(){ printf '\n== %s\n' "$*"; }

say "Downloading the MavPad relay ($BRANCH) into $DIR"
mkdir -p "$DIR"
tmp=$(mktemp -d)
curl -fsSL "https://github.com/wilsonsamiano/secure-notepad/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$tmp"
cp "$tmp"/secure-notepad-*/relay/server.js "$tmp"/secure-notepad-*/relay/package.json \
   "$tmp"/secure-notepad-*/relay/Dockerfile "$tmp"/secure-notepad-*/relay/docker-compose.yml "$DIR"/
rm -rf "$tmp"
cd "$DIR"
if [ ! -f .env ]; then
  printf 'RELAY_NAME=%s\nPEERS=%s\nPEER_SECRET=%s\n' "$NAME" "${PEERS:-}" "${PEER_SECRET:-}" > .env
fi
mkdir -p data

say "Building and starting the relay (asks for your Umbrel password)"
sudo docker compose up -d --build

for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:8787/ | grep -q mavpad-relay; then break; fi
  sleep 1
done
curl -fs http://127.0.0.1:8787/ | grep -q mavpad-relay || { echo "The relay did not start. Logs:"; sudo docker logs --tail 30 mavpad-relay; exit 1; }
echo "Relay is running on this Umbrel (port 8787, local only). It restarts by itself after a reboot."

say "Publishing it with Tailscale ($MODE)"
TSC=$(sudo docker ps --format '{{.Names}}' | grep -i tailscale | head -1 || true)
if [ -n "$TSC" ]; then ts(){ sudo docker exec "$TSC" tailscale "$@"; }
elif command -v tailscale >/dev/null 2>&1; then ts(){ sudo tailscale "$@"; }
else
  echo "Tailscale is not installed. Install the Tailscale app from the Umbrel App Store,"
  echo "open it and sign in, then run this command again."
  exit 1
fi
echo "If a login.tailscale.com link appears, open it and approve, then wait here."
if [ "$MODE" = funnel ]; then ts funnel --bg 8787; else ts serve --bg 8787; fi
HOST=$(ts status --json 2>/dev/null | grep -o '"DNSName": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/; s/\.$//')

say "Checking the public address"
ok=no
if [ -n "$HOST" ] && curl -fs -m 15 "https://$HOST/" | grep -q mavpad-relay; then ok=yes; fi
echo
echo "================================================================"
if [ -n "$HOST" ]; then
  echo " In MavPad: Settings > Relays > type this and press Add relay:"
  echo
  echo "     $HOST"
  echo
  [ "$ok" = yes ] && echo " Checked: the relay answers at https://$HOST/" \
                  || echo " Could not check it from here yet; try opening https://$HOST/ in a browser."
else
  echo " Tailscale did not report this machine's name. Open the Tailscale app on"
  echo " the Umbrel to see it (something like umbrel.your-tailnet.ts.net)."
fi
[ "$MODE" = funnel ] && echo " The address is public (Tailscale Funnel); the relay only holds ciphertext." \
                     || echo " The address works only on your Tailscale network."
echo "================================================================"
