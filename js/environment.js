// ═══════════════════════════════════════════════════════
//  ENVIRONMENT — sky dome, lights, ground
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';

export function createSky(scene) {
  const skyGeo = new THREE.SphereGeometry(400, 32, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x1a1a3e) },        // deep indigo top
      uMid: { value: new THREE.Color(0xb07088) },        // muted mauve
      uBot: { value: new THREE.Color(0xffa860) },        // warm amber horizon
      uSun: { value: new THREE.Color(0xffee88) },        // warm sun glow
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
        vec3 col = mix(uMid, uTop, smoothstep(0.1, 0.8, y));
        col = mix(uBot, col, smoothstep(-0.02, 0.15, y));
        float sunDot = max(dot(dir, uSunDir), 0.0);
        col += uSun * pow(sunDot, 64.0) * 2.0;
        col += uSun * pow(sunDot, 6.0) * 0.4;
        col += vec3(1.0, 0.8, 0.5) * pow(sunDot, 3.0) * 0.15;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

export function createLights(scene) {
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

  const fill = new THREE.DirectionalLight(0x8877aa, 0.2);
  fill.position.set(-40, 30, -60);
  scene.add(fill);

  return { sun };
}

export function createGround(scene, renderer) {
  const texSize = 512;
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = texSize;
  const ctx = texCanvas.getContext('2d');
  ctx.fillStyle = '#4a7a3a';
  ctx.fillRect(0, 0, texSize, texSize);
  const imgData = ctx.getImageData(0, 0, texSize, texSize);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    d[i] = Math.max(0, Math.min(255, d[i] + n * 0.6));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.4));
  }
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * texSize, y = Math.random() * texSize;
    const r = 2 + Math.random() * 4;
    ctx.fillStyle = Math.random() > 0.7 ? '#3d6a2a' : '#5a8f40';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * texSize, y = Math.random() * texSize;
    ctx.fillStyle = ['#ff8866', '#ffcc44', '#ffaa77', '#cc7744'][Math.floor(Math.random() * 4)];
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
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
