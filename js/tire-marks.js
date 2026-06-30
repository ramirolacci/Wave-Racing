// ═══════════════════════════════════════════════════════
//  TIRE MARKS — persistent skid marks on the ground
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { MAX_TIRE_MARKS } from './config.js';

const VERTS_PER_MARK = 6;
const MARK_WIDTH = 0.38;

export function createTireMarkSystem(scene) {
  const maxVerts = MAX_TIRE_MARKS * VERTS_PER_MARK;
  const positions = new Float32Array(maxVerts * 3);
  const alphas = new Float32Array(maxVerts);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {},
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        // Dark rubber marks — quite opaque near black
        gl_FragColor = vec4(0.12, 0.11, 0.10, vAlpha * 0.85);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.08;         // Above road (0.02) and curbs (0.03–0.2)
  mesh.frustumCulled = false;     // Dynamic geometry — don't cull
  mesh.renderOrder = 1;           // Render after opaque, before other transparent
  scene.add(mesh);

  let markCount = 0;

  // Per-car chain state — keyed by car id
  const chainState = new Map();

  function getChain(id) {
    if (!chainState.has(id)) chainState.set(id, { prevLeft: null, prevRight: null });
    return chainState.get(id);
  }

  function addMark(cx, cz, heading, intensity, side, id = 'player') {
    if (markCount >= MAX_TIRE_MARKS) return;

    // Right vector perpendicular to car heading
    const rightX = Math.cos(heading);
    const rightZ = -Math.sin(heading);

    const hw = MARK_WIDTH / 2;
    const lx = cx - rightX * hw;
    const lz = cz - rightZ * hw;
    const rx = cx + rightX * hw;
    const rz = cz + rightZ * hw;

    const chain = getChain(id);
    const prev = side < 0 ? chain.prevLeft : chain.prevRight;

    if (prev) {
      const vi = markCount * VERTS_PER_MARK;
      const pi = vi * 3;

      // Quad: prev edge → current edge
      positions[pi + 0]  = prev.lx; positions[pi + 1]  = 0; positions[pi + 2]  = prev.lz;
      positions[pi + 3]  = prev.rx; positions[pi + 4]  = 0; positions[pi + 5]  = prev.rz;
      positions[pi + 6]  = lx;     positions[pi + 7]  = 0; positions[pi + 8]  = lz;
      positions[pi + 9]  = lx;     positions[pi + 10] = 0; positions[pi + 11] = lz;
      positions[pi + 12] = prev.rx; positions[pi + 13] = 0; positions[pi + 14] = prev.rz;
      positions[pi + 15] = rx;     positions[pi + 16] = 0; positions[pi + 17] = rz;

      const avgAlpha = (intensity + prev.intensity) * 0.5;
      for (let v = 0; v < VERTS_PER_MARK; v++) {
        alphas[vi + v] = avgAlpha;
      }

      markCount++;
      geo.setDrawRange(0, markCount * VERTS_PER_MARK);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.alpha.needsUpdate = true;
    }

    const state = { lx, lz, rx, rz, intensity };
    if (side < 0) chain.prevLeft = state;
    else chain.prevRight = state;
  }

  function breakChain(id = 'player') {
    const chain = getChain(id);
    chain.prevLeft = null;
    chain.prevRight = null;
  }

  return { addMark, breakChain };
}
