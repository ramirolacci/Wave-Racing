// ═══════════════════════════════════════════════════════
//  MINIMAP — White track, no container, perspective tilt
// ═══════════════════════════════════════════════════════
import { trackCurve } from './track.js';

export function createMinimap(aiCars) {
  // Replace the old minimap canvas with our own
  const oldCanvas = document.getElementById('minimap');
  if (oldCanvas) oldCanvas.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'minimap';
  const MW = 180, MH = 180;
  canvas.width = MW;
  canvas.height = MH;
  canvas.style.cssText = `
    position: fixed;
    bottom: 18px;
    right: 18px;
    width: ${MW}px;
    height: ${MH}px;
    pointer-events: none;
    z-index: 100;
    opacity: 0.85;
  `;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  // Pre-compute track points
  const NUM_PTS = 200;
  const pts = [];
  for (let i = 0; i <= NUM_PTS; i++) {
    pts.push(trackCurve.getPointAt(i / NUM_PTS));
  }

  // Track bounds
  let mMinX = Infinity, mMaxX = -Infinity, mMinZ = Infinity, mMaxZ = -Infinity;
  for (const p of pts) {
    mMinX = Math.min(mMinX, p.x); mMaxX = Math.max(mMaxX, p.x);
    mMinZ = Math.min(mMinZ, p.z); mMaxZ = Math.max(mMaxZ, p.z);
  }
  const pad = Math.max(mMaxX - mMinX, mMaxZ - mMinZ) * 0.14;
  mMinX -= pad; mMaxX += pad; mMinZ -= pad; mMaxZ += pad;

  let frameFn = null;
  function setFrame(fn) { frameFn = fn; }

  function draw(player) {
    const w = MW, h = MH;
    ctx.clearRect(0, 0, w, h);

    // Scale: fit track into canvas with margin
    const scaleX = (w - 20) / (mMaxX - mMinX);
    const scaleZ = (h - 20) / (mMaxZ - mMinZ);
    const scale = Math.min(scaleX, scaleZ);

    // Simple top-down projection (no rotation)
    function toScreen(wx, wz) {
      const sx = ((wx - mMinX) / (mMaxX - mMinX)) * (w - 16) + 8;
      const sy = ((mMaxZ - wz) / (mMaxZ - mMinZ)) * (h - 16) + 8; // flip Z so north=up
      return [sx, sy];
    }

    // ── Draw track path ──
    // Outer glow
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.25)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= NUM_PTS; i++) {
      const [sx, sy] = toScreen(pts[i].x, pts[i].z);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Track center line (thinner, brighter)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= NUM_PTS; i++) {
      const [sx, sy] = toScreen(pts[i].x, pts[i].z);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.stroke();

    // ── Dashed center line ──
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= NUM_PTS; i++) {
      const [sx, sy] = toScreen(pts[i].x, pts[i].z);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── AI car dots ──
    if (frameFn) {
      for (const ai of aiCars) {
        const ap = { x: ai.x, z: ai.z };
        const [ax, ay] = toScreen(ap.x, ap.z);
        // Check if on screen
        if (ax < -5 || ax > w + 5 || ay < -5 || ay > h + 5) continue;
        ctx.fillStyle = '#' + ai.color.toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fill();
        // Tiny white outline
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // ── Player marker ──
    const [px, py] = toScreen(player.x, player.z);
    // Arrow rotated to match player heading
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.heading); // rotate arrow to face heading direction
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -7);   // tip (forward = up when heading=0)
    ctx.lineTo(-5, 4);   // left
    ctx.lineTo(5, 4);    // right
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return { draw, setFrame };
}
