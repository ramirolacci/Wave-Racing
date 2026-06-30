// ═══════════════════════════════════════════════════════
//  ITEMS — glowing, pulsing item boxes
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { frame } from './track.js';

export function createItemBoxes(scene) {
  const itemBoxes = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const { point } = frame(t);
    const boxMat = new THREE.MeshPhongMaterial({
      color: 0xffaa00, emissive: 0x664400, emissiveIntensity: 0.5,
      shininess: 100, specular: 0xffffff,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), boxMat);
    box.position.copy(point); box.position.y += 2;
    scene.add(box);
    itemBoxes.push(box);

    // "?" decal
    const qCanvas = document.createElement('canvas');
    qCanvas.width = qCanvas.height = 64;
    const qctx = qCanvas.getContext('2d');
    qctx.fillStyle = '#ffaa00'; qctx.fillRect(0, 0, 64, 64);
    qctx.strokeStyle = '#222'; qctx.lineWidth = 4; qctx.strokeRect(2, 2, 60, 60);
    qctx.fillStyle = '#fff'; qctx.font = 'bold 48px Arial';
    qctx.textAlign = 'center'; qctx.textBaseline = 'middle'; qctx.fillText('?', 32, 34);
    const qTex = new THREE.CanvasTexture(qCanvas);
    const qGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const qMat = new THREE.MeshBasicMaterial({ map: qTex, transparent: true });
    for (const face of [
      { pos: [0, 0, 0.71], rot: [0, 0, 0] },
      { pos: [0, 0, -0.71], rot: [0, Math.PI, 0] },
      { pos: [0.71, 0, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [-0.71, 0, 0], rot: [0, -Math.PI / 2, 0] },
    ]) {
      const q = new THREE.Mesh(qGeo, qMat);
      q.position.set(...face.pos); q.rotation.set(...face.rot);
      box.add(q);
    }

    const glow = new THREE.PointLight(0xffaa00, 0.8, 8);
    box.add(glow);
  }
  return itemBoxes;
}
