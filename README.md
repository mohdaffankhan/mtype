# Stillpoint

A typing defense game. Your ship can't move; words drift in on asteroids — type them before they hit.

## Modes

| Mode | Players | Rules |
| --- | --- | --- |
| Classic | Solo | Endless waves, one breach ends the run |
| Sprint | Solo | 60 seconds, breaches cost points instead of your ship |
| Zen | Solo | Slow and steady, no game over (Esc → End session) |
| Race | 2–6 | Identical seeded waves for everyone; first to clear wave 5 wins |
| Versus | 2–6 | Clean words charge attacks that send asteroids to a random rival; last ship standing wins |

Clean words (no typos) build a streak multiplier up to ×2.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy (free)

Push to GitHub and import the repo on [vercel.com](https://vercel.com) — no environment variables or settings needed.
The app is fully static, so it fits the free Hobby plan.

## How multiplayer works

There is no game server. Players connect peer-to-peer over WebRTC via [PeerJS](https://peerjs.com); its free public
broker is only used for the initial handshake. The room creator's browser acts as host: it owns the lobby, relays
attacks and decides when a match ends. If the host leaves, the room closes.

Share the 5-letter room code, or click it in the lobby to copy an invite link (`/?room=CODE`).

Caveat: very restrictive networks (some corporate/school firewalls) can block WebRTC. PeerJS's default config
includes a public relay that covers most cases.

## Layout

- `lib/game/engine.ts` — canvas simulation and rendering
- `lib/game/modes.ts` — mode definitions
- `lib/game/words.ts` — word pools (edit freely)
- `lib/audio.ts` — synthesized sound effects (Web Audio, no asset files)
- `lib/net/room.ts` — PeerJS lobby / match protocol
- `components/` — React UI
