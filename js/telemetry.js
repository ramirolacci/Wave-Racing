// ═══════════════════════════════════════════════════════
//  TELEMETRY — lap timing, sector splits, driving analysis
//  Records frame-by-frame data, detects laps, computes
//  statistics, and persists sessions to the server.
// ═══════════════════════════════════════════════════════

import { trackLen } from './track.js';

// ── Sectors: divide track into 3 equal sectors ──
export const NUM_SECTORS = 3;
export const SECTOR_BOUNDARIES = []; // t values where each sector starts
for (let i = 0; i < NUM_SECTORS; i++) {
  SECTOR_BOUNDARIES.push(i / NUM_SECTORS);
}

// ── Driving event types ──
export const EVENT = {
  LAP_START: 'lap_start',
  LAP_FINISH: 'lap_finish',
  SECTOR_CROSS: 'sector_cross',
  OFF_TRACK: 'off_track',
  ON_TRACK: 'on_track',
  DRIFT_START: 'drift_start',
  DRIFT_END: 'drift_end',
  COLLISION: 'collision',
  TOP_SPEED: 'top_speed',
  SPIN: 'spin',           // heading reversal
  REVERSE: 'reverse',     // going backwards
};

// ═══════════════════════════════════════════════════════
//  Session — one continuous driving session
// ═══════════════════════════════════════════════════════

export class TelemetrySession {
  constructor() {
    this.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.startedAt = performance.now();
    this.frames = [];          // sampled frame data
    this.events = [];           // discrete events
    this.laps = [];             // completed lap records
    this.currentLap = null;     // in-progress lap

    // ── Cumulative stats ──
    this.totalDistance = 0;
    this.totalOnTrackDist = 0;
    this.totalOffTrackDist = 0;
    this.totalDriftTime = 0;
    this.totalOffTrackTime = 0;
    this.topSpeed = 0;
    this.topSpeedKmh = 0;

    // ── Internal state ──
    this._prevTrackT = null;
    this._prevX = null;
    this._prevZ = null;
    this._wasOnTrack = true;
    this._wasDrifting = false;
    this._driftStart = null;
    this._offTrackStart = null;
    this._currentSector = 0;
    this._frameCount = 0;
    this._sampleInterval = 4;  // record every N frames
    this._lastTopSpeed = 0;
  }

  /**
   * Called every frame from the game loop
   * @param {object} player - G.player
   * @param {number} trackT - current track parameter (0-1)
   * @param {number} dt - delta time in seconds
   * @param {number} elapsed - total elapsed time in seconds
   */
  update(player, trackT, dt, elapsed) {
    this._frameCount++;

    const speed = Math.abs(player.speed);
    const speedKmh = speed * 8.75;
    const onTrack = player.onTrack;
    const x = player.x;
    const z = player.z;
    const heading = player.heading;
    const velHeading = player.velHeading;

    // ── Drift angle ──
    let driftAngle = heading - velHeading;
    while (driftAngle > Math.PI) driftAngle -= 2 * Math.PI;
    while (driftAngle < -Math.PI) driftAngle += 2 * Math.PI;
    const absDrift = Math.abs(driftAngle);
    const isDrifting = absDrift > 0.15 && speed > 3;

    // ── Distance traveled ──
    if (this._prevX !== null) {
      const dx = x - this._prevX;
      const dz = z - this._prevZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      this.totalDistance += dist;
      if (onTrack) this.totalOnTrackDist += dist;
      else this.totalOffTrackDist += dist;
    }
    this._prevX = x;
    this._prevZ = z;

    // ── Top speed ──
    if (speedKmh > this.topSpeedKmh) {
      this.topSpeedKmh = speedKmh;
      this.topSpeed = speed;
    }

    // ── Off-track tracking ──
    if (!onTrack && this._wasOnTrack) {
      this._offTrackStart = elapsed;
      this.events.push({ type: EVENT.OFF_TRACK, time: elapsed, x, z, speed: speedKmh });
    } else if (onTrack && !this._wasOnTrack) {
      const duration = elapsed - (this._offTrackStart || elapsed);
      this.totalOffTrackTime += duration;
      this.events.push({ type: EVENT.ON_TRACK, time: elapsed, x, z, offTrackDuration: duration });
    }
    if (!onTrack) {
      this.totalOffTrackTime += dt;
    }
    this._wasOnTrack = onTrack;

    // ── Drift tracking ──
    if (isDrifting && !this._wasDrifting) {
      this._driftStart = elapsed;
      this.events.push({ type: EVENT.DRIFT_START, time: elapsed, x, z, driftAngle: absDrift });
    } else if (!isDrifting && this._wasDrifting) {
      const duration = elapsed - (this._driftStart || elapsed);
      this.totalDriftTime += duration;
      this.events.push({ type: EVENT.DRIFT_END, time: elapsed, x, z, driftDuration: duration });
    }
    if (isDrifting) {
      this.totalDriftTime += dt;
    }
    this._wasDrifting = isDrifting;

    // ── Spin detection (heading reverses) ──
    if (absDrift > 2.5 && speed > 1) {
      this.events.push({ type: EVENT.SPIN, time: elapsed, x, z, heading, velHeading });
    }

    // ── Reverse detection ──
    if (player.speed < -2) {
      this.events.push({ type: EVENT.REVERSE, time: elapsed, x, z, speed: speedKmh });
    }

    // ── Sector crossing ──
    const currentSector = Math.floor(trackT * NUM_SECTORS) % NUM_SECTORS;
    if (currentSector !== this._currentSector && this.currentLap) {
      // We crossed into a new sector
      const prevSector = this._currentSector;
      const sectorTime = elapsed - (this.currentLap._sectorStartTimes[prevSector] || this.currentLap.lapStartTime);
      this.currentLap.sectorTimes[prevSector] = sectorTime;
      this.currentLap._sectorStartTimes[currentSector] = elapsed;
      this.events.push({
        type: EVENT.SECTOR_CROSS,
        time: elapsed,
        from: prevSector,
        to: currentSector,
        sectorTime,
      });
      this._currentSector = currentSector;
    }

    // ── Lap detection ──
    if (this._prevTrackT !== null) {
      const prevT = this._prevTrackT;
      const curT = trackT;

      // Forward lap crossing: prevT > 0.9 && curT < 0.1 && moving forward
      if (prevT > 0.85 && curT < 0.15 && speed > 1) {
        this._finishLap(elapsed, speedKmh);
        this._startLap(elapsed, trackT);
      }
    }

    // ── Start first lap if not yet started ──
    if (!this.currentLap && speed > 1) {
      this._startLap(elapsed, trackT);
    }

    this._prevTrackT = trackT;

    // ── Sample frame data (not every frame to save memory) ──
    if (this._frameCount % this._sampleInterval === 0) {
      this.frames.push({
        t: elapsed,
        x, z,
        speed: speedKmh,
        heading,
        driftAngle: absDrift,
        trackT,
        onTrack,
        lap: this.laps.length + (this.currentLap ? 1 : 0),
      });
    }
  }

  _startLap(elapsed, trackT) {
    this.currentLap = {
      lapStartTime: elapsed,
      trackT: trackT,
      sectorTimes: new Array(NUM_SECTORS).fill(null),
      _sectorStartTimes: (() => { const a = new Array(NUM_SECTORS).fill(null); a[0] = elapsed; return a; })(),
      topSpeed: 0,
      avgSpeed: 0,
      offTrackTime: 0,
      driftTime: 0,
    };
    this._currentSector = 0;
    this.events.push({ type: EVENT.LAP_START, time: elapsed, lapNumber: this.laps.length + 1 });
  }

  _finishLap(elapsed, speedKmh) {
    if (!this.currentLap) return;

    const lapTime = elapsed - this.currentLap.lapStartTime;

    // Compute final sector time if sector crossing didn't capture it
    for (let i = 0; i < NUM_SECTORS; i++) {
      if (this.currentLap.sectorTimes[i] === null) {
        const sectorStart = this.currentLap._sectorStartTimes[i] || this.currentLap.lapStartTime;
        this.currentLap.sectorTimes[i] = elapsed - sectorStart;
      }
    }

    const lapRecord = {
      lapNumber: this.laps.length + 1,
      lapTime,
      sectorTimes: [...this.currentLap.sectorTimes],
      topSpeed: this.topSpeedKmh, // approximate — session-level
    };
    this.laps.push(lapRecord);

    this.events.push({
      type: EVENT.LAP_FINISH,
      time: elapsed,
      lapNumber: lapRecord.lapNumber,
      lapTime,
      sectorTimes: [...this.currentLap.sectorTimes],
    });

    this.currentLap = null;
  }

  // ── Queries ──

  getBestLap() {
    if (this.laps.length === 0) return null;
    return this.laps.reduce((best, lap) =>
      lap.lapTime < best.lapTime ? lap : best
    , this.laps[0]);
  }

  getLastLap() {
    return this.laps.length > 0 ? this.laps[this.laps.length - 1] : null;
  }

  getCurrentLapTime(elapsed) {
    if (!this.currentLap) return null;
    return elapsed - this.currentLap.lapStartTime;
  }

  getBestSector(sectorIdx) {
    let best = Infinity;
    for (const lap of this.laps) {
      if (lap.sectorTimes[sectorIdx] != null && lap.sectorTimes[sectorIdx] < best) {
        best = lap.sectorTimes[sectorIdx];
      }
    }
    return best < Infinity ? best : null;
  }

  getAverageSpeed() {
    if (this.frames.length === 0) return 0;
    const sum = this.frames.reduce((s, f) => s + f.speed, 0);
    return sum / this.frames.length;
  }

  getConsistency() {
    // Standard deviation of lap times (lower = more consistent)
    if (this.laps.length < 2) return null;
    const times = this.laps.map(l => l.lapTime);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((s, t) => s + (t - mean) ** 2, 0) / times.length;
    return Math.sqrt(variance);
  }

  getTrackCoverage() {
    // What percentage of the track t-range has been visited
    if (this.frames.length === 0) return 0;
    const visited = new Set();
    for (const f of this.frames) {
      visited.add(Math.floor(f.trackT * 100)); // 100 buckets
    }
    return visited.size / 100;
  }

  getDrivingStyle() {
    const avgSpeed = this.getAverageSpeed();
    const driftRatio = this.totalDriftTime / Math.max(0.001, (performance.now() - this.startedAt) / 1000);
    const offTrackRatio = this.totalOffTrackTime / Math.max(0.001, (performance.now() - this.startedAt) / 1000);

    let style = 'Clean';
    if (driftRatio > 0.15) style = 'Drifter';
    else if (offTrackRatio > 0.1) style = 'Rally';
    else if (avgSpeed > 200) style = 'Speed Demon';
    else if (avgSpeed < 80) style = 'Cautious';
    return style;
  }

  // ── Serialize for server persistence ──

  toJSON() {
    return {
      sessionId: this.id,
      startedAt: this.startedAt,
      duration: (performance.now() - this.startedAt) / 1000,
      totalDistance: Math.round(this.totalDistance * 10) / 10,
      totalOnTrackDist: Math.round(this.totalOnTrackDist * 10) / 10,
      totalOffTrackDist: Math.round(this.totalOffTrackDist * 10) / 10,
      topSpeedKmh: Math.round(this.topSpeedKmh * 10) / 10,
      avgSpeedKmh: Math.round(this.getAverageSpeed() * 10) / 10,
      totalDriftTime: Math.round(this.totalDriftTime * 100) / 100,
      totalOffTrackTime: Math.round(this.totalOffTrackTime * 100) / 100,
      drivingStyle: this.getDrivingStyle(),
      trackCoverage: Math.round(this.getTrackCoverage() * 100),
      consistency: this.getConsistency() !== null ? Math.round(this.getConsistency() * 1000) / 1000 : null,
      laps: this.laps,
      bestLap: this.getBestLap(),
      bestSectors: Array.from({ length: NUM_SECTORS }, (_, i) => this.getBestSector(i)),
      events: this.events.slice(-200),  // keep last 200 events
      frames: this.frames.slice(-500),  // keep last 500 samples
    };
  }
}

// ═══════════════════════════════════════════════════════
//  Lap Timer HUD — overlay showing timing info
// ═══════════════════════════════════════════════════════

export function createLapTimerHUD() {
  const canvas = document.createElement('canvas');
  canvas.id = 'lap-timer';
  const W = 320, H = 160;
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = `
    position: fixed;
    top: 90px;
    right: 20px;
    pointer-events: none;
    z-index: 101;
    opacity: 0.92;
  `;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Wait for font
  document.fonts.load('700 16px Orbitron').catch(() => {});

  function formatTime(seconds) {
    if (seconds === null || seconds === undefined) return '--:--.---';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const wholeSecs = Math.floor(secs);
    const ms = Math.floor((secs - wholeSecs) * 1000);
    return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function draw(session, elapsed) {
    ctx.clearRect(0, 0, W, H);

    // ── Background panel ──
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 10);
    ctx.fill();
    ctx.restore();

    // ── Current lap time (large) ──
    const currentLapTime = session.getCurrentLapTime(elapsed);
    const isRunning = currentLapTime !== null;

    ctx.save();
    ctx.font = '900 28px Orbitron, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isRunning ? '#ffffff' : 'rgba(255,255,255,0.3)';
    ctx.fillText(formatTime(currentLapTime), W - 16, 12);
    ctx.restore();

    // "CURRENT" label
    ctx.save();
    ctx.font = '700 9px Orbitron, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('CURRENT LAP', W - 16, 44);
    ctx.restore();

    // ── Sector times ──
    const sectorLabels = ['S1', 'S2', 'S3'];
    const sectorColors = ['#ff6b6b', '#ffd93d', '#6bff6b'];
    const currentSectorTimes = session.currentLap ? session.currentLap.sectorTimes : [null, null, null];
    const bestSectors = Array.from({ length: NUM_SECTORS }, (_, i) => session.getBestSector(i));

    let sectorY = 60;
    for (let i = 0; i < NUM_SECTORS; i++) {
      const st = currentLapTime !== null ? currentSectorTimes[i] : null;

      ctx.save();
      ctx.font = '700 9px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = sectorColors[i];
      ctx.fillText(sectorLabels[i], 16, sectorY);
      ctx.restore();

      ctx.save();
      ctx.font = '700 14px Orbitron, monospace';
      ctx.textAlign = 'right';
      // Purple if new best sector
      const isBest = st !== null && bestSectors[i] !== null && Math.abs(st - bestSectors[i]) < 0.05;
      ctx.fillStyle = isBest ? '#c77dff' : st !== null ? '#ffffff' : 'rgba(255,255,255,0.25)';
      ctx.fillText(formatTime(st), 140, sectorY - 3);
      ctx.restore();

      // Best sector in dim
      ctx.save();
      ctx.font = '700 10px Orbitron, monospace';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText('best ' + formatTime(bestSectors[i]), 140, sectorY + 12);
      ctx.restore();

      sectorY += 30;
    }

    // ── Last Lap ──
    const lastLap = session.getLastLap();
    if (lastLap) {
      ctx.save();
      ctx.font = '700 9px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('LAST', 170, 60);
      ctx.restore();

      ctx.save();
      ctx.font = '700 16px Orbitron, monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(formatTime(lastLap.lapTime), 170, 73);
      ctx.restore();

      // ── Best Lap ──
      const bestLap = session.getBestLap();
      ctx.save();
      ctx.font = '700 9px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,200,0,0.6)';
      ctx.fillText('BEST', 170, 100);
      ctx.restore();

      ctx.save();
      ctx.font = '700 16px Orbitron, monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(formatTime(bestLap.lapTime), 170, 113);
      ctx.restore();

      // ── Delta (last vs best) ──
      if (bestLap && lastLap) {
        const delta = lastLap.lapTime - bestLap.lapTime;
        const isPositive = delta > 0.01;
        ctx.save();
        ctx.font = '700 12px Orbitron, monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = isPositive ? '#ff6b6b' : '#6bff6b';
        const sign = isPositive ? '+' : '';
        ctx.fillText(sign + delta.toFixed(3), 170, 134);
        ctx.restore();
      }
    }
  }

  return { canvas, draw, formatTime };
}

// ═══════════════════════════════════════════════════════
//  Session Reporter — generates detailed analysis
// ═══════════════════════════════════════════════════════

export function generateReport(session) {
  const data = session.toJSON();
  const lines = [];

  lines.push('═══════════════════════════════════════');
  lines.push('  🏁  DRIVING SESSION REPORT');
  lines.push('═══════════════════════════════════════');
  lines.push('');
  lines.push(`  Session:    ${data.sessionId}`);
  lines.push(`  Duration:   ${data.duration.toFixed(1)}s`);
  lines.push(`  Style:      ${data.drivingStyle}`);
  lines.push('');

  lines.push('── SPEED ──────────────────────────');
  lines.push(`  Top Speed:  ${data.topSpeedKmh} km/h`);
  lines.push(`  Avg Speed:  ${data.avgSpeedKmh} km/h`);
  lines.push('');

  lines.push('── TRACK ──────────────────────────');
  lines.push(`  Coverage:   ${data.trackCoverage}%`);
  lines.push(`  Off-Track:  ${data.totalOffTrackTime.toFixed(1)}s (${(data.totalOffTrackDist).toFixed(0)}m)`);
  lines.push('');

  lines.push('── DRIVING ────────────────────────');
  lines.push(`  Drift Time: ${data.totalDriftTime.toFixed(1)}s`);
  lines.push(`  Distance:   ${data.totalDistance.toFixed(0)}m total`);
  lines.push('');

  if (data.laps.length > 0) {
    lines.push('── LAPS ───────────────────────────');
    for (const lap of data.laps) {
      const marker = lap.lapTime === data.bestLap?.lapTime ? ' ⭐' : '';
      lines.push(`  Lap ${lap.lapNumber}: ${session.formatTime ? '' : ''}${formatTimeStatic(lap.lapTime)}${marker}`);
      if (lap.sectorTimes) {
        const sectors = lap.sectorTimes.map((st, i) => `S${i + 1}=${formatTimeStatic(st)}`).join('  ');
        lines.push(`           ${sectors}`);
      }
    }
    lines.push('');
    lines.push(`  Best Lap:  ${formatTimeStatic(data.bestLap?.lapTime)}`);
    if (data.consistency !== null) {
      lines.push(`  Consistency: σ=${data.consistency.toFixed(3)}s`);
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════');

  return lines.join('\n');
}

function formatTimeStatic(seconds) {
  if (seconds === null || seconds === undefined) return '--:--.---';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const ms = Math.floor((secs - wholeSecs) * 1000);
  return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════
//  Server persistence — save telemetry to disk
// ═══════════════════════════════════════════════════════

let _saveTimeout = null;

export function scheduleSave(session) {
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => saveTelemetry(session), 2000);
}

export async function saveTelemetry(session) {
  try {
    const data = session.toJSON();
    const resp = await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!resp.ok) console.warn('Telemetry save failed:', resp.status);
  } catch (e) {
    console.warn('Telemetry save error:', e.message);
  }
}

// ── Load all saved sessions ──
export async function loadSessions() {
  try {
    const resp = await fetch('/api/telemetry');
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}
