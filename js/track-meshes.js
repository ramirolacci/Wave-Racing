// ═══════════════════════════════════════════════════════
//  TRACK MESHES — road, dirt, curbs, dashes, start/finish, barriers
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { TRACK_WIDTH, CURB_W, SEG } from './config.js';
import { frame, buildRoad, buildDirtStrip, buildCurb } from './track.js';

export function createRoadSurface(scene, renderer) {
  const texSize = 1024;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = texSize;
  const ctx = texCanvas.getContext('2d');

  // ── Base: dark goudron fill ──
  ctx.fillStyle = '#2a2a2e';
  ctx.fillRect(0, 0, texSize, texSize);

  // ── Coarse pixel noise (large-scale tonal variation) ──
  const imgData = ctx.getImageData(0, 0, texSize, texSize);
  const d = imgData.data;
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const i = (y * texSize + x) * 4;
      // Multi-scale noise: combine two frequencies for organic look
      const n1 = (Math.random() - 0.5) * 14;  // fine grain
      const n2 = (Math.random() - 0.5) * 8;    // coarser shimmer
      const n = n1 + n2;
      d[i]   = Math.max(0, Math.min(255, d[i]   + n * 0.8));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.8));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 1.1));
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // ── Driving-lane wear strips (lighter where tires roll) ──
  const laneY = texSize * 0.35;   // left wheel path
  const laneY2 = texSize * 0.65;  // right wheel path
  for (const ly of [laneY, laneY2]) {
    for (let j = 0; j < 60; j++) {
      const x = Math.random() * texSize;
      const y = ly + (Math.random() - 0.5) * texSize * 0.08;
      ctx.fillStyle = `rgba(58,58,64,${0.3 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 12 + Math.random() * 30, 4 + Math.random() * 8, (Math.random() - 0.5) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Dark tire-rut patches (oil / soot) ──
  for (let j = 0; j < 40; j++) {
    const x = Math.random() * texSize, y = Math.random() * texSize;
    ctx.fillStyle = `rgba(30,30,34,${0.3 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 8 + Math.random() * 25, 3 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Patch repairs (slightly different shade rectangles) ──
  for (let j = 0; j < 12; j++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    const w = 15 + Math.random() * 40;
    const h = 8 + Math.random() * 25;
    const shade = 38 + Math.random() * 15;
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 4},0.4)`;
    ctx.fillRect(x, y, w, h);
  }

  // ── Road marking remnants (faded paint flecks) ──
  for (let j = 0; j < 8; j++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    ctx.fillStyle = `rgba(200,200,180,${0.08 + Math.random() * 0.1})`;
    ctx.fillRect(x, y, 3 + Math.random() * 20, 1 + Math.random() * 3);
  }

  // ── Small aggregate / stone chips ──
  for (let j = 0; j < 200; j++) {
    const x = Math.random() * texSize, y = Math.random() * texSize;
    const brightness = 55 + Math.random() * 30;
    ctx.fillStyle = `rgba(${brightness},${brightness},${brightness + 6},0.6)`;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + Math.random() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Cracks (thin dark lines) ──
  for (let j = 0; j < 6; j++) {
    let cx = Math.random() * texSize, cy = Math.random() * texSize;
    const angle = Math.random() * Math.PI;
    const len = 20 + Math.random() * 60;
    ctx.strokeStyle = `rgba(15,15,18,${0.3 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < len; s += 4) {
      cx += Math.cos(angle) * 4 + (Math.random() - 0.5) * 3;
      cy += Math.sin(angle) * 4 + (Math.random() - 0.5) * 3;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const roadTex = new THREE.CanvasTexture(texCanvas);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  // No extra repeat — UVs already span ~3 tiles, each 1024px rich texture
  roadTex.repeat.set(1, 1);
  roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const road = new THREE.Mesh(buildRoad(), new THREE.MeshLambertMaterial({ map: roadTex }));
  road.receiveShadow = true;
  scene.add(road);
}

export function createDirtStrips(scene, renderer) {
  const texSize = 256;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texSize; texCanvas.height = texSize;
  const ctx = texCanvas.getContext('2d');

  // ── Gradient from goudron edge → gravel → grass ──
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const t = x / texSize;
      let r, g, b;
      // Add per-pixel noise for non-repeating look
      const jitter = (Math.random() - 0.5) * 6;
      if (t < 0.4) {
        // Dark goudron edge (close to track)
        const f = t / 0.4;
        r = 42 - f * 5 + (Math.random() - 0.5) * 12 + jitter;
        g = 42 + f * 10 + (Math.random() - 0.5) * 12 + jitter;
        b = 46 + f * 4 + (Math.random() - 0.5) * 8 + jitter;
      } else if (t < 0.7) {
        // Gravel / transition
        const f = (t - 0.4) / 0.3;
        r = 64 + f * 20 + (Math.random() - 0.5) * 18 + jitter;
        g = 89 + f * 30 + (Math.random() - 0.5) * 18 + jitter;
        b = 79 + f * 10 + (Math.random() - 0.5) * 10 + jitter;
      } else {
        // Grass blend
        const f = (t - 0.7) / 0.3;
        r = 84 - f * 30 + (Math.random() - 0.5) * 25 + jitter;
        g = 119 + f * 20 + (Math.random() - 0.5) * 20 + jitter;
        b = 89 - f * 30 + (Math.random() - 0.5) * 10 + jitter;
      }
      ctx.fillStyle = `rgb(${Math.max(0,Math.min(255,r|0))},${Math.max(0,Math.min(255,g|0))},${Math.max(0,Math.min(255,b|0))})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // ── Goudron edge pebbles ──
  for (let j = 0; j < 60; j++) {
    const x = Math.random() * texSize * 0.5, y = Math.random() * texSize;
    ctx.fillStyle = '#3e3e44';
    ctx.beginPath(); ctx.arc(x, y, 0.8 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
  }

  // ── Gravel zone stones ──
  for (let j = 0; j < 30; j++) {
    const x = texSize * 0.35 + Math.random() * texSize * 0.3, y = Math.random() * texSize;
    const shade = 90 + Math.random() * 40;
    ctx.fillStyle = `rgb(${shade},${shade - 5},${shade - 15})`;
    ctx.beginPath(); ctx.arc(x, y, 1 + Math.random() * 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // ── Grass blades ──
  for (let j = 0; j < 30; j++) {
    const x = texSize * 0.5 + Math.random() * texSize * 0.4, y = Math.random() * texSize;
    ctx.fillStyle = `rgb(${40 + Math.random() * 20},${120 + Math.random() * 40},${40 + Math.random() * 20})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + Math.random() * 3, 1 + Math.random() * 1, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Dirt clods in transition zone ──
  for (let j = 0; j < 20; j++) {
    const x = texSize * 0.3 + Math.random() * texSize * 0.3, y = Math.random() * texSize;
    ctx.fillStyle = `rgba(110,90,60,${0.3 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + Math.random() * 4, 1 + Math.random() * 2, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const dirtTex = new THREE.CanvasTexture(texCanvas);
  dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;
  dirtTex.repeat.set(1, 3);
  dirtTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex });
  const dirtL = new THREE.Mesh(buildDirtStrip(-1), dirtMat);
  dirtL.receiveShadow = true;
  scene.add(dirtL);
  const dirtR = new THREE.Mesh(buildDirtStrip(1), dirtMat);
  dirtR.receiveShadow = true;
  scene.add(dirtR);
}

export function createCurbs(scene) {
  const curbMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const curbL = new THREE.Mesh(buildCurb(-1), curbMat);
  curbL.castShadow = true;
  scene.add(curbL);
  const curbR = new THREE.Mesh(buildCurb(1), curbMat);
  curbR.castShadow = true;
  scene.add(curbR);
}

export function createCenterDashes(scene) {
  const dashGeo = new THREE.BoxGeometry(0.25, 0.02, 3);
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffcc });
  for (let i = 0; i < SEG; i += 10) {
    const t = i / SEG;
    const { point, tangent } = frame(t);
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.copy(point);
    d.position.y += 0.04;
    d.lookAt(point.clone().add(tangent));
    scene.add(d);
  }
}

export function createStartFinish(scene) {
  const { point, tangent, side } = frame(0);
  const angle = Math.atan2(tangent.x, tangent.z);

  // White base
  const sl = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.05, 2),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  sl.position.copy(point); sl.position.y += 0.04; sl.rotation.y = angle;
  scene.add(sl);

  // Black checker squares
  const n = 8, sw = TRACK_WIDTH / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 2; j++) {
      if ((i + j) % 2 === 0) continue;
      const sq = new THREE.Mesh(
        new THREE.BoxGeometry(sw, 0.06, 1),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      const pos = point.clone()
        .add(side.clone().multiplyScalar((i - n / 2 + 0.5) * sw))
        .add(tangent.clone().multiplyScalar((j - 0.5) * 1));
      sq.position.copy(pos); sq.position.y += 0.05; sq.rotation.y = angle;
      scene.add(sq);
    }
  }

  // Archway
  const archMat = new THREE.MeshPhongMaterial({ color: 0xdd2222, shininess: 60 });
  const poleMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 40 });
  for (const s2 of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 10, 12), poleMat);
    const pPos = point.clone().add(side.clone().multiplyScalar(s2 * (TRACK_WIDTH / 2 + 1)));
    pole.position.copy(pPos); pole.position.y += 5; pole.castShadow = true;
    scene.add(pole);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 3, 1.2, 1.2), archMat);
  crossbar.position.copy(point); crossbar.position.y += 9.5;
  crossbar.rotation.y = angle; crossbar.castShadow = true;
  scene.add(crossbar);

  // Banner
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 512; bannerCanvas.height = 64;
  const bctx = bannerCanvas.getContext('2d');
  bctx.fillStyle = '#dd2222'; bctx.fillRect(0, 0, 512, 64);
  for (let bx = 0; bx < 32; bx++) {
    for (let by = 0; by < 4; by++) {
      if ((bx + by) % 2 === 0) { bctx.fillStyle = '#111'; bctx.fillRect(bx * 16, by * 16, 16, 16); }
    }
  }
  bctx.fillStyle = '#fff'; bctx.font = 'bold 40px Arial';
  bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
  bctx.fillText('START / FINISH', 256, 32);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  const bannerGeo = new THREE.PlaneGeometry(TRACK_WIDTH * 0.8, 0.9);
  for (const rotY of [angle, angle + Math.PI]) {
    const banner = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ map: bannerTex }));
    banner.position.copy(point); banner.position.y += 9.5; banner.rotation.y = rotY;
    scene.add(banner);
  }
}

export function createSectorMarkers(scene) {
  const SECTOR_COLORS = [0xff6b6b, 0xffd93d, 0x6bff6b]; // S1 red, S2 yellow, S3 green
  const NUM_SECTORS = 3;
  for (let s = 0; s < NUM_SECTORS; s++) {
    const t = s / NUM_SECTORS;
    const { point, tangent, side } = frame(t);
    const angle = Math.atan2(tangent.x, tangent.z);

    // Sector line across the track
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH + 2, 0.06, 0.6),
      new THREE.MeshLambertMaterial({ color: SECTOR_COLORS[s], transparent: true, opacity: 0.5 })
    );
    line.position.copy(point);
    line.position.y += 0.06;
    line.rotation.y = angle;
    scene.add(line);

    // Sector label on the side
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128; labelCanvas.height = 48;
    const lctx = labelCanvas.getContext('2d');
    lctx.fillStyle = SECTOR_COLORS[s];
    lctx.font = 'bold 36px Orbitron, Arial';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    lctx.fillText(`S${s + 1}`, 64, 24);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelGeo = new THREE.PlaneGeometry(2.5, 1.0);
    const labelMesh = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, opacity: 0.7 }));
    // Place label just outside track on the right side
    const labelPos = point.clone().add(side.clone().multiplyScalar(TRACK_WIDTH / 2 + 3));
    labelMesh.position.copy(labelPos);
    labelMesh.position.y += 1.5;
    labelMesh.rotation.y = angle;
    scene.add(labelMesh);
  }
}

export function createBarriers(scene) {
  for (let i = 0; i < SEG; i += 8) {
    const t = i / SEG;
    const { point, side } = frame(t);
    const dist = TRACK_WIDTH / 2 + CURB_W + 0.3;
    for (const s of [-1, 1]) {
      const pos = point.clone().add(side.clone().multiplyScalar(s * dist));
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.8, 0.5),
        new THREE.MeshLambertMaterial({ color: 0xcccccc })
      );
      barrier.position.copy(pos); barrier.position.y += 0.4;
      barrier.castShadow = true; barrier.receiveShadow = true;
      scene.add(barrier);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, 0.15, 0.52),
        new THREE.MeshLambertMaterial({ color: 0xdd2222 })
      );
      stripe.position.copy(pos); stripe.position.y += 0.55;
      scene.add(stripe);
    }
  }
}
