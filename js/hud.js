// ═══════════════════════════════════════════════════════
//  HUD — Daytona-style minimal white gauge
//  One speedometer arc, transparent, vintage arcade
// ═══════════════════════════════════════════════════════

export function createHUD() {
  const canvas = document.createElement('canvas');
  canvas.id = 'hud-canvas';
  const SIZE = 220;
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = `
    position: fixed;
    bottom: 18px;
    left: 18px;
    pointer-events: none;
    z-index: 100;
    opacity: 0.88;
  `;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let smoothSpeed = 0;

  // Wait for font to load
  document.fonts.load('900 24px Orbitron').catch(() => {});

  // ── Single speed gauge ──
  function drawGauge(speed) {
    const cx = SIZE / 2;
    const cy = SIZE / 2 + 10;
    const r = 88;
    const maxSpeed = 160;

    const startA = Math.PI * 0.8;    // ~144°
    const endA = Math.PI * 2.2;      // ~396°
    const sweep = endA - startA;     // ~252°

    ctx.clearRect(0, 0, SIZE, SIZE);

    const clamped = Math.max(0, Math.min(speed / maxSpeed, 1.05));

    // ── Outer arc track (dim white) ──
    ctx.beginPath();
    ctx.arc(cx, cy, r, startA, endA);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();

    // ── Active arc (bright white) ──
    const activeEnd = startA + clamped * sweep;
    if (clamped > 0.005) {
      // Glow layer
      ctx.save();
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, activeEnd);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // Solid layer on top
      ctx.beginPath();
      ctx.arc(cx, cy, r, startA, activeEnd);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // ── Redline zone indicator ──
    const redlineT = 0.78;
    const redlineA = startA + redlineT * sweep;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, redlineA, endA);
    ctx.strokeStyle = 'rgba(255,60,40,0.35)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (clamped > redlineT) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,60,40,0.6)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, redlineA, activeEnd);
      ctx.strokeStyle = 'rgba(255,60,40,0.8)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // ── Tick marks ──
    const majorTicks = [0, 20, 40, 60, 80, 100, 120, 140, 160];
    const minorPerMajor = 5;

    // Minor ticks
    for (let i = 0; i < majorTicks.length - 1; i++) {
      for (let j = 1; j < minorPerMajor; j++) {
        const t = (majorTicks[i] + (majorTicks[i + 1] - majorTicks[i]) * j / minorPerMajor) / maxSpeed;
        const a = startA + t * sweep;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14));
        ctx.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Major ticks + labels
    for (const val of majorTicks) {
      const t = val / maxSpeed;
      const a = startA + t * sweep;
      const isRed = t >= redlineT;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16));
      ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
      ctx.strokeStyle = isRed ? 'rgba(255,80,60,0.8)' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Number label
      const lr = r - 26;
      const lx = cx + Math.cos(a) * lr;
      const ly = cy + Math.sin(a) * lr;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.fillStyle = isRed ? 'rgba(255,80,60,0.85)' : 'rgba(255,255,255,0.55)';
      ctx.font = '700 10px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val, 0, 0);
      ctx.restore();
    }

    // ── Needle ──
    const needleA = startA + clamped * sweep;
    const nLen = r - 4;
    const nTail = 14;
    const tipX = cx + Math.cos(needleA) * nLen;
    const tipY = cy + Math.sin(needleA) * nLen;
    const tailX = cx - Math.cos(needleA) * nTail;
    const tailY = cy - Math.sin(needleA) * nTail;

    // Needle glow
    ctx.save();
    ctx.shadowColor = clamped > redlineT ? 'rgba(255,60,40,0.8)' : 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = clamped > redlineT ? '#ff4030' : '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();

    // Center pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // ── Digital speed readout ──
    const speedVal = Math.round(speed);
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(speedVal, cx, cy + 32);
    ctx.restore();

    // "km/h" label
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '700 10px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('km/h', cx, cy + 50);
  }

  // ── Position & lap overlay (top corners) ──
  const overlay = document.createElement('canvas');
  overlay.id = 'hud-overlay';
  overlay.width = window.innerWidth;
  overlay.height = 80;
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 100;
    opacity: 0.9;
  `;
  document.body.appendChild(overlay);
  const octx = overlay.getContext('2d');

  function drawOverlay(position, lap, totalLaps, onTrack, time) {
    octx.clearRect(0, 0, overlay.width, overlay.height);

    // Position — top left, bold white
    const posText = `${position}`;
    octx.save();
    octx.font = '900 56px Orbitron, sans-serif';
    octx.textAlign = 'left';
    octx.textBaseline = 'top';
    // Dark outline for readability
    octx.strokeStyle = 'rgba(0,0,0,0.7)';
    octx.lineWidth = 6;
    octx.lineJoin = 'round';
    octx.strokeText(posText, 22, 10);
    // Position color — gold/silver/bronze/white
    const posColors = { 1: '#ffd700', 2: '#e0e0e0', 3: '#cd7f32' };
    octx.fillStyle = posColors[position] || '#ffffff';
    octx.fillText(posText, 22, 10);
    octx.restore();

    // "POSITION" label
    octx.save();
    octx.font = '700 11px Orbitron, sans-serif';
    octx.textAlign = 'left';
    octx.strokeStyle = 'rgba(0,0,0,0.6)';
    octx.lineWidth = 3;
    octx.lineJoin = 'round';
    octx.strokeText('POSITION', 24, 68);
    octx.fillStyle = 'rgba(255,255,255,0.5)';
    octx.fillText('POSITION', 24, 68);
    octx.restore();

    // Lap — top right
    const lapText = `LAP ${lap}/${totalLaps}`;
    octx.save();
    octx.font = '900 28px Orbitron, sans-serif';
    octx.textAlign = 'right';
    octx.textBaseline = 'top';
    octx.strokeStyle = 'rgba(0,0,0,0.7)';
    octx.lineWidth = 5;
    octx.lineJoin = 'round';
    octx.strokeText(lapText, overlay.width - 22, 18);
    octx.fillStyle = '#ffffff';
    octx.fillText(lapText, overlay.width - 22, 18);
    octx.restore();

    // Off-track warning
    if (!onTrack) {
      const flash = Math.sin(time * 10) > 0;
      if (flash) {
        octx.save();
        octx.font = '900 22px Orbitron, sans-serif';
        octx.textAlign = 'center';
        octx.strokeStyle = 'rgba(0,0,0,0.8)';
        octx.lineWidth = 5;
        octx.lineJoin = 'round';
        octx.strokeText('OFF TRACK', overlay.width / 2, 26);
        octx.fillStyle = '#ff3333';
        octx.fillText('OFF TRACK', overlay.width / 2, 26);
        octx.restore();
      }
    }
  }

  window.addEventListener('resize', () => {
    overlay.width = window.innerWidth;
  });

  // ── Main entry ──
  function draw(speed, onTrack, lap, position, totalLaps, totalRacers, time) {
    smoothSpeed += (speed - smoothSpeed) * 0.14;
    drawGauge(smoothSpeed);
    drawOverlay(position, lap, totalLaps, onTrack, time);
  }

  return { draw };
}
