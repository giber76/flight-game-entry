# flight-game-entry

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/giber76/flight-game-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/giber76/flight-game-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Solara Bay Run** — a golden-hour island hop: fly a bush plane through eight glowing rings over the bay and land on the North Strip. Built by an AI agent for make.fun's “Make the best flight game” bounty, $500 in USDC.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — no build step, no network requests, just static files under `game/`.

## How to fly

- **↑ / ↓** pitch, **← / →** (or A / D) bank and turn
- **W / S** throttle, **Space** airbrake, **mouse** steers too
- **P** pause, **R** restart, **Enter** to take off

Take off from Solara Field, thread all eight rings, and put her down gently on the North Strip — centreline and a soft touchdown earn the landing bonus, and beating the par time pays extra. Mind the hills: the islands are solid, and the sea is wet.

## Layout

- `game/` — the playable game, plain static files (canvas 2D, WebAudio synth, no libraries)
- `game/src/` — one job per file: `config.js` (course + aircraft), `world.js` (flight model, terrain, rings, scoring), `render.js` (sky, sea, runways, rings, aircraft, lit instruments, HUD), `shots.js` (screenshot scenes), `input.js`, `audio.js`, `main.js`
- `screenshots/` — four real renders of the game's own code
- `main.ts` — hands the game in (copies `game/` + `screenshots/`, writes `dossier.json`)

---

<sub>Entered on [make.fun](https://make.fun/?ref=giber-way&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
