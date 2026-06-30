// ═══════════════════════════════════════════════════════
//  TRACK — curve, frame, geometry builders, nearest point
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { TRACK_WIDTH, CURB_W, SEG, DIRT_WIDTH } from './config.js';

// ── Track control points ──
const trackPoints = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(55, 0, 0),
  new THREE.Vector3(85, 0, -25),
  new THREE.Vector3(95, 0, -60),
  new THREE.Vector3(80, 0, -90),
  new THREE.Vector3(50, 2, -108),
  new THREE.Vector3(20, 1, -100),
  new THREE.Vector3(0, 0, -78),
  new THREE.Vector3(8, 0, -52),
  new THREE.Vector3(-18, 0, -38),
  new THREE.Vector3(-48, 0, -58),
  new THREE.Vector3(-72, 0, -38),
  new THREE.Vector3(-62, 0, -8),
  new THREE.Vector3(-32, 0, 12),
];

export const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.3);
export const trackLen = trackCurve.getLength();

// Get track frame at parameter t (0–1)
export function frame(t) {
  t = ((t % 1) + 1) % 1;
  const point = trackCurve.getPointAt(t);
  const tangent = trackCurve.getTangentAt(t).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
  if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
  return { point, tangent, side };
}

// ── Geometry builders ──

export function buildRoad() {
  const v = [], u = [], idx = [];
  const hw = TRACK_WIDTH / 2;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const { point, side } = frame(t);
    const L = point.clone().add(side.clone().multiplyScalar(-hw));
    const R = point.clone().add(side.clone().multiplyScalar(hw));
    L.y += 0.02; R.y += 0.02;
    v.push(L.x, L.y, L.z, R.x, R.y, R.z);
    u.push(0, t * 3, 1, t * 3);
    // CCW winding: normals face UP (+Y) for proper lighting
    if (i < SEG) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildDirtStrip(sSign) {
  const v = [], u = [], idx = [];
  const hw = TRACK_WIDTH / 2 + CURB_W;
  const rows = 4;
  const colW = DIRT_WIDTH / rows;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const { point, side } = frame(t);
    const dir = side.clone().multiplyScalar(sSign);
    for (let r = 0; r <= rows; r++) {
      const dist = hw + r * colW;
      const p = point.clone().add(dir.clone().multiplyScalar(dist));
      p.y += 0.01;
      v.push(p.x, p.y, p.z);
      u.push(r / rows, t * 3);
    }
    // Winding depends on sSign
    if (i < SEG) {
      const base = i * (rows + 1);
      for (let r = 0; r < rows; r++) {
        if (sSign === -1) {
          idx.push(base + r, base + rows + 1 + r, base + r + 1);
          idx.push(base + r + 1, base + rows + 1 + r, base + rows + 2 + r);
        } else {
          idx.push(base + r, base + r + 1, base + rows + 1 + r);
          idx.push(base + r + 1, base + rows + 2 + r, base + rows + 1 + r);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCurb(sSign) {
  const v = [], c = [], idx = [];
  const hw = TRACK_WIDTH / 2;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const { point, side } = frame(t);
    const dir = side.clone().multiplyScalar(sSign);
    const inner = point.clone().add(dir.clone().multiplyScalar(hw));
    const outer = point.clone().add(dir.clone().multiplyScalar(hw + CURB_W));
    inner.y += 0.03; outer.y += 0.2;
    v.push(inner.x, inner.y, inner.z, outer.x, outer.y, outer.z);
    const isRed = Math.floor(i / 4) % 2 === 0;
    const col = isRed ? [1, 0.15, 0.15] : [1, 1, 1];
    c.push(...col, ...col);
    // Winding depends on sSign: cross(tangent, side*sSign) = -sSign*up
    // so left (sSign=-1) needs old winding, right (sSign=+1) needs reversed
    if (i < SEG) {
      const b = i * 2;
      if (sSign === -1) {
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      } else {
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── Nearest track point (for on/off track detection) ──

export function nearestTrackT(px, pz) {
  let bestT = 0, bestD = Infinity;
  const steps = 300;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const p = trackCurve.getPointAt(t);
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }
  const range = 1 / steps;
  const fineSteps = 30;
  for (let i = 0; i <= fineSteps; i++) {
    const t = ((bestT - range + i * 2 * range / fineSteps) % 1 + 1) % 1;
    const p = trackCurve.getPointAt(t);
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }
  return { t: bestT, dist: Math.sqrt(bestD) };
}

// ── Collision check for scenery placement ──

const trackCheckPts = [];
for (let i = 0; i < 600; i++) {
  trackCheckPts.push(trackCurve.getPointAt(i / 600));
}

export function isSafeForScenery(px, pz, minDist) {
  for (const tp of trackCheckPts) {
    const dx = tp.x - px, dz = tp.z - pz;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }
  return true;
}
