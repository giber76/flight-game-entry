// Solara Bay Run — the world: the aircraft's flight model, the island
// terrain, the ring course and the scoring. One fixed step (1/60 s) at a
// time, so a screenshot staged from a seed is always the same frame.
import { PLANE, RINGS, RUNWAY_1, RUNWAY_2, RING_SCORE, LANDING_BASE, TIME_BONUS_MAX, PAR_TIME } from './config.js';
import { createRandom, range } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_OVER = EVENT_LANDED | EVENT_CRASHED;

// The archipelago: Gaussian bumps, so terrain height is smooth and cheap.
// The course threads between them — Turtle Island on the left, Twin Peaks
// on the right, Long Reef under the final leg.
const ISLANDS = [
  { x: -1400, z: -1800, r: 900, h: 260 }, // Turtle Island
  { x: 1500, z: -2600, r: 1100, h: 420 }, // Twin Peaks
  { x: 1400, z: -2700, r: 500, h: 520 },
  { x: -900, z: -4200, r: 1000, h: 180 }, // Palm Cay
  { x: 1900, z: -5200, r: 900, h: 300 }, // Gull Rock
  { x: -1600, z: -6400, r: 1200, h: 480 }, // High Bluff
  { x: 2000, z: -7600, r: 800, h: 220 }, // North Reef
  { x: -500, z: -9000, r: 700, h: 150 },
  { x: 2600, z: -8800, r: 900, h: 340 },
  { x: -2200, z: -2400, r: 700, h: 120 },
];

export function terrainHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = (x - isl.x) / isl.r;
    const dz = (z - isl.z) / isl.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 9) h += isl.h * Math.exp(-d2);
  }
  // The two strips are flat ground, so a landing is fair.
  for (const rw of [RUNWAY_1, RUNWAY_2]) {
    const dx = Math.abs(x - rw.x);
    const dz = Math.abs(z - rw.z);
    if (dx < rw.width * 1.6 && dz < rw.length / 2 + 200) h = Math.min(h, 0);
  }
  return h;
}

function onRunway(x, z, rw) {
  return Math.abs(x - rw.x) < rw.width / 2 && Math.abs(z - rw.z) < rw.length / 2;
}

function headingTo(fromX, fromZ, toX, toZ) {
  // Heading 0 is north (-z), clockwise: atan2(dx, -dz).
  return Math.atan2(toX - fromX, -(toZ - fromZ));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createWorld(random) {
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: range(random, -6000, 6000),
      z: range(random, 3000, -11000),
      y: range(random, 1400, 2600),
      s: range(random, 220, 520),
      a: range(random, 0.25, 0.6),
    });
  }
  const state = freshState();
  let events = EVENT_NONE;

  function freshState() {
    return {
      x: RUNWAY_1.x,
      z: RUNWAY_1.z + RUNWAY_1.length / 2 - 200,
      alt: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
      speed: 0, // knots
      throttle: 0,
      fuel: PLANE.fuelSeconds,
      score: 0,
      rings: 0,
      time: 0,
      vspeed: 0, // ft/s, for the HUD and the landing verdict
      message: '',
      messageT: 0,
      crashed: false,
      landed: false,
      landedQuality: null, // {center, vspeed, bonus} once landed
      airborne: false,
      best: 0,
      clouds,
      ringsPassed: RINGS.map(() => false),
    };
  }

  function reset() {
    const keep = state.best;
    Object.assign(state, freshState());
    state.best = keep;
  }

  function setMessage(text, seconds = 2.5) {
    state.message = text;
    state.messageT = seconds;
  }

  /**
   * One fixed step. `input` is { pitch, roll, throttleUp, throttleDown,
   * brake } with pitch/roll in -1..1. Returns an event mask.
   */
  function step(dt, input, autopilot) {
    events = EVENT_NONE;
    if (state.crashed || state.landed) return events;
    state.time += dt;
    if (state.messageT > 0) state.messageT -= dt;

    const ctl = autopilot || input;
    // Throttle: a gentle lever, 0..1, that the engine follows.
    if (ctl.throttleUp) state.throttle = Math.min(1, state.throttle + dt * 0.7);
    if (ctl.throttleDown) state.throttle = Math.max(0, state.throttle - dt * 0.7);
    if (state.fuel <= 0) state.throttle = 0;
    state.fuel = Math.max(0, state.fuel - dt * (0.25 + state.throttle * 0.75));

    // Speed chases the throttle, the brake drags it back.
    const target = PLANE.minSpeed + state.throttle * (PLANE.cruiseSpeed - PLANE.minSpeed);
    const accel = ctl.brake ? 55 : 26;
    state.speed += Math.max(-accel * dt, Math.min(accel * dt, target - state.speed));
    if (ctl.brake) state.speed = Math.max(PLANE.minSpeed, state.speed);

    // Pitch and roll ease toward what the pilot asks for.
    const pitchTarget = ctl.pitch * PLANE.maxPitch;
    const rollTarget = ctl.roll * PLANE.maxRoll;
    state.pitch += (pitchTarget - state.pitch) * Math.min(1, dt * 4);
    state.roll += (rollTarget - state.roll) * Math.min(1, dt * 4);

    // A slow wing still turns, but it sinks: the stall.
    const stalled = state.speed < 60;
    const effPitch = stalled ? state.pitch * 0.4 : state.pitch;
    const climb = stalled
      ? -PLANE.sinkRate * 1.6
      : state.speed * 1.688 * Math.sin(effPitch) * 0.9 + (state.throttle - 0.55) * 6;
    state.vspeed = climb;
    state.alt += climb * dt;
    // A right bank (positive roll) turns the nose right: heading is
    // clockwise from north, so heading grows with roll. The turn tightens
    // as the wing slows — see PLANE.turnK.
    if (state.speed > 25) {
      const turn = (state.roll * PLANE.turnK) / state.speed;
      state.heading += Math.max(-0.9, Math.min(0.9, turn)) * dt;
    }

    const fx = Math.sin(state.heading);
    const fz = -Math.cos(state.heading);
    const dist = state.speed * 1.688 * dt;
    state.x += fx * dist;
    state.z += fz * dist;

    if (state.alt > 30) state.airborne = true;

    // Rings: pass within the hoop and it counts, with a chime.
    const next = RINGS[state.rings];
    if (next) {
      const dx = state.x - next.x;
      const dy = state.alt - next.alt;
      const dz = state.z - next.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < next.r) {
        state.rings += 1;
        state.ringsPassed[state.rings - 1] = true;
        state.score += RING_SCORE;
        events |= EVENT_RING;
        setMessage(state.rings === RINGS.length ? 'ALL RINGS — LAND ON THE NORTH STRIP!' : `RING ${state.rings} OF ${RINGS.length}  +${RING_SCORE}`);
      } else if (state.airborne && Math.abs(dz) < 120 && Math.abs(dx) > 300 && state.rings < RINGS.length) {
        // Flew past the hoop's plane without going through it: it stays
        // open behind you, so turn back — no penalty, no free pass.
      }
    }

    // Ground: the sea, the islands, and the two strips.
    const ground = terrainHeight(state.x, state.z);
    if (state.alt <= ground) {
      const rw = onRunway(state.x, state.z, RUNWAY_2) ? RUNWAY_2 : onRunway(state.x, state.z, RUNWAY_1) ? RUNWAY_1 : null;
      const aligned = rw ? Math.abs(angleDiff(state.heading, 0)) < 0.35 || Math.abs(angleDiff(state.heading, Math.PI)) < 0.35 : false;
      const gentle = state.vspeed > -14 && state.speed > 45 && state.speed < 130;
      if (rw && state.airborne && aligned && gentle && state.rings === RINGS.length) {
        // A real landing: on the strip, lined up, descending gently.
        state.landed = true;
        state.alt = 0;
        const center = Math.max(0, 1 - Math.abs(state.x - rw.x) / (rw.width / 2));
        const smooth = Math.max(0, 1 - Math.abs(state.vspeed) / 14);
        const bonus = Math.round(LANDING_BASE * (0.4 + 0.35 * center + 0.25 * smooth));
        const timeBonus = Math.max(0, Math.round(TIME_BONUS_MAX * (1 - state.time / (PAR_TIME * 1.6))));
        state.score += bonus + timeBonus;
        state.landedQuality = { center, vspeed: state.vspeed, bonus, timeBonus };
        events |= EVENT_LANDED;
        setMessage('TOUCHDOWN — WELCOME TO THE NORTH STRIP', 5);
      } else if (rw && state.airborne && aligned && gentle) {
        // Touched down early, before the rings: a safe landing, not a win.
        state.landed = true;
        state.alt = 0;
        state.landedQuality = { center: 0, vspeed: state.vspeed, bonus: 0, timeBonus: 0, early: true };
        events |= EVENT_LANDED;
        setMessage('LANDED — BUT THE RINGS ARE STILL OUT THERE', 5);
      } else if (state.alt <= ground && state.airborne) {
        state.crashed = true;
        state.alt = ground;
        events |= EVENT_CRASHED;
        setMessage(ground > 2 ? 'CRASHED INTO THE HILLSIDE' : 'DITCHED IN THE BAY', 5);
      } else {
        state.alt = Math.max(state.alt, ground);
      }
    }
    if (state.alt < 0) state.alt = 0;
    // Out of the bay, the sea goes on — turn back with a hint.
    if (Math.abs(state.x) > 5200 || state.z > 3500 || state.z < -13500) {
      if (state.messageT <= 0) setMessage('OUT OF THE BAY — TURN BACK', 2);
    }
    return events;
  }

  /** Steer toward a point: the autopilot the screenshot scenes use.
   * `lineUp` is an optional point to fly to first — a pilot lines up on a
   * ring from down its course, or on a runway from down its final, and
   * flies straight through, instead of turning circles around the target.
   * The lineup is a one-way gate: once the plane is close to the ring it
   * commits to the ring, so the two targets can never trade places
   * mid-approach and send it around in circles.
   * `glide` is an optional glide slope (altitude per foot of distance to
   * the target): a landing approach rides down it instead of diving.
   */
  function autopilotTo(targetX, targetZ, targetAlt, cruise = 138, lineUp = null, glide = null) {
    let tx = targetX;
    let tz = targetZ;
    if (lineUp) {
      const dRing = Math.hypot(state.x - targetX, state.z - targetZ);
      const dLineUp = Math.hypot(state.x - lineUp.x, state.z - lineUp.z);
      // The gate is the lineup-to-target distance plus a margin: once the
      // plane has passed the lineup it is inside the gate and commits to
      // the target for good — a go-around only starts from beyond it.
      const gate = Math.hypot(lineUp.x - targetX, lineUp.z - targetZ) + 350;
      if (dRing > gate && dLineUp > 350) {
        tx = lineUp.x;
        tz = lineUp.z;
      }
    }
    const wantHeading = headingTo(state.x, state.z, tx, tz);
    const dh = angleDiff(wantHeading, state.heading);
    const wantAlt = glide !== null
      ? Math.max(0, Math.hypot(state.x - targetX, state.z - targetZ) * glide)
      : (targetAlt ?? 500);
    const altErr = wantAlt - state.alt;
    // Ease off near the target: a slower wing turns tighter, so the plane
    // can actually swing onto a hoop instead of circling it.
    const dist = Math.hypot(tx - state.x, tz - state.z);
    const cruiseEff = dist < 1400 ? Math.min(cruise, 105) : cruise;
    // Pitch: on a glide slope, hold the slope's own angle and trim it by
    // the altitude error — a plain error-chaser lags the slope and sails
    // over the touchdown point still flying. The trim is strong enough to
    // join the slope from above with room to spare, then fades as the
    // error closes, so the touchdown itself stays gentle.
    const pitch = glide !== null
      ? Math.max(-0.7, Math.min(0.7, -Math.atan(glide) / PLANE.maxPitch + altErr / 600))
      : Math.max(-0.7, Math.min(0.7, altErr / 200));
    return {
      pitch,
      roll: Math.max(-1, Math.min(1, dh * 2.2)),
      throttleUp: state.speed < cruiseEff - 6,
      throttleDown: state.speed > cruiseEff + 8,
      brake: false,
    };
  }

  return { state, reset, step, autopilotTo, terrainHeight, headingTo, angleDiff };
}
