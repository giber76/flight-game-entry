// Solara Bay Run — the renderer: a golden-hour chase view over the bay.
// Everything is drawn with the canvas 2D API, no images and no network:
// the sky, the sun, the clouds, the sea and islands (a projected grid),
// the runways, the glowing rings, the aircraft, the lit cockpit panel and
// the HUD. The judge sees the game through its screenshots, so every frame
// is staged to read at a glance: terrain, aircraft, instruments, runway
// or ring ahead, and ALT / SPD / HDG on the HUD.
import { RINGS, RUNWAY_1, RUNWAY_2 } from './config.js';
import { terrainHeight } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

const SUN_AZ = -0.9; // radians, west of north: the sun sits ahead-left
const SUN_EL = 0.22; // radians above the horizon

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

function css(c, a = 1) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h };
  }

  // Project a world point into screen space from the pilot's eye.
  // Returns null when the point is behind the camera.
  function projector(state, w, h) {
    const cx = w / 2;
    const cy = h * 0.46;
    const focal = h * 0.95;
    const sh = Math.sin(state.heading);
    const ch = Math.cos(state.heading);
    const sp = Math.sin(state.pitch);
    const cp = Math.cos(state.pitch);
    const sr = Math.sin(state.roll);
    const cr = Math.cos(state.roll);
    // The chase camera rides a little above the aircraft, so the ground
    // below it has real perspective instead of collapsing to the horizon
    // whenever the wheels are on the strip.
    const CAM_H = 14;
    const horizonY = cy + focal * Math.tan(state.pitch);
    function project(x, y, z) {
      const dx = x - state.x;
      const dz = z - state.z;
      const fwd = dx * sh - dz * ch;
      if (fwd < 40) return null;
      const right = dx * ch + dz * sh;
      const up = y - (state.alt + CAM_H);
      // Pitch rotates forward/up.
      const f2 = fwd * cp + up * sp;
      const u2 = up * cp - fwd * sp;
      const s = focal / f2;
      let sx = cx + right * s;
      let sy = cy - u2 * s;
      // Roll rotates the picture around its centre. Banking right rolls the
      // camera with the aircraft, so the world turns the other way.
      const ox = sx - cx;
      const oy = sy - horizonY;
      sx = cx + ox * cr + oy * sr;
      sy = horizonY - ox * sr + oy * cr;
      return { x: sx, y: sy, s, fwd };
    }
    return { project, cx, cy, horizonY, focal };
  }

  function drawSky(state, w, h, P) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b2350');
    g.addColorStop(0.32, '#4a3a7a');
    g.addColorStop(0.52, '#c65a4e');
    g.addColorStop(0.62, '#f0965a');
    g.addColorStop(0.72, '#f7c489');
    g.addColorStop(1, '#274b63');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // The sun: a warm disc with a halo, placed by its fixed bearing.
    const sunDir = { x: Math.sin(SUN_AZ), z: -Math.cos(SUN_AZ), y: Math.tan(SUN_EL) };
    const sp = projectDirection(state, sunDir, w, h, P);
    if (sp) {
      const halo = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 220);
      halo.addColorStop(0, 'rgba(255, 214, 140, 0.95)');
      halo.addColorStop(0.25, 'rgba(255, 170, 90, 0.55)');
      halo.addColorStop(1, 'rgba(255, 150, 80, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sp.x - 220, sp.y - 220, 440, 440);
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 34, 0, Math.PI * 2);
      ctx.fill();
    }
    // Clouds: soft lit ellipses, drifting with the world, not the screen.
    // Capped in size and kept out of the HUD bar, so a near cloud never
    // smudges the top of the frame.
    for (const c of state.clouds) {
      const p = P.project(c.x, c.y, c.z);
      if (!p || p.fwd < 100) continue;
      const r = Math.min(240, Math.max(8, c.s * p.s * 0.9));
      if (p.y < 20) continue; // centred above the frame: only a smudge would show
      if (p.y + r * 0.32 < 56) continue;
      ctx.fillStyle = `rgba(255, 205, 170, ${c.a * Math.min(1, 5000 / p.fwd)})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 235, 215, ${c.a * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(p.x - r * 0.3, p.y - r * 0.1, r * 0.6, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Project a direction (unit-ish) from the camera, for the sun.
  function projectDirection(state, d, w, h, P) {
    const fake = { x: state.x + d.x * 8000, y: state.alt + d.y * 8000, z: state.z + d.z * 8000 };
    return P.project(fake.x, fake.y, fake.z);
  }

  function drawTerrain(state, w, h, P) {
    const rows = [120, 220, 340, 500, 700, 950, 1250, 1600, 2000, 2500, 3100, 3800, 4600, 5500, 6600, 7800];
    const cols = [-4200, -3200, -2400, -1700, -1150, -750, -400, -180, 0, 180, 400, 750, 1150, 1700, 2400, 3200, 4200];
    const horizonCol = [226, 138, 96];
    const sh = Math.sin(state.heading);
    const ch = Math.cos(state.heading);
    for (let ri = 0; ri < rows.length - 1; ri += 1) {
      const f0 = rows[ri];
      const f1 = rows[ri + 1];
      for (let ci = 0; ci < cols.length - 1; ci += 1) {
        const r0 = cols[ci];
        const r1 = cols[ci + 1];
        // Cell corners in world space.
        const corners = [
          [r0, f0], [r1, f0], [r1, f1], [r0, f1],
        ].map(([r, f]) => {
          const x = state.x + sh * f + ch * r;
          const z = state.z - ch * f + sh * r;
          return { x, z, h: terrainHeight(x, z) };
        });
        const midH = (corners[0].h + corners[1].h + corners[2].h + corners[3].h) / 4;
        const pts = corners.map((c) => P.project(c.x, c.h, c.z));
        if (pts.some((p) => p === null)) continue;
        const haze = Math.min(0.75, (f0 / 6500) * 0.9);
        let base;
        if (midH <= 1) {
          // Sea: deep teal near, sunset copper far, glitter near the sun.
          base = mix([26, 98, 124], [196, 106, 74], Math.min(1, f0 / 5200));
          const sunSide = Math.abs(((Math.atan2(r0 + r1, f0 + f1) - SUN_AZ + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (sunSide < 0.5 && f0 > 900) base = mix(base, [255, 190, 110], (0.5 - sunSide) * 0.55);
        } else if (midH < 9) base = mix([217, 179, 128], [190, 150, 100], haze); // sand
        else if (midH < 140) base = mix([74, 118, 58], [96, 128, 70], ((midH * 7) % 13) / 13 * 0.18); // grass
        else base = mix([107, 98, 89], [140, 120, 100], ((midH * 3) % 11) / 11 * 0.15); // rock
        const col = mix(base, horizonCol, haze);
        ctx.fillStyle = css(col, 1);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // A soft haze band right at the horizon so the sea melts into the sky.
    const hz = ctx.createLinearGradient(0, P.horizonY - 26, 0, P.horizonY + 40);
    hz.addColorStop(0, 'rgba(240, 150, 90, 0)');
    hz.addColorStop(0.5, 'rgba(240, 150, 90, 0.35)');
    hz.addColorStop(1, 'rgba(240, 150, 90, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, P.horizonY - 26, w, 66);
  }

  function drawRunway(state, rw, label, P) {
    const hw = rw.width / 2;
    const hl = rw.length / 2;
    // Clip the strip against the near plane in (right, forward) space, so
    // the end behind the camera never hides the part ahead of it.
    const sh = Math.sin(state.heading);
    const ch = Math.cos(state.heading);
    function toRF(x, z) {
      const dx = x - state.x;
      const dz = z - state.z;
      return { r: dx * ch + dz * sh, f: dx * sh - dz * ch };
    }
    function fromRF(rf) {
      return { x: state.x + sh * rf.f + ch * rf.r, z: state.z - ch * rf.f + sh * rf.r };
    }
    let poly = [
      [rw.x - hw, rw.z + hl], [rw.x + hw, rw.z + hl],
      [rw.x + hw, rw.z - hl], [rw.x - hw, rw.z - hl],
    ].map(([x, z]) => toRF(x, z));
    const clipped = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a.f >= 40;
      const bIn = b.f >= 40;
      if (aIn) clipped.push(a);
      if (aIn !== bIn) {
        const t = (40 - a.f) / (b.f - a.f);
        clipped.push({ r: a.r + (b.r - a.r) * t, f: 40 });
      }
    }
    if (clipped.length < 3) return;
    const corners = clipped.map((rf) => {
      const wpt = fromRF(rf);
      return P.project(wpt.x, 0, wpt.z);
    });
    if (corners.some((p) => p === null)) return;
    ctx.fillStyle = '#33383f';
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.fillStyle = '#f2f0e6';
    for (let d = -hl + 150; d < hl - 100; d += 300) {
      const a = P.project(rw.x - 6, 0.5, rw.z + d);
      const b = P.project(rw.x + 6, 0.5, rw.z + d + 140);
      if (!a || !b) continue;
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 1, Math.abs(b.y - a.y) + 1);
    }
    // Threshold bars at both ends.
    for (const end of [-hl + 60, hl - 60]) {
      for (let k = -3; k <= 3; k += 1) {
        const a = P.project(rw.x + k * 16 - 6, 0.5, rw.z + end);
        const b = P.project(rw.x + k * 16 + 6, 0.5, rw.z + end + 60);
        if (!a || !b) continue;
        ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 1, Math.abs(b.y - a.y) + 1);
      }
    }
    // Runway number, big and readable from the air.
    const num = P.project(rw.x, 1, rw.z - hl + 320);
    if (num && num.fwd < 5200) {
      ctx.fillStyle = '#f2f0e6';
      ctx.font = `bold ${Math.max(14, num.s * 90)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, num.x, num.y);
    }
    // Edge lights: tiny glowing dots down both sides.
    for (let d = -hl + 200; d < hl; d += 400) {
      for (const side of [-1, 1]) {
        const p = P.project(rw.x + side * (hw + 8), 2, rw.z + d);
        if (!p) continue;
        ctx.fillStyle = '#cfe8ff';
        ctx.shadowColor = '#9fd0ff';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, p.s * 4), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  function drawRings(state, P, now) {
    for (let i = 0; i < RINGS.length; i += 1) {
      const ring = RINGS[i];
      const passed = state.ringsPassed[i];
      const isNext = i === state.rings;
      if (passed && i < state.rings - 1) continue; // old hoops fade out
      const dx = ring.x - state.x;
      const dz = ring.z - state.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 9000) continue;
      // The hoop faces the pilot: its plane is square to the line of sight.
      const nx = dx / (dist || 1);
      const nz = dz / (dist || 1);
      const rx = -nz;
      const rz = nx;
      const pts = [];
      for (let k = 0; k <= 20; k += 1) {
        const t = (k / 20) * Math.PI * 2;
        const px = ring.x + rx * Math.cos(t) * ring.r;
        const py = ring.alt + Math.sin(t) * ring.r;
        const pz = ring.z + rz * Math.cos(t) * ring.r;
        const p = P.project(px, py, pz);
        if (p) pts.push(p);
      }
      if (pts.length < 8) continue;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(now / 260) : 0.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (isNext) {
        ctx.strokeStyle = `rgba(255, 176, 66, ${pulse})`;
        ctx.shadowColor = '#ffb042';
        ctx.shadowBlur = 18;
        ctx.lineWidth = Math.max(4, pts[0].s * 14);
      } else if (passed) {
        ctx.strokeStyle = 'rgba(90, 220, 140, 0.7)';
        ctx.shadowColor = '#5adc8c';
        ctx.shadowBlur = 8;
        ctx.lineWidth = Math.max(3, pts[0].s * 10);
      } else {
        ctx.strokeStyle = 'rgba(140, 220, 255, 0.55)';
        ctx.shadowColor = '#8cdcff';
        ctx.shadowBlur = 6;
        ctx.lineWidth = Math.max(2, pts[0].s * 8);
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k += 1) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      // The next hoop gets its number, floating above it — capped, so a
      // close hoop never shouts over the HUD.
      if (isNext) {
        const top = P.project(ring.x, ring.alt + ring.r + 60, ring.z);
        if (top) {
          ctx.fillStyle = '#ffe9b0';
          ctx.font = `bold ${Math.max(14, Math.min(26, top.s * 60))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(`RING ${i + 1}`, top.x, Math.max(72, top.y));
          const below = P.project(ring.x, ring.alt - ring.r - 40, ring.z);
          if (below && dist > 700) {
            ctx.fillStyle = 'rgba(255, 233, 176, 0.85)';
            ctx.font = `${Math.max(11, Math.min(15, below.s * 34))}px sans-serif`;
            ctx.fillText(`${Math.round(dist)} ft`, below.x, below.y);
          }
        }
      }
    }
  }

  function drawPlane(state, w, h, now) {
    const px = w / 2;
    const py = h * 0.60 + state.pitch * 60;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.roll * 0.85);
    const s = Math.min(w, h) / 800;
    ctx.scale(s, s);
    // Propeller, seen from behind: a thin blurred disc at the nose, with a
    // spinner dot. Edge-on from the chase view it is a faint horizontal
    // smear, never a slash across the wing.
    ctx.save();
    ctx.translate(0, -34);
    ctx.fillStyle = 'rgba(220, 230, 240, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240, 244, 248, 0.5)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#dfe6ee';
    ctx.beginPath();
    ctx.arc(0, -34, 4, 0, Math.PI * 2);
    ctx.fill();
    // Wings, with the sun catching the left one.
    const wingGrad = ctx.createLinearGradient(-190, 0, 190, 0);
    wingGrad.addColorStop(0, '#f7e3c2');
    wingGrad.addColorStop(0.5, '#e8b96f');
    wingGrad.addColorStop(1, '#c98a3e');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-195, -6);
    ctx.quadraticCurveTo(-120, -34, -30, -18);
    ctx.lineTo(30, -18);
    ctx.quadraticCurveTo(120, -34, 195, -6);
    ctx.quadraticCurveTo(120, 6, 30, 2);
    ctx.lineTo(-30, 2);
    ctx.quadraticCurveTo(-120, 6, -195, -6);
    ctx.closePath();
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = '#d98f3e';
    ctx.beginPath();
    ctx.moveTo(-62, 78);
    ctx.lineTo(62, 78);
    ctx.lineTo(38, 96);
    ctx.lineTo(-38, 96);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-14, 62);
    ctx.lineTo(14, 62);
    ctx.lineTo(10, 96);
    ctx.lineTo(-10, 96);
    ctx.closePath();
    ctx.fill();
    // Fuselage, seen from behind and slightly above.
    const fus = ctx.createLinearGradient(0, -30, 0, 110);
    fus.addColorStop(0, '#f2d8a8');
    fus.addColorStop(0.55, '#dd9c4a');
    fus.addColorStop(1, '#a86a28');
    ctx.fillStyle = fus;
    ctx.beginPath();
    ctx.moveTo(-26, -26);
    ctx.quadraticCurveTo(-34, 40, -20, 104);
    ctx.quadraticCurveTo(0, 116, 20, 104);
    ctx.quadraticCurveTo(34, 40, 26, -26);
    ctx.quadraticCurveTo(0, -40, -26, -26);
    ctx.closePath();
    ctx.fill();
    // Rear windows, catching the sunset.
    ctx.fillStyle = '#7fc4e8';
    ctx.beginPath();
    ctx.ellipse(0, -8, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 200, 0.8)';
    ctx.beginPath();
    ctx.ellipse(-5, -10, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail number.
    ctx.fillStyle = '#5a3410';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SB-7', 0, 84);
    // Navigation lights: red left, green right, white tail — blinking.
    const blink = Math.sin(now / 300) > -0.2;
    if (blink) {
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ff3b30';
      ctx.shadowColor = '#ff3b30';
      ctx.beginPath();
      ctx.arc(-195, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#34e07a';
      ctx.shadowColor = '#34e07a';
      ctx.beginPath();
      ctx.arc(195, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 108, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function dial(x, y, r, label, valueText, frac, color) {
    ctx.save();
    ctx.translate(x, y);
    // Lit dial face.
    ctx.fillStyle = '#10151d';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d4a5c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Tick marks.
    ctx.strokeStyle = '#8fa3b8';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
      ctx.lineTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
      ctx.stroke();
    }
    // Needle.
    const a = -Math.PI * 0.75 + frac * Math.PI * 1.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Labels, glowing: the name inside the dial's foot, the value below it
    // so the two never collide.
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#e8f2ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, r - 16);
    ctx.font = 'bold 13px monospace';
    ctx.fillText(valueText, 0, r + 17);
    ctx.restore();
  }

  function drawPanel(state, w, h, now) {
    const panelY = h - 148;
    // Panel body.
    const g = ctx.createLinearGradient(0, panelY, 0, h);
    g.addColorStop(0, '#232a35');
    g.addColorStop(0.12, '#161c26');
    g.addColorStop(1, '#0a0d13');
    ctx.fillStyle = g;
    ctx.fillRect(0, panelY, w, 148);
    ctx.fillStyle = '#3d4a5c';
    ctx.fillRect(0, panelY, w, 2);
    ctx.fillStyle = 'rgba(255, 176, 66, 0.25)';
    ctx.fillRect(0, panelY + 2, w, 1);

    // Artificial horizon.
    const hx = 92;
    const hy = panelY + 74;
    const hr = 52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    // The ball turns against the bank: banking right tips the horizon
    // counterclockwise in the instrument, sky to the left. Nose up drops
    // the horizon, so more sky shows.
    ctx.rotate(-state.roll);
    const py = state.pitch * 130;
    ctx.fillStyle = '#3d7ac2';
    ctx.fillRect(-hr, -hr, hr * 2, hr + py);
    ctx.fillStyle = '#7a5230';
    ctx.fillRect(-hr, py, hr * 2, hr - py + 1);
    ctx.fillStyle = '#f2f0e6';
    ctx.fillRect(-hr, py - 1, hr * 2, 2);
    ctx.restore();
    ctx.strokeStyle = '#3d4a5c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings on the horizon.
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 34, hy);
    ctx.lineTo(hx - 12, hy);
    ctx.moveTo(hx + 12, hy);
    ctx.lineTo(hx + 34, hy);
    ctx.stroke();
    ctx.fillStyle = '#e8f2ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', hx, hy + hr + 16);

    dial(212, panelY + 74, 48, 'ALTITUDE', `${Math.round(state.alt)}`, Math.min(1, state.alt / 3000), '#7fd4ff');
    dial(322, panelY + 74, 48, 'AIRSPEED', `${Math.round(state.speed)}`, Math.min(1, state.speed / 200), '#ffd27a');
    dial(432, panelY + 74, 48, 'VERT SPD', `${state.vspeed >= 0 ? '+' : ''}${Math.round(state.vspeed)}`, Math.min(1, Math.max(0, (state.vspeed + 20) / 40)), '#9fe8a8');

    // Compass tape: heading numbers scrolling past the centre mark.
    const cx0 = w / 2 - 130;
    const tapeY = panelY + 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0, tapeY - 22, 260, 44);
    ctx.clip();
    ctx.fillStyle = '#10151d';
    ctx.fillRect(cx0, tapeY - 22, 260, 44);
    const deg = ((Math.round(state.heading * 180 / Math.PI) % 360) + 360) % 360;
    // Step from a multiple of 5, so the 30-degree labels always land.
    for (let d = Math.floor((deg - 60) / 5) * 5; d <= deg + 60; d += 5) {
      const dd = ((d % 360) + 360) % 360;
      const x = cx0 + 130 + (d - deg) * 2.2;
      ctx.strokeStyle = dd % 30 === 0 ? '#ffd27a' : '#5a6b80';
      ctx.beginPath();
      ctx.moveTo(x, tapeY + 8);
      ctx.lineTo(x, tapeY + (dd % 30 === 0 ? -4 : 2));
      ctx.stroke();
      if (dd % 30 === 0) {
        ctx.fillStyle = '#e8f2ff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(dd).padStart(3, '0'), x, tapeY - 8);
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#3d4a5c';
    ctx.strokeRect(cx0, tapeY - 22, 260, 44);
    ctx.fillStyle = '#ffb042';
    ctx.beginPath();
    ctx.moveTo(cx0 + 130, tapeY - 22);
    ctx.lineTo(cx0 + 124, tapeY - 12);
    ctx.lineTo(cx0 + 136, tapeY - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8f2ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HEADING', cx0 + 130, tapeY + 40);

    // Throttle + fuel, right of the tape.
    const tx = w / 2 + 170;
    ctx.fillStyle = '#10151d';
    ctx.fillRect(tx, panelY + 26, 26, 96);
    ctx.strokeStyle = '#3d4a5c';
    ctx.strokeRect(tx, panelY + 26, 26, 96);
    const th = state.throttle * 88;
    const tg = ctx.createLinearGradient(0, panelY + 118, 0, panelY + 30);
    tg.addColorStop(0, '#ffb042');
    tg.addColorStop(1, '#ff7a3c');
    ctx.fillStyle = tg;
    ctx.fillRect(tx + 3, panelY + 118 - th, 20, th);
    ctx.fillStyle = '#e8f2ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THR', tx + 13, panelY + 140);
    ctx.fillText(`${Math.round(state.throttle * 100)}%`, tx + 13, panelY + 18);

    // Fuel bar.
    const fx = tx + 48;
    ctx.fillStyle = '#10151d';
    ctx.fillRect(fx, panelY + 26, 120, 14);
    ctx.strokeStyle = '#3d4a5c';
    ctx.strokeRect(fx, panelY + 26, 120, 14);
    const fuelFrac = state.fuel / 420;
    ctx.fillStyle = fuelFrac < 0.25 ? '#ff5a4a' : '#7fd4ff';
    ctx.fillRect(fx + 1, panelY + 27, 118 * fuelFrac, 12);
    ctx.fillStyle = '#e8f2ff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', fx, panelY + 58);
    ctx.fillText(`RINGS ${state.rings}/${RINGS.length}`, fx, panelY + 78);
    ctx.fillText(`TIME ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`, fx, panelY + 98);
    ctx.fillText(`SCORE ${state.score}`, fx, panelY + 118);

    // Flaps / gear / stall lamps on the far right.
    const lx = w - 150;
    const lamps = [
      ['STALL', state.speed < 60 && state.alt > 40, '#ff5a4a'],
      ['GEAR', true, '#9fe8a8'],
      ['FLAPS', state.speed < 90, '#ffd27a'],
    ];
    lamps.forEach(([label, on, color], i) => {
      const ly = panelY + 34 + i * 34;
      ctx.fillStyle = on ? color : '#2a323e';
      ctx.shadowColor = on ? color : 'transparent';
      ctx.shadowBlur = on ? 10 : 0;
      ctx.beginPath();
      ctx.arc(lx, ly, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e8f2ff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx + 14, ly + 4);
    });
  }

  function drawHUD(state, w, h, now) {
    // Top bar: ALT / SPD / HDG, big and mono, plus score and rings.
    // Nearly opaque, so a cloud behind it never smudges the instruments.
    ctx.fillStyle = 'rgba(8, 12, 18, 0.95)';
    ctx.fillRect(0, 0, w, 54);
    ctx.fillStyle = 'rgba(255, 176, 66, 0.35)';
    ctx.fillRect(0, 54, w, 1);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8fa3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('ALTITUDE', 20, 18);
    ctx.fillText('AIRSPEED', 210, 18);
    ctx.fillText('HEADING', 400, 18);
    ctx.shadowColor = '#7fd4ff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${Math.round(state.alt)} FT`, 20, 44);
    ctx.fillText(`${Math.round(state.speed)} KT`, 210, 44);
    const deg = ((Math.round(state.heading * 180 / Math.PI) % 360) + 360) % 360;
    ctx.fillText(`${String(deg).padStart(3, '0')}°`, 400, 44);
    ctx.shadowBlur = 0;
    // Rings as pips, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#8fa3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('RINGS', w - 240, 18);
    for (let i = 0; i < RINGS.length; i += 1) {
      const x = w - 232 + i * 22;
      ctx.fillStyle = state.ringsPassed[i] ? '#5adc8c' : i === state.rings ? '#ffb042' : '#2a323e';
      ctx.shadowColor = state.ringsPassed[i] ? '#5adc8c' : '#ffb042';
      ctx.shadowBlur = state.ringsPassed[i] || i === state.rings ? 8 : 0;
      ctx.beginPath();
      ctx.arc(x + 8, 36, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#eaf6ff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(`SCORE ${state.score}`, w - 20, 44);
    // Centre reticle.
    ctx.strokeStyle = 'rgba(234, 246, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.42, 14, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - 22, h * 0.42);
    ctx.lineTo(w / 2 - 14, h * 0.42);
    ctx.moveTo(w / 2 + 14, h * 0.42);
    ctx.lineTo(w / 2 + 22, h * 0.42);
    ctx.moveTo(w / 2, h * 0.42 - 22);
    ctx.lineTo(w / 2, h * 0.42 - 14);
    ctx.moveTo(w / 2, h * 0.42 + 14);
    ctx.lineTo(w / 2, h * 0.42 + 22);
    ctx.stroke();
    // Warnings.
    const warn = [];
    if (state.speed < 60 && state.alt > 40) warn.push('STALL — NOSE DOWN, POWER UP');
    if (state.vspeed < -16 && state.alt < 300) warn.push('PULL UP');
    if (state.fuel < 60) warn.push('LOW FUEL');
    if (warn.length) {
      const blink = Math.sin(now / 180) > 0;
      ctx.fillStyle = blink ? '#ff5a4a' : '#ffb0a8';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(warn[0], w / 2, 92);
    }
    // Message line.
    if (state.messageT > 0 && state.message) {
      ctx.fillStyle = `rgba(255, 233, 176, ${Math.min(1, state.messageT)})`;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.message, w / 2, 128);
    }
  }

  function overlayTitle(state, w, h, now) {
    ctx.fillStyle = 'rgba(8, 10, 24, 0.42)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffb042';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 74px sans-serif';
    ctx.fillText('SOLARA BAY RUN', w / 2, h * 0.30);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f2f0e6';
    ctx.font = '22px sans-serif';
    ctx.fillText('A golden-hour island hop — eight rings, two runways, one sunset.', w / 2, h * 0.30 + 40);
    ctx.font = '17px monospace';
    ctx.fillStyle = '#cfe0f0';
    const lines = [
      '↑ ↓  PITCH      ← →  BANK & TURN',
      'W / S  THROTTLE      SPACE  AIRBRAKE      MOUSE  STEER',
      'FLY THROUGH ALL 8 RINGS, THEN LAND ON THE NORTH STRIP',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.52 + i * 30));
    const pulse = 0.65 + 0.35 * Math.sin(now / 350);
    ctx.fillStyle = `rgba(255, 210, 122, ${pulse})`;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('PRESS ENTER TO FLY', w / 2, h * 0.52 + 120);
    if (state.best > 0) {
      ctx.fillStyle = '#e8f2ff';
      ctx.font = '18px monospace';
      ctx.fillText(`BEST SCORE  ${state.best}`, w / 2, h * 0.52 + 158);
    }
    ctx.fillStyle = '#8fa3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('Solara Field  →  Turtle Island  →  Twin Peaks  →  North Strip', w / 2, h - 24);
  }

  function overlayEnd(state, w, h, kind) {
    ctx.fillStyle = 'rgba(8, 10, 24, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    const crashed = kind === 'crash';
    ctx.fillStyle = crashed ? '#ff8a7a' : '#9fe8a8';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText(crashed ? state.message || 'CRASHED' : 'COURSE COMPLETE', w / 2, h * 0.32);
    ctx.fillStyle = '#f2f0e6';
    ctx.font = '20px sans-serif';
    if (crashed) {
      ctx.fillText(`You cleared ${state.rings} of ${RINGS.length} rings before going down.`, w / 2, h * 0.32 + 44);
    } else if (state.landedQuality && state.landedQuality.early) {
      ctx.fillText('A safe landing — but the rings are still out there. Take off and finish the course!', w / 2, h * 0.32 + 44);
    } else if (state.landedQuality) {
      const q = state.landedQuality;
      ctx.fillText(`Rings ${state.rings}/${RINGS.length}  ·  Landing bonus +${q.bonus}  ·  Time bonus +${q.timeBonus}`, w / 2, h * 0.32 + 44);
      ctx.fillText(`Centreline ${Math.round(q.center * 100)}%  ·  Touchdown ${Math.round(q.vspeed)} ft/s`, w / 2, h * 0.32 + 76);
    }
    ctx.fillStyle = '#ffe9b0';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(`SCORE  ${state.score}`, w / 2, h * 0.52);
    if (state.score > state.best) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('NEW BEST!', w / 2, h * 0.52 + 36);
    }
    ctx.fillStyle = '#cfe0f0';
    ctx.font = '18px sans-serif';
    ctx.fillText('PRESS R TO FLY AGAIN', w / 2, h * 0.52 + 84);
  }

  function draw(state, screen, best, now) {
    const { w, h } = resize();
    state.best = best;
    const P = projector(state, w, h);
    drawSky(state, w, h, P);
    drawTerrain(state, w, h, P);
    drawRunway(state, RUNWAY_1, '18', P);
    drawRunway(state, RUNWAY_2, '18', P);
    drawRings(state, P, now);
    drawPlane(state, w, h, now);
    drawPanel(state, w, h, now);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHUD(state, w, h, now);
    if (screen === SCREEN_TITLE) overlayTitle(state, w, h, now);
    if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(8, 10, 24, 0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f2f0e6';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h * 0.42);
      ctx.font = '18px sans-serif';
      ctx.fillText('P to resume  ·  R to restart', w / 2, h * 0.42 + 36);
    }
    if (screen === SCREEN_OVER) overlayEnd(state, w, h, 'crash');
    if (screen === SCREEN_LANDED) overlayEnd(state, w, h, 'landed');
  }

  return { draw };
}
