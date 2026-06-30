// ═══════════════════════════════════════════════════════
//  SOUND — programmatic engine audio via Web Audio API
//  RPM-based pitch, throttle-based volume, backfire FX
// ═══════════════════════════════════════════════════════

export function createSoundEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.75;
  master.connect(ctx.destination);

  // ── Noise buffer (shared by exhaust + backfire) ──
  const noiseLen = 2 * ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) noiseData[i] = Math.random() * 2 - 1;

  function makeNoiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  // ── Engine RPM oscillators ──
  // Fundamental + harmonics give a rich multi-cylinder sound
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const engineLP = ctx.createBiquadFilter();
  engineLP.type = 'lowpass';
  engineLP.frequency.value = 800;
  engineLP.Q.value = 1;
  engineGain.connect(engineLP);
  engineLP.connect(master);

  const oscs = [];
  // Harmonics: fundamental, 2x, 3x, 4x — decreasing volume
  const harmonicGains = [0.12, 0.06, 0.03, 0.015];
  for (let h = 0; h < 4; h++) {
    const osc = ctx.createOscillator();
    osc.type = h === 0 ? 'sawtooth' : 'square';
    osc.frequency.value = 40;
    const g = ctx.createGain();
    g.gain.value = harmonicGains[h];
    osc.connect(g);
    g.connect(engineGain);
    osc.start();
    oscs.push({ osc, gain: g });
  }

  // ── Exhaust rumble (low-passed noise, tracks RPM) ──
  const exhaustSrc = makeNoiseSource();
  const exhaustGain = ctx.createGain();
  exhaustGain.gain.value = 0;
  const exhaustLP = ctx.createBiquadFilter();
  exhaustLP.type = 'lowpass';
  exhaustLP.frequency.value = 200;
  exhaustLP.Q.value = 2;
  exhaustSrc.connect(exhaustLP);
  exhaustLP.connect(exhaustGain);
  exhaustGain.connect(master);
  exhaustSrc.start();

  // ── Turbo whine (high sine, appears at high RPM) ──
  const turboOsc = ctx.createOscillator();
  turboOsc.type = 'sine';
  turboOsc.frequency.value = 2000;
  const turboGain = ctx.createGain();
  turboGain.gain.value = 0;
  turboOsc.connect(turboGain);
  turboGain.connect(master);
  turboOsc.start();

  // ── Engine backfire pop (triggered occasionally on lift-off) ──
  let popCooldown = 0;
  function triggerPop() {
    const pop = ctx.createBufferSource();
    pop.buffer = noiseBuf;
    const popGain = ctx.createGain();
    popGain.gain.value = 0.15;
    const popLP = ctx.createBiquadFilter();
    popLP.type = 'lowpass';
    popLP.frequency.value = 600;
    pop.connect(popLP);
    popLP.connect(popGain);
    popGain.connect(master);
    pop.start();
    pop.stop(ctx.currentTime + 0.04 + Math.random() * 0.03);
    popGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.07);
  }

  // ── State tracking ──
  let smoothRPM = 800;   // idle
  let wasThrottle = false;
  let prevHighRPM = false;
  const IDLE_RPM = 800;
  const MAX_RPM = 7500;

  // ── Update function — call each frame ──
  function update(speed, absSpeed, isThrottle, dt) {
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const ramp = 0.05; // smooth param transitions (~50ms)

    // ── RPM: map speed → RPM, with throttle lag ──
    const speedFrac = Math.min(absSpeed / 180, 1); // 180 ≈ MAX_SPEED
    const targetRPM = IDLE_RPM + speedFrac * (MAX_RPM - IDLE_RPM);
    // RPM rises faster under throttle, falls slower
    const rpmRate = isThrottle ? 12 : 6;
    smoothRPM += (targetRPM - smoothRPM) * rpmRate * dt;
    smoothRPM = Math.max(IDLE_RPM, Math.min(MAX_RPM, smoothRPM));

    const rpmFrac = (smoothRPM - IDLE_RPM) / (MAX_RPM - IDLE_RPM);
    const baseFreq = 30 + rpmFrac * 150; // 30–180 Hz fundamental

    // ── Engine oscillators ──
    for (let h = 0; h < oscs.length; h++) {
      oscs[h].osc.frequency.linearRampToValueAtTime(baseFreq * (h + 1), now + ramp);
    }
    // Engine volume: louder with throttle, quieter coasting
    const throttleVol = isThrottle ? 0.7 + rpmFrac * 0.3 : 0.15 + rpmFrac * 0.15;
    engineGain.gain.linearRampToValueAtTime(throttleVol, now + ramp);
    // Engine LP opens up with RPM (more harmonics audible at high RPM)
    engineLP.frequency.linearRampToValueAtTime(500 + rpmFrac * 1500, now + ramp);

    // ── Exhaust rumble ──
    exhaustLP.frequency.linearRampToValueAtTime(100 + rpmFrac * 350, now + ramp);
    const exhaustVol = isThrottle ? 0.06 + rpmFrac * 0.08 : 0.02 + rpmFrac * 0.02;
    exhaustGain.gain.linearRampToValueAtTime(exhaustVol, now + ramp);

    // ── Turbo whine ──
    const turboActive = rpmFrac > 0.55;
    turboOsc.frequency.linearRampToValueAtTime(1800 + rpmFrac * 3000, now + ramp);
    const turboVol = turboActive ? (rpmFrac - 0.55) / 0.45 * 0.04 : 0;
    turboGain.gain.linearRampToValueAtTime(turboVol, now + ramp);

    // ── Backfire pops on throttle lift at high RPM ──
    popCooldown -= dt;
    const highRPM = rpmFrac > 0.4;
    if (wasThrottle && !isThrottle && prevHighRPM && popCooldown <= 0) {
      triggerPop();
      if (rpmFrac > 0.6 && Math.random() > 0.5) {
        setTimeout(() => triggerPop(), 60 + Math.random() * 80);
      }
      popCooldown = 0.3;
    }
    wasThrottle = isThrottle;
    prevHighRPM = highRPM;
  }

  function reset() {
    smoothRPM = IDLE_RPM;
    wasThrottle = false;
    prevHighRPM = false;
    popCooldown = 0;
    const now = ctx.currentTime;
    const ramp = 0.05;
    // Reset all oscillators to idle
    for (let h = 0; h < oscs.length; h++) {
      oscs[h].osc.frequency.linearRampToValueAtTime(30 * (h + 1), now + ramp);
    }
    engineGain.gain.linearRampToValueAtTime(0, now + ramp);
    exhaustGain.gain.linearRampToValueAtTime(0, now + ramp);
    turboGain.gain.linearRampToValueAtTime(0, now + ramp);
  }

  return { update, reset, ctx, master, noiseBuf };
}
