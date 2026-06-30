// ═══════════════════════════════════════════════════════
//  AI — competitive physics-based racing
//  Key insight from telemetry: player NEVER drops below
//  270 km/h. AI must carry corner speed like the player.
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import {
  MAX_SPEED, ACCEL, BRAKE, DRAG, TURN_RATE,
  GRIP_TRACK, GRIP_GRASS, TRACK_WIDTH
} from './config.js';
import { frame, nearestTrackT, trackLen, trackCurve } from './track.js';

// ── AI tuning ──
const LOOK_AHEAD_NEAR = 20;       // near steering target
const LOOK_AHEAD_MID = 35;        // mid steering target
const LOOK_AHEAD_FAR = 60;        // far speed planning
const CURVE_SLOW_SCALE = 6;       // very gentle slowdown (was 35!)
const CURVE_MIN_FACTOR = 0.72;    // never below 72% speed (was 0.5!)
const STRAIGHT_BOOST = 1.0;       // no boost needed (was 1.15)
const AVOID_STEER = 0.7;
const BLOCK_STEER = 0.6;
const OVERTAKE_SPEED = 1.05;
const CAR_HALF_L = 2.15;   // half-length (z axis, includes bumper)
const CAR_HALF_W = 1.1;    // half-width (x axis)
const COLLISION_PUSH = 8;
const RUBBER_BAND_STR = 0.2;      // strong rubber banding
const RUBBER_BAND_GAP = 0.04;     // tight gap threshold
const RUBBER_BAND_MAX = 0.4;      // max gap to consider

// ── Personalities — all fast, different styles ──
const PERSONALITIES = [
  { aggression: 0.9,  caution: 0.3, name: 'aggressive', baseSpeed: 40, driftTendency: 0.08 },
  { aggression: 0.65, caution: 0.6, name: 'cautious',    baseSpeed: 40, driftTendency: 0.02 },
  { aggression: 0.8,  caution: 0.4, name: 'balanced',    baseSpeed: 40, driftTendency: 0.06 },
  { aggression: 0.75, caution: 0.45,name: 'rookie',      baseSpeed: 40, driftTendency: 0.04 },
];

// ── Pre-compute track curvature map ──
const CURVATURE_MAP_SIZE = 600;
const CURVATURE_MAP = new Float32Array(CURVATURE_MAP_SIZE);
{
  const step = 0.002;
  const arcLen = step * trackLen;
  const mod = v => ((v % 1) + 1) % 1;
  for (let i = 0; i < CURVATURE_MAP_SIZE; i++) {
    const t = i / CURVATURE_MAP_SIZE;
    const prev = trackCurve.getTangentAt(mod(t - step));
    const next = trackCurve.getTangentAt(mod(t + step));
    let dAngle = Math.atan2(next.x, next.z) - Math.atan2(prev.x, prev.z);
    while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    CURVATURE_MAP[i] = Math.abs(dAngle) / (2 * arcLen);
  }
}

function getCurvatureAt(t) {
  const idx = Math.floor(((t % 1 + 1) % 1) * CURVATURE_MAP_SIZE) % CURVATURE_MAP_SIZE;
  return CURVATURE_MAP[idx];
}

/** Get max curvature in a range ahead on the track */
function getMaxCurvatureAhead(t, lookDist) {
  const advanceT = lookDist / trackLen;
  const steps = 12;
  let maxC = 0;
  for (let i = 0; i <= steps; i++) {
    const sampleT = ((t + advanceT * i / steps) % 1 + 1) % 1;
    const c = getCurvatureAt(sampleT);
    if (c > maxC) maxC = c;
  }
  return maxC;
}

// ── Create car mesh ──
function createCarMesh(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 100, specular: 0x444444 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4), bodyMat);
  body.position.y = 0.6; body.castShadow = true; g.add(body);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 }));
  frontBumper.position.set(0, 0.42, 2.1); g.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 }));
  rearBumper.position.set(0, 0.42, -2.1); g.add(rearBumper);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2),
    new THREE.MeshPhongMaterial({ color: 0x111122, shininess: 200, specular: 0x888888, transparent: true, opacity: 0.85 }));
  cabin.position.set(0, 1.15, -0.3); cabin.castShadow = true; g.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), bodyMat);
  spoiler.position.set(0, 1.1, -1.8); g.add(spoiler);

  const spoilerPosts = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 }));
  for (const x of [-0.8, 0.8]) {
    const sp = spoilerPosts.clone(); sp.position.set(x, 0.95, -1.8); g.add(sp);
  }

  const wg = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
  const wm = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 30 });
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
  const rimMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 150 });

  const frontWheels = [];
  for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.35, z);
    const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; pivot.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; pivot.add(rim);
    g.add(pivot);
    frontWheels.push(pivot);
  }
  g.userData.frontWheels = frontWheels;

  for (const [x, z] of [[-1.1, -1.3], [1.1, -1.3]]) {
    const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); g.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; rim.position.set(x, 0.35, z); g.add(rim);
  }

  const hlg = new THREE.SphereGeometry(0.15, 8, 8);
  const hlm = new THREE.MeshBasicMaterial({ color: 0xffffee });
  for (const x of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(hlg, hlm); hl.position.set(x, 0.6, 2); g.add(hl);
  }
  const tlm = new THREE.MeshStandardMaterial({ color: 0x880000, emissive: 0x000000, emissiveIntensity: 0 });
  const tailLights = [];
  for (const x of [-0.7, 0.7]) {
    const tl = new THREE.Mesh(hlg, tlm); tl.position.set(x, 0.6, -2); g.add(tl);
    tailLights.push(tl);
  }
  g.userData.tailLights = tailLights;
  g.userData.tailLightMat = tlm;

  const numGeo = new THREE.CircleGeometry(0.35, 16);
  const numMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-1.01, 1.01]) {
    const numCircle = new THREE.Mesh(numGeo, numMat);
    numCircle.position.set(x, 0.85, -0.3);
    numCircle.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(numCircle);
  }
  return g;
}

/**
 * Create AI cars with full physics state
 */
export function createAICars(scene) {
  const names = ['BLUE', 'GOLD', 'JADE', 'BLAZE'];
  const colors = [0x3366ff, 0xffcc00, 0x00cc66, 0xff6600];
  return PERSONALITIES.map((pers, i) => {
    const color = colors[i];
    const mesh = createCarMesh(color);
    scene.add(mesh);

    // Position will be set by game.js grid placement
    const ai = {
      x: 0,
      z: 0,
      heading: 0,
      velHeading: 0,
      speed: 0,
      onTrack: true,

      baseSpeed: pers.baseSpeed,
      color,
      name: names[i],
      mesh,
      personality: pers,
      soundIdx: undefined,

      steerInput: 0,
      throttle: 0,
      brake: 0,
      handbrake: false,

      _trackT: 0,
      _lateral: 0,
      isBraking: false,
      targetSpeed: pers.baseSpeed,

      impulseX: 0,
      impulseZ: 0,

      // Race state
      lap: 0,
      prevTrackT: 0,
      finished: false,
      finishTime: 0,
      hasPassedHalf: false,
    };

    mesh.position.set(0, 0.05, 0);
    return ai;
  });
}

/**
 * Find target point on track for AI to steer toward
 */
function findTargetPoint(ai, lookDist) {
  const curT = ai._trackT;
  const advanceT = lookDist / trackLen;
  const targetT = ((curT + advanceT) % 1 + 1) % 1;
  const { point, tangent, side } = frame(targetT);

  const curvature = getCurvatureAt(targetT);

  // Racing line: cut inside on curves
  const racingLateral = -curvature * 200 * ai.personality.aggression;
  const clampedLat = THREE.MathUtils.clamp(racingLateral, -0.6, 0.6);
  const lateralOffset = side.clone().multiplyScalar(clampedLat * (TRACK_WIDTH / 2 - 3));

  return {
    x: point.x + lateralOffset.x,
    z: point.z + lateralOffset.z,
    t: targetT,
    curvature,
  };
}

/**
 * AI brain — competitive driving
 */
function aiBrain(ai, aiCars, player, dt) {
  // ── 1. Find target points at multiple distances ──
  const nearTarget = findTargetPoint(ai, LOOK_AHEAD_NEAR);
  const midTarget = findTargetPoint(ai, LOOK_AHEAD_MID);

  // ── 2. Steering: blend near and mid targets ──
  const dx = midTarget.x - ai.x;
  const dz = midTarget.z - ai.z;
  const angleToMid = Math.atan2(dx, dz);
  let midDiff = angleToMid - ai.heading;
  while (midDiff > Math.PI) midDiff -= 2 * Math.PI;
  while (midDiff < -Math.PI) midDiff += 2 * Math.PI;

  const ndx = nearTarget.x - ai.x;
  const ndz = nearTarget.z - ai.z;
  const angleToNear = Math.atan2(ndx, ndz);
  let nearDiff = angleToNear - ai.heading;
  while (nearDiff > Math.PI) nearDiff -= 2 * Math.PI;
  while (nearDiff < -Math.PI) nearDiff += 2 * Math.PI;

  // Blend: more mid for smooth lines, more near for sharp corrections
  let steer = midDiff * 2.5 * 0.6 + nearDiff * 3.5 * 0.4;
  steer = THREE.MathUtils.clamp(steer, -1, 1);

  // ── 3. Avoidance ──
  let avoidSteer = 0;
  let isAvoiding = false;
  const myDir = new THREE.Vector2(Math.sin(ai.heading), Math.cos(ai.heading));

  for (const other of [player, ...aiCars]) {
    if (other === ai) continue;
    const ox = other === player ? player.x : other.x;
    const oz = other === player ? player.z : other.z;
    const toOther = new THREE.Vector2(ox - ai.x, oz - ai.z);
    const dist = toOther.length();

    if (dist < 14) {
      const sideDot = toOther.x * myDir.y - toOther.y * myDir.x;
      const dotAhead = toOther.dot(myDir);
      if (dotAhead > 0 && dist < 10) {
        const dodgeDir = sideDot > 0 ? -1 : 1;
        const urgency = 1 - dist / 10;
        avoidSteer += dodgeDir * urgency * AVOID_STEER * ai.personality.aggression;
        isAvoiding = true;
      }
      if (other === player && dotAhead < 0 && dist < 16 && dist > 3) {
        const playerLatDir = sideDot > 0 ? 1 : -1;
        avoidSteer += playerLatDir * BLOCK_STEER * ai.personality.aggression;
      }
    }
  }

  steer += avoidSteer;
  steer = THREE.MathUtils.clamp(steer, -1, 1);

  // ── 4. Speed planning ──
  // Key insight: player maintains 77-90% of max speed through corners
  // AI must do the same — only slow for genuinely tight turns
  const nearMaxC = getMaxCurvatureAhead(ai._trackT, 25);
  const farMaxC = getMaxCurvatureAhead(ai._trackT, 55);
  const maxCurv = nearMaxC * 0.5 + farMaxC * 0.5;

  // Gentle speed reduction based on curvature
  const curveFactor = THREE.MathUtils.clamp(1 - maxCurv * CURVE_SLOW_SCALE, CURVE_MIN_FACTOR, 1.0);
  let targetSpeed = ai.baseSpeed * curveFactor * STRAIGHT_BOOST;

  // ── 5. Overtaking ──
  if (isAvoiding) {
    targetSpeed *= OVERTAKE_SPEED;
  }

  // ── 6. Rubber-banding — keep races tight ──
  const playerT = player._trackT || 0;
  if (Math.abs(player.speed) > 5) {
    let gap = ai._trackT - playerT;
    if (gap > 0.5) gap -= 1;
    if (gap < -0.5) gap += 1;
    const clampedGap = THREE.MathUtils.clamp(gap, -RUBBER_BAND_MAX, RUBBER_BAND_MAX);
    if (clampedGap < -RUBBER_BAND_GAP) {
      // AI behind — boost
      const boost = Math.abs(clampedGap) * RUBBER_BAND_STR * MAX_SPEED;
      targetSpeed += boost;
    } else if (clampedGap > RUBBER_BAND_GAP) {
      // AI ahead — slow slightly
      const penalty = clampedGap * RUBBER_BAND_STR * MAX_SPEED * 0.6;
      targetSpeed -= penalty;
    }
  }

  // Don't let rubber-banding push above MAX_SPEED or below 50%
  targetSpeed = THREE.MathUtils.clamp(targetSpeed, MAX_SPEED * 0.5, MAX_SPEED);

  ai.targetSpeed = targetSpeed;

  // ── 7. Convert target speed into inputs ──
  let throttle = 0;
  let brake = 0;
  let handbrake = false;

  const speedDiff = ai.speed - targetSpeed;

  if (speedDiff < -4) {
    throttle = 1.0;   // full gas
  } else if (speedDiff < -1) {
    throttle = 0.7;   // strong gas
  } else if (speedDiff < 1) {
    throttle = 0.4;   // maintain
  } else if (speedDiff < 4) {
    throttle = 0.1;   // lift off
  } else if (speedDiff < 8) {
    brake = THREE.MathUtils.clamp((speedDiff - 4) / 10, 0.1, 0.5);
  } else {
    brake = THREE.MathUtils.clamp((speedDiff - 4) / 8, 0.4, 1.0);
    // Emergency: handbrake if way too fast into a tight turn
    if (nearMaxC > 0.04 && ai.speed > targetSpeed * 1.5) {
      handbrake = true;
    }
  }

  // ── 8. Tactical drift: aggressive AIs use handbrake to rotate ──
  const currentCurvature = getCurvatureAt(ai._trackT);
  if (currentCurvature > 0.02 && ai.speed > ai.baseSpeed * 0.65 && Math.abs(steer) > 0.35) {
    if (Math.random() < ai.personality.driftTendency) {
      handbrake = true;
    }
  }

  ai.steerInput = steer;
  ai.throttle = throttle;
  ai.brake = brake;
  ai.handbrake = handbrake;
}

/**
 * Update AI car physics (same model as player)
 */
function updateAIPhysics(ai, dt) {
  const nearest = nearestTrackT(ai.x, ai.z);
  const onRoad = nearest.dist < TRACK_WIDTH / 2;
  ai.onTrack = onRoad;
  ai._trackT = nearest.t;

  const { point: trackPt, side } = frame(nearest.t);
  const toAi = { x: ai.x - trackPt.x, z: ai.z - trackPt.z };
  const trackHalfW = TRACK_WIDTH / 2 - 3;
  ai._lateral = (side.x * toAi.x + side.z * toAi.z) / trackHalfW;
  ai._lateral = THREE.MathUtils.clamp(ai._lateral, -1, 1);

  if (ai.throttle > 0) ai.speed += ACCEL * ai.throttle * dt;
  if (ai.brake > 0) ai.speed -= BRAKE * ai.brake * dt;
  if (ai.throttle === 0 && ai.brake === 0) {
    if (ai.speed > 0) ai.speed = Math.max(0, ai.speed - DRAG * dt);
    else ai.speed = Math.min(0, ai.speed + DRAG * dt);
  }
  if (ai.handbrake && Math.abs(ai.speed) > 2) {
    const hbDrag = 18;
    if (ai.speed > 0) ai.speed = Math.max(0, ai.speed - hbDrag * dt);
    else ai.speed = Math.min(0, ai.speed + hbDrag * dt);
  }

  if (!onRoad) {
    const grassDrag = 25;
    ai.speed *= Math.max(0, 1 - grassDrag * dt / Math.max(Math.abs(ai.speed), 8));
  }

  ai.speed = THREE.MathUtils.clamp(ai.speed, -MAX_SPEED * 0.3, MAX_SPEED);

  const absSpeed = Math.abs(ai.speed);
  const turnAuthority = Math.min(absSpeed / 12, 1) * Math.max(0.45, 1 - (absSpeed / MAX_SPEED) * 0.55);
  const brakeTurnBonus = ai.brake > 0 && ai.speed > 2 ? 1.45 : 1.0;
  const handbrakeTurnBonus = ai.handbrake ? 1.8 : 1.0;

  const turnDelta = ai.steerInput * TURN_RATE * turnAuthority * brakeTurnBonus * handbrakeTurnBonus * dt;
  ai.heading += turnDelta;

  let grip = onRoad ? GRIP_TRACK : GRIP_GRASS;
  if (ai.handbrake) grip *= 0.35;

  let velHeadingDiff = ai.heading - ai.velHeading;
  while (velHeadingDiff > Math.PI) velHeadingDiff -= 2 * Math.PI;
  while (velHeadingDiff < -Math.PI) velHeadingDiff += 2 * Math.PI;
  ai.velHeading += velHeadingDiff * grip * 5 * dt;
  while (ai.velHeading > Math.PI) ai.velHeading -= 2 * Math.PI;
  while (ai.velHeading < -Math.PI) ai.velHeading += 2 * Math.PI;

  const moveX = Math.sin(ai.velHeading);
  const moveZ = Math.cos(ai.velHeading);
  ai.x += moveX * ai.speed * dt + ai.impulseX * dt;
  ai.z += moveZ * ai.speed * dt + ai.impulseZ * dt;

  ai.impulseX *= Math.max(0, 1 - 5 * dt);
  ai.impulseZ *= Math.max(0, 1 - 5 * dt);

  ai.isBraking = ai.brake > 0.2 || ai.handbrake || ai.speed < -1;
}

/**
 * Collision detection and response — OBB (oriented bounding box)
 * Cars are rectangles: length=CAR_HALF_L*2 along heading, width=CAR_HALF_W*2 across.
 * We use the Separating Axis Theorem with each car's local axes.
 */

// Project a point onto an axis, return [min, max]
function projectPoint(px, pz, ax, az) {
  const d = px * ax + pz * az;
  return d;
}

// Check if two OBBs overlap on a given axis
// Each box has center (cx, cz), half-extents (hx, hz) along its own axes (ax, az)
function overlapOnAxis(acx, acz, ahx, ahz, aAx, aAz, bcx, bcz, bhx, bhz, bAx, bAz) {
  // Project both boxes onto the test axis
  // For box A: project all 4 corners, or use the radius trick
  // Radius of A on this axis = |ahx * dot(aAx, axis)| + |ahz * dot(aAz, axis)|
  // Same for B
  // We test on 4 axes: A's local X, A's local Z, B's local X, B's local Z
}

// Full SAT test for two oriented rectangles
function satOverlap(ax, az, aHx, aHz, aCx, aCz, bx, bz, bHx, bHz, bCx, bCz) {
  // aAx = (sin(az), cos(az)) = forward dir of A
  // aSide = (cos(az), -sin(az)) = right dir of A
  const aFwd = { x: Math.sin(az), z: Math.cos(az) };
  const aRt  = { x: Math.cos(az), z: -Math.sin(az) };
  const bFwd = { x: Math.sin(bz), z: Math.cos(bz) };
  const bRt  = { x: Math.cos(bz), z: -Math.sin(bz) };

  // 4 separating axes to test: A-fwd, A-rt, B-fwd, B-rt
  const axes = [aFwd, aRt, bFwd, bRt];

  let minOverlap = Infinity;
  let sepAxis = null;

  for (const axis of axes) {
    // Radius of each box projected onto this axis
    const rA = aHx * Math.abs(aRt.x * axis.x + aRt.z * axis.z)
             + aHz * Math.abs(aFwd.x * axis.x + aFwd.z * axis.z);
    const rB = bHx * Math.abs(bRt.x * axis.x + bRt.z * axis.z)
             + bHz * Math.abs(bFwd.x * axis.x + bFwd.z * axis.z);

    // Project centers onto axis
    const dA = aCx * axis.x + aCz * axis.z;
    const dB = bCx * axis.x + bCz * axis.z;

    const gap = Math.abs(dB - dA) - (rA + rB);
    if (gap > 0) return null; // separating axis found, no collision

    if (-gap < minOverlap) {
      minOverlap = -gap;
      sepAxis = axis;
      // Make sure axis points from A to B
      if ((dB - dA) < 0) { sepAxis = { x: -axis.x, z: -axis.z }; }
    }
  }

  return { overlap: minOverlap, nx: sepAxis.x, nz: sepAxis.z };
}

export function handleCollisions(player, aiCars) {
  const allCars = [
    { x: player.x, z: player.z, heading: player.heading, speed: player.speed, velHeading: player.velHeading, isPlayer: true },
    ...aiCars,
  ];

  for (let i = 0; i < allCars.length; i++) {
    for (let j = i + 1; j < allCars.length; j++) {
      const a = allCars[i];
      const b = allCars[j];

      // Quick broad-phase: skip if centers are clearly too far apart
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist2 = dx * dx + dz * dz;
      const maxReach = (CAR_HALF_L + CAR_HALF_W) * 2;  // conservative circle radius
      if (dist2 > maxReach * maxReach) continue;

      const hit = satOverlap(
        a.x, a.heading, CAR_HALF_W, CAR_HALF_L, a.x, a.z,
        b.x, b.heading, CAR_HALF_W, CAR_HALF_L, b.x, b.z
      );
      if (!hit) continue;

      const { overlap, nx, nz } = hit;

      const pushA = b.isPlayer ? 0.3 : 0.5;
      const pushB = a.isPlayer ? 0.3 : 0.5;

      if (a.isPlayer) {
        player.x -= nx * overlap * pushA;
        player.z -= nz * overlap * pushA;
        player.speed *= 0.85;
        a.impulseX = (a.impulseX || 0) - nx * COLLISION_PUSH;
        a.impulseZ = (a.impulseZ || 0) - nz * COLLISION_PUSH;
      } else {
        a.x -= nx * overlap * pushA;
        a.z -= nz * overlap * pushA;
        a.impulseX = (a.impulseX || 0) - nx * COLLISION_PUSH;
        a.impulseZ = (a.impulseZ || 0) - nz * COLLISION_PUSH;
        a.speed *= 0.85;
      }

      if (b.isPlayer) {
        player.x += nx * overlap * pushB;
        player.z += nz * overlap * pushB;
        player.speed *= 0.85;
        b.impulseX = (b.impulseX || 0) + nx * COLLISION_PUSH;
        b.impulseZ = (b.impulseZ || 0) + nz * COLLISION_PUSH;
      } else {
        b.x += nx * overlap * pushB;
        b.z += nz * overlap * pushB;
        b.impulseX = (b.impulseX || 0) + nx * COLLISION_PUSH;
        b.impulseZ = (b.impulseZ || 0) + nz * COLLISION_PUSH;
        b.speed *= 0.85;
      }

      if (!a.isPlayer) a.heading += (Math.random() - 0.5) * 0.1;
      if (!b.isPlayer) b.heading += (Math.random() - 0.5) * 0.1;
    }
  }
}

/**
 * Main update — called once per frame
 */
export function updateAI(aiCars, player, dt, raceState = 'racing') {
  if (player.impulseX === undefined) {
    player.impulseX = 0;
    player.impulseZ = 0;
  }

  for (const ai of aiCars) {
    if (raceState === 'racing' && !ai.finished) {
      aiBrain(ai, aiCars, player, dt);
      updateAIPhysics(ai, dt);
    } else if (ai.finished || raceState === 'finished') {
      // Gradually slow down after finishing
      ai.speed *= Math.max(0, 1 - 3 * dt);
      const moveX = Math.sin(ai.velHeading);
      const moveZ = Math.cos(ai.velHeading);
      ai.x += moveX * ai.speed * dt;
      ai.z += moveZ * ai.speed * dt;
    }
    // else: grid/countdown — don't move at all

    const nearest = nearestTrackT(ai.x, ai.z);
    // Always update _trackT for position calculation
    if (raceState !== 'racing' || ai.finished) {
      ai._trackT = nearest.t;
    }
    const surfaceFrame = frame(nearest.t);
    const surfaceY = surfaceFrame.point.y + 0.05;
    ai.mesh.position.set(ai.x, surfaceY, ai.z);
    ai.mesh.rotation.y = ai.heading;

    let driftAngle = ai.heading - ai.velHeading;
    while (driftAngle > Math.PI) driftAngle -= 2 * Math.PI;
    while (driftAngle < -Math.PI) driftAngle += 2 * Math.PI;
    const targetRoll = driftAngle * 0.4;
    ai.mesh.rotation.z = THREE.MathUtils.lerp(ai.mesh.rotation.z, targetRoll, 5 * dt);

    const fw = ai.mesh.userData.frontWheels;
    if (fw) {
      const absSpeed = Math.abs(ai.speed);
      const maxSteerAngle = 0.44 * Math.max(0.35, 1 - (absSpeed / MAX_SPEED) * 0.5);
      const targetSteerAngle = ai.steerInput * maxSteerAngle;
      const currentSteer = fw[0].rotation.y;
      const newSteer = THREE.MathUtils.lerp(currentSteer, targetSteerAngle, 8 * dt);
      for (const w of fw) w.rotation.y = newSteer;
    }

    const tlm = ai.mesh.userData.tailLightMat;
    if (tlm) {
      tlm.emissive.setHex(ai.isBraking ? 0xff0000 : 0x000000);
      tlm.emissiveIntensity = ai.isBraking ? 1.5 : 0;
    }

    const targetPitch = ai.throttle > 0 ? -0.03 : ai.brake > 0 ? 0.04 : 0;
    ai.mesh.rotation.x = THREE.MathUtils.lerp(ai.mesh.rotation.x, targetPitch * (Math.abs(ai.speed) / MAX_SPEED), 5 * dt);
  }

  if (raceState === 'racing') {
    handleCollisions(player, aiCars);
  }

  player.x += player.impulseX * dt;
  player.z += player.impulseZ * dt;
  player.impulseX *= Math.max(0, 1 - 5 * dt);
  player.impulseZ *= Math.max(0, 1 - 5 * dt);
}
