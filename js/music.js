// ═══════════════════════════════════════════════════════
//  MUSIC — 8-bit chiptune soundtrack, picks 1 of 3 at load
//  Nitro Dash / Midnight Circuit / Coastal Drive
// ═══════════════════════════════════════════════════════

export function createMusic() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.50;
  master.connect(ctx.destination);

  // ── Helpers ──
  function midiToHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function makePulse(duty) {
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  const pulse25 = makePulse(0.25);
  const pulse50 = makePulse(0.5);

  const noiseLen = 0.5 * ctx.sampleRate;
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

  function playPulse(wave, note, start, dur, vol) {
    if (!note) return;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = midiToHz(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.005);
    g.gain.setValueAtTime(vol, start + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g); g.connect(master);
    osc.start(start); osc.stop(start + dur + 0.01);
  }

  function playTri(note, start, dur, vol) {
    if (!note) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiToHz(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.003);
    g.gain.setValueAtTime(vol, start + dur - 0.015);
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g); g.connect(master);
    osc.start(start); osc.stop(start + dur + 0.01);
  }

  function playNoise(start, dur, vol, hpFreq, lpFreq) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.linearRampToValueAtTime(0, start + dur);
    if (hpFreq) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpFreq;
      src.connect(hp); hp.connect(g);
    } else if (lpFreq) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpFreq;
      src.connect(lp); lp.connect(g);
    } else {
      src.connect(g);
    }
    g.connect(master);
    src.start(start); src.stop(start + dur + 0.01);
  }

  // ══════════════════════════════════════════════
  //  Track 1: Nitro Dash (170 BPM, C minor)
  // ══════════════════════════════════════════════
  function nitroDash() {
    const bpm = 170;
    const step = 60 / bpm / 4;
    const bars = 32;
    const loopLen = bars * 16 * step;

    const leadPattern = [
      72,0,75,0, 79,77,75,72,  70,0,72,0, 75,0,72,0,
      72,0,75,0, 79,80,79,75,  72,0,70,0, 67,0,0,0,
      75,0,79,0, 82,80,79,75,  72,0,75,0, 72,0,70,0,
      67,0,70,0, 72,75,77,79,  80,0,79,0, 75,0,0,0,
      80,0,79,0, 75,0,72,0,  70,0,72,75, 79,0,77,0,
      75,0,72,0, 70,72,75,0,  79,80,82,0, 80,0,0,0,
      82,0,80,0, 79,0,75,0,  77,79,80,0, 82,0,80,0,
      79,77,75,72, 70,72,75,0,  79,0,72,0, 0,0,0,0,
    ];

    const bassPatterns = [
      [36,0,36,0,36,0,36,0,39,0,39,0,43,0,41,0],
      [36,0,36,0,39,0,36,0,43,0,41,0,39,0,36,0],
      [36,0,36,36,39,0,36,0,43,0,43,41,39,0,36,0],
      [36,0,39,0,36,0,43,0,41,0,39,0,43,0,0,0],
      [32,0,32,0,32,0,32,0,36,0,36,0,39,0,38,0],
      [32,0,32,0,36,0,32,0,39,0,38,0,36,0,32,0],
      [32,0,32,32,36,0,32,0,39,0,39,38,36,0,32,0],
      [32,0,36,0,32,0,39,0,38,0,36,0,39,0,0,0],
      [39,0,39,0,39,0,39,0,43,0,43,0,46,0,44,0],
      [39,0,39,0,43,0,39,0,46,0,44,0,43,0,39,0],
      [39,0,39,39,43,0,39,0,46,0,46,44,43,0,39,0],
      [39,0,43,0,39,0,46,0,44,0,43,0,46,0,0,0],
      [34,0,34,0,34,0,34,0,38,0,38,0,41,0,39,0],
      [34,0,34,0,38,0,34,0,41,0,39,0,38,0,34,0],
      [34,0,34,34,38,0,34,0,41,0,41,39,38,0,34,0],
      [34,0,38,0,34,0,41,0,39,0,38,0,41,0,0,0],
      [36,0,36,0,36,0,36,0,39,0,39,0,43,0,41,0],
      [36,0,36,0,39,0,36,0,43,0,41,0,39,0,36,0],
      [36,0,36,36,39,0,36,0,43,0,43,41,39,0,36,0],
      [36,0,39,0,36,0,43,0,41,0,39,0,43,0,0,0],
      [32,0,32,0,32,0,32,0,36,0,36,0,39,0,38,0],
      [32,0,32,0,36,0,32,0,39,0,38,0,36,0,32,0],
      [32,0,32,32,36,0,32,0,39,0,39,38,36,0,32,0],
      [32,0,36,0,32,0,39,0,38,0,36,0,39,0,0,0],
      [29,0,29,0,29,0,29,0,32,0,32,0,36,0,34,0],
      [29,0,29,0,32,0,29,0,36,0,34,0,32,0,29,0],
      [29,0,29,29,32,0,29,0,36,0,36,34,32,0,29,0],
      [29,0,32,0,29,0,36,0,34,0,32,0,36,0,0,0],
      [31,0,31,0,31,0,31,0,35,0,35,0,38,0,36,0],
      [31,0,31,0,35,0,31,0,38,0,36,0,35,0,31,0],
      [31,0,31,31,35,0,31,0,38,0,38,36,35,0,31,0],
      [31,0,35,0,31,0,38,0,36,0,35,0,38,0,0,0],
    ];

    function schedule(startTime) {
      const t = startTime;
      for (let bar = 0; bar < bars; bar++) {
        const barStart = t + bar * 16 * step;
        const transpose = bar >= 24 ? 0 : (bar >= 16 ? -2 : 0);
        for (let s = 0; s < 16; s++) {
          const patIdx = ((bar % 8) * 16 + s) % leadPattern.length;
          const note = leadPattern[patIdx];
          if (note) playPulse(pulse25, note + transpose, barStart + s * step, step * 0.8, 0.12);
        }
        const bp = bassPatterns[bar];
        for (let s = 0; s < 16; s++) {
          if (bp[s]) playTri(bp[s], barStart + s * step, step * 1.5, 0.18);
        }
        for (let s = 0; s < 16; s++) {
          if (s % 2 === 0) playNoise(barStart + s * step, step * 0.3, 0.06, 8000, null);
          if (s === 0 || s === 8) playNoise(barStart + s * step, step * 2, 0.15, null, 400);
          if (s === 4 || s === 12) playNoise(barStart + s * step, step * 1.5, 0.1, 2000, null);
        }
      }
    }

    return { loopLen, schedule };
  }

  // ══════════════════════════════════════════════
  //  Track 2: Midnight Circuit (155 BPM, A minor)
  // ══════════════════════════════════════════════
  function midnightCircuit() {
    const bpm = 155;
    const step = 60 / bpm / 4;
    const bars = 30;
    const loopLen = bars * 16 * step;

    const leadNotes = [
      76,0,74,0,72,0,71,0,69,0,71,0,72,0,74,0,
      76,0,77,0,76,0,74,0,72,0,69,0,71,0,0,0,
      77,0,76,0,74,0,72,0,77,0,76,0,74,0,72,0,
      69,0,72,0,74,0,76,0,77,0,74,0,72,0,0,0,
      72,0,76,0,79,0,77,0,76,0,74,0,72,0,76,0,
      79,0,81,0,79,0,77,0,76,0,74,0,72,0,0,0,
      79,0,77,0,74,0,72,0,74,0,76,0,77,0,79,0,
      81,0,79,0,77,0,76,0,77,0,79,0,81,0,84,0,
      84,0,83,0,81,0,79,0,77,0,76,0,77,0,0,0,
    ];

    const bassNotes = [
      33,0,33,0,33,0,36,0,33,0,33,0,40,0,38,0,
      33,0,33,0,36,0,33,0,38,0,36,0,33,0,0,0,
      33,0,33,33,36,0,33,0,40,0,40,38,36,0,33,0,
      33,0,36,0,33,0,40,0,38,0,36,0,40,0,0,0,
      29,0,29,0,29,0,32,0,29,0,29,0,36,0,34,0,
      29,0,29,0,32,0,29,0,34,0,32,0,29,0,0,0,
      29,0,29,29,32,0,29,0,36,0,36,34,32,0,29,0,
      29,0,32,0,29,0,36,0,34,0,32,0,36,0,0,0,
      36,0,36,0,36,0,40,0,36,0,36,0,43,0,41,0,
      36,0,36,0,40,0,36,0,41,0,40,0,36,0,0,0,
      36,0,36,36,40,0,36,0,43,0,43,41,40,0,36,0,
      36,0,40,0,36,0,43,0,41,0,40,0,43,0,0,0,
      31,0,31,0,31,0,35,0,31,0,31,0,38,0,36,0,
      31,0,31,0,35,0,31,0,36,0,35,0,31,0,0,0,
      31,0,31,31,35,0,31,0,38,0,38,36,35,0,31,0,
      31,0,35,0,31,0,38,0,36,0,35,0,38,0,0,0,
      31,0,35,0,38,0,36,0,35,0,31,0,35,0,0,0,
      38,0,36,0,35,0,31,0,35,0,38,0,40,0,0,0,
    ];

    function schedule(startTime) {
      const t = startTime;
      for (let bar = 0; bar < bars; bar++) {
        const barStart = t + bar * 16 * step;
        for (let s = 0; s < 16; s++) {
          const idx = bar * 16 + s;
          if (idx < leadNotes.length && leadNotes[idx])
            playPulse(pulse25, leadNotes[idx], barStart + s * step, step * 0.7, 0.10);
        }
        for (let s = 0; s < 16; s++) {
          const idx = bar * 16 + s;
          if (idx < bassNotes.length && bassNotes[idx])
            playTri(bassNotes[idx], barStart + s * step, step * 1.4, 0.20);
        }
        for (let s = 0; s < 16; s++) {
          if (s % 2 === 0) playNoise(barStart + s * step, step * 0.25, 0.05, 9000, null);
          if (s === 0 || s === 8) playNoise(barStart + s * step, step * 2.5, 0.18, null, 350);
          if (s === 4 || s === 12) playNoise(barStart + s * step, step * 1.2, 0.09, 2200, null);
          if (bar % 4 === 3 && s === 14) {
            playNoise(barStart + s * step, step * 0.5, 0.07, 5000, null);
            playNoise(barStart + (s + 0.66) * step, step * 0.5, 0.07, 5000, null);
          }
        }
      }
    }

    return { loopLen, schedule };
  }

  // ══════════════════════════════════════════════
  //  Track 3: Coastal Drive (140 BPM, G major)
  // ══════════════════════════════════════════════
  function coastalDrive() {
    const bpm = 140;
    const step = 60 / bpm / 4;
    const bars = 28;
    const loopLen = bars * 16 * step;

    const lead = [
      79,0,0,77,76,0,0,74,72,0,74,0,76,0,79,0,
      81,0,0,79,77,0,0,76,74,0,76,0,77,0,0,0,
      76,0,0,74,72,0,0,71,69,0,71,0,72,0,76,0,
      77,0,0,76,74,0,0,72,71,0,72,0,74,0,0,0,
      76,0,79,0,76,0,74,0,71,0,74,0,76,0,79,0,
      81,0,79,0,76,0,74,0,72,0,74,0,76,0,0,0,
      74,0,77,0,81,0,79,0,77,0,74,0,72,0,74,0,
      76,0,77,0,79,0,81,0,84,0,81,0,79,0,0,0,
      79,0,0,81,84,0,0,86,84,0,81,0,79,0,77,0,
      76,0,0,77,79,0,0,81,79,0,77,0,76,0,0,0,
      76,0,0,77,79,0,81,0,84,0,86,0,84,0,81,0,
      79,0,77,0,76,0,74,0,72,0,74,0,76,0,0,0,
    ];

    const bass = [
      [31,0,31,0,31,0,35,0,38,0,36,0,35,0,31,0],
      [31,0,35,0,38,0,36,0,35,0,31,0,35,0,0,0],
      [36,0,36,0,36,0,40,0,43,0,41,0,40,0,36,0],
      [36,0,40,0,43,0,41,0,40,0,36,0,40,0,0,0],
      [28,0,28,0,28,0,31,0,35,0,33,0,31,0,28,0],
      [28,0,31,0,35,0,33,0,31,0,28,0,31,0,0,0],
      [26,0,26,0,26,0,29,0,33,0,31,0,29,0,26,0],
      [26,0,29,0,33,0,31,0,29,0,26,0,33,0,0,0],
      [31,0,31,0,35,0,38,0,36,0,35,0,38,0,40,0],
      [43,0,41,0,40,0,38,0,36,0,35,0,38,0,0,0],
      [36,0,36,0,40,0,43,0,41,0,40,0,43,0,45,0],
      [48,0,47,0,45,0,43,0,41,0,40,0,43,0,0,0],
      [28,0,28,0,31,0,35,0,38,0,36,0,35,0,31,0],
      [26,0,29,0,33,0,36,0,38,0,40,0,43,0,0,0],
    ];

    function schedule(startTime) {
      const t = startTime;
      for (let bar = 0; bar < bars; bar++) {
        const barStart = t + bar * 16 * step;
        for (let s = 0; s < 16; s++) {
          const idx = bar * 16 + s;
          if (idx < lead.length && lead[idx])
            playPulse(pulse50, lead[idx], barStart + s * step, step * 1.2, 0.09);
        }
        const bassBar = bass[bar % bass.length];
        for (let s = 0; s < 16; s++) {
          if (bassBar[s]) playTri(bassBar[s], barStart + s * step, step * 1.5, 0.17);
        }
        for (let s = 0; s < 16; s++) {
          if (s % 2 === 0) playNoise(barStart + s * step, step * 0.15, 0.035, 10000, null);
          if (s === 0) playNoise(barStart + s * step, step * 2, 0.12, null, 300);
          if (s === 4) playNoise(barStart + s * step, step * 1, 0.06, 3000, null);
        }
      }
    }

    return { loopLen, schedule };
  }

  // ── Pick a random track ──
  const tracks = [nitroDash, midnightCircuit, coastalDrive];
  const trackNames = ['Nitro Dash', 'Midnight Circuit', 'Coastal Drive'];
  const pick = Math.floor(Math.random() * tracks.length);
  const track = tracks[pick]();
  let loopTimer = null;

  function scheduleLoop() {
    if (ctx.state === 'suspended') ctx.resume();
    track.schedule(ctx.currentTime + 0.05);
    loopTimer = setTimeout(scheduleLoop, (track.loopLen - 0.5) * 1000);
  }

  function start() {
    scheduleLoop();
  }

  function stop() {
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
  }

  return { start, stop, trackName: trackNames[pick] };
}
