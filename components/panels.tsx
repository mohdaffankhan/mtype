'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ATTACK_COST, type HudState, type RunResult } from '@/lib/game/engine';
import { MODES, MP_MODES, RACE_WAVES, SOLO_MODES, type MpMode, type SoloMode } from '@/lib/game/modes';
import { MAX_PLAYERS, normalizeCode, type LobbyState, type Player } from '@/lib/net/room';

const fmt = (n: number) => n.toLocaleString();
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Eases a displayed number toward its target; snaps on reset to zero. */
function useTweened(target: number, ms = 450) {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (target === 0 || from === target) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      current.current = from + (target - from) * (1 - Math.pow(1 - t, 3));
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return Math.round(shown);
}

// ---------------------------------------------------------------- shared

export function Overlay({ children, visible = true, dim = true }: { children: ReactNode; visible?: boolean; dim?: boolean }) {
  return (
    <section className={`overlay${dim ? '' : ' overlay-clear'}${visible ? '' : ' is-hidden'}`}>
      <div className="panel">{children}</div>
    </section>
  );
}

export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      className="sound-btn"
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={(e) => { e.currentTarget.blur(); onToggle(); }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" />
        {muted
          ? <path d="M11 6l3 4M14 6l-3 4" />
          : <><path d="M11 5.5a3.5 3.5 0 0 1 0 5" /><path d="M12.8 3.8a6 6 0 0 1 0 8.4" /></>}
      </svg>
      <span>{muted ? 'Sound off' : 'Sound on'}</span>
    </button>
  );
}

function Stats({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="stats" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- menu

interface MenuProps {
  name: string;
  onName: (v: string) => void;
  bests: Record<SoloMode, number>;
  onSolo: (m: SoloMode) => void;
  joinCode: string;
  onJoinCode: (v: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  busy: null | 'create' | 'join';
}

export function Menu(p: MenuProps) {
  const submitJoin = (e: FormEvent) => { e.preventDefault(); p.onJoin(); };
  return (
    <>
      <p className="eyebrow">A typing defense</p>
      <h1 className="title">MType</h1>
      <p className="lede">Your ship can&apos;t move. Words drift in on asteroids. Type each one before it reaches you.</p>

      <label className="field">
        <span className="section-label">Callsign</span>
        <input
          className="input"
          value={p.name}
          maxLength={16}
          placeholder="Pilot"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => p.onName(e.target.value)}
        />
      </label>

      <p className="section-label">Solo</p>
      <div className="cards">
        {SOLO_MODES.map((m, i) => (
          <button key={m} className="card" onClick={() => p.onSolo(m)}>
            <kbd className="card-key">{i + 1}</kbd>
            <span className="card-name">{MODES[m].name}</span>
            <span className="card-tag">{MODES[m].tagline}</span>
            <span className="card-best">{p.bests[m] ? `Best ${fmt(p.bests[m])}` : ' '}</span>
          </button>
        ))}
      </div>

      <p className="section-label">Together</p>
      <div className="duo">
        <div className="tile">
          <span className="tile-title">Host a room</span>
          <span className="tile-text">Get a code to share with up to {MAX_PLAYERS - 1} friends.</span>
          <button className="btn btn-primary btn-block" onClick={p.onCreate} disabled={p.busy !== null}>
            {p.busy === 'create' ? 'Opening…' : 'Create room'}
          </button>
        </div>
        <form className="tile" onSubmit={submitJoin}>
          <span className="tile-title">Join a room</span>
          <span className="tile-text">Enter the 5-letter code from your host.</span>
          <div className="combo">
            <input
              className="combo-input"
              value={p.joinCode}
              placeholder="CODE"
              maxLength={5}
              spellCheck={false}
              autoComplete="off"
              aria-label="Room code"
              onChange={(e) => p.onJoinCode(normalizeCode(e.target.value))}
            />
            <button className="combo-btn" type="submit" disabled={p.busy !== null || p.joinCode.length !== 5}>
              {p.busy === 'join' ? '…' : 'Join'}
            </button>
          </div>
        </form>
      </div>

      <ul className="keys">
        <li><kbd>A–Z</kbd><span>lock &amp; fire</span></li>
        <li><kbd>⌫</kbd><span>release lock</span></li>
        <li><kbd>Esc</kbd><span>pause</span></li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------- lobby

interface LobbyProps {
  lobby: LobbyState;
  selfId: string;
  isHost: boolean;
  copied: boolean;
  onCopy: () => void;
  onMode: (m: MpMode) => void;
  onStart: () => void;
  onLeave: () => void;
}

export function Lobby({ lobby, selfId, isHost, copied, onCopy, onMode, onStart, onLeave }: LobbyProps) {
  const enough = lobby.players.length >= 2;
  return (
    <>
      <p className="eyebrow">Room code</p>
      <div className="slots" aria-label={`Room code ${lobby.code}`}>
        {lobby.code.split('').map((c, i) => <span key={i} className="slot">{c}</span>)}
      </div>
      <button className={`btn btn-sm${copied ? ' is-done' : ''}`} onClick={onCopy}>
        {copied ? 'Link copied' : 'Copy invite link'}
      </button>

      <p className="section-label">Mode</p>
      <div className="seg" role="radiogroup">
        {MP_MODES.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={lobby.mode === m}
            className={`seg-item${lobby.mode === m ? ' is-on' : ''}`}
            disabled={!isHost}
            onClick={() => onMode(m)}
          >
            <span className="card-name">{MODES[m].name}</span>
            <span className="card-tag">{MODES[m].tagline}</span>
          </button>
        ))}
      </div>
      <p className="hint">{MODES[lobby.mode].description}</p>

      <p className="section-label">Pilots {lobby.players.length}/{MAX_PLAYERS}</p>
      <ul className="players list">
        {lobby.players.map((pl) => (
          <li key={pl.id} className="player">
            <span className="dot" />
            <span className="player-name">{pl.name}</span>
            {pl.host && <span className="tag">host</span>}
            {pl.id === selfId && <span className="tag tag-you">you</span>}
          </li>
        ))}
      </ul>

      <div className="actions">
        {isHost ? (
          <button className="btn btn-primary btn-wide" onClick={onStart} disabled={!enough}>
            Start match <kbd>Enter</kbd>
          </button>
        ) : (
          <p className="hint hint-pulse">Waiting for the host to start</p>
        )}
        <button className="btn btn-ghost" onClick={onLeave}>Leave</button>
      </div>
      {isHost && !enough && <p className="hint">Waiting for at least one more pilot</p>}
    </>
  );
}

// ---------------------------------------------------------------- in-game HUD

interface HudProps {
  hud: HudState;
  players: Player[] | null;
  selfId: string | null;
}

export function Hud({ hud, players, selfId }: HudProps) {
  const waveLabel = hud.mode === 'sprint' ? 'Level' : 'Wave';
  const wave = String(Math.max(1, hud.wave)).padStart(2, '0');
  const waveValue = hud.mode === 'race' ? `${wave}/${String(RACE_WAVES).padStart(2, '0')}` : wave;
  const t = hud.timeLeft;
  const score = useTweened(hud.score);
  return (
    <>
      <header className="hud">
        {hud.mode !== 'zen' && (
          <div className="stat"><span className="label">{waveLabel}</span><span key={waveValue} className="value bump">{waveValue}</span></div>
        )}
        <div className="stat"><span className="label">WPM</span><span className="value">{hud.wpm}</span></div>
        <div className="stat"><span className="label">Accuracy</span><span className={`value${hud.acc < 90 ? ' value-warn' : ''}`}>{hud.acc}%</span></div>
        <div className="stat">
          <span className="label">Streak</span>
          <span key={hud.streak} className={`value bump${hud.streak >= 5 ? ' value-hot' : ''}`}>
            ×{hud.mult.toFixed(2)}
          </span>
        </div>
        <div className="stat stat-right">
          <span className="label">Score</span>
          <span key={hud.score} className="value value-score bump">{fmt(score)}</span>
          {t !== null && (
            <span className={`timer${t <= 10 ? ' timer-low' : ''}`}>
              0:{String(Math.ceil(t)).padStart(2, '0')}
            </span>
          )}
          {hud.mode === 'versus' && (
            <span className="pips" aria-label={`Attack charge ${hud.charge} of ${ATTACK_COST}`}>
              {Array.from({ length: ATTACK_COST }, (_, i) => (
                <i key={i} className={i < hud.charge ? 'is-on' : ''} />
              ))}
            </span>
          )}
        </div>
      </header>
      {players && <Rivals players={players} selfId={selfId} mode={hud.mode} />}
    </>
  );
}

function Rivals({ players, selfId, mode }: { players: Player[]; selfId: string | null; mode: string }) {
  const sorted = [...players].sort((a, b) =>
    Number(b.alive) - Number(a.alive) || (mode === 'race' ? b.wave - a.wave : 0) || b.score - a.score);
  return (
    <aside className="rivals">
      {sorted.map((p) => (
        <div key={p.id} className={`rival${p.alive ? '' : ' is-out'}${p.id === selfId ? ' is-self' : ''}`}>
          <span className="dot" />
          <span className="rival-name">{p.name}</span>
          <span className="rival-meta">
            {!p.connected ? 'left' : !p.alive ? 'out' : mode === 'race' ? (p.finished ? 'done' : `W${Math.max(1, p.wave)}`) : ''}
          </span>
          <span className="rival-score">{fmt(p.score)}</span>
          {mode === 'race' && (
            <span className="rival-bar">
              <i style={{ width: `${(p.finished ? 1 : Math.max(0, p.wave - 1) / RACE_WAVES) * 100}%` }} />
            </span>
          )}
        </div>
      ))}
    </aside>
  );
}

// ---------------------------------------------------------------- end states

const RESULT_COPY: Record<RunResult['reason'], [string, string]> = {
  breach: ['Hull breached', 'Signal lost'],
  time: ['Time', 'Sprint complete'],
  finished: ['Course complete', 'Well flown'],
  quit: ['Session ended', 'Until next time'],
  match: ['Match over', 'Well flown'],
};

export function RunOver({ result, best, isBest, onAgain, onMenu }: {
  result: RunResult; best: number; isBest: boolean; onAgain: () => void; onMenu: () => void;
}) {
  const [eyebrow, title] = RESULT_COPY[result.reason];
  return (
    <>
      <p className={`eyebrow${result.reason === 'breach' ? ' eyebrow-danger' : ''}`}>{eyebrow}</p>
      <h2 className="title title-sm">{title}</h2>
      <Stats items={[
        ['Score', fmt(result.score)],
        result.mode === 'zen' ? ['Words', result.words] : [result.mode === 'sprint' ? 'Level' : 'Wave', result.wave],
        ['WPM', result.wpm],
        ['Accuracy', `${result.acc}%`],
      ]} />
      <div className="actions">
        <button className="btn btn-primary btn-wide" onClick={onAgain}>Play again <kbd>Enter</kbd></button>
        <button className="btn btn-ghost" onClick={onMenu}>Menu</button>
      </div>
      <p className="best">{isBest ? 'New best' : best ? `Best ${fmt(best)}` : ''}</p>
    </>
  );
}

export function Paused({ zen, onResume, onRestart, onEnd, onMenu }: {
  zen: boolean; onResume: () => void; onRestart: () => void; onEnd: () => void; onMenu: () => void;
}) {
  return (
    <>
      <p className="eyebrow">Paused</p>
      <h2 className="title title-sm">Holding position</h2>
      <div className="actions actions-stack">
        <button className="btn btn-primary btn-wide" onClick={onResume}>Resume <kbd>Esc</kbd></button>
        {zen
          ? <button className="btn btn-ghost" onClick={onEnd}>End session</button>
          : <button className="btn btn-ghost" onClick={onRestart}>Restart</button>}
        <button className="btn btn-ghost" onClick={onMenu}>Main menu</button>
      </div>
    </>
  );
}

export function LeaveConfirm({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <>
      <p className="eyebrow eyebrow-danger">Leave match?</p>
      <h2 className="title title-sm">The match goes on</h2>
      <p className="lede">Your ship keeps flying while this is open.</p>
      <div className="actions">
        <button className="btn btn-primary" onClick={onStay}>Stay <kbd>Esc</kbd></button>
        <button className="btn btn-ghost" onClick={onLeave}>Leave <kbd>Enter</kbd></button>
      </div>
    </>
  );
}

export function Standings({ lobby, selfId, isHost, onLobby, onLeave }: {
  lobby: LobbyState; selfId: string; isHost: boolean; onLobby: () => void; onLeave: () => void;
}) {
  const ranked = [...lobby.players].sort((a, b) => a.place - b.place);
  const me = ranked.find((p) => p.id === selfId);
  const won = me?.place === 1;
  return (
    <>
      <p className={`eyebrow${won ? '' : ' eyebrow-danger'}`}>{MODES[lobby.mode].name} · match over</p>
      <h2 className="title title-sm">{won ? 'Victory' : me ? `${ordinal(me.place)} place` : 'Match over'}</h2>
      <ol className="standings list">
        {ranked.map((p) => (
          <li key={p.id} className={p.id === selfId ? 'is-self' : ''}>
            <span className="place">{p.place}</span>
            <span className="player-name">{p.name}</span>
            <span className="rival-meta">
              {lobby.mode === 'race' ? (p.finished ? 'finished' : `wave ${p.wave}`) : p.alive ? 'survived' : p.connected ? 'out' : 'left'}
            </span>
            <span className="rival-meta">{p.wpm} wpm</span>
            <span className="rival-score">{fmt(p.score)}</span>
          </li>
        ))}
      </ol>
      <div className="actions">
        {isHost
          ? <button className="btn btn-primary btn-wide" onClick={onLobby}>Back to lobby <kbd>Enter</kbd></button>
          : <p className="hint hint-pulse">Waiting for the host</p>}
        <button className="btn btn-ghost" onClick={onLeave}>Leave room</button>
      </div>
    </>
  );
}
