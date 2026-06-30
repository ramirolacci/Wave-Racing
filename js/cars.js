// ═══════════════════════════════════════════════════════
//  CARS — player car model + AI racers
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { TRACK_WIDTH } from './config.js';
import { frame, trackLen } from './track.js';

export function createCar(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 100, specular: 0x444444 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4), bodyMat);
  body.position.y = 0.6; body.castShadow = true; g.add(body);

  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.35, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 })
  );
  frontBumper.position.set(0, 0.42, 2.1); g.add(frontBumper);

  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.35, 0.5),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 })
  );
  rearBumper.position.set(0, 0.42, -2.1); g.add(rearBumper);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.5, 2),
    new THREE.MeshPhongMaterial({ color: 0x111122, shininess: 200, specular: 0x888888, transparent: true, opacity: 0.85 })
  );
  cabin.name = 'cabin';
  cabin.position.set(0, 1.15, -0.3); cabin.castShadow = true; g.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), bodyMat);
  spoiler.position.set(0, 1.1, -1.8); g.add(spoiler);

  const spoilerPosts = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.3, 0.1),
    new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 60 })
  );
  for (const x of [-0.8, 0.8]) {
    const sp = spoilerPosts.clone(); sp.position.set(x, 0.95, -1.8); g.add(sp);
  }

  const wg = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12);
  const wm = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 30 });
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8);
  const rimMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 150 });

  // Front wheels wrapped in steering pivots
  const frontWheels = [];
  for (const [x, z] of [[-1.1, 1.3], [1.1, 1.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.35, z);
    const w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; w.position.set(0, 0, 0); pivot.add(w);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; rim.position.set(0, 0, 0); pivot.add(rim);
    g.add(pivot);
    frontWheels.push(pivot);
  }
  g.userData.frontWheels = frontWheels;

  // Rear wheels (static)
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

export function createAICars(scene) {
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
  return aiCars;
}
