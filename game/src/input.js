// Keyboard + mouse input. Arrow keys pitch and bank (A/D bank too), W/S or
// Shift/Ctrl work the throttle, Space is the airbrake, P pauses, R restarts,
// Enter confirms on the title and end screens. The mouse steers too: hold the
// pointer off-centre and the plane banks and pitches toward it.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    pitch: 0, // -1 (nose down) .. 1 (nose up)
    roll: 0, // -1 (left) .. 1 (right)
    throttleUp: false,
    throttleDown: false,
    brake: false,
    mouseX: 0, // -1 .. 1 from screen centre
    mouseY: 0,
    mouseActive: false,
  };
  const pressed = new Set();

  function keyName(event) {
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
  }

  function onKeyDown(event) {
    const key = keyName(event);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(key);
    keys.add(key);
  }
  function onKeyUp(event) {
    keys.delete(keyName(event));
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouseY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    state.mouseActive = true;
  }
  function onMouseLeave() {
    state.mouseActive = false;
    state.mouseX = 0;
    state.mouseY = 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  function poll() {
    const up = keys.has('arrowup');
    const down = keys.has('arrowdown');
    const left = keys.has('arrowleft') || keys.has('a');
    const right = keys.has('arrowright') || keys.has('d');
    let pitch = (up ? 1 : 0) - (down ? 1 : 0);
    let roll = (right ? 1 : 0) - (left ? 1 : 0);
    // Mouse steering blends in only when the keys are quiet.
    if (state.mouseActive && pitch === 0 && roll === 0) {
      if (Math.abs(state.mouseX) > 0.08) roll = Math.max(-1, Math.min(1, state.mouseX * 1.4));
      if (Math.abs(state.mouseY) > 0.08) pitch = Math.max(-1, Math.min(1, -state.mouseY * 1.4));
    }
    state.pitch = pitch;
    state.roll = roll;
    state.throttleUp = keys.has('shift') || keys.has('w');
    state.throttleDown = keys.has('control') || keys.has('s');
    state.brake = keys.has(' ');
    const actions = new Set();
    if (pressed.has('enter')) actions.add(ACTION_CONFIRM);
    if (pressed.has('p') || pressed.has('escape')) actions.add(ACTION_PAUSE);
    if (pressed.has('r')) actions.add(ACTION_RESTART);
    pressed.clear();
    return { ...state, actions };
  }

  return { poll };
}
