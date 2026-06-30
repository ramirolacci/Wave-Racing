// ═══════════════════════════════════════════════════════
//  CAR GAME — main.js
//  ═══════════════════════════════════════════════════════
//  TABLE OF CONTENTS:
//    L10   — GLOBALS
//    L13   — TRACK DEFINITION
//    L51   — GEOMETRY BUILDERS
//    L136  — RENDERER & SCENE
//    L153  — SKY DOME
//    L201  — LIGHTS
//    L224  — GROUND
//    L281  — TRACK MESHES
//    L556  — SCENERY (trees, bushes, rocks, objects)
//    L931  — PLACE SCENERY (positioning + safety checks)
//    L1117 — CARS (player + AI)
//    L1230 — ITEM BOXES
//    L1289 — PARTICLE SYSTEMS
//    L1552 — MINI-MAP
//    L1635 — FIND NEAREST POINT ON TRACK
//    L1660 — WINDOW EXPORTS
//    L1669 — INPUT
//    L1675 — TIRE MARKS
//    L1766 — GAME LOOP
//    L1995 — RESIZE
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════════════
const G = {
  player: { x: 0, z: 0, heading: 0, speed: 0, lap: 0, onTrack: true },
  keys: {},
  lapMarker: 0, // track parameter at start/finish line
};

// window exports moved to bottom (after declarations)

// ═══════════════════════════════════════════════════════
//  TRACK DEFINITION — closed-loop circuit
// ═══════════════════════════════════════════════════════
const TRACK_WIDTH = 16;
const CURB_W = 1.2;
const SEG = 600;

const trackPoints = [
  new THREE.Vector3(0, 0, 0),         // Start/finish
  new THREE.Vector3(55, 0, 0),        // End of main straight
  new THREE.Vector3(85, 0, -25),      // Turn 1 entry (right sweeper)
  new THREE.Vector3(95, 0, -60),      // Turn 1 apex
  new THREE.Vector3(80, 0, -90),      // Turn 1 exit
  new THREE.Vector3(50, 2, -108),     // Uphill back-straight
  new THREE.Vector3(20, 1, -100),     // Hairpin entry
  new THREE.Vector3(0, 0, -78),      // Hairpin apex
  new THREE.Vector3(8, 0, -52),       // Hairpin exit
  new THREE.Vector3(-18, 0, -38),     // S-curve entry
  new THREE.Vector3(-48, 0, -58),     // S-curve mid
  new THREE.Vector3(-72, 0, -38),     // S-curve exit
  new THREE.Vector3(-62, 0, -8),      // Final sweeper entry
  new THREE.Vector3(-32, 0, 12),      // Final sweeper exit → approach start
];

const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.3);
const trackLen = trackCurve.getLength();

// Get track frame at parameter t (0–1)
function frame(t) {
  t = ((t % 1) + 1) % 1;
  const point = trackCurve.getPointAt(t);
  const tangent = trackCurve.getTangentAt(t).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
  if (side.lengthSq() < 0.0001) side.set(1, 0, 0);
  return { point, tangent, side };
}

// ═══════════════════════════════════════════════════════
//  GEOMETRY BUILDERS
// ═══════════════════════════════════════════════════════
// Track width + dirt runoff zone
const DIRT_WIDTH = 14; // extra dirt on each side beyond curbs

function buildRoad() {
  const v = [], u = [], idx = [];
  const hw = TRACK_WIDTH / 2;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const { point, side } = frame(t);
    const L = point.clone().add(side.clone().multiplyScalar(-hw));
    const R = point.clone().add(side.clone().multiplyScalar(hw));
    L.y += 0.02; R.y += 0.02;
    v.push(L.x, L.y, L.z, R.x, R.y, R.z);
    u.push(0, t * 25, 1, t * 25);
    // CCW winding: normals face UP (+Y)
    if (i < SEG) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Build dirt strip around track (4 rows: dirt-dense, dirt, transition, grass-edge)
function buildDirtStrip(sSign) {
  const v = [], u = [], idx = [];
  const hw = TRACK_WIDTH / 2 + CURB_W;
  const rows = 4;
  const colW = DIRT_WIDTH / rows; // width per row
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const { point, side } = frame(t);
    const dir = side.clone().multiplyScalar(sSign);
    for (let r = 0; r <= rows; r++) {
      const dist = hw + r * colW;
      const p = point.clone().add(dir.clone().multiplyScalar(dist));
      p.y += 0.01;
      v.push(p.x, p.y, p.z);
      // U: across strip (0=track edge, 1=grass edge), V: along track
      u.push(r / rows, t * 50);
    }
    // Winding depends on sSign: same logic as curbs
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

function buildCurb(sSign) {
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
    // Winding depends on sSign
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

// ═══════════════════════════════════════════════════════
//  RENDERER & SCENE
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe8926a, 0.0025);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 600);

// ═══════════════════════════════════════════════════════
//  SKY DOME — procedural gradient
// ═══════════════════════════════════════════════════════
{
  const skyGeo = new THREE.SphereGeometry(400, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x1a1a3e) },      // deep indigo top
      uMid: { value: new THREE.Color(0xb07088) },       // muted mauve
      uBot: { value: new THREE.Color(0xffa860) },       // warm amber horizon
      uSun: { value: new THREE.Color(0xffee88) },       // warm sun glow
      uSunDir: { value: new THREE.Vector3(0.6, 0.01, 0.3).normalize() }, // sun right at horizon
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uMid, uBot, uSun;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float y = dir.y;
        // Sky gradient: top → mid → horizon
        vec3 col = mix(uMid, uTop, smoothstep(0.1, 0.8, y));
        col = mix(uBot, col, smoothstep(-0.02, 0.15, y));
        // Sun disc + glow
        float sunDot = max(dot(dir, uSunDir), 0.0);
        col += uSun * pow(sunDot, 64.0) * 2.0;   // sharp disc
        col += uSun * pow(sunDot, 6.0) * 0.4;     // wide glow
        col += vec3(1.0, 0.8, 0.5) * pow(sunDot, 3.0) * 0.15; // warm haze

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ═══════════════════════════════════════════════════════
//  LIGHTS — warm sun + cool ambient
// ═══════════════════════════════════════════════════════
scene.add(new THREE.AmbientLight(0x999088, 0.45));
scene.add(new THREE.HemisphereLight(0xffccaa, 0x443322, 0.3));

const sun = new THREE.DirectionalLight(0xffe8cc, 1.4);
sun.position.set(120, 6, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
const sc = sun.shadow.camera;
sc.left = sc.bottom = -130;
sc.right = sc.top = 130;
sc.near = 1; sc.far = 300;
scene.add(sun);
scene.add(sun.target);

// Subtle fill light from opposite side
const fill = new THREE.DirectionalLight(0x8877aa, 0.2);
fill.position.set(-40, 30, -60);
scene.add(fill);

// ═══════════════════════════════════════════════════════
//  GROUND — textured with procedural noise
// ═══════════════════════════════════════════════════════
{
  // Create procedural grass texture via canvas
  const texSize = 512;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = texSize;
  const ctx = texCanvas.getContext('2d');
  // Base green
  ctx.fillStyle = '#4a7a3a';
  ctx.fillRect(0, 0, texSize, texSize);
  // Add noise variation
  const imgData = ctx.getImageData(0, 0, texSize, texSize);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.6));     // R
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));        // G
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.4));  // B
  }
  // Darker patches (flowers/shadows)
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    const r = 2 + Math.random() * 4;
    ctx.fillStyle = Math.random() > 0.7 ? '#3d6a2a' : '#5a8f40';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tiny flower dots
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    ctx.fillStyle = ['#ff8866', '#ffcc44', '#ffaa77', '#cc7744'][Math.floor(Math.random() * 4)];
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.putImageData(imgData, 0, 0);

  const grassTex = new THREE.CanvasTexture(texCanvas);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(40, 40);
  grassTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshLambertMaterial({ map: grassTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);
}

// ═══════════════════════════════════════════════════════
//  TRACK MESHES
// ═══════════════════════════════════════════════════════
// Road surface — warm brown dirt track (Wind Waker style)
{
  const texSize = 256;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = texSize;
  const ctx = texCanvas.getContext('2d');
  // Dark asphalt — goudron style
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 0, texSize, texSize);
  // Grain noise
  const imgData = ctx.getImageData(0, 0, texSize, texSize);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 25;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 1.1));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.8));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.5));
  }
  ctx.putImageData(imgData, 0, 0);
  // Darker packed-earth patches (tire ruts)
  for (let j = 0; j < 15; j++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.ellipse(x, y, 8 + Math.random() * 15, 3 + Math.random() * 6, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lighter sandy spots
  for (let j = 0; j < 10; j++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + Math.random() * 8, 3 + Math.random() * 5, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small pebbles
  for (let j = 0; j < 30; j++) {
    const x = Math.random() * texSize;
    const y = Math.random() * texSize;
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const roadTex = new THREE.CanvasTexture(texCanvas);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.repeat.set(2, 25);
  roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const road = new THREE.Mesh(buildRoad(), new THREE.MeshLambertMaterial({ map: roadTex }));
  road.receiveShadow = true;
  scene.add(road);
}

// Dirt runoff strips — brown-to-green transition (Wind Waker style)
{
  const texSize = 128;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texSize;
  texCanvas.height = texSize;
  const ctx = texCanvas.getContext('2d');
  // Create gradient: left (near track) = dirt, right (far) = grass
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const t = x / texSize; // 0=dirt edge, 1=grass edge
      // Mix: packed brown → loose dirt → grass
      let r, g, b;
      if (t < 0.4) {
        // Dark asphalt edge (close to track)
        const f = t / 0.4;
        r = 74 - f * 10 + (Math.random() - 0.5) * 15;
        g = 74 + f * 15 + (Math.random() - 0.5) * 15;
        b = 74 + f * 5 + (Math.random() - 0.5) * 10;
      } else if (t < 0.7) {
        // Gravel / transition
        const f = (t - 0.4) / 0.3;
        r = 64 + f * 20 + (Math.random() - 0.5) * 18;
        g = 89 + f * 30 + (Math.random() - 0.5) * 18;
        b = 79 + f * 10 + (Math.random() - 0.5) * 10;
      } else {
        // Grass blend
        const f = (t - 0.7) / 0.3;
        r = 84 - f * 30 + (Math.random() - 0.5) * 25;
        g = 119 + f * 20 + (Math.random() - 0.5) * 20;
        b = 89 - f * 30 + (Math.random() - 0.5) * 10;
      }
      ctx.fillStyle = `rgb(${Math.max(0,Math.min(255,r|0))},${Math.max(0,Math.min(255,g|0))},${Math.max(0,Math.min(255,b|0))})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Sprinkle pebbles in dirt area
  for (let j = 0; j < 40; j++) {
    const x = Math.random() * texSize * 0.5;
    const y = Math.random() * texSize;
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.arc(x, y, 1 + Math.random() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small grass tufts at transition
  for (let j = 0; j < 20; j++) {
    const x = texSize * 0.5 + Math.random() * texSize * 0.4;
    const y = Math.random() * texSize;
    ctx.fillStyle = '#3a8f3a';
    ctx.beginPath();
    ctx.ellipse(x, y, 2 + Math.random() * 3, 1 + Math.random() * 1, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const dirtTex = new THREE.CanvasTexture(texCanvas);
  dirtTex.wrapS = dirtTex.wrapT = THREE.RepeatWrapping;
  dirtTex.repeat.set(1, 50);
  dirtTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const dirtMat = new THREE.MeshLambertMaterial({ map: dirtTex });
  const dirtL = new THREE.Mesh(buildDirtStrip(-1), dirtMat);
  dirtL.receiveShadow = true;
  scene.add(dirtL);
  const dirtR = new THREE.Mesh(buildDirtStrip(1), dirtMat);
  dirtR.receiveShadow = true;
  scene.add(dirtR);
}

// Curbs — with 3D raised profile
const curbMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const curbL = new THREE.Mesh(buildCurb(-1), curbMat);
curbL.castShadow = true;
scene.add(curbL);
const curbR = new THREE.Mesh(buildCurb(1), curbMat);
curbR.castShadow = true;
scene.add(curbR);

// Center-line dashes
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

// Start/finish checkerboard line — with archway
{
  const { point, tangent, side } = frame(0);
  const angle = Math.atan2(tangent.x, tangent.z);
  // White base
  const sl = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.05, 2),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  sl.position.copy(point);
  sl.position.y += 0.04;
  sl.rotation.y = angle;
  scene.add(sl);
  // Black checker squares
  const n = 8;
  const sw = TRACK_WIDTH / n;
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
      sq.position.copy(pos);
      sq.position.y += 0.05;
      sq.rotation.y = angle;
      scene.add(sq);
    }
  }

  // ══ START/FINISH ARCHWAY ══
  const archMat = new THREE.MeshPhongMaterial({ color: 0xdd2222, shininess: 60 });
  const poleMat = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 40 });
  // Poles
  for (const s2 of [-1, 1]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.35, 10, 12),
      poleMat
    );
    const pPos = point.clone().add(side.clone().multiplyScalar(s2 * (TRACK_WIDTH / 2 + 1)));
    pole.position.copy(pPos);
    pole.position.y += 5;
    pole.castShadow = true;
    scene.add(pole);
  }
  // Crossbar
  const crossbar = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH + 3, 1.2, 1.2),
    archMat
  );
  crossbar.position.copy(point);
  crossbar.position.y += 9.5;
  crossbar.rotation.y = angle;
  crossbar.castShadow = true;
  scene.add(crossbar);
  // "START" banner on crossbar (using a plane)
  const bannerGeo = new THREE.PlaneGeometry(TRACK_WIDTH * 0.8, 0.9);
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 512; bannerCanvas.height = 64;
  const bctx = bannerCanvas.getContext('2d');
  bctx.fillStyle = '#dd2222';
  bctx.fillRect(0, 0, 512, 64);
  bctx.fillStyle = '#ffffff';
  bctx.font = 'bold 48px Arial';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('START / FINISH', 256, 32);
  // Checkerboard pattern on banner
  for (let bx = 0; bx < 32; bx++) {
    for (let by = 0; by < 4; by++) {
      if ((bx + by) % 2 === 0) {
        bctx.fillStyle = '#111';
        bctx.fillRect(bx * 16, by * 16, 16, 16);
      }
    }
  }
  bctx.fillStyle = '#fff';
  bctx.font = 'bold 40px Arial';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('START / FINISH', 256, 32);
  const bannerTex = new THREE.CanvasTexture(bannerCanvas);
  const banner = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ map: bannerTex }));
  banner.position.copy(point);
  banner.position.y += 9.5;
  banner.rotation.y = angle;
  scene.add(banner);
  // Back side of banner
  const bannerBack = banner.clone();
  bannerBack.rotation.y = angle + Math.PI;
  scene.add(bannerBack);
}

// Barrier fence — improved with concrete barriers
for (let i = 0; i < SEG; i += 8) {
  const t = i / SEG;
  const { point, side } = frame(t);
  const dist = TRACK_WIDTH / 2 + CURB_W + 0.3;
  for (const s of [-1, 1]) {
    const pos = point.clone().add(side.clone().multiplyScalar(s * dist));
    // Concrete barrier segment
    const barrier = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.8, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xcccccc })
    );
    barrier.position.copy(pos);
    barrier.position.y += 0.4;
    barrier.castShadow = true;
    barrier.receiveShadow = true;
    scene.add(barrier);
    // Red stripe on barrier
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.15, 0.52),
      new THREE.MeshLambertMaterial({ color: 0xdd2222 })
    );
    stripe.position.copy(pos);
    stripe.position.y += 0.55;
    scene.add(stripe);
  }
}

// ═══════════════════════════════════════════════════════
//  SCENERY — dense forest + trackside objects
// ═══════════════════════════════════════════════════════

// Shared materials (reuse to save draw calls)
const TRUNK_COLORS = [0x5a2d0c, 0x6b3a1f, 0x7a4a2a, 0x4a2510];
const LEAF_COLORS = [0x1a6b1a, 0x228B22, 0x2d9f2d, 0x1a7a1a, 0x0f5f0f, 0x3aaf3a];
const AUTUMN_COLORS = [0xcc6600, 0xdd9900, 0xaa3300, 0xee7722];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(a, b) { return a + Math.random() * (b - a); }

// ── Pine tree (natural layered look) ──
function createPine(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * s, 0.25 * s, 3 * s, 6),
    new THREE.MeshLambertMaterial({ color: pick(TRUNK_COLORS) })
  );
  trunk.position.y = 1.5 * s;
  trunk.castShadow = true;
  g.add(trunk);
  // Layered cones with wide overlap
  // Each layer: wide base cone + a smaller one peeking out top
  const layers = [
    { baseR: 2.8, topR: 0.0, h: 3.2, y: 3.5 },
    { baseR: 2.3, topR: 0.0, h: 2.6, y: 5.6 },
    { baseR: 1.8, topR: 0.0, h: 2.2, y: 7.4 },
    { baseR: 1.2, topR: 0.0, h: 1.8, y: 8.8 },
  ];
  const leafCol = pick(LEAF_COLORS);
  for (const l of layers) {
    // Main cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(l.baseR * s, l.h * s, 8),
      new THREE.MeshLambertMaterial({ color: leafCol })
    );
    cone.position.y = l.y * s;
    cone.castShadow = true;
    g.add(cone);
    // Slightly darker underside ring (visual depth)
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(l.baseR * 0.85 * s, l.baseR * s, l.h * 0.15 * s, 8, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x0f4f0f, side: THREE.DoubleSide })
    );
    ring.position.y = (l.y - l.h * 0.4) * s;
    g.add(ring);
  }
  g.position.set(x, 0, z);
  return g;
}

// ── Oak tree (broad, round canopy) ──
function createOak(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25 * s, 0.5 * s, 4 * s, 7),
    new THREE.MeshLambertMaterial({ color: pick(TRUNK_COLORS) })
  );
  trunk.position.y = 2 * s;
  trunk.castShadow = true;
  g.add(trunk);
  // Big round canopy (cluster of spheres)
  const col = pick(LEAF_COLORS);
  const positions = [
    [0, 5.5, 0, 3.2], [1.5, 5.0, 0.8, 2.2], [-1.2, 5.2, -1, 2.4],
    [0.5, 6.2, -0.5, 2.0], [-0.8, 4.8, 1.2, 2.0],
  ];
  for (const [px, py, pz, pr] of positions) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(pr * s, 7, 5),
      new THREE.MeshLambertMaterial({ color: col })
    );
    sphere.position.set(px * s, py * s, pz * s);
    sphere.castShadow = true;
    g.add(sphere);
  }
  g.position.set(x, 0, z);
  return g;
}

// ── Birch tree (white trunk, small canopy) ──
function createBirch(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 5 * s, 6),
    new THREE.MeshLambertMaterial({ color: 0xddd8c8 })
  );
  trunk.position.y = 2.5 * s;
  trunk.castShadow = true;
  g.add(trunk);
  // Dark marks on trunk
  for (let i = 0; i < 4; i++) {
    const mark = new THREE.Mesh(
      new THREE.BoxGeometry(0.26 * s, 0.08 * s, 0.04 * s),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    );
    mark.position.set(0, (1 + i * 1.1) * s, 0.09 * s);
    g.add(mark);
  }
  // Small canopy
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(2 * s, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x88cc44 })
  );
  canopy.position.y = 6 * s;
  canopy.scale.y = 0.7;
  canopy.castShadow = true;
  g.add(canopy);
  g.position.set(x, 0, z);
  return g;
}

// ── Autumn tree (orange/red foliage) ──
function createAutumnTree(x, z, s = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * s, 0.4 * s, 3.5 * s, 6),
    new THREE.MeshLambertMaterial({ color: 0x4a2510 })
  );
  trunk.position.y = 1.75 * s;
  trunk.castShadow = true;
  g.add(trunk);
  // Layered cones with autumn colors
  for (let i = 0; i < 3; i++) {
    const r = (2.5 - i * 0.6) * s;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(0.3, r), 2.5 * s, 7),
      new THREE.MeshLambertMaterial({ color: pick(AUTUMN_COLORS) })
    );
    cone.position.y = (4.0 + i * 1.6) * s;
    cone.castShadow = true;
    g.add(cone);
  }
  g.position.set(x, 0, z);
  return g;
}

// ── Bush (low dense sphere) ──
function createBush(x, z, s = 1) {
  const g = new THREE.Group();
  const bush = new THREE.Mesh(
    new THREE.SphereGeometry(1.2 * s, 7, 5),
    new THREE.MeshLambertMaterial({ color: pick(LEAF_COLORS) })
  );
  bush.position.y = 0.8 * s;
  bush.scale.y = 0.6;
  bush.castShadow = true;
  g.add(bush);
  g.position.set(x, 0, z);
  return g;
}

// ── Flower patch ──
function createFlowers(x, z) {
  const g = new THREE.Group();
  const colors = [0xff8866, 0xffcc44, 0xffaa77, 0xff5544, 0xffddaa, 0xcc7744];
  for (let i = 0; i < 12; i++) {
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 5, 4),
      new THREE.MeshLambertMaterial({ color: pick(colors) })
    );
    flower.position.set(rand(-1.5, 1.5), 0.15, rand(-1.5, 1.5));
    g.add(flower);
    // Stem
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4),
      new THREE.MeshLambertMaterial({ color: 0x2d7722 })
    );
    stem.position.set(flower.position.x, 0.05, flower.position.z);
    g.add(stem);
  }
  g.position.set(x, 0, z);
  return g;
}

// ── Rock ──
function createRock(x, z, s = 1) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.2 * s, 0),
    new THREE.MeshLambertMaterial({ color: pick([0x888888, 0x777766, 0x999988, 0x666655]) })
  );
  rock.position.y = 0.5 * s;
  rock.scale.set(rand(0.7, 1.3), rand(0.4, 0.8), rand(0.7, 1.3));
  rock.rotation.y = rand(0, Math.PI * 2);
  rock.castShadow = true;
  g.add(rock);
  g.position.set(x, 0, z);
  return g;
}

// ── Mushroom ──
function createMushroom(x, z) {
  const g = new THREE.Group();
  // Stem
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 0.6, 6),
    new THREE.MeshLambertMaterial({ color: 0xeeddcc })
  );
  stem.position.y = 0.3;
  g.add(stem);
  // Cap
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xcc2222 })
  );
  cap.position.y = 0.55;
  g.add(cap);
  // White dots on cap
  for (let i = 0; i < 5; i++) {
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    const angle = rand(0, Math.PI * 2);
    const r = rand(0.1, 0.3);
    dot.position.set(Math.cos(angle) * r, 0.7, Math.sin(angle) * r);
    g.add(dot);
  }
  g.position.set(x, 0, z);
  return g;
}

// ── Wooden sign ──
function createSign(x, z, rot) {
  const g = new THREE.Group();
  // Post
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.15, 2.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b3a1f })
  );
  post.position.y = 1.25;
  g.add(post);
  // Board
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.8, 0.12),
    new THREE.MeshLambertMaterial({ color: 0x8b5a2b })
  );
  board.position.y = 2.2;
  g.add(board);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

// ── Tire stack ──
function createTireStack(x, z) {
  const g = new THREE.Group();
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.25, 8, 12),
      tireMat
    );
    tire.position.y = 0.25 + i * 0.45;
    tire.rotation.x = Math.PI / 2;
    g.add(tire);
  }
  g.position.set(x, 0, z);
  return g;
}

// ── Oil drum ──
function createDrum(x, z) {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 1.2, 10),
    new THREE.MeshPhongMaterial({ color: 0x2244aa, shininess: 40 })
  );
  drum.position.y = 0.6;
  drum.castShadow = true;
  g.add(drum);
  // Red stripe
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.15, 10),
    new THREE.MeshPhongMaterial({ color: 0xcc2222, shininess: 40 })
  );
  stripe.position.y = 0.4;
  g.add(stripe);
  g.position.set(x, 0, z);
  return g;
}

// ── Treasure chest (hidden in forest) ──
function createChest(x, z) {
  const g = new THREE.Group();
  // Box
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.6, 0.8),
    new THREE.MeshPhongMaterial({ color: 0x8b5a2b, shininess: 20 })
  );
  box.position.y = 0.3;
  box.castShadow = true;
  g.add(box);
  // Lid
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.15, 0.82),
    new THREE.MeshPhongMaterial({ color: 0x7a4a1a, shininess: 20 })
  );
  lid.position.y = 0.65;
  lid.rotation.z = 0.3;
  g.add(lid);
  // Gold trim
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.05, 0.84),
    new THREE.MeshPhongMaterial({ color: 0xddaa00, shininess: 80 })
  );
  trim.position.y = 0.6;
  g.add(trim);
  g.position.set(x, 0, z);
  g.rotation.y = rand(0, Math.PI * 2);
  return g;
}

// ── Lamp post ──
function createLampPost(x, z) {
  const g = new THREE.Group();
  // Pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 5, 6),
    new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 60 })
  );
  pole.position.y = 2.5;
  g.add(pole);
  // Arm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.06, 0.06),
    new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 60 })
  );
  arm.position.set(0.3, 4.8, 0);
  g.add(arm);
  // Light
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffcc77 })
  );
  light.position.set(0.6, 4.6, 0);
  g.add(light);
  // Small point light
  const pl = new THREE.PointLight(0xffaa55, 0.8, 15);
  pl.position.set(0.6, 4.6, 0);
  g.add(pl);
  g.position.set(x, 0, z);
  return g;
}

// ── Wooden fence section ──
function createFence(x, z, length, rot) {
  const g = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b3a1f });
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
  const posts = Math.ceil(length / 3);
  for (let i = 0; i <= posts; i++) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 1.2, 5),
      postMat
    );
    post.position.set(i * 3, 0.6, 0);
    g.add(post);
  }
  // Two rails
  for (const y of [0.35, 0.85]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.06, 0.06),
      railMat
    );
    rail.position.set(length / 2, y, 0);
    g.add(rail);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

// ═══════════════════════════════════════════════════════
//  PLACE SCENERY — dense forest around the track
// ═══════════════════════════════════════════════════════

// Min distance from track centerline for scenery
// Trees have canopy radius ~3m, track half-width = 8m
// Trees need to be at least 12m from center to keep canopy off road
const MIN_SCENERY_DIST = TRACK_WIDTH / 2 + 4; // 12m — canopy clearance from track edge

// Pre-compute track points for collision checking (dense for accuracy)
const trackCheckPts = [];
for (let i = 0; i < 600; i++) {
  trackCheckPts.push(trackCurve.getPointAt(i / 600));
}

// Check that a position is far enough from ALL track points
function isSafeForScenery(px, pz, minDist) {
  for (const tp of trackCheckPts) {
    const dx = tp.x - px, dz = tp.z - pz;
    if (dx * dx + dz * dz < minDist * minDist) return false;
  }
  return true;
}

// Inner ring: trees close to track (just beyond dirt)
for (let i = 0; i < 180; i++) {
  const t = i / 180;
  const { point, side } = frame(t);
  const s2 = Math.random() > 0.5 ? 1 : -1;
  const dist = MIN_SCENERY_DIST + Math.random() * 6;
  const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
  if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
  const s = rand(0.6, 1.2);
  const treeFn = Math.random() < 0.5 ? createPine :
                 Math.random() < 0.6 ? createOak :
                 Math.random() < 0.5 ? createBirch : createAutumnTree;
  scene.add(treeFn(pos.x, pos.z, s));
}

// Mid ring: dense forest 8–30m past dirt edge
for (let i = 0; i < 350; i++) {
  const t = Math.random();
  const { point, side } = frame(t);
  const s2 = Math.random() > 0.5 ? 1 : -1;
  const dist = MIN_SCENERY_DIST + 8 + Math.random() * 25;
  const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
  if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
  const s = rand(0.5, 1.4);
  const r = Math.random();
  const treeFn = r < 0.35 ? createPine :
                 r < 0.6 ? createOak :
                 r < 0.8 ? createBirch : createAutumnTree;
  scene.add(treeFn(pos.x, pos.z, s));
}

// Outer ring: scattered tall pines far out
for (let i = 0; i < 300; i++) {
  const t = Math.random();
  const { point, side } = frame(t);
  const s2 = Math.random() > 0.5 ? 1 : -1;
  const dist = MIN_SCENERY_DIST + 30 + Math.random() * 50;
  const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
  if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
  const s = rand(0.8, 1.6);
  scene.add(createPine(pos.x, pos.z, s));
}

// Dense bushes just beyond dirt
for (let i = 0; i < 100; i++) {
  const t = Math.random();
  const { point, side } = frame(t);
  const s2 = Math.random() > 0.5 ? 1 : -1;
  const dist = MIN_SCENERY_DIST + Math.random() * 5;
  const pos = point.clone().add(side.clone().multiplyScalar(s2 * dist));
  if (!isSafeForScenery(pos.x, pos.z, MIN_SCENERY_DIST)) continue;
  scene.add(createBush(pos.x, pos.z, rand(0.4, 1.0)));
}

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

// ── Trackside objects ──

// Tire stacks at turns
const turnTs = [0.12, 0.28, 0.45, 0.65, 0.85];
for (const tt of turnTs) {
  const { point, side } = frame(tt);
  const dist = MIN_SCENERY_DIST - 2; // tire stacks sit on the dirt edge
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
const signTs = [
  { t: 0.08, rot: 0.5 },
  { t: 0.25, rot: -0.8 },
  { t: 0.45, rot: 1.2 },
];
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


// ═══════════════════════════════════════════════════════
//  CARS — improved with Phong + metallic look
// ═══════════════════════════════════════════════════════
function createCar(color) {
  const g = new THREE.Group();
  // Body — rounded box approximation using a slightly larger main body + fenders
  const bodyMat = new THREE.MeshPhongMaterial({
    color,
    shininess: 100,
    specular: 0x444444,
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.7, 4),
    bodyMat
  );
  body.position.y = 0.6;
  body.castShadow = true;
  g.add(body);
  // Front bumper (rounded)
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.35, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 })
  );
  frontBumper.position.set(0, 0.42, 2.1);
  g.add(frontBumper);
  // Rear bumper
  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.35, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 })
  );
  rearBumper.position.set(0, 0.42, -2.1);
  g.add(rearBumper);
  // Cabin — dark windshield
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 2),
    new THREE.MeshPhongMaterial({ color: 0x111122, shininess: 200, specular: 0x888888, transparent: true, opacity: 0.85 })
  );
  cabin.position.set(0, 1.15, -0.3);
  cabin.castShadow = true;
  g.add(cabin);
  // Spoiler
  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.08, 0.5),
    bodyMat
  );
  spoiler.position.set(0, 1.1, -1.8);
  g.add(spoiler);
  const spoilerPosts = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.3, 0.1),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 })
  );
  for (const x of [-0.8, 0.8]) {
    const sp = spoilerPosts.clone();
    sp.position.set(x, 0.95, -1.8);
    g.add(sp);
  }
  // Wheels — with rims
  const wg = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
  const wm = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 30 });
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
  const rimMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 150 });
  for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3], [-1.1, -1.3], [1.1, -1.3]]) {
    const w = new THREE.Mesh(wg, wm);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.35, z);
    g.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, 0.35, z);
    g.add(rim);
  }
  // Headlights — glowing
  const hlg = new THREE.SphereGeometry(0.15, 8, 8);
  const hlm = new THREE.MeshBasicMaterial({ color: 0xffffcc });
  for (const x of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(hlg, hlm);
    hl.position.set(x, 0.6, 2);
    g.add(hl);
  }
  // Tail lights — glowing red
  const tlm = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (const x of [-0.7, 0.7]) {
    const tl = new THREE.Mesh(hlg, tlm);
    tl.position.set(x, 0.6, -2);
    g.add(tl);
  }
  // Racing number circle on sides
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

const playerCar = createCar(0xff2200);
scene.add(playerCar);

// AI racers
const aiCars = [
  { t: 0.15, speed: 48, lateral: 0.2, color: 0x3366ff, mesh: null, prevT: 0.15 },
  { t: 0.30, speed: 52, lateral: -0.25, color: 0xffcc00, mesh: null, prevT: 0.30 },
  { t: 0.50, speed: 44, lateral: 0.15, color: 0x00cc66, mesh: null, prevT: 0.50 },
  { t: 0.70, speed: 50, lateral: -0.1, color: 0xff6600, mesh: null, prevT: 0.70 },
].map(ai => {
  ai.mesh = createCar(ai.color);
  scene.add(ai.mesh);
  return ai;
});

// ═══════════════════════════════════════════════════════
//  (Item boxes removed)
// ═══════════════════════════════════════════════════════
//  PARTICLE SYSTEMS
// ═══════════════════════════════════════════════════════

// Tire smoke particles
const SMOKE_COUNT = 200;
const smokeGeo = new THREE.BufferGeometry();
const smokePositions = new Float32Array(SMOKE_COUNT * 3);
const smokeSizes = new Float32Array(SMOKE_COUNT);
const smokeAlphas = new Float32Array(SMOKE_COUNT);
const smokeVelocities = [];
const smokeLifetimes = new Float32Array(SMOKE_COUNT);
for (let i = 0; i < SMOKE_COUNT; i++) {
  smokePositions[i * 3] = 0;
  smokePositions[i * 3 + 1] = -100; // hidden below ground
  smokePositions[i * 3 + 2] = 0;
  smokeSizes[i] = 0;
  smokeAlphas[i] = 0;
  smokeLifetimes[i] = 0;
  smokeVelocities.push(new THREE.Vector3());
}
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
smokeGeo.setAttribute('size', new THREE.BufferAttribute(smokeSizes, 1));
smokeGeo.setAttribute('alpha', new THREE.BufferAttribute(smokeAlphas, 1));

const smokeMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uColor: { value: new THREE.Color(0xddbbaa) },
  },
  vertexShader: `
    attribute float size;
    attribute float alpha;
    varying float vAlpha;
    void main() {
      vAlpha = alpha;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (200.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      float dist = length(gl_PointCoord - 0.5) * 2.0;
      float a = smoothstep(1.0, 0.2, dist) * vAlpha;
      gl_FragColor = vec4(uColor, a);
    }
  `,
});
const smokePoints = new THREE.Points(smokeGeo, smokeMat);
scene.add(smokePoints);

let smokeIdx = 0;
function emitSmoke(px, py, pz, vx, vy, vz) {
  const i = smokeIdx % SMOKE_COUNT;
  smokePositions[i * 3] = px;
  smokePositions[i * 3 + 1] = py;
  smokePositions[i * 3 + 2] = pz;
  smokeSizes[i] = 2 + Math.random() * 3;
  smokeAlphas[i] = 0.6;
  smokeLifetimes[i] = 1.0;
  smokeVelocities[i].set(vx, vy, vz);
  smokeIdx++;
}

function updateSmoke(dt) {
  for (let i = 0; i < SMOKE_COUNT; i++) {
    if (smokeLifetimes[i] > 0) {
      smokeLifetimes[i] -= dt * 1.2;
      smokePositions[i * 3] += smokeVelocities[i].x * dt;
      smokePositions[i * 3 + 1] += smokeVelocities[i].y * dt;
      smokePositions[i * 3 + 2] += smokeVelocities[i].z * dt;
      smokeSizes[i] += dt * 8;
      smokeAlphas[i] = Math.max(0, smokeLifetimes[i]) * 0.5;
    } else {
      smokePositions[i * 3 + 1] = -100; // hide
      smokeAlphas[i] = 0;
    }
  }
  smokeGeo.attributes.position.needsUpdate = true;
  smokeGeo.attributes.size.needsUpdate = true;
  smokeGeo.attributes.alpha.needsUpdate = true;
}

// Dust particles (off-track)
const DUST_COUNT = 150;
const dustGeo = new THREE.BufferGeometry();
const dustPositions = new Float32Array(DUST_COUNT * 3);
const dustSizes = new Float32Array(DUST_COUNT);
const dustAlphas = new Float32Array(DUST_COUNT);
const dustVelocities = [];
const dustLifetimes = new Float32Array(DUST_COUNT);
for (let i = 0; i < DUST_COUNT; i++) {
  dustPositions[i * 3] = 0;
  dustPositions[i * 3 + 1] = -100;
  dustPositions[i * 3 + 2] = 0;
  dustSizes[i] = 0;
  dustAlphas[i] = 0;
  dustLifetimes[i] = 0;
  dustVelocities.push(new THREE.Vector3());
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
dustGeo.setAttribute('alpha', new THREE.BufferAttribute(dustAlphas, 1));

const dustMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  uniforms: {
    uColor: { value: new THREE.Color(0x9f7f5f) },
  },
  vertexShader: `
    attribute float size;
    attribute float alpha;
    varying float vAlpha;
    void main() {
      vAlpha = alpha;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (200.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      float dist = length(gl_PointCoord - 0.5) * 2.0;
      float a = smoothstep(1.0, 0.3, dist) * vAlpha;
      gl_FragColor = vec4(uColor, a);
    }
  `,
});
const dustPoints = new THREE.Points(dustGeo, dustMat);
scene.add(dustPoints);

let dustIdx = 0;
function emitDust(px, py, pz) {
  const i = dustIdx % DUST_COUNT;
  dustPositions[i * 3] = px + (Math.random() - 0.5) * 2;
  dustPositions[i * 3 + 1] = py;
  dustPositions[i * 3 + 2] = pz + (Math.random() - 0.5) * 2;
  dustSizes[i] = 3 + Math.random() * 5;
  dustAlphas[i] = 0.4;
  dustLifetimes[i] = 1.0;
  dustVelocities[i].set(
    (Math.random() - 0.5) * 4,
    1 + Math.random() * 2,
    (Math.random() - 0.5) * 4
  );
  dustIdx++;
}

function updateDust(dt) {
  for (let i = 0; i < DUST_COUNT; i++) {
    if (dustLifetimes[i] > 0) {
      dustLifetimes[i] -= dt * 1.0;
      dustPositions[i * 3] += dustVelocities[i].x * dt;
      dustPositions[i * 3 + 1] += dustVelocities[i].y * dt;
      dustPositions[i * 3 + 2] += dustVelocities[i].z * dt;
      dustSizes[i] += dt * 6;
      dustAlphas[i] = Math.max(0, dustLifetimes[i]) * 0.35;
    } else {
      dustPositions[i * 3 + 1] = -100;
      dustAlphas[i] = 0;
    }
  }
  dustGeo.attributes.position.needsUpdate = true;
  dustGeo.attributes.size.needsUpdate = true;
  dustGeo.attributes.alpha.needsUpdate = true;
}

// Speed lines (appear at high speed)
const SPEED_LINE_COUNT = 80;
const speedLineGeo = new THREE.BufferGeometry();
const slPositions = new Float32Array(SPEED_LINE_COUNT * 3);
const slAlphas = new Float32Array(SPEED_LINE_COUNT);
const slVelocities = [];
for (let i = 0; i < SPEED_LINE_COUNT; i++) {
  slPositions[i * 3] = 0;
  slPositions[i * 3 + 1] = -100;
  slPositions[i * 3 + 2] = 0;
  slAlphas[i] = 0;
  slVelocities.push(new THREE.Vector3());
}
speedLineGeo.setAttribute('position', new THREE.BufferAttribute(slPositions, 3));
speedLineGeo.setAttribute('alpha', new THREE.BufferAttribute(slAlphas, 1));

const speedLineMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {},
  vertexShader: `
    attribute float alpha;
    varying float vAlpha;
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
const speedLinePoints = new THREE.Points(speedLineGeo, speedLineMat);
scene.add(speedLinePoints);

let slIdx = 0;
function emitSpeedLine(px, py, pz, heading, speed) {
  const i = slIdx % SPEED_LINE_COUNT;
  const offset = new THREE.Vector3(
    (Math.random() - 0.5) * 12,
    Math.random() * 5 + 1,
    (Math.random() - 0.5) * 12
  );
  slPositions[i * 3] = px + offset.x;
  slPositions[i * 3 + 1] = py + offset.y;
  slPositions[i * 3 + 2] = pz + offset.z;
  slAlphas[i] = 0.3;
  const dir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
  slVelocities[i].copy(dir).multiplyScalar(-speed * 0.5);
  slVelocities[i].y = (Math.random() - 0.5) * 5;
  slIdx++;
}

function updateSpeedLines(dt) {
  const p = G.player;
  const speedRatio = Math.abs(p.speed) / MAX_SPEED;
  for (let i = 0; i < SPEED_LINE_COUNT; i++) {
    slAlphas[i] *= (1 - dt * 3);
    if (slAlphas[i] < 0.01) {
      slPositions[i * 3 + 1] = -100;
      slAlphas[i] = 0;
    } else {
      slPositions[i * 3] += slVelocities[i].x * dt;
      slPositions[i * 3 + 1] += slVelocities[i].y * dt;
      slPositions[i * 3 + 2] += slVelocities[i].z * dt;
    }
  }
  speedLineGeo.attributes.position.needsUpdate = true;
  speedLineGeo.attributes.alpha.needsUpdate = true;

  // Emit new speed lines at high speed
  if (speedRatio > 0.6) {
    const count = Math.floor((speedRatio - 0.5) * 6);
    for (let j = 0; j < count; j++) {
      emitSpeedLine(p.x, p.z > 0 ? 0 : 0, p.z, p.heading, p.speed);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  MINI-MAP (2D canvas overlay)
// ═══════════════════════════════════════════════════════
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

// Pre-compute track bounds for minimap
let mMinX = Infinity, mMaxX = -Infinity, mMinZ = Infinity, mMaxZ = -Infinity;
const minimapPts = [];
for (let i = 0; i <= 200; i++) {
  const p = trackCurve.getPointAt(i / 200);
  minimapPts.push(p);
  mMinX = Math.min(mMinX, p.x); mMaxX = Math.max(mMaxX, p.x);
  mMinZ = Math.min(mMinZ, p.z); mMaxZ = Math.max(mMaxZ, p.z);
}
const padX = (mMaxX - mMinX) * 0.12, padZ = (mMaxZ - mMinZ) * 0.12;
mMinX -= padX; mMaxX += padX; mMinZ -= padZ; mMaxZ += padZ;

function drawMinimap() {
  const w = minimapCanvas.width, h = minimapCanvas.height;
  const toMX = (x) => ((x - mMinX) / (mMaxX - mMinX)) * (w - 16) + 8;
  const toMY = (z) => ((z - mMinZ) / (mMaxZ - mMinZ)) * (h - 16) + 8;

  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.fillStyle = 'rgba(0,0,0,0.55)';
  minimapCtx.beginPath();
  minimapCtx.roundRect(0, 0, w, h, 8);
  minimapCtx.fill();

  // Track outline — colored by section
  minimapCtx.strokeStyle = '#888';
  minimapCtx.lineWidth = 5;
  minimapCtx.lineCap = 'round';
  minimapCtx.beginPath();
  minimapPts.forEach((p, i) => {
    const mx = toMX(p.x), my = toMY(p.z);
    i === 0 ? minimapCtx.moveTo(mx, my) : minimapCtx.lineTo(mx, my);
  });
  minimapCtx.closePath();
  minimapCtx.stroke();

  // Road fill
  minimapCtx.strokeStyle = '#555';
  minimapCtx.lineWidth = 3;
  minimapCtx.beginPath();
  minimapPts.forEach((p, i) => {
    const mx = toMX(p.x), my = toMY(p.z);
    i === 0 ? minimapCtx.moveTo(mx, my) : minimapCtx.lineTo(mx, my);
  });
  minimapCtx.closePath();
  minimapCtx.stroke();

  // AI dots
  for (const ai of aiCars) {
    const ap = frame(ai.t).point;
    minimapCtx.fillStyle = '#' + ai.color.toString(16).padStart(6, '0');
    minimapCtx.beginPath();
    minimapCtx.arc(toMX(ap.x), toMY(ap.z), 3, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  // Player dot (world position) — with glow
  minimapCtx.shadowColor = '#ff2200';
  minimapCtx.shadowBlur = 6;
  minimapCtx.fillStyle = '#ff2200';
  minimapCtx.strokeStyle = '#fff';
  minimapCtx.lineWidth = 1.5;
  minimapCtx.beginPath();
  minimapCtx.arc(toMX(G.player.x), toMY(G.player.z), 4, 0, Math.PI * 2);
  minimapCtx.fill();
  minimapCtx.stroke();
  minimapCtx.shadowBlur = 0;
  // Player direction indicator
  const dirX = toMX(G.player.x) + Math.sin(G.player.heading) * 8;
  const dirZ = toMY(G.player.z) + Math.cos(G.player.heading) * 8;
  minimapCtx.strokeStyle = '#ff2200';
  minimapCtx.lineWidth = 2;
  minimapCtx.beginPath();
  minimapCtx.moveTo(toMX(G.player.x), toMY(G.player.z));
  minimapCtx.lineTo(dirX, dirZ);
  minimapCtx.stroke();
}

// ═══════════════════════════════════════════════════════
//  FIND NEAREST POINT ON TRACK
// ═══════════════════════════════════════════════════════
// Returns { t, dist } — nearest track parameter and distance to centerline
function nearestTrackT(px, pz) {
  let bestT = 0, bestD = Infinity;
  const steps = 300;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const p = trackCurve.getPointAt(t);
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }
  // Refine around best
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

// ═══════════════════════════════════════════════════════
//  WINDOW EXPORTS (must be after all const declarations)
// ═══════════════════════════════════════════════════════
window.G = G;
window.keys = G.keys;
window.trackCurve = trackCurve;
window.trackLen = trackLen;
window.frameFn = frame;

// ═══════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════
window.addEventListener('keydown', (e) => { G.keys[e.code] = true; });
window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });

// ═══════════════════════════════════════════════════════
//  TIRE MARKS — persistent skid marks on the ground
// ═══════════════════════════════════════════════════════
const MAX_TIRE_MARKS = 8000; // 2 marks per frame (left+right wheel)
const tireMarkGeo = new THREE.BufferGeometry();
const tireMarkPositions = new Float32Array(MAX_TIRE_MARKS * 6); // 2 triangles (6 verts) per mark
const tireMarkAlphas = new Float32Array(MAX_TIRE_MARKS * 6);   // 1 alpha per vertex
for (let i = 0; i < MAX_TIRE_MARKS * 6; i++) tireMarkPositions[i] = 0;
for (let i = 0; i < MAX_TIRE_MARKS * 6; i++) tireMarkAlphas[i] = 0;
tireMarkGeo.setAttribute('position', new THREE.BufferAttribute(tireMarkPositions, 3));
tireMarkGeo.setAttribute('alpha', new THREE.BufferAttribute(tireMarkAlphas, 1));
tireMarkGeo.setDrawRange(0, 0);

const tireMarkMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
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
      gl_FragColor = vec4(0.08, 0.08, 0.08, vAlpha);
    }
  `,
});
const tireMarkMesh = new THREE.Mesh(tireMarkGeo, tireMarkMat);
tireMarkMesh.position.y = 0.025; // just above road surface (road is at 0.02)
scene.add(tireMarkMesh);

let tireMarkCount = 0;
// Track previous mark positions per wheel (left=-1, right=+1)
let prevTireMarkLeft = null;
let prevTireMarkRight = null;

// Add a single tire mark strip for one wheel.
// cx, cz = center position of the wheel on the ground
// perpX, perpZ = perpendicular to car's forward direction (used for mark width)
// intensity = 0-1 how dark
function addTireMark(cx, cz, perpX, perpZ, intensity, side) {
  if (tireMarkCount >= MAX_TIRE_MARKS) return;
  
  const markHalfWidth = 0.18; // half-width of a single tire mark strip
  const i = tireMarkCount;
  const i6 = i * 6;
  const i6a = i * 6; // alpha index matches position index
  
  // Left/right edges of this mark strip (perpendicular to car forward)
  const lx = cx + perpX * markHalfWidth;
  const lz = cz + perpZ * markHalfWidth;
  const rx = cx - perpX * markHalfWidth;
  const rz = cz - perpZ * markHalfWidth;
  
  const prev = side < 0 ? prevTireMarkLeft : prevTireMarkRight;
  
  if (prev) {
    // Triangle 1: prevL, prevR, curL
    tireMarkPositions[i6]     = prev.lx;
    tireMarkPositions[i6 + 1] = 0;
    tireMarkPositions[i6 + 2] = prev.lz;
    tireMarkPositions[i6 + 3] = prev.rx;
    tireMarkPositions[i6 + 4] = 0;
    tireMarkPositions[i6 + 5] = prev.rz;
    // Triangle 2: prevR, curR, curL
    tireMarkPositions[i6 + 6]  = prev.rx;
    tireMarkPositions[i6 + 7]  = 0;
    tireMarkPositions[i6 + 8]  = prev.rz;
    tireMarkPositions[i6 + 9]  = rx;
    tireMarkPositions[i6 + 10] = 0;
    tireMarkPositions[i6 + 11] = rz;
    
    // Per-vertex alpha (6 vertices per quad)
    const avgIntensity = (intensity + prev.intensity) * 0.5;
    tireMarkAlphas[i6]     = avgIntensity;
    tireMarkAlphas[i6 + 1] = avgIntensity;
    tireMarkAlphas[i6 + 2] = avgIntensity;
    tireMarkAlphas[i6 + 3] = avgIntensity;
    tireMarkAlphas[i6 + 4] = avgIntensity;
    tireMarkAlphas[i6 + 5] = avgIntensity;
    
    tireMarkCount++;
    tireMarkGeo.setDrawRange(0, tireMarkCount * 6);
    tireMarkGeo.attributes.position.needsUpdate = true;
    tireMarkGeo.attributes.alpha.needsUpdate = true;
  }
  
  if (side < 0) prevTireMarkLeft = { lx, lz, rx, rz, intensity };
  else prevTireMarkRight = { lx, lz, rx, rz, intensity };
}

// Reset tire mark chain when not skidding
function breakTireMarkChain() {
  prevTireMarkLeft = null;
  prevTireMarkRight = null;
}

// ═══════════════════════════════════════════════════════
//  GAME LOOP — free-form driving for player
// ═══════════════════════════════════════════════════════
const MAX_SPEED = 40;
const ACCEL = 22;
const BRAKE = 35;
const DRAG = 10;
const TURN_RATE = 2.6;       // radians/sec at full speed
const GRIP_TRACK = 1.0;      // 1.0 = full grip on road
const GRIP_GRASS = 0.6;      // reduced grip on grass
const DRIFT_FACTOR = 0.15;   // how much the car slides

const clock = new THREE.Clock();

// Initialize player position at start line, facing forward
{
  const { point, tangent } = frame(0);
  G.player.x = point.x;
  G.player.z = point.z;
  G.player.heading = Math.atan2(tangent.x, tangent.z);
  G.lapMarker = 0;
}

// Track previous position for lap detection
let prevTrackT = 0;

function update() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const p = G.player;

  // ── Find nearest track point ──
  const nearest = nearestTrackT(p.x, p.z);
  const onRoad = nearest.dist < TRACK_WIDTH / 2;
  p.onTrack = onRoad;

  // ── Accelerate / brake / handbrake ──
  const handbrake = G.keys['Space'] || false;
  if (G.keys['KeyW'] || G.keys['ArrowUp']) p.speed += ACCEL * dt;
  else if (G.keys['KeyS'] || G.keys['ArrowDown']) p.speed -= BRAKE * dt;
  else {
    if (p.speed > 0) p.speed = Math.max(0, p.speed - DRAG * dt);
    else p.speed = Math.min(0, p.speed + DRAG * dt);
  }
  // Handbrake: moderate decel + greatly reduced grip (enables drifting)
  if (handbrake && Math.abs(p.speed) > 2) {
    const hbDrag = 18;
    if (p.speed > 0) p.speed = Math.max(0, p.speed - hbDrag * dt);
    else p.speed = Math.min(0, p.speed + hbDrag * dt);
  }

  // Off-road penalty — grass friction (proportional to speed)
  if (!onRoad) {
    const grassDrag = 25;
    p.speed *= Math.max(0, 1 - grassDrag * dt / Math.max(Math.abs(p.speed), 8));
  }

  p.speed = THREE.MathUtils.clamp(p.speed, -MAX_SPEED * 0.3, MAX_SPEED);

  // ── Steer (turn rate scales down at high speed — more realistic) ──
  const speedFactor = Math.min(Math.abs(p.speed) / 20, 1);
  const steerInput = (G.keys['KeyA'] || G.keys['ArrowLeft']) ? 1 :
                     (G.keys['KeyD'] || G.keys['ArrowRight']) ? -1 : 0;
  const turnDelta = steerInput * TURN_RATE * speedFactor * dt;
  let grip = onRoad ? GRIP_TRACK : GRIP_GRASS;
  if (handbrake) grip *= 0.35; // handbrake kills grip → drift!

  // ── Calculate desired vs actual heading ──
  const desiredHeading = p.heading + turnDelta;

  // Drift: car doesn't instantly follow heading — it slides a bit
  const headingDiff = desiredHeading - p.heading;
  p.heading += headingDiff * grip;
  
  // ── Move car in the direction it's facing ──
  const moveDir = new THREE.Vector3(
    Math.sin(p.heading),
    0,
    Math.cos(p.heading)
  );

  p.x += moveDir.x * p.speed * dt;
  p.z += moveDir.z * p.speed * dt;

  // ── Position car on road surface ──
  const surfaceFrame = frame(nearest.t);
  const surfaceY = surfaceFrame.point.y + 0.05;
  playerCar.position.set(p.x, surfaceY, p.z);
  playerCar.rotation.y = p.heading;

  // Visual body roll when turning
  const targetRoll = steerInput * 0.08 * (p.speed / MAX_SPEED);
  playerCar.rotation.z = THREE.MathUtils.lerp(playerCar.rotation.z, targetRoll, 5 * dt);
  // Visual pitch when accelerating/braking
  const targetPitch = (G.keys['KeyW'] || G.keys['ArrowUp']) ? -0.03 :
                      (G.keys['KeyS'] || G.keys['ArrowDown']) ? 0.04 : 0;
  playerCar.rotation.x = THREE.MathUtils.lerp(playerCar.rotation.x, targetPitch * (p.speed / MAX_SPEED), 5 * dt);

  // ── Tire marks when drifting or hard braking ──
  const isDrifting = grip < 0.7 && Math.abs(p.speed) > 3;
  const isHardBraking = handbrake && Math.abs(p.speed) > 3;
  const isAggressiveTurn = Math.abs(steerInput) > 0 && Math.abs(p.speed) > 15 && onRoad;
  if (isDrifting || isHardBraking || isAggressiveTurn) {
    const perpX = moveDir.z;
    const perpZ = -moveDir.x;
    const intensity = Math.min(1, (Math.abs(p.speed) / MAX_SPEED) * (1 - grip + 0.3));
    // Rear wheel positions (car body is ~4 units long, wheels at z=±1.3)
    const rearOffset = -1.3; // wheels are 1.3 behind car center in local Z
    const wheelX = p.x + moveDir.x * rearOffset;
    const wheelZ = p.z + moveDir.z * rearOffset;
    const sideDist = 1.1; // wheels are ±1.1 from center in local X
    // Left wheel
    addTireMark(
      wheelX + perpX * sideDist,
      wheelZ + perpZ * sideDist,
      perpX, perpZ,
      intensity, -1
    );
    // Right wheel
    addTireMark(
      wheelX - perpX * sideDist,
      wheelZ - perpZ * sideDist,
      perpX, perpZ,
      intensity, 1
    );
  } else {
    breakTireMarkChain();
  }

  // ── Particles ──
  // Tire smoke when drifting or handbraking
  if ((Math.abs(p.speed) > 20 && grip < 0.7) || (Math.abs(p.speed) > 30 && Math.abs(steerInput) > 0.5)) {
    const behindOffset = moveDir.clone().multiplyScalar(-2);
    for (const side of [-1.2, 1.2]) {
      const sideVec = new THREE.Vector3(moveDir.z, 0, -moveDir.x).multiplyScalar(side);
      emitSmoke(
        p.x + behindOffset.x + sideVec.x,
        0.2,
        p.z + behindOffset.z + sideVec.z,
        (Math.random() - 0.5) * 3,
        1.5 + Math.random(),
        (Math.random() - 0.5) * 3
      );
    }
  }
  // Dust when off-track and moving
  if (!onRoad && Math.abs(p.speed) > 5) {
    if (Math.random() < 0.4) {
      const behindOffset = moveDir.clone().multiplyScalar(-1.5);
      emitDust(
        p.x + behindOffset.x + (Math.random() - 0.5),
        0.3,
        p.z + behindOffset.z + (Math.random() - 0.5)
      );
    }
  }
  updateSmoke(dt);
  updateDust(dt);
  updateSpeedLines(dt);

  // ── Lap detection ──
  const currentTrackT = nearest.t;
  // Player crossed the start/finish line (from ~0.95+ to ~0.05-)
  if (prevTrackT > 0.9 && currentTrackT < 0.1 && p.speed > 0) {
    p.lap++;
  }
  if (prevTrackT < 0.1 && currentTrackT > 0.9 && p.speed < 0) {
    p.lap = Math.max(0, p.lap - 1);
  }
  prevTrackT = currentTrackT;

  // ── Camera follow — with dynamic FOV ──
  const camBehind = moveDir.clone().multiplyScalar(-14);
  const camUp = new THREE.Vector3(0, 7, 0);
  const targetCamPos = playerCar.position.clone().add(camBehind).add(camUp);
  camera.position.lerp(targetCamPos, 5 * dt);
  const lookTarget = playerCar.position.clone();
  lookTarget.y += 1;
  camera.lookAt(lookTarget);

  // Dynamic FOV — widens at speed
  const targetFov = 65 + (Math.abs(p.speed) / MAX_SPEED) * 15;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 3 * dt);
  camera.updateProjectionMatrix();

  // Shadow follow
  sun.position.copy(playerCar.position).add(new THREE.Vector3(60, 80, 40));
  sun.target.position.copy(playerCar.position);

  // ── AI racers (stay on spline) ──
  for (const ai of aiCars) {
    ai.prevT = ai.t;
    ai.t += (ai.speed * dt) / trackLen;
    ai.t = ((ai.t % 1) + 1) % 1;
    const { point: ap, tangent: at, side: as } = frame(ai.t);
    ai.mesh.position.copy(ap).add(as.clone().multiplyScalar(ai.lateral * (TRACK_WIDTH / 2 - 2)));
    ai.mesh.position.y += 0.05;
    ai.mesh.lookAt(ai.mesh.position.clone().add(at));
  }

  // ── HUD ──
  document.getElementById('speed').textContent = `${Math.abs(Math.round(p.speed))} km/h`;
  document.getElementById('lap').textContent = `Lap ${p.lap + 1} / 3`;
  document.getElementById('position').textContent = `P${getPosition(currentTrackT)}`;
  // Off-track indicator
  const trackIndicator = document.getElementById('track-status');
  if (trackIndicator) {
    trackIndicator.textContent = onRoad ? '' : 'OFF TRACK!';
    trackIndicator.style.color = onRoad ? 'inherit' : '#ff4444';
  }

  // ── Mini-map ──
  drawMinimap();
}

function getPosition(playerT) {
  // Compare progress: lap + track parameter
  const playerProgress = G.player.lap + playerT;
  let pos = 1;
  for (const ai of aiCars) {
    const aiProgress = ai.t; // simple: AI stays on lap 0 for now
    if (aiProgress > playerT) pos++;
  }
  return pos;
}

function animate() {
  requestAnimationFrame(animate);
  update();
  renderer.render(scene, camera);
}

animate();

// ═══════════════════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════════════════
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
