'use strict';
/*
 * MavPad relay — store-and-forward for encrypted MavPad records.
 *
 * What it holds: records shaped {kind, id, updatedAt, deleted, iv, data, ...}
 * where iv/data are AES-256-GCM ciphertext made on the device. The key is
 * derived from the sync code, which never reaches the relay, so the relay
 * cannot read notes, chat, events or passwords. It only sees record ids,
 * kinds, timestamps and sizes.
 *
 * What it does:
 *   - clients join a room (a hash of the sync code) over WebSocket
 *   - on connect they swap a digest {kind:id -> [updatedAt, deleted]};
 *     each side sends what the other lacks
 *   - live changes are stored and forwarded to the other clients in the room
 *   - relays listed in PEERS sync every room with each other, so a note
 *     written while one relay was down is copied to it when it returns
 *
 * Conflict rule (same as the app): newest updatedAt wins; on a tie a delete wins.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = +process.env.PORT || 8787;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const NAME = (process.env.RELAY_NAME || os.hostname()).slice(0, 60);
const PEERS = (process.env.PEERS || '').split(',').map(s => s.trim()).filter(Boolean);
const PEER_SECRET = process.env.PEER_SECRET || '';
const MAX_REC = 16 * 1024 * 1024;          // one record (a note with pictures)
const MAX_ROOM = 1024 * 1024 * 1024;       // 1 GB per sync code
const BATCH = 1024 * 1024;                 // send records in ~1 MB batches

fs.mkdirSync(DATA, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- storage ---------- */
const rooms = new Map(); // room -> {recs: Map(key -> rec), bytes, clients: Set, timer}
const validRoom = r => typeof r === 'string' && /^[a-z0-9-]{8,80}$/.test(r);
const fileOf = r => path.join(DATA, r + '.json');
const keyOf = rec => rec.kind + ':' + rec.id;
const sizeOf = rec => JSON.stringify(rec).length;
function validRec(r) {
  return r && typeof r === 'object' && typeof r.kind === 'string' && /^[a-z]{1,16}$/.test(r.kind) &&
    typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 120 &&
    typeof r.updatedAt === 'number' && isFinite(r.updatedAt);
}
/* Newest write wins; a delete wins a tie so deletions spread. */
function newer(a, b) {
  if (!b) return true;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return !!a.deleted && !b.deleted;
}
function room(r) {
  let R = rooms.get(r);
  if (R) return R;
  R = { recs: new Map(), bytes: 0, clients: new Set(), timer: null };
  try {
    const arr = JSON.parse(fs.readFileSync(fileOf(r), 'utf8'));
    for (const rec of arr) if (validRec(rec)) { R.recs.set(keyOf(rec), rec); R.bytes += sizeOf(rec); }
  } catch (e) { /* new room */ }
  rooms.set(r, R);
  return R;
}
function persist(r) {
  const R = rooms.get(r);
  if (!R || R.timer) return;
  R.timer = setTimeout(() => {
    R.timer = null;
    const tmp = fileOf(r) + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify([...R.recs.values()]));
      fs.renameSync(tmp, fileOf(r));
    } catch (e) { log('write failed', r, e.message); }
  }, 1000);
}
function flushAll() {
  for (const [r, R] of rooms) {
    if (!R.timer) continue;
    clearTimeout(R.timer); R.timer = null;
    try { fs.writeFileSync(fileOf(r), JSON.stringify([...R.recs.values()])); } catch (e) {}
  }
}
for (const f of fs.readdirSync(DATA)) if (f.endsWith('.json')) room(f.slice(0, -5));

/* Merge incoming records; return the ones that changed this relay. */
function merge(r, recs) {
  const R = room(r), applied = [];
  for (const rec of Array.isArray(recs) ? recs : []) {
    if (!validRec(rec)) continue;
    const sz = sizeOf(rec);
    if (sz > MAX_REC) continue;
    const k = keyOf(rec), cur = R.recs.get(k);
    if (!newer(rec, cur)) continue;
    const delta = sz - (cur ? sizeOf(cur) : 0);
    if (R.bytes + delta > MAX_ROOM) { log('room full', r); continue; }
    R.recs.set(k, rec); R.bytes += delta;
    applied.push(rec);
  }
  if (applied.length) persist(r);
  return applied;
}
function digest(r) {
  const out = {};
  for (const [k, rec] of room(r).recs) out[k] = [rec.updatedAt, rec.deleted ? 1 : 0];
  return out;
}
/* Keys where `have` (the other side) is behind us, and keys where it is ahead. */
function diff(r, have) {
  const R = room(r), mine = [], want = [];
  have = have && typeof have === 'object' ? have : {};
  for (const [k, rec] of R.recs) {
    const h = have[k];
    if (!h || newer(rec, { updatedAt: h[0], deleted: !!h[1] })) mine.push(rec);
  }
  for (const k of Object.keys(have)) {
    const h = have[k], cur = R.recs.get(k);
    if (Array.isArray(h) && (!cur || newer({ updatedAt: h[0], deleted: !!h[1] }, cur))) want.push(k);
  }
  return { mine, want };
}
function batches(recs) {
  const out = []; let cur = [], sz = 0;
  for (const rec of recs) {
    const s = sizeOf(rec);
    if (cur.length && sz + s > BATCH) { out.push(cur); cur = []; sz = 0; }
    cur.push(rec); sz += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ---------- sockets ---------- */
const send = (ws, m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const relayLinks = new Set(); // sockets to/from other relays

function toClients(r, recs, except) {
  if (!recs.length) return;
  for (const c of room(r).clients) if (c !== except) for (const b of batches(recs)) send(c, { t: 'recs', recs: b });
}
function toRelays(r, recs, except) {
  if (!recs.length) return;
  for (const p of relayLinks) if (p !== except) for (const b of batches(recs)) send(p, { t: 'rrecs', room: r, recs: b });
}

function onClientMsg(ws, m) {
  if (m.t === 'join') {
    if (!validRoom(m.room)) return send(ws, { t: 'error', error: 'bad room' });
    if (ws.room) room(ws.room).clients.delete(ws);
    ws.room = m.room; room(m.room).clients.add(ws);
    send(ws, { t: 'joined', relay: NAME });
    return;
  }
  if (m.t === 'ping') return send(ws, { t: 'pong' });
  if (!ws.room) return;
  const r = ws.room;
  if (m.t === 'have') {
    const { mine, want } = diff(r, m.have);
    for (const b of batches(mine)) send(ws, { t: 'recs', recs: b });
    if (want.length) send(ws, { t: 'want', keys: want });
    send(ws, { t: 'synced', req: m.req });
  } else if (m.t === 'recs') {
    const applied = merge(r, m.recs);
    toClients(r, applied, ws);
    toRelays(r, applied, null);
  } else if (m.t === 'want') {
    const R = room(r);
    const recs = (m.keys || []).map(k => R.recs.get(k)).filter(Boolean);
    for (const b of batches(recs)) send(ws, { t: 'recs', recs: b });
  }
}

function startRelayLink(ws) {
  ws.isRelay = true;
  relayLinks.add(ws);
  const all = {};
  for (const r of rooms.keys()) all[r] = digest(r);
  send(ws, { t: 'rhave', rooms: all });
}
function onRelayMsg(ws, m) {
  if (m.t === 'rhave') {
    const theirs = m.rooms && typeof m.rooms === 'object' ? m.rooms : {};
    const names = new Set([...rooms.keys(), ...Object.keys(theirs).filter(validRoom)]);
    for (const r of names) {
      const { mine, want } = diff(r, theirs[r] || {});
      for (const b of batches(mine)) send(ws, { t: 'rrecs', room: r, recs: b });
      if (want.length) send(ws, { t: 'rwant', room: r, keys: want });
    }
  } else if (m.t === 'rrecs' && validRoom(m.room)) {
    const applied = merge(m.room, m.recs);
    toClients(m.room, applied, null);
    toRelays(m.room, applied, ws);
  } else if (m.t === 'rwant' && validRoom(m.room)) {
    const R = room(m.room);
    const recs = (m.keys || []).map(k => R.recs.get(k)).filter(Boolean);
    for (const b of batches(recs)) send(ws, { t: 'rrecs', room: m.room, recs: b });
  }
}

function wire(ws, outbound) {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', buf => {
    ws.alive = true;
    let m; try { m = JSON.parse(buf); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'rhello') {
      if (PEER_SECRET && m.secret !== PEER_SECRET) return ws.close(4003, 'bad secret');
      if (!ws.isRelay) { startRelayLink(ws); if (!outbound) send(ws, { t: 'rhello', name: NAME, secret: PEER_SECRET }); }
      return;
    }
    if (ws.isRelay) onRelayMsg(ws, m); else onClientMsg(ws, m);
  });
  ws.on('close', () => {
    relayLinks.delete(ws);
    if (ws.room) { const R = rooms.get(ws.room); if (R) R.clients.delete(ws); }
  });
  ws.on('error', () => {});
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
  let clients = 0; for (const R of rooms.values()) clients += R.clients.size;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ app: 'mavpad-relay', name: NAME, rooms: rooms.size, clients, peers: relayLinks.size, encrypted: 'ciphertext only' }));
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 * 1024 });
wss.on('connection', ws => wire(ws, false));

/* outbound links to the other relay(s); retry forever */
function dialPeer(url) {
  const ws = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 });
  let up = false;
  ws.on('open', () => { up = true; log('peer relay up', url); wire(ws, true); send(ws, { t: 'rhello', name: NAME, secret: PEER_SECRET }); startRelayLink(ws); });
  ws.on('close', () => { if (up) log('peer relay down', url); setTimeout(() => dialPeer(url), 5000); });
  ws.on('error', () => {});
}

setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) {} }
}, 25000);

server.listen(PORT, () => {
  log(`MavPad relay "${NAME}" on :${PORT}, data in ${DATA}, ${rooms.size} room(s)`);
  PEERS.forEach(dialPeer);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushAll(); process.exit(0); });
