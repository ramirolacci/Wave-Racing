// ═══════════════════════════════════════════════════════
//  PARTICLES — smoke, dust, speed lines
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { SMOKE_COUNT, DUST_COUNT, SPEED_LINE_COUNT, MAX_SPEED } from './config.js';

// ── Smoke ──

export function createSmokeSystem(scene) {
  const positions = new Float32Array(SMOKE_COUNT * 3);
  const sizes = new Float32Array(SMOKE_COUNT);
  const alphas = new Float32Array(SMOKE_COUNT);
  const velocities = [];
  const lifetimes = new Float32Array(SMOKE_COUNT);
  for (let i = 0; i < SMOKE_COUNT; i++) {
    positions[i * 3 + 1] = -100;
    sizes[i] = 0; alphas[i] = 0; lifetimes[i] = 0;
    velocities.push(new THREE.Vector3());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0xddccbb) } },
    vertexShader: `
      attribute float size; attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor; varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, dist) * vAlpha;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let idx = 0;

  function emit(px, py, pz, vx, vy, vz) {
    const i = idx % SMOKE_COUNT;
    positions[i * 3] = px; positions[i * 3 + 1] = py; positions[i * 3 + 2] = pz;
    sizes[i] = 2 + Math.random() * 3; alphas[i] = 0.6; lifetimes[i] = 1.0;
    velocities[i].set(vx, vy, vz); idx++;
  }

  function update(dt) {
    for (let i = 0; i < SMOKE_COUNT; i++) {
      if (lifetimes[i] > 0) {
        lifetimes[i] -= dt * 1.2;
        positions[i * 3] += velocities[i].x * dt;
        positions[i * 3 + 1] += velocities[i].y * dt;
        positions[i * 3 + 2] += velocities[i].z * dt;
        sizes[i] += dt * 8;
        alphas[i] = Math.max(0, lifetimes[i]) * 0.5;
      } else {
        positions[i * 3 + 1] = -100; alphas[i] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }

  return { emit, update };
}

// ── Dust ──

export function createDustSystem(scene) {
  const positions = new Float32Array(DUST_COUNT * 3);
  const sizes = new Float32Array(DUST_COUNT);
  const alphas = new Float32Array(DUST_COUNT);
  const velocities = [];
  const lifetimes = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    positions[i * 3 + 1] = -100;
    sizes[i] = 0; alphas[i] = 0; lifetimes[i] = 0;
    velocities.push(new THREE.Vector3());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    uniforms: { uColor: { value: new THREE.Color(0x8f7f5f) } },
    vertexShader: `
      attribute float size; attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor; varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.3, dist) * vAlpha;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let idx = 0;

  function emit(px, py, pz) {
    const i = idx % DUST_COUNT;
    positions[i * 3] = px + (Math.random() - 0.5) * 2;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz + (Math.random() - 0.5) * 2;
    sizes[i] = 3 + Math.random() * 5; alphas[i] = 0.4; lifetimes[i] = 1.0;
    velocities[i].set(
      (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4
    );
    idx++;
  }

  function update(dt) {
    for (let i = 0; i < DUST_COUNT; i++) {
      if (lifetimes[i] > 0) {
        lifetimes[i] -= dt * 1.0;
        positions[i * 3] += velocities[i].x * dt;
        positions[i * 3 + 1] += velocities[i].y * dt;
        positions[i * 3 + 2] += velocities[i].z * dt;
        sizes[i] += dt * 6;
        alphas[i] = Math.max(0, lifetimes[i]) * 0.35;
      } else {
        positions[i * 3 + 1] = -100; alphas[i] = 0;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }

  return { emit, update };
}

// ── Speed lines ──

export function createSpeedLineSystem(scene) {
  const positions = new Float32Array(SPEED_LINE_COUNT * 3);
  const alphas = new Float32Array(SPEED_LINE_COUNT);
  const velocities = [];
  for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    positions[i * 3 + 1] = -100; alphas[i] = 0;
    velocities.push(new THREE.Vector3());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: `
      attribute float alpha; varying float vAlpha;
      void main() {
        vAlpha = alpha;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 3.0 * (200.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float dist = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, dist) * vAlpha;
        gl_FragColor = vec4(1.0, 1.0, 1.0, a);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  let idx = 0;

  function emit(px, py, pz, heading, speed) {
    const i = idx % SPEED_LINE_COUNT;
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 12, Math.random() * 5 + 1, (Math.random() - 0.5) * 12
    );
    positions[i * 3] = px + offset.x;
    positions[i * 3 + 1] = py + offset.y;
    positions[i * 3 + 2] = pz + offset.z;
    alphas[i] = 0.3;
    const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    velocities[i].copy(dir).multiplyScalar(-speed * 0.5);
    velocities[i].y = (Math.random() - 0.5) * 5;
    idx++;
  }

  function update(dt, player) {
    const speedRatio = Math.abs(player.speed) / MAX_SPEED;
    for (let i = 0; i < SPEED_LINE_COUNT; i++) {
      alphas[i] *= (1 - dt * 3);
      if (alphas[i] < 0.01) {
        positions[i * 3 + 1] = -100; alphas[i] = 0;
      } else {
        positions[i * 3] += velocities[i].x * dt;
        positions[i * 3 + 1] += velocities[i].y * dt;
        positions[i * 3 + 2] += velocities[i].z * dt;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;

    if (speedRatio > 0.6) {
      const count = Math.floor((speedRatio - 0.5) * 6);
      for (let j = 0; j < count; j++) {
        emit(player.x, 0, player.z, player.heading, player.speed);
      }
    }
  }

  return { emit, update };
}
