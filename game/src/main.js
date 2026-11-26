// Solara Bay Run — boot and the one loop: input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what is
// there. The game moves between title, play, paused, landed and game over.
// ?seed=N fixes the cloud layout. ?shot=cover|takeoff|turn|landing (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASHED, EVENT_LANDED, EVENT_RING } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function describe(state, screen) {
  if (screen === SCREEN_TITLE) return 'Solara Bay Run. Press Enter to fly. Eight rings, then land on the North Strip.';
  if (screen === SCREEN_PAUSED) return 'Paused. Press P to resume.';
  if (screen === SCREEN_OVER) return `Crashed. Score ${state.score}. Press R to fly again.`;
  if (screen === SCREEN_LANDED) return `Landed. Score ${state.score}. Press R to fly again.`;
  return `Flying. Altitude ${Math.round(state.alt)} feet, speed ${Math.round(state.speed)} knots, heading ${Math.round(((state.heading * 180) / Math.PI % 360) + 360) % 360} degrees. Rings ${state.rings} of 8. Score ${state.score}.`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, performance.now());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audioApi = audio;
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function setScreen(next) {
    screen = next;
    status.textContent = describe(world.state, screen);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const polled = input.poll();
    if (polled.actions.has(ACTION_CONFIRM)) audioApi.start();
    if (polled.actions.has(ACTION_PAUSE) && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      setScreen(screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY);
      audioApi.click();
    }
    if (polled.actions.has(ACTION_RESTART) && screen !== SCREEN_TITLE) {
      world.reset();
      setScreen(SCREEN_TITLE);
    }
    if (screen === SCREEN_TITLE && polled.actions.has(ACTION_CONFIRM)) {
      world.reset();
      setScreen(SCREEN_PLAY);
      audioApi.start();
      audioApi.click();
    }
    if (screen === SCREEN_PLAY) {
      accumulator += frameDt;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const events = world.step(STEP, polled, null);
        if (events & EVENT_RING) audioApi.ring();
        if (events & EVENT_CRASHED) {
          audioApi.crash();
          if (world.state.score > best) {
            best = world.state.score;
            saveBest(best);
          }
          setScreen(SCREEN_OVER);
        }
        if (events & EVENT_LANDED) {
          audioApi.land();
          if (world.state.score > best) {
            best = world.state.score;
            saveBest(best);
          }
          setScreen(SCREEN_LANDED);
        }
      }
      audioApi.update(world.state.throttle, world.state.speed);
      status.textContent = describe(world.state, screen);
    }
    renderer.draw(world.state, screen, best, now);
  }
  setScreen(SCREEN_TITLE);
  requestAnimationFrame(frame);
}

if (shot) {
  try {
    runShot(shot);
  } catch (err) {
    document.title = `ERR: ${err.message}`;
    throw err;
  }
} else {
  runGame();
}
