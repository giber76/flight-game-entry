// The screenshot scenes behind ?shot=cover|takeoff|turn|landing.
// Each one flies the real rules forward from a fresh world with the
// autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { RINGS, STEP } from './config.js';
import { EVENT_CRASHED, EVENT_LANDED, EVENT_RING } from './world.js';
import { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/**
 * Stage the named scene on `world` and return the screen to draw over it
 * and the best score to show.
 * cover:   through the middle of the course — ring 4 glowing dead ahead,
 *           the bay and Twin Peaks below, instruments lit.
 * takeoff: rolling down Runway 1 at Solara Field, the strip ahead, the
 *           sun low over the bay.
 * turn:    banked hard toward ring 6 over Gull Rock, the next hoop lit.
 * landing: short final to the North Strip, PAPI lights and the threshold
 *           ahead, low and slow with the gear down.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();

  function place(x, z, alt, heading, speed, throttle) {
    state.x = x;
    state.z = z;
    state.alt = alt;
    state.heading = heading;
    state.speed = speed;
    state.throttle = throttle;
    state.airborne = alt > 30;
    state.fuel = 400;
  }

  function flyTo(target, seconds, stopOnRing = false, index = -1) {
    let events = 0;
    // Line up from down the course, so the plane flies straight through
    // the hoop instead of circling it.
    let lineUp = null;
    if (index >= 0) {
      const prev = index === 0 ? { x: 0, z: 0 } : RINGS[index - 1];
      const dx = target.x - prev.x;
      const dz = target.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      lineUp = { x: target.x - (dx / len) * 700, z: target.z - (dz / len) * 700 };
    }
    for (let t = 0; t < seconds; t += STEP) {
      events = world.step(STEP, null, world.autopilotTo(target.x, target.z, target.alt, 138, lineUp));
      if (events & (EVENT_CRASHED | EVENT_LANDED)) break;
      if (stopOnRing && (events & EVENT_RING)) break;
    }
    return events;
  }

  if (name === 'takeoff') {
    // Roll down the strip: full throttle from a standing start.
    for (let t = 0; t < 2.4; t += STEP) {
      world.step(STEP, { pitch: 0, roll: 0, throttleUp: true, throttleDown: false, brake: false }, null);
    }
    state.message = 'ROTATE — 68 KT';
    state.messageT = 3;
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'turn') {
    // Mid-course: just cleared ring 5, easing toward ring 6 over open
    // water — a gentle bank, the next hoop lit, islands on the horizon.
    const hdg = world.headingTo(960, -6600, RINGS[5].x, RINGS[5].z);
    place(960, -6600, 780, hdg, 138, 0.85);
    state.rings = 5;
    state.score = 500;
    state.ringsPassed = [true, true, true, true, true, false, false, false];
    flyTo(RINGS[5], 1.2, false, 5);
    return { screen: SCREEN_PLAY, best: 500 };
  }

  if (name === 'landing') {
    // Short final: lined up on the North Strip before its threshold,
    // low and slow with the gear down, descending gently.
    place(600, -9900, 165, 0, 108, 0.5);
    state.rings = 8;
    state.score = 800;
    state.ringsPassed = [true, true, true, true, true, true, true, true];
    for (let t = 0; t < 2.0; t += STEP) {
      const ctl = {
        pitch: -0.04, roll: 0,
        throttleUp: state.speed < 106, throttleDown: state.speed > 110,
        brake: false,
      };
      const events = world.step(STEP, ctl, null);
      if (events & (EVENT_CRASHED | EVENT_LANDED)) break;
    }
    state.message = 'SHORT FINAL — NORTH STRIP IN SIGHT';
    state.messageT = 3;
    return { screen: SCREEN_PLAY, best: 800 };
  }

  // cover (default): ring 4 dead ahead, low over the bay — already lined
  // up on it, so the frame is level, the hoop is centred and the islands
  // frame the shot instead of filling it.
  const hdg = world.headingTo(150, -4700, RINGS[3].x, RINGS[3].z);
  place(150, -4700, 640, hdg, 135, 0.85);
  state.rings = 3;
  state.score = 300;
  state.ringsPassed = [true, true, true, false, false, false, false, false];
  flyTo(RINGS[3], 0.9, true, 3);
  return { screen: SCREEN_PLAY, best: 300 };
}

export { SCREEN_LANDED, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE };
