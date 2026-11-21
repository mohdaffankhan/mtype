import type { DataConnection, Peer } from 'peerjs';
import type { MpMode } from '../game/modes';

/**
 * Serverless multiplayer: players connect peer-to-peer over WebRTC. PeerJS's free public
 * broker only brokers the handshake. The host's browser is the authority — it owns the
 * lobby, relays attacks and decides when a match ends.
 */

const PREFIX = 'stillpoint-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 6;
const TICK_MS = 300;
const SEND_MS = 250;
const TIMEOUT_MS = 12000;

export type Phase = 'lobby' | 'playing' | 'results';

export interface PlayerStats {
  score: number;
  wave: number;
  wpm: number;
  acc: number;
  alive: boolean;
  finished: boolean;
}

export interface Player extends PlayerStats {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
  outAt: number;
  finishedAt: number;
  place: number;
}

export interface LobbyState {
  code: string;
  mode: MpMode;
  phase: Phase;
  seed: number;
  round: number;
  players: Player[];
}

type ToHost =
  | { t: 'hello'; name: string }
  | { t: 'state'; s: PlayerStats }
  | { t: 'attack'; n: number };

type ToClient =
  | { t: 'welcome'; you: string; lobby: LobbyState }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'attack'; n: number; from: string }
  | { t: 'reject'; reason: string };

interface Events {
  change: (l: LobbyState) => void;
  phase: (p: Phase, l: LobbyState) => void;
  attack: (n: number, from: string) => void;
  closed: (reason: string) => void;
}

const freshStats = (): PlayerStats => ({ score: 0, wave: 0, wpm: 0, acc: 100, alive: true, finished: false });

const makePlayer = (id: string, name: string, host: boolean): Player => ({
  id, name, host, connected: true, outAt: 0, finishedAt: 0, place: 0, ...freshStats(),
});

export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) : '';
  return s || `Pilot ${Math.floor(10 + Math.random() * 90)}`;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function makeCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo;

function friendly(err: unknown): Error {
  const type = (err as { type?: string })?.type;
  if (type === 'peer-unavailable') return new Error('No room with that code.');
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed')
    return new Error('Could not reach the matchmaking server. Check your connection.');
  if (type === 'browser-incompatible') return new Error('This browser does not support WebRTC.');
  return err instanceof Error ? err : new Error('Connection failed.');
}

function openPeer(peer: Peer): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('Matchmaking server timed out.')); }, TIMEOUT_MS);
    peer.once('open', () => { clearTimeout(timer); resolve(peer); });
    peer.once('error', (e) => { clearTimeout(timer); peer.destroy(); reject(e); });
  });
}

export class Room {
  readonly isHost: boolean;
  readonly code: string;
  selfId: string;
  lobby: LobbyState;

  private peer: Peer;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null;
  private listeners = new Map<keyof Events, Set<Events[keyof Events]>>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private lastSent = 0;
  private pending: PlayerStats | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  // ---------------------------------------------------------------- creation

  static async host(name: string): Promise<Room> {
    const { Peer } = await import('peerjs');
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      try {
        const peer = await openPeer(new Peer(PREFIX + code.toLowerCase(), { debug: 0 }));
        return new Room(peer, code, cleanName(name), null);
      } catch (e) {
        if ((e as { type?: string })?.type !== 'unavailable-id') throw friendly(e);
      }
    }
    throw new Error('Could not allocate a room code. Try again.');
  }

  static async join(rawCode: string, name: string): Promise<Room> {
    const code = normalizeCode(rawCode);
    if (code.length !== 5) throw new Error('Room codes are 5 characters.');
    const { Peer } = await import('peerjs');
    let peer: Peer;
    try {
      peer = await openPeer(new Peer({ debug: 0 }));
    } catch (e) {
      throw friendly(e);
    }
    try {
      const conn = peer.connect(PREFIX + code.toLowerCase(), { reliable: true, serialization: 'json' });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Room not found or unreachable.')), TIMEOUT_MS);
        conn.once('open', () => { clearTimeout(timer); resolve(); });
        conn.once('error', (e) => { clearTimeout(timer); reject(friendly(e)); });
        peer.once('error', (e) => { clearTimeout(timer); reject(friendly(e)); });
      });
      const room = new Room(peer, code, cleanName(name), conn);
      await room.awaitWelcome(cleanName(name));
      return room;
    } catch (e) {
      peer.destroy();
      throw e;
    }
  }

  private constructor(peer: Peer, code: string, name: string, hostConn: DataConnection | null) {
    this.peer = peer;
    this.code = code;
    this.hostConn = hostConn;
    this.isHost = hostConn === null;
    this.selfId = peer.id;
    this.lobby = {
      code,
      mode: 'race',
      phase: 'lobby',
      seed: 0,
      round: 0,
      players: this.isHost ? [makePlayer(peer.id, name, true)] : [],
    };

    peer.on('disconnected', () => {
      // Lost the broker; live peer links keep working, but reconnect so new players can join.
      if (!this.closed) setTimeout(() => { if (!this.closed && peer.disconnected) peer.reconnect(); }, 1500);
    });

    if (this.isHost) {
      peer.on('connection', (conn) => this.accept(conn));
    } else {
      hostConn!.on('data', (d) => this.onClientData(d as ToClient));
      hostConn!.on('close', () => this.shutdown('The host closed the room.'));
      hostConn!.on('error', () => this.shutdown('Lost connection to the host.'));
    }
  }

  private awaitWelcome(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error('The host did not respond.')); }, TIMEOUT_MS);
      const offChange = this.on('change', () => { clearTimeout(timer); off(); resolve(); });
      const offClosed = this.on('closed', (reason) => { clearTimeout(timer); off(); reject(new Error(reason)); });
      const off = () => { offChange(); offClosed(); };
      this.hostConn!.send({ t: 'hello', name } satisfies ToHost);
    });
  }

  // ---------------------------------------------------------------- events

  on<K extends keyof Events>(k: K, fn: Events[K]): () => void {
    let set = this.listeners.get(k);
    if (!set) this.listeners.set(k, (set = new Set()));
    set.add(fn);
    return () => { set.delete(fn); };
  }

  private emit<K extends keyof Events>(k: K, ...args: Parameters<Events[K]>) {
    this.listeners.get(k)?.forEach((fn) => (fn as (...a: Parameters<Events[K]>) => void)(...args));
  }

  private setLobby(next: LobbyState) {
    const prev = this.lobby;
    this.lobby = next;
    this.emit('change', next);
    if (prev.phase !== next.phase || prev.round !== next.round) this.emit('phase', next.phase, next);
  }

  // ---------------------------------------------------------------- shared API

  get self(): Player | undefined {
    return this.lobby.players.find((p) => p.id === this.selfId);
  }

  updateSelf(s: PlayerStats) {
    if (this.lobby.phase !== 'playing') return;
    if (this.isHost) {
      this.applyStats(this.selfId, s);
      return;
    }
    // Throttle, but never delay a death or finish.
    const urgent = !s.alive || s.finished;
    this.pending = s;
    const wait = SEND_MS - (Date.now() - this.lastSent);
    if (urgent || wait <= 0) this.flushState();
    else if (!this.sendTimer) this.sendTimer = setTimeout(() => this.flushState(), wait);
  }

  private flushState() {
    if (this.sendTimer) { clearTimeout(this.sendTimer); this.sendTimer = null; }
    if (!this.pending || !this.hostConn?.open) return;
    this.hostConn.send({ t: 'state', s: this.pending } satisfies ToHost);
    this.pending = null;
    this.lastSent = Date.now();
  }

  sendAttack(n: number) {
    if (this.lobby.phase !== 'playing') return;
    if (this.isHost) this.routeAttack(this.selfId, n);
    else this.hostConn?.send({ t: 'attack', n } satisfies ToHost);
  }

  leave() {
    this.shutdown(null);
  }

  private shutdown(reason: string | null) {
    if (this.closed) return;
    this.closed = true;
    if (this.tick) clearInterval(this.tick);
    if (this.sendTimer) clearTimeout(this.sendTimer);
    for (const c of this.conns.values()) c.close();
    this.hostConn?.close();
    // Give close frames a moment to flush before tearing down the peer.
    setTimeout(() => this.peer.destroy(), 200);
    if (reason) this.emit('closed', reason);
  }

  // ---------------------------------------------------------------- host

  setMode(mode: MpMode) {
    if (!this.isHost || this.lobby.phase !== 'lobby') return;
    this.commit({ ...this.lobby, mode });
  }

  start() {
    if (!this.isHost || this.lobby.phase === 'playing' || this.lobby.players.length < 2) return;
    const players = this.lobby.players
      .filter((p) => p.connected)
      .map((p) => ({ ...p, ...freshStats(), outAt: 0, finishedAt: 0, place: 0 }));
    this.commit({
      ...this.lobby,
      players,
      phase: 'playing',
      seed: (Math.random() * 2 ** 32) >>> 0,
      round: this.lobby.round + 1,
    });
    if (this.tick) clearInterval(this.tick);
    this.tick = setInterval(() => this.broadcast({ t: 'lobby', lobby: this.lobby }), TICK_MS);
  }

  backToLobby() {
    if (!this.isHost || this.lobby.phase !== 'results') return;
    const players = this.lobby.players
      .filter((p) => p.connected)
      .map((p) => ({ ...p, ...freshStats(), outAt: 0, finishedAt: 0, place: 0 }));
    this.commit({ ...this.lobby, players, phase: 'lobby' });
  }

  private commit(next: LobbyState) {
    this.setLobby(next);
    this.broadcast({ t: 'lobby', lobby: next });
  }

  private broadcast(msg: ToClient) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  private accept(conn: DataConnection) {
    conn.on('data', (d) => this.onHostData(conn, d as ToHost));
    conn.on('close', () => this.drop(conn.peer));
    conn.on('error', () => this.drop(conn.peer));
  }

  private reject(conn: DataConnection, reason: string) {
    conn.send({ t: 'reject', reason } satisfies ToClient);
    setTimeout(() => conn.close(), 300);
  }

  private onHostData(conn: DataConnection, msg: ToHost) {
    if (!msg || typeof msg !== 'object') return;
    const id = conn.peer;
    if (msg.t === 'hello') {
      if (this.conns.has(id)) return;
      if (this.lobby.phase !== 'lobby') return this.reject(conn, 'A match is in progress. Try again shortly.');
      if (this.lobby.players.length >= MAX_PLAYERS) return this.reject(conn, 'That room is full.');
      this.conns.set(id, conn);
      const lobby = { ...this.lobby, players: [...this.lobby.players, makePlayer(id, cleanName(msg.name), false)] };
      this.setLobby(lobby);
      conn.send({ t: 'welcome', you: id, lobby } satisfies ToClient);
      this.broadcast({ t: 'lobby', lobby });
      return;
    }
    if (!this.conns.has(id)) return;
    if (msg.t === 'state') this.applyStats(id, msg.s);
    else if (msg.t === 'attack') this.routeAttack(id, num(msg.n, 1, 5));
  }

  private applyStats(id: string, s: PlayerStats) {
    if (this.lobby.phase !== 'playing' || !s) return;
    const now = Date.now();
    const players = this.lobby.players.map((p) => {
      if (p.id !== id) return p;
      const alive = p.alive && s.alive !== false;
      const finished = p.finished || s.finished === true;
      return {
        ...p,
        score: num(s.score, 0, 1e9),
        wave: num(s.wave, 0, 999),
        wpm: num(s.wpm, 0, 400),
        acc: num(s.acc, 0, 100),
        alive,
        finished,
        outAt: !alive && p.alive ? now : p.outAt,
        finishedAt: finished && !p.finished ? now : p.finishedAt,
      };
    });
    this.setLobby({ ...this.lobby, players });
    this.checkEnd();
  }

  private routeAttack(from: string, n: number) {
    const targets = this.lobby.players.filter((p) => p.id !== from && p.connected && p.alive && !p.finished);
    if (!targets.length) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const fromName = this.lobby.players.find((p) => p.id === from)?.name ?? 'A rival';
    if (target.id === this.selfId) this.emit('attack', n, fromName);
    else this.conns.get(target.id)?.send({ t: 'attack', n, from: fromName } satisfies ToClient);
  }

  private drop(id: string) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    if (this.lobby.phase === 'playing') {
      const now = Date.now();
      const players = this.lobby.players.map((p) =>
        p.id === id ? { ...p, connected: false, alive: false, outAt: p.outAt || now } : p);
      this.commit({ ...this.lobby, players });
      this.checkEnd();
    } else {
      this.commit({ ...this.lobby, players: this.lobby.players.filter((p) => p.id !== id) });
    }
  }

  private checkEnd() {
    const l = this.lobby;
    if (!this.isHost || l.phase !== 'playing') return;
    const active = l.players.filter((p) => p.connected && p.alive && !p.finished);
    const over = l.mode === 'race'
      ? l.players.some((p) => p.finished) || active.length === 0
      : active.length <= 1;
    if (!over) return;

    const ranked = [...l.players].sort((a, b) => {
      if (l.mode === 'race') {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished && b.finished) return a.finishedAt - b.finishedAt;
        if (a.wave !== b.wave) return b.wave - a.wave;
        return b.score - a.score || b.outAt - a.outAt;
      }
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.outAt !== b.outAt) return b.outAt - a.outAt; // outlasting counts for more than points
      return b.score - a.score;
    });
    const players = ranked.map((p, i) => ({ ...p, place: i + 1 }));
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
    this.commit({ ...l, players, phase: 'results' });
  }

  // ---------------------------------------------------------------- client

  private onClientData(msg: ToClient) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'welcome') {
      this.selfId = msg.you;
      this.setLobby(msg.lobby);
    } else if (msg.t === 'lobby') {
      this.setLobby(msg.lobby);
    } else if (msg.t === 'attack') {
      this.emit('attack', num(msg.n, 1, 5), String(msg.from).slice(0, 16));
    } else if (msg.t === 'reject') {
      this.shutdown(msg.reason);
    }
  }
}
