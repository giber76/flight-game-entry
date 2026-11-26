// Synthesised sound, no audio files: an engine hum that follows the
// throttle, wind that rises with speed, a chime for each ring, a thud for a
// crash and a little fanfare for a good landing. Everything starts on the
// first key press, so a browser never blocks it.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let started = false;

  function start() {
    if (started) return;
    started = true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      // Engine: two detuned saws through a low-pass, quiet by design.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 71.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc.connect(filter);
      osc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      osc2.start();
      // Wind: looped noise through a band-pass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 600;
      band.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0.0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, when, dur, type, vol) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime + when);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + dur + 0.05);
  }

  return {
    start,
    /** Called every frame while flying: throttle 0..1, speed in knots. */
    update(throttle, speed) {
      if (!ctx || !engineGain) return;
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + throttle * 75 + speed * 0.12, t, 0.1);
      engineGain.gain.setTargetAtTime(0.045 + throttle * 0.05, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.09, Math.max(0, (speed - 60) * 0.0009)), t, 0.15);
    },
    ring() {
      tone(880, 0, 0.35, 'sine', 0.16);
      tone(1318, 0.09, 0.45, 'sine', 0.14);
    },
    crash() {
      tone(70, 0, 0.5, 'sine', 0.3);
      tone(45, 0.05, 0.7, 'triangle', 0.25);
    },
    land() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.4, 'sine', 0.14));
    },
    click() {
      tone(660, 0, 0.08, 'square', 0.05);
    },
  };
}
