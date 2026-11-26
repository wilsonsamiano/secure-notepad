# MavPad relay

A small store-and-forward server for MavPad. Run one on each Umbrel. It keeps the
**encrypted** notes, chat, calendar and export history for every sync code, so a
device that was offline gets what it missed. It cannot read anything: records are
AES-256-GCM ciphertext made on the device, and the sync code never reaches the relay.
It does see record ids, kinds (note/chat/event…), timestamps and sizes.

- Clients write to **every** relay they know, and the relays copy to each other
  (`PEERS`). If one Umbrel is down, the other keeps serving. When it comes back, the
  other relay and the devices fill it in.
- Data lives in `./data/<room>/`, one file per record (ciphertext only).
- Conflict rule: newest write wins; on a tie a delete wins.

## Quick start on a Windows laptop

1. Install Node.js (LTS) from nodejs.org and Tailscale from tailscale.com, and sign in to Tailscale.
2. Download this repository (green **Code** button → **Download ZIP**) and extract it.
3. Open the `relay` folder and double-click **`start-relay-windows.cmd`**. It installs the relay on
   first run, publishes it with Tailscale Funnel (a public HTTPS address, so devices that are not on
   your tailnet can reach it too), and prints the address to add in MavPad.

Keep the window open; closing it stops the relay. The relay only stores ciphertext.

## Run it on an Umbrel

SSH into the Umbrel (`ssh umbrel@umbrel.local`), copy this `relay/` folder over, then:

```bash
cd relay
```

Edit `docker-compose.yml`: set `RELAY_NAME` (for example `umbrel-1`), and set `PEERS` to the
**other** Umbrel's relay address. Then start it:

```bash
sudo docker compose up -d --build
```

Do the same on the second Umbrel, with `RELAY_NAME: umbrel-2` and `PEERS` pointing back at the first one.

## Publish it on your tailnet (HTTPS)

MavPad is served over https, so browsers only allow `wss://` relays. Tailscale Serve
gives the relay a real certificate on your tailnet name. Turn on MagicDNS and HTTPS
certificates in the Tailscale admin console (DNS page) once. Then, on each Umbrel:

```bash
sudo docker ps --format '{{.Names}}' | grep -i tailscale
```

```bash
sudo docker exec -it <that-container-name> tailscale serve --bg --https=443 http://127.0.0.1:8787
```

(The Umbrel Tailscale app uses host networking, so `127.0.0.1:8787` is the relay.
If Tailscale is installed directly on the host instead, run `sudo tailscale serve --bg --https=443 http://127.0.0.1:8787`.)

To let devices that are **not** on your tailnet reach it (for example a teammate without the
Tailscale app), use `tailscale funnel --bg 8787` instead of `tailscale serve`: it publishes the same
HTTPS address on the public internet. The relay only holds ciphertext.

Check it from a device on the tailnet: `https://umbrel-1.<your-tailnet>.ts.net/`
should return `{"app":"mavpad-relay",...}`.

## Add it in MavPad

Settings → **Relays** → enter `umbrel-1.<your-tailnet>.ts.net` → **Add relay**, then the
second one. The first one added becomes the main relay and the second a backup. The list
syncs to every device on the same sync code. Devices must be on the tailnet (Tailscale app
on the phone) to reach the relays. Chrome may ask to allow access to devices on your local
network the first time. Allow it.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 8787 | listen port |
| `RELAY_NAME` | hostname | shown in logs and status |
| `PEERS` | (none) | comma-separated `wss://` URLs of the other relay(s) |
| `PEER_SECRET` | (none) | if set, other relays must send the same secret to copy rooms. Set the same value on both. |
| `DATA_DIR` | `./data` | where ciphertext is stored |

Limits: 16 MB per record (a note with pictures), 1 GB per sync code.
