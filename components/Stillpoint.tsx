'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Engine, type HudState, type RunResult } from '@/lib/game/engine';
import { randomSeed } from '@/lib/game/rng';
import { SOLO_MODES, type SoloMode } from '@/lib/game/modes';
import { sfx } from '@/lib/audio';
import { normalizeCode, Room, type LobbyState } from '@/lib/net/room';
import {
  Hud, LeaveConfirm, Lobby, Menu, Overlay, Paused, RunOver, SoundToggle, Standings,
} from './panels';

type Screen = 'menu' | 'lobby' | 'game';

const NAME_KEY = 'stillpoint.name';
// The hidden touch input always holds this, so a backspace is visible as a shorter value.
const SENTINEL = ' ';
const bestKey = (m: SoloMode) => `stillpoint.best.${m}`;

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export default function Stillpoint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const roomRef = useRef<Room | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  const [screen, setScreen] = useState<Screen>('menu');
  const [touch, setTouch] = useState(false);
  const [typing, setTyping] = useState(false);
  const [soloMode, setSoloMode] = useState<SoloMode>('classic');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'join'>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [prevBest, setPrevBest] = useState(0);
  const [paused, setPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const [muted, setMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bests, setBests] = useState<Record<SoloMode, number>>({ classic: 0, sprint: 0, zen: 0 });

  const room = roomRef.current;

  // ---------------------------------------------------------------- actions

  /** Raise the on-screen keyboard. Only works inside a tap, so a hint covers network-started matches. */
  function focusCapture() {
    if (!touch) return;
    const el = captureRef.current;
    if (!el) return;
    el.value = SENTINEL;
    el.focus({ preventScroll: true });
    el.setSelectionRange(SENTINEL.length, SENTINEL.length);
  }

  function onCaptureInput(e: FormEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const engine = engineRef.current;
    if (engine) {
      if (el.value.length < SENTINEL.length) engine.releaseLock();
      else engine.typeText(el.value.slice(SENTINEL.length));
    }
    el.value = SENTINEL;
    el.setSelectionRange(SENTINEL.length, SENTINEL.length);
  }

  function startSolo(mode: SoloMode) {
    const engine = engineRef.current;
    if (!engine) return;
    sfx.ui();
    setSoloMode(mode);
    setResult(null);
    setPaused(false);
    setHud(null);
    setScreen('game');
    engine.startRun({ mode, seed: randomSeed() });
    focusCapture();
  }

  function toMenu() {
    engineRef.current?.toIdle();
    setResult(null);
    setPaused(false);
    setHud(null);
    setScreen('menu');
  }

  function togglePause() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.pause()) {
      setPaused(true);
      captureRef.current?.blur();
    } else if (engine.resume()) {
      setPaused(false);
      focusCapture();
    }
  }

  function endZen() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resume();
    setPaused(false);
    engine.endRun('quit');
  }

  function recordBest(r: RunResult) {
    if (!(SOLO_MODES as string[]).includes(r.mode)) return;
    const mode = r.mode as SoloMode;
    const prev = parseInt(read(bestKey(mode)) ?? '0', 10) || 0;
    setPrevBest(prev);
    if (r.score > prev) {
      write(bestKey(mode), String(r.score));
      setBests((b) => ({ ...b, [mode]: r.score }));
    }
  }

  function attachRoom(r: Room) {
    roomRef.current = r;
    setLobby(r.lobby);
    setCopied(false);
    setScreen('lobby');
    r.on('change', (l) => setLobby(l));
    r.on('phase', (phase, l) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (phase === 'playing') {
        setResult(null);
        setConfirmLeave(false);
        setHud(null);
        setScreen('game');
        engine.startRun({ mode: l.mode, seed: l.seed, countdown: 3 });
        focusCapture();
      } else if (phase === 'results') {
        engine.endRun('match');
        setConfirmLeave(false);
        const me = l.players.find((p) => p.id === r.selfId);
        if (me?.place === 1 && !me.finished) sfx.win();
        else if (me && me.place > 1 && me.alive) sfx.lose();
      } else {
        engine.toIdle();
        setResult(null);
        setHud(null);
        setScreen('lobby');
      }
    });
    r.on('attack', (n) => engineRef.current?.addIncoming(n));
    r.on('closed', (reason) => {
      if (roomRef.current !== r) return;
      roomRef.current = null;
      setLobby(null);
      setToast(reason);
      toMenu();
    });
  }

  async function createRoom() {
    sfx.ui();
    setBusy('create');
    try {
      attachRoom(await Room.host(name));
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function joinRoom() {
    if (joinCode.length !== 5) return;
    sfx.ui();
    setBusy('join');
    try {
      attachRoom(await Room.join(joinCode, name));
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function leaveRoom() {
    roomRef.current?.leave();
    roomRef.current = null;
    setLobby(null);
    setConfirmLeave(false);
    toMenu();
  }

  async function copyInvite() {
    if (!lobby) return;
    const url = `${location.origin}${location.pathname}?room=${lobby.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast(`Invite link: ${url}`);
    }
  }

  function toggleMute() {
    sfx.unlock();
    const m = !muted;
    sfx.setMuted(m);
    setMuted(m);
    if (!m) sfx.ui();
  }

  // The global key handler reads the latest state and actions through this ref.
  const live = useRef({ screen, soloMode, result, paused, confirmLeave, lobby, startSolo, toMenu, togglePause, leaveRoom });
  live.current = { screen, soloMode, result, paused, confirmLeave, lobby, startSolo, toMenu, togglePause, leaveRoom };

  // ---------------------------------------------------------------- setup

  useEffect(() => {
    const engine = new Engine(canvasRef.current!, sfx);
    engineRef.current = engine;
    // Dev-only handle for automated play-testing from the console.
    if (process.env.NODE_ENV === 'development') (window as unknown as { __engine?: Engine }).__engine = engine;
    engine.setHandlers({
      onHud: (h) => {
        setHud(h);
        roomRef.current?.updateSelf({ score: h.score, wave: h.wave, wpm: h.wpm, acc: h.acc, alive: h.alive, finished: false });
      },
      onEnd: (r) => {
        setResult(r);
        captureRef.current?.blur();
        const rm = roomRef.current;
        if (rm) {
          rm.updateSelf({
            score: r.score, wave: r.wave, wpm: r.wpm, acc: r.acc,
            alive: r.reason !== 'breach', finished: r.reason === 'finished',
          });
        } else {
          recordBest(r);
          if (r.reason === 'breach') setTimeout(() => sfx.lose(), 200);
        }
      },
      onAttack: (n) => roomRef.current?.sendAttack(n),
    });

    setMuted(sfx.loadPreference());
    setTouch(window.matchMedia('(pointer: coarse)').matches);
    setName(read(NAME_KEY) ?? '');
    setBests({
      classic: parseInt(read(bestKey('classic')) ?? '0', 10) || 0,
      sprint: parseInt(read(bestKey('sprint')) ?? '0', 10) || 0,
      zen: parseInt(read(bestKey('zen')) ?? '0', 10) || 0,
    });
    const invited = new URLSearchParams(location.search).get('room');
    if (invited) setJoinCode(normalizeCode(invited));

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      sfx.unlock();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = live.current;
      const engine = engineRef.current;
      const rm = roomRef.current;
      if (!engine) return;
      const el = e.target as HTMLElement | null;
      const inField = !!el?.closest?.('input:not(.type-capture), textarea');
      const onButton = !!el?.closest?.('button');
      if (onButton && (e.key === 'Enter' || e.key === ' ')) return; // let the button handle it

      if (s.screen === 'menu') {
        if (inField) return;
        const quick = ['1', '2', '3'].indexOf(e.key);
        if (quick >= 0) { e.preventDefault(); s.startSolo(SOLO_MODES[quick]); }
        else if (e.key === 'Enter') { e.preventDefault(); s.startSolo(s.soloMode); }
        return;
      }
      if (s.screen === 'lobby') {
        if (e.key === 'Enter' && !inField && rm?.isHost) { e.preventDefault(); rm.start(); }
        return;
      }

      if (rm) {
        if (s.lobby?.phase === 'results') {
          if (e.key === 'Enter' && rm.isHost) { e.preventDefault(); rm.backToLobby(); }
          return;
        }
        if (e.key === 'Escape') { e.preventDefault(); setConfirmLeave((v) => !v); return; }
        if (s.confirmLeave) {
          if (e.key === 'Enter') { e.preventDefault(); s.leaveRoom(); }
          return;
        }
        if (engine.handleKey(e)) e.preventDefault();
        return;
      }

      if (s.result) {
        if (e.key === 'Enter') { e.preventDefault(); s.startSolo(s.result.mode as SoloMode); }
        else if (e.key === 'Escape') { e.preventDefault(); s.toMenu(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); s.togglePause(); return; }
      if (s.paused) {
        if (e.key === 'Enter') { e.preventDefault(); s.togglePause(); }
        return;
      }
      if (engine.handleKey(e)) e.preventDefault();
    };
    const unlock = () => sfx.unlock();
    const onBlur = () => {
      const s = live.current;
      if (s.screen === 'game' && !roomRef.current && !s.paused && !s.result) s.togglePause();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => () => roomRef.current?.leave(), []);

  // ---------------------------------------------------------------- view

  const inMatch = screen === 'game' && room && lobby;
  const soloOver = screen === 'game' && !room && result;
  const spectating = inMatch && result && lobby.phase === 'playing';
  const canType = screen === 'game' && !paused && !result && !(inMatch && (confirmLeave || lobby.phase !== 'playing'));

  return (
    <main>
      <canvas ref={canvasRef} className="stage" onPointerDown={() => { if (canType) focusCapture(); }} />
      <input
        ref={captureRef}
        className="type-capture"
        aria-label="Type the words"
        defaultValue={SENTINEL}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        tabIndex={-1}
        onInput={onCaptureInput}
        onFocus={() => setTyping(true)}
        onBlur={() => setTyping(false)}
      />
      {touch && canType && !typing && (
        <button className="tap-hint" onClick={focusCapture}>Tap to type</button>
      )}

      {screen === 'game' && hud && (
        <Hud hud={hud} players={inMatch ? lobby.players : null} selfId={room?.selfId ?? null} />
      )}

      <Overlay visible={screen === 'menu'}>
        <Menu
          name={name}
          onName={(v) => { setName(v); write(NAME_KEY, v); }}
          bests={bests}
          onSolo={startSolo}
          joinCode={joinCode}
          onJoinCode={setJoinCode}
          onCreate={createRoom}
          onJoin={joinRoom}
          busy={busy}
        />
      </Overlay>

      {screen === 'lobby' && room && lobby && (
        <Overlay>
          <Lobby
            lobby={lobby}
            selfId={room.selfId}
            isHost={room.isHost}
            copied={copied}
            onCopy={copyInvite}
            onMode={(m) => { sfx.ui(); room.setMode(m); }}
            onStart={() => room.start()}
            onLeave={leaveRoom}
          />
        </Overlay>
      )}

      {screen === 'game' && !room && paused && !result && (
        <Overlay>
          <Paused
            zen={soloMode === 'zen'}
            onResume={togglePause}
            onRestart={() => startSolo(soloMode)}
            onEnd={endZen}
            onMenu={toMenu}
          />
        </Overlay>
      )}

      {soloOver && (
        <Overlay>
          <RunOver
            result={result}
            best={Math.max(prevBest, bests[result.mode as SoloMode] ?? 0)}
            isBest={result.score > prevBest && result.score > 0}
            onAgain={() => startSolo(result.mode as SoloMode)}
            onMenu={toMenu}
          />
        </Overlay>
      )}

      {inMatch && confirmLeave && lobby.phase === 'playing' && (
        <Overlay dim={false}>
          <LeaveConfirm onStay={() => setConfirmLeave(false)} onLeave={leaveRoom} />
        </Overlay>
      )}

      {spectating && !confirmLeave && (
        <div className="spectate">
          <span className="dot dot-danger" />
          {result.reason === 'finished' ? 'Course complete — waiting for results' : 'Ship lost · spectating'}
        </div>
      )}

      {inMatch && lobby.phase === 'results' && (
        <Overlay>
          <Standings
            lobby={lobby}
            selfId={room.selfId}
            isHost={room.isHost}
            onLobby={() => room.backToLobby()}
            onLeave={leaveRoom}
          />
        </Overlay>
      )}

      <div className="corner">
        <SoundToggle muted={muted} onToggle={toggleMute} />
        {screen === 'game' && !room && !result && (
          <button className="corner-btn" onClick={(e) => { e.currentTarget.blur(); togglePause(); }}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        {inMatch && lobby.phase === 'playing' && (
          <button className="corner-btn" onClick={(e) => { e.currentTarget.blur(); setConfirmLeave(true); }}>
            Leave
          </button>
        )}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
