// ═══════════════════════════════════════════════════════
//  SCENERY — instanced forest + background mountains
//  Strategy:
//    - Inner/mid trees: InstancedMesh (1 draw call per type)
//    - Mountains: silhouette meshes in background (3 draw calls)
//    - Trackside objects: kept as individual meshes (few of them)
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { MIN_SCENERY_DIST, TRACK_WIDTH, CURB_W, TRUNK_COLORS, LEAF_COLORS, AUTUMN_COLORS, pick, rand } from './config.js';
import { frame, isSafeForScenery, nearestTrackT } from './track.js';

// ══════════════════════════════════════════════════════════
//  PART 1: Instanced tree geometries (shared, built once)
// ══════════════════════════════════════════════════════════

// We merge each tree type's sub-meshes into a single BufferGeometry,
// then use InstancedMesh to place hundreds with 1 draw call.

function mergeGroupGeometries(group, scale) {
  const merged = [];
  const matrix = new THREE.Matrix4();
  group.updateMatrixWorld(true);
  group.traverse(child => {
    if (!child.isMesh) return;
    const geo = child.geometry.clone();
    child.updateMatrixWorld(true);
    matrix.copy(child.matrixWorld);
    // Apply scale
    const s = new THREE.Matrix4().makeScale(scale, scale, scale);
    matrix.premultiply(s);
    geo.applyMatrix4(matrix);
    // Carry over color attribute if present
    const mat = child.material;
    merged.push({ geo, color: mat.color ? mat.color.clone() : new THREE.Color(0x228B22) });
  });
  return merged;
}

// Build a single merged geometry for a pine tree (all sub-meshes baked)
function buildPineGeo(scale = 1) {
  const s = scale;
  const positions = [], indices = [], colors = [];
  let vertCount = 0;

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.1 * s, 0.25 * s, 3 * s, 5);
  const trunkCol = new THREE.Color(pick(TRUNK_COLORS));
  appendGeo(trunkGeo, trunkCol, positions, indices, colors, vertCount);
  vertCount += trunkGeo.attributes.position.count;

  // Cone layers
  const layers = [
    { baseR: 2.8, h: 3.2, y: 3.5 },
    { baseR: 2.3, h: 2.6, y: 5.6 },
    { baseR: 1.8, h: 2.2, y: 7.4 },
    { baseR: 1.2, h: 1.8, y: 8.8 },
  ];
  const leafCol = new THREE.Color(pick(LEAF_COLORS));
  for (const l of layers) {
    const coneGeo = new THREE.ConeGeometry(l.baseR * s, l.h * s, 6);
    appendGeo(coneGeo, leafCol, positions, indices, colors, vertCount, [0, l.y * s, 0]);
    vertCount += coneGeo.attributes.position.count;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildOakGeo(scale = 1) {
  const s = scale;
  const positions = [], indices = [], colors = [];
  let vertCount = 0;

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.25 * s, 0.5 * s, 4 * s, 5);
  appendGeo(trunkGeo, new THREE.Color(pick(TRUNK_COLORS)), positions, indices, colors, vertCount, [0, 2 * s, 0]);
  vertCount += trunkGeo.attributes.position.count;

  // Canopy spheres
  const col = new THREE.Color(pick(LEAF_COLORS));
  const canopyParts = [
    [0, 5.5, 0, 3.2], [1.5, 5.0, 0.8, 2.2], [-1.2, 5.2, -1, 2.4],
    [0.5, 6.2, -0.5, 2.0], [-0.8, 4.8, 1.2, 2.0],
  ];
  for (const [px, py, pz, pr] of canopyParts) {
    const sphereGeo = new THREE.SphereGeometry(pr * s, 6, 4);
    appendGeo(sphereGeo, col, positions, indices, colors, vertCount, [px * s, py * s, pz * s]);
    vertCount += sphereGeo.attributes.position.count;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildAutumnGeo(scale = 1) {
  const s = scale;
  const positions = [], indices = [], colors = [];
  let vertCount = 0;

  const trunkGeo = new THREE.CylinderGeometry(0.2 * s, 0.4 * s, 3.5 * s, 5);
  appendGeo(trunkGeo, new THREE.Color(0x4a2510), positions, indices, colors, vertCount, [0, 1.75 * s, 0]);
  vertCount += trunkGeo.attributes.position.count;

  for (let i = 0; i < 3; i++) {
    const r = (2.5 - i * 0.6) * s;
    const coneGeo = new THREE.ConeGeometry(Math.max(0.3, r), 2.5 * s, 6);
    appendGeo(coneGeo, new THREE.Color(pick(AUTUMN_COLORS)), positions, indices, colors, vertCount, [0, (4.0 + i * 1.6) * s, 0]);
    vertCount += coneGeo.attributes.position.count;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildBushGeo(scale = 1) {
  const s = scale;
  const positions = [], indices = [], colors = [];
  let vertCount = 0;

  const sphereGeo = new THREE.SphereGeometry(1.2 * s, 6, 4);
  const posArr = sphereGeo.attributes.position.array;
  for (let i = 1; i < posArr.length; i += 3) {
    posArr[i] = posArr[i] * 0.6 + 0.8 * s * 0.4;
  }
  appendGeo(sphereGeo, new THREE.Color(pick(LEAF_COLORS)), positions, indices, colors, vertCount);
  vertCount += sphereGeo.attributes.position.count;

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Helper: append a geometry's vertices/indices into arrays, with offset and optional translation
function appendGeo(srcGeo, color, outPositions, outIndices, outColors, indexOffset, translation = [0, 0, 0]) {
  const posArr = srcGeo.attributes.position.array;
  const hasIndex = srcGeo.index;
  const srcIdx = hasIndex ? srcGeo.index.array : null;

  for (let i = 0; i < posArr.length; i += 3) {
    outPositions.push(posArr[i] + translation[0], posArr[i + 1] + translation[1], posArr[i + 2] + translation[2]);
    outColors.push(color.r, color.g, color.b);
  }

  if (srcIdx) {
    for (let i = 0; i < srcIdx.length; i++) {
      outIndices.push(srcIdx[i] + indexOffset);
    }
  } else {
    for (let i = 0; i < posArr.length / 3; i++) {
      outIndices.push(i + indexOffset);
    }
  }
}

// ══════════════════════════════════════════════════════════
//  PART 2: Placement — Poisson disk sampled instanced forest
//  Grid-accelerated sampling gives natural spacing with minimal overlap
// ══════════════════════════════════════════════════════════

// Poisson disk sampler — places points with minimum spacing on a grid
function poissonSample({ bounds, minDist, maxAttempts = 6, seed = 42 }) {
  const cellSize = minDist / Math.SQRT2;
  const gridW = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
  const gridH = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
  const grid = new Int32Array(gridW * gridH).fill(-1);
  const points = [];
  let rng = seed;
  function rand() { rng = (rng * 16807 + 0) % 2147483647; return (rng & 0x7fffffff) / 0x7fffffff; }

  function gridIdx(x, z) {
    const gx = Math.floor((x - bounds.minX) / cellSize);
    const gz = Math.floor((z - bounds.minZ) / cellSize);
    if (gx < 0 || gz < 0 || gx >= gridW || gz >= gridH) return -1;
    return gz * gridW + gx;
  }

  function tooClose(x, z) {
    const gx = Math.floor((x - bounds.minX) / cellSize);
    const gz = Math.floor((z - bounds.minZ) / cellSize);
    const searchR = 2;
    for (let dz = -searchR; dz <= searchR; dz++) {
      for (let dx = -searchR; dx <= searchR; dx++) {
        const nx = gx + dx, nz = gz + dz;
        if (nx < 0 || nz < 0 || nx >= gridW || nz >= gridH) continue;
        const idx = grid[nz * gridW + nx];
        if (idx === -1) continue;
        const p = points[idx];
        const ddx = p.x - x, ddz = p.z - z;
        if (ddx * ddx + ddz * ddz < minDist * minDist) return true;
      }
    }
    return false;
  }

  function addPoint(x, z) {
    const idx = points.length;
    points.push({ x, z });
    const gi = gridIdx(x, z);
    if (gi >= 0) grid[gi] = idx;
    return idx;
  }

  // Seed with initial points along the track
  const candidates = [];
  for (let i = 0; i < 80; i++) {
    const t = i / 80;
    const { point, side } = frame(t);
    const s2 = (i % 2 === 0) ? 1 : -1;
    const dist = MIN_SCENERY_DIST + 5 + rand() * 20;
    const x = point.x + side.x * s2 * dist;
    const z = point.z + side.z * s2 * dist;
    if (isSafeForScenery(x, z, MIN_SCENERY_DIST)) candidates.push({ x, z });
  }

  // Process candidates with Poisson expansion
  const active = [];
  for (const c of candidates) {
    if (!tooClose(c.x, c.z)) {
      addPoint(c.x, c.z);
      active.push(c);
    }
  }

  while (active.length > 0) {
    const ai = Math.floor(rand() * active.length);
    const center = active[ai];
    let placed = false;
    for (let a = 0; a < maxAttempts; a++) {
      const angle = rand() * Math.PI * 2;
      const dist = minDist + rand() * minDist; // ring between minDist and 2*minDist
      const nx = center.x + Math.cos(angle) * dist;
      const nz = center.z + Math.sin(angle) * dist;
      if (nx < bounds.minX || nz < bounds.minZ || nx > bounds.maxX || nz > bounds.maxZ) continue;
      if (!isSafeForScenery(nx, nz, MIN_SCENERY_DIST)) continue;
      if (tooClose(nx, nz)) continue;
      addPoint(nx, nz);
      active.push({ x: nx, z: nz });
      placed = true;
    }
    if (!placed) active.splice(ai, 1); // dead point, remove
  }

  return points;
}

export function placeScenery(scene) {
  // ── Collect positions for each tree type ──
  const pinePositions = [];
  const oakPositions = [];
  const autumnPositions = [];
  const bushPositions = [];

  // ── Define placement zones ──
  // Track bounds (approximate, for Poisson grid)
  const bounds = { minX: -160, minZ: -160, maxX: 160, maxZ: 40 };

  // Zone 1: Trackside trees — tight spacing near track edge
  const tracksidePoints = poissonSample({ bounds, minDist: 5, maxAttempts: 12, seed: 42 });
  for (const p of tracksidePoints) {
    // Only keep points close to the track
    const nearest = nearestTrackT(p.x, p.z);
    if (nearest.dist > MIN_SCENERY_DIST + 12) continue;
    const s = rand(0.6, 1.2);
    const r = Math.random();
    if (r < 0.4) pinePositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else if (r < 0.6) oakPositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else autumnPositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
  }

  // Zone 2: Forest — medium spacing, fills mid-range
  const forestPoints = poissonSample({ bounds, minDist: 6, maxAttempts: 10, seed: 137 });
  for (const p of forestPoints) {
    const nearest = nearestTrackT(p.x, p.z);
    if (nearest.dist < MIN_SCENERY_DIST + 8 || nearest.dist > MIN_SCENERY_DIST + 50) continue;
    const s = rand(0.5, 1.4);
    const r = Math.random();
    if (r < 0.35) pinePositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else if (r < 0.6) oakPositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else autumnPositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
  }

  // Zone 3: Deep forest — wider spacing, tall pines
  const deepPoints = poissonSample({ bounds, minDist: 8, maxAttempts: 8, seed: 256 });
  for (const p of deepPoints) {
    const nearest = nearestTrackT(p.x, p.z);
    if (nearest.dist < MIN_SCENERY_DIST + 40) continue;
    const r = Math.random();
    if (r < 0.5) pinePositions.push({ x: p.x, z: p.z, s: rand(0.8, 1.8), ry: rand(0, Math.PI * 2) });
    else if (r < 0.75) autumnPositions.push({ x: p.x, z: p.z, s: rand(0.7, 1.4), ry: rand(0, Math.PI * 2) });
    else oakPositions.push({ x: p.x, z: p.z, s: rand(0.6, 1.2), ry: rand(0, Math.PI * 2) });
  }

  // Zone 4: Interior — fills inside the track loop
  const interiorPoints = poissonSample({ bounds, minDist: 5, maxAttempts: 10, seed: 999 });
  for (const p of interiorPoints) {
    const nearest = nearestTrackT(p.x, p.z);
    if (nearest.dist < MIN_SCENERY_DIST + 3 || nearest.dist > MIN_SCENERY_DIST + 45) continue;
    const s = rand(0.5, 1.3);
    const r = Math.random();
    if (r < 0.35) pinePositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else if (r < 0.55) oakPositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else if (r < 0.85) autumnPositions.push({ x: p.x, z: p.z, s, ry: rand(0, Math.PI * 2) });
    else bushPositions.push({ x: p.x, z: p.z, s: rand(0.4, 1.0), ry: rand(0, Math.PI * 2) });
  }

  // Bushes — small minDist, clustered near track
  const bushBounds = bounds;
  const bushPoints = poissonSample({ bounds: bushBounds, minDist: 3, maxAttempts: 12, seed: 777 });
  for (const p of bushPoints) {
    const nearest = nearestTrackT(p.x, p.z);
    if (nearest.dist > MIN_SCENERY_DIST + 8) continue;
    bushPositions.push({ x: p.x, z: p.z, s: rand(0.4, 1.0), ry: rand(0, Math.PI * 2) });
  }

  // ── Build instanced meshes ──
  const dummy = new THREE.Object3D();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  // Pines
  if (pinePositions.length > 0) {
    // Use a few size variants for visual variety, batch into 3 instanced meshes
    const sizeBuckets = [[], [], []]; // small, medium, large
    for (const p of pinePositions) {
      if (p.s < 0.8) sizeBuckets[0].push(p);
      else if (p.s < 1.2) sizeBuckets[1].push(p);
      else sizeBuckets[2].push(p);
    }
    const bucketScales = [0.7, 1.0, 1.4];
    for (let b = 0; b < 3; b++) {
      if (sizeBuckets[b].length === 0) continue;
      const geo = buildPineGeo(bucketScales[b]);
      const instanced = new THREE.InstancedMesh(geo, mat, sizeBuckets[b].length);
      instanced.castShadow = true;
      for (let i = 0; i < sizeBuckets[b].length; i++) {
        const p = sizeBuckets[b][i];
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.y = p.ry;
        const sizeScale = p.s / bucketScales[b]; // relative scale within bucket
        dummy.scale.set(sizeScale, sizeScale, sizeScale);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      scene.add(instanced);
    }
  }

  // Oaks
  if (oakPositions.length > 0) {
    const sizeBuckets = [[], [], []];
    for (const p of oakPositions) {
      if (p.s < 0.8) sizeBuckets[0].push(p);
      else if (p.s < 1.2) sizeBuckets[1].push(p);
      else sizeBuckets[2].push(p);
    }
    const bucketScales = [0.7, 1.0, 1.4];
    for (let b = 0; b < 3; b++) {
      if (sizeBuckets[b].length === 0) continue;
      const geo = buildOakGeo(bucketScales[b]);
      const instanced = new THREE.InstancedMesh(geo, mat, sizeBuckets[b].length);
      instanced.castShadow = true;
      for (let i = 0; i < sizeBuckets[b].length; i++) {
        const p = sizeBuckets[b][i];
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.y = p.ry;
        const sizeScale = p.s / bucketScales[b];
        dummy.scale.set(sizeScale, sizeScale, sizeScale);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      scene.add(instanced);
    }
  }

  // Autumn trees
  if (autumnPositions.length > 0) {
    const sizeBuckets = [[], [], []];
    for (const p of autumnPositions) {
      if (p.s < 0.8) sizeBuckets[0].push(p);
      else if (p.s < 1.2) sizeBuckets[1].push(p);
      else sizeBuckets[2].push(p);
    }
    const bucketScales = [0.7, 1.0, 1.4];
    for (let b = 0; b < 3; b++) {
      if (sizeBuckets[b].length === 0) continue;
      const geo = buildAutumnGeo(bucketScales[b]);
      const instanced = new THREE.InstancedMesh(geo, mat, sizeBuckets[b].length);
      instanced.castShadow = true;
      for (let i = 0; i < sizeBuckets[b].length; i++) {
        const p = sizeBuckets[b][i];
        dummy.position.set(p.x, 0, p.z);
        dummy.rotation.y = p.ry;
        const sizeScale = p.s / bucketScales[b];
        dummy.scale.set(sizeScale, sizeScale, sizeScale);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      scene.add(instanced);
    }
  }

  // Bushes
  if (bushPositions.length > 0) {
    const geo = buildBushGeo(1.0);
    const instanced = new THREE.InstancedMesh(geo, mat, bushPositions.length);
    instanced.castShadow = true;
    for (let i = 0; i < bushPositions.length; i++) {
      const p = bushPositions[i];
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.y = p.ry;
      dummy.scale.set(p.s, p.s, p.s);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    scene.add(instanced);
  }

  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════
  //  PART 4: Background mountains (silhouettes to break horizon)
  // ══════════════════════════════════════════════════════════

  createMountains(scene);

  // ══════════════════════════════════════════════════════════
  //  PART 5: Small detail objects (flowers, rocks, mushrooms)
  //  These are few enough that individual meshes are fine.
  // ══════════════════════════════════════════════════════════

  // Flower patches
  for (let i = 0; i < 30; i++) {
    const t = Math.random();
    const { point, side } = frame(t);
    const s2 = Math.random() > 0.5 ? 1 : -1;
    const dist = MIN_SCENERY_DIST + 3 + Math.random() * 10;
    const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
    if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
    scene.add(createFlowers(pos.x, pos.z));
  }

  // Rocks scattered around
  for (let i = 0; i < 45; i++) {
    const t = Math.random();
    const { point, side } = frame(t);
    const s2 = Math.random() > 0.5 ? 1 : -1;
    const dist = MIN_SCENERY_DIST + 2 + Math.random() * 20;
    const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
    if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST - 2)) continue;
    scene.add(createRock(pos.x, pos.z, rand(0.4, 1.2)));
  }

  // Mushrooms (hidden in forest)
  for (let i = 0; i < 15; i++) {
    const t = Math.random();
    const { point, side } = frame(t);
    const s2 = Math.random() > 0.5 ? 1 : -1;
    const dist = MIN_SCENERY_DIST + 5 + Math.random() * 25;
    const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
    if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
    scene.add(createMushroom(pos.x, pos.z));
  }

  // ══════════════════════════════════════════════════════════
  //  PART 6: Trackside objects (individual meshes, few of them)
  // ══════════════════════════════════════════════════════════

  // Tire stacks at turns
  const turnTs = [0.12, 0.28, 0.45, 0.65, 0.85];
  for (const tt of turnTs) {
    const { point, side } = frame(tt);
    const dist = MIN_SCENERY_DIST - 2;
    for (const s2 of [-1, 1]) {
      const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
      if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST - 4)) continue;
      scene.add(createTireStack(pos.x, pos.z));
    }
  }

  // Oil drums scattered near track
  for (let i = 0; i < 15; i++) {
    const t = rand(0, 1);
    const { point, side } = frame(t);
    const s2 = Math.random() > 0.5 ? 1 : -1;
    const dist = MIN_SCENERY_DIST + Math.random() * 3;
    const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
    if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST - 2)) continue;
    scene.add(createDrum(pos.x, pos.z));
  }

  // Lamp posts along main straight
  for (let i = 0; i < 6; i++) {
    const t = i / 12;
    const { point, side } = frame(t);
    for (const s2 of [-1, 1]) {
      const dist = MIN_SCENERY_DIST + 2;
      const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
      if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
      scene.add(createLampPost(pos.x, pos.z));
    }
  }

  // Wooden signs at key turns
  const signTs = [{ t: 0.08, rot: 0.5 }, { t: 0.25, rot: -0.8 }, { t: 0.45, rot: 1.2 }];
  for (const { t, rot } of signTs) {
    const { point, side } = frame(t);
    const dist = MIN_SCENERY_DIST + 3;
    const s2 = Math.random() > 0.5 ? 1 : -1;
    const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
    if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
    scene.add(createSign(pos.x, pos.z, rot));
  }

  // Treasure chests hidden deep in forest
  for (let i = 0; i < 8; i++) {
    const t = Math.random();
    const { point, side } = frame(t);
    const s2 = Math.random() > 0.5 ? 1 : -1;
    const dist = MIN_SCENERY_DIST + 15 + Math.random() * 20;
    const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
    if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
    scene.add(createChest(pos.x, pos.z));
  }


}



// ══════════════════════════════════════════════════════════
//  BACKGROUND MOUNTAINS
//  Low-poly silhouette meshes that break the horizon line.
//  3 mountain ranges at different distances for depth.
// ══════════════════════════════════════════════════════════

function createMountains(scene) {
  // Mountain shape: a series of peaks along a circular path
  // Using a LatheGeometry-like approach but with custom profile

  const fogColor = 0xe8926a;

  // 3 ranges: far (lighter, smaller), mid, near (darker, taller)
  const ranges = [
    { radius: 340, peaks: 12, height: 40, color: 0x8a6a5a, yOffset: -5 },  // far — warm faded
    { radius: 280, peaks: 9, height: 55, color: 0x6a4a3a, yOffset: -3 },   // mid
    { radius: 220, peaks: 7, height: 70, color: 0x4a3a2a, yOffset: -2 },   // near — dark warm
  ];

  for (const range of ranges) {
    // Build mountain ring geometry
    const segments = range.peaks * 8; // smooth-ish ring
    const vertices = [], indices = [], uvs = [];

    // Create profile: a ring with peaks
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const baseR = range.radius;

      // Height modulation: multiple sine waves to create organic peaks
      let h = 0;
      h += Math.sin(angle * range.peaks + 1.3) * 0.4;
      h += Math.sin(angle * range.peaks * 2.1 + 0.7) * 0.2;
      h += Math.sin(angle * range.peaks * 0.5 + 2.1) * 0.3;
      h += Math.sin(angle * 3.7 + 0.5) * 0.1;
      h = Math.max(0, h); // no negative peaks
      h = h * h; // sharpen peaks
      const peakH = h * range.height + 5; // minimum 5 units tall

      // Bottom vertex
      const bx = Math.cos(angle) * (baseR + 8);
      const bz = Math.sin(angle) * (baseR + 8);
      vertices.push(bx, range.yOffset, bz);
      uvs.push(i / segments, 0);

      // Top vertex
      const tx = Math.cos(angle) * baseR;
      const tz = Math.sin(angle) * baseR;
      vertices.push(tx, peakH + range.yOffset, tz);
      uvs.push(i / segments, 1);

      // Back-bottom vertex (slightly behind, for thickness)
      const bbx = Math.cos(angle) * (baseR + 12);
      const bbz = Math.sin(angle) * (baseR + 12);
      vertices.push(bbx, range.yOffset - 2, bbz);
      uvs.push(i / segments, 0);

      if (i < segments) {
        const b = i * 3;
        // Front face (top triangle)
        indices.push(b, b + 3, b + 1);
        indices.push(b + 1, b + 3, b + 4);
        // Bottom face (fill the gap)
        indices.push(b, b + 2, b + 3);
        indices.push(b + 2, b + 5, b + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // Use a fog-aware material so mountains fade into the sky
    const mountainMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(range.color) },
        uFogColor: { value: new THREE.Color(fogColor) },
        uFogDensity: { value: 0.0022 },
      },
      vertexShader: `
        varying float vFogDepth;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying float vFogDepth;
        void main() {
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          vec3 col = mix(uColor, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mountainMat);
    scene.add(mesh);
  }
}

// ══════════════════════════════════════════════════════════
//  Original detail factories (flowers, rocks, mushrooms, etc.)
//  Kept as individual meshes since there are few of them.
// ══════════════════════════════════════════════════════════

export function createFlowers(x, z) {
  const g = new THREE.Group();
  const colors = [0xff8866, 0xffcc44, 0xffaa77, 0xff5544, 0xffddaa, 0xcc7744];
  for (let i = 0; i < 12; i++) {
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 5, 4),
      new THREE.MeshLambertMaterial({ color: pick(colors) })
    );
    flower.position.set(rand(-1.5, 1.5), 0.15, rand(-1.5, 1.5)); g.add(flower);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4),
      new THREE.MeshLambertMaterial({ color: 0x338833 })
    );
    stem.position.set(flower.position.x, 0.05, flower.position.z); g.add(stem);
  }
  g.position.set(x, 0, z); return g;
}

export function createRock(x, z, s = 1) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.2 * s, 0),
    new THREE.MeshLambertMaterial({ color: pick([0x888888, 0x777766, 0x999988, 0x666655]) })
  );
  rock.position.y = 0.5 * s;
  rock.scale.set(rand(0.7, 1.3), rand(0.4, 0.8), rand(0.7, 1.3));
  rock.rotation.y = rand(0, Math.PI * 2); rock.castShadow = true; g.add(rock);
  g.position.set(x, 0, z); return g;
}

export function createMushroom(x, z) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 0.6, 6),
    new THREE.MeshLambertMaterial({ color: 0xeeddcc })
  );
  stem.position.y = 0.3; g.add(stem);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xcc2222 })
  );
  cap.position.y = 0.55; g.add(cap);
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    const angle = rand(0, Math.PI * 2), r = rand(0.1, 0.3);
    dot.position.set(Math.cos(angle) * r, 0.7, Math.sin(angle) * r); g.add(dot);
  }
  g.position.set(x, 0, z); return g;
}

export function createSign(x, z, rot) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 2.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b3a1f })
  );
  post.position.y = 1.25; g.add(post);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.8, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b })
  );
  board.position.y = 2.2; g.add(board);
  g.position.set(x, 0, z); g.rotation.y = rot; return g;
}

export function createTireStack(x, z) {
  const g = new THREE.Group();
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.25, 8, 12), tireMat);
    tire.position.y = 0.25 + i * 0.45; tire.rotation.x = Math.PI / 2; g.add(tire);
  }
  g.position.set(x, 0, z); return g;
}

export function createDrum(x, z) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 1.2, 10),
    new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 40 })
  );
  drum.position.y = 0.6; drum.castShadow = true; g.add(drum);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.15, 10),
    new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 40 })
  );
  stripe.position.y = 0.4; g.add(stripe);
  g.position.set(x, 0, z); return g;
}

export function createChest(x, z) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.6, 0.8),
    new THREE.MeshPhongMaterial({ color: 0x8b5a2b, shininess: 20 })
  );
  box.position.y = 0.3; box.castShadow = true; g.add(box);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.15, 0.82),
    new THREE.MeshPhongMaterial({ color: 0x7a4a1a, shininess: 20 })
  );
  lid.position.y = 0.65; lid.rotation.z = 0.3; g.add(lid);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.05, 0.84),
    new THREE.MeshPhongMaterial({ color: 0xddaa00, shininess: 80 })
  );
  trim.position.y = 0.6; g.add(trim);
  g.position.set(x, 0, z); g.rotation.y = rand(0, Math.PI * 2); return g;
}

export function createLampPost(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 5, 6),
    new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 60 })
  );
  pole.position.y = 2.5; g.add(pole);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.06, 0.06),
    new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 60 })
  );
  arm.position.set(0.3, 4.8, 0); g.add(arm);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffcc77 })
  );
  light.position.set(0.6, 4.6, 0); g.add(light);
  const pl = new THREE.PointLight(0xffaa55, 0.8, 15);
  pl.position.set(0.6, 4.6, 0); g.add(pl);
  g.position.set(x, 0, z); return g;
}


