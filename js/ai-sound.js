// ═══════════════════════════════════════════════════════
//  AI SOUND — per-car engine with distance-based 3D pan
//  Closer = louder, farther = silent. Uses PannerNode.
// ═══════════════════════════════════════════════════════

export function createAISound(ctx, master, noiseBuf) {
  const voices = [];
  const MAX_DIST = 80;   // beyond this, silent
  const REF_DIST = 8;    // full volume within this

  function makeVoice() {
    // Per-car gain (distance-based)
    const distGain = ctx.createGain();
    distGain.gain.value = 0;

    // 3D panner
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.maxDistance = 1;
    panner.refDistance = 1;
    panner.rolloffFactor = 0;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    distGain.connect(panner);
    panner.connect(master);

    // Simple engine: sawtooth + lowpass (lighter than player's 4-osc setup)
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 1;
    osc.connect(oscGain);
    oscGain.connect(lp);
    lp.connect(distGain);
    osc.start();

    // Exhaust: filtered noise, quiet
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = noiseBuf;
    nSrc.loop = true;
    const nLP = ctx.createBiquadFilter();
    nLP.type = 'lowpass';
    nLP.frequency.value = 200;
    nLP.Q.value = 1.5;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.06;
    nSrc.connect(nLP);
    nLP.connect(nGain);
    nGain.connect(distGain);
    nSrc.start();

    return { osc, oscGain, lp, nLP, nGain, distGain, panner, smoothRPM: 800 };
  }

  return {
    // Call once per AI car to create its voice
    addCar() {
      const v = makeVoice();
      voices.push(v);
      return voices.length - 1;
    },

    // Call each frame with each car's data
    updateCar(idx, x, y, z, speed, playerX, playerY, playerZ, playerHeading, dt) {
      if (idx >= voices.length) return;
      const v = voices[idx];
      const now = ctx.currentTime;
      const ramp = 0.05;

      // ── Distance-based volume ──
      const dx = x - playerX;
      const dy = y - playerY;
      const dz = z - playerZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const vol = dist < MAX_DIST ? Math.max(0, 1 - dist / MAX_DIST) : 0;
      // Smooth it
      const curVol = v.distGain.gain.value;
      const newVol = curVol + (vol - curVol) * Math.min(1, 8 * dt);
      v.distGain.gain.setTargetAtTime(newVol, now, 0.05);

      // ── Position the panner relative to player heading ──
      v.panner.positionX.setValueAtTime(x, now);
      v.panner.positionY.setValueAtTime(y, now);
      v.panner.positionZ.setValueAtTime(z, now);

      // ── RPM from speed ──
      const IDLE = 800, MAX = 6500;
      const speedFrac = Math.min(Math.abs(speed) / 120, 1);
      const targetRPM = IDLE + speedFrac * (MAX - IDLE);
      v.smoothRPM += (targetRPM - v.smoothRPM) * 6 * dt;
      const rpmFrac = (v.smoothRPM - IDLE) / (MAX - IDLE);
      const baseFreq = 30 + rpmFrac * 120;

      // ── Engine pitch + filter ──
      v.osc.frequency.linearRampToValueAtTime(baseFreq, now + ramp);
      v.lp.frequency.linearRampToValueAtTime(400 + rpmFrac * 1200, now + ramp);
      v.oscGain.gain.linearRampToValueAtTime(0.20 + rpmFrac * 0.16, now + ramp);

      // ── Exhaust ──
      v.nLP.frequency.linearRampToValueAtTime(80 + rpmFrac * 250, now + ramp);
      v.nGain.gain.linearRampToValueAtTime(0.03 + rpmFrac * 0.06, now + ramp);
    },

    reset() {
      const now = ctx.currentTime;
      const ramp = 0.05;
      for (const v of voices) {
        v.smoothRPM = 800;
        v.osc.frequency.linearRampToValueAtTime(30, now + ramp);
        v.distGain.gain.linearRampToValueAtTime(0, now + ramp);
      }
    },
  };
}
