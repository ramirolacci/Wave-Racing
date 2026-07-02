// ═══════════════════════════════════════════════════════
//  GAME — entry point: scene, camera, renderer, input, game loop
// ═══════════════════════════════════════════════════════
import * as THREE from 'three';
import { MAX_SPEED, ACCEL, BRAKE, DRAG, TURN_RATE, GRIP_TRACK, GRIP_GRASS, TRACK_WIDTH } from './config.js';
import { frame, nearestTrackT, trackLen, trackCurve } from './track.js';
import { createSky, createLights, createGround } from './environment.js';
import { createRoadSurface, createDirtStrips, createCurbs, createCenterDashes, createStartFinish, createSectorMarkers, createBarriers } from './track-meshes.js';
import { placeScenery } from './scenery.js';
import { createCar } from './cars.js';
import { createAICars, updateAI } from './ai.js';
import { createSmokeSystem, createDustSystem, createSpeedLineSystem } from './particles.js';
import { createTireMarkSystem } from './tire-marks.js';
import { createMinimap } from './minimap.js';
import { createHUD } from './hud.js';
import { TelemetrySession, scheduleSave } from './telemetry.js';
import { createSoundEngine } from './sound.js';
import { createMusic } from './music.js';
import { createAISound } from './ai-sound.js';
import { createTouchControls } from './touch-controls.js';

// ══ GLOBALS ══
const G = {
  player: { x: 0, z: 0, heading: 0, velHeading: 0, speed: 0, lap: 0, onTrack: true },
  keys: {},
  lapMarker: 0,
};
window.G = G;
window.keys = G.keys;
window.trackCurve = trackCurve;
window.trackLen = trackLen;
window.frameFn = frame;
window.nearestTrackT = nearestTrackT;

// ══ RENDERER & SCENE ══
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xc8ddf0, 0.0022);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 600);

// ══ BUILD WORLD ══
createSky(scene);
const { sun } = createLights(scene);
createGround(scene, renderer);
createRoadSurface(scene, renderer);
createDirtStrips(scene, renderer);
createCurbs(scene);
createCenterDashes(scene);
createStartFinish(scene);
createSectorMarkers(scene);
createBarriers(scene);
placeScenery(scene);

const playerCar = createCar(0xff2200);
scene.add(playerCar);

const aiCars = createAICars(scene);
window.aiCars = aiCars;
window.scene = scene;
window.__playerFinished = () => playerFinished;
window.__raceResults = () => raceResults;
window.__raceEndTimer = () => raceEndTimer;
window.__raceState = () => raceState;
window.__resultsShown = () => resultsShown;
const smoke = createSmokeSystem(scene);
const dust = createDustSystem(scene);
const speedLines = createSpeedLineSystem(scene);
const tireMarks = createTireMarkSystem(scene);

// ── Cockpit Group for First Person View ──
let existingCockpit = scene.getObjectByName('cockpit-group');
if (existingCockpit) scene.remove(existingCockpit);

const cockpitGroup = new THREE.Group();
cockpitGroup.name = 'cockpit-group';

const dashMat = new THREE.MeshPhongMaterial({ color: 0x1c1c1c, shininess: 40 });
const dashMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 0.3), dashMat);
dashMesh.position.set(0, -0.15, 0);
cockpitGroup.add(dashMesh);

// Custom hood mesh that slants forward in front of the dash (no clipping!)
const hoodMat = new THREE.MeshPhongMaterial({ color: 0xff2200, shininess: 120, specular: 0x555555 });
const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 1.8), hoodMat);
hoodMesh.position.set(0, -0.22, -0.95);
hoodMesh.rotation.x = 0.08;
cockpitGroup.add(hoodMesh);

// A-pillars and roof frame to simulate interior cockpit (thinner and wider)
const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), dashMat);
leftPillar.position.set(-0.9, 0.2, -0.15);
leftPillar.rotation.z = -0.22;
leftPillar.rotation.y = 0.1;
cockpitGroup.add(leftPillar);

const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), dashMat);
rightPillar.position.set(0.9, 0.2, -0.15);
rightPillar.rotation.z = 0.22;
rightPillar.rotation.y = -0.1;
cockpitGroup.add(rightPillar);

const topBeam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.06), dashMat);
topBeam.position.set(0, 0.65, -0.15);
cockpitGroup.add(topBeam);

const wheelGroup = new THREE.Group();
wheelGroup.position.set(0, 0, 0.05);

const wheelMat = new THREE.MeshPhongMaterial({ color: 0x2e2e2e, shininess: 80 });
const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 24), wheelMat);
wheelGroup.add(rimMesh);

const spokeMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 100 });
const spokeCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), spokeMat);
spokeCenter.rotation.x = Math.PI / 2;
wheelGroup.add(spokeCenter);

const spoke1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.01), spokeMat);
wheelGroup.add(spoke1);

const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.01), spokeMat);
spoke2.position.set(0, -0.07, 0);
wheelGroup.add(spoke2);

cockpitGroup.add(wheelGroup);
cockpitGroup.visible = false;
scene.add(cockpitGroup);

const minimap = createMinimap(aiCars);
minimap.setFrame(frame);

const hud = createHUD();
const telemetry = new TelemetrySession();
let sound = null;
let music = null;
let aiSound = null;

// ══ TOUCH CONTROLS ══
const touchControls = createTouchControls(G.keys);

// ══ INPUT ══
let cameraMode = 0; // 0: Third Person, 1: Hood, 2: Bumper, 3: Aerial
window.addEventListener('keydown', (e) => {
  G.keys[e.code] = true;
  if (e.code === 'KeyC') {
    cameraMode = (cameraMode + 1) % 4;
  }
  if (!sound) {
    sound = createSoundEngine();
    aiSound = createAISound(sound.ctx, sound.master, sound.noiseBuf);
    for (const ai of aiCars) ai.soundIdx = aiSound.addCar();
    music = createMusic(); music.start();
  }
});

// ── Helper to init audio on first touch (mobile AudioContext policy) ──
function initAudioOnInteraction() {
  if (!sound) {
    sound = createSoundEngine();
    aiSound = createAISound(sound.ctx, sound.master, sound.noiseBuf);
    for (const ai of aiCars) ai.soundIdx = aiSound.addCar();
    music = createMusic(); music.start();
  }
  // Remove listener after first interaction
  window.removeEventListener('touchstart', initAudioOnInteraction);
}
window.addEventListener('touchstart', initAudioOnInteraction, { once: true });

// ── Wire touch start/restart buttons ──
if (touchControls) {
  touchControls.startBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudioOnInteraction();
    if (raceState === 'attract') startRace();
  }, { passive: false });

  touchControls.restartBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (raceState === 'finished' || raceState === 'racing' || raceState === 'countdown' || raceState === 'grid') restartRace();
  }, { passive: false });
}

window.addEventListener('keyup', (e) => { G.keys[e.code] = false; });

// ══ RACE STATE ══
const TOTAL_LAPS = 3;
let raceState = 'attract'; // attract → grid → countdown → racing → finished
let countdownStartTime = 0;
let raceStartTime = 0;
let raceResults = [];
let playerFinished = false;
let playerFinishTime = 0;
let playerHasPassedHalf = false;
let raceEndTimer = -1;
let resultsShown = false;
let gridTimer = 1.5;
let attractAIIdx = 0; // which AI car to follow in attract mode
let attractT = 0; // track position for attract AI

// Hide player car during attract mode
playerCar.visible = false;

// ══ POSITION ALL CARS ON GRID ══
function positionOnGrid() {
  const { point: startPt, tangent: startTan, side: startSide } = frame(0);
  const startHeading = Math.atan2(startTan.x, startTan.z);

  // 2-wide grid: AI in front, player back-left (like real racing)
  const gridSlots = [
    { row: 0, col: -1, type: 'ai', idx: 0 },   // BLUE - pole left
    { row: 0, col:  1, type: 'ai', idx: 1 },   // GOLD - pole right
    { row: 1, col: -1, type: 'ai', idx: 2 },   // JADE - 2nd row left
    { row: 1, col:  1, type: 'ai', idx: 3 },   // BLAZE - 2nd row right
    { row: 2, col: -1, type: 'player' },         // YOU - back left
  ];

  const ROW_SPACING = 12 / trackLen;  // ~12 world units between rows (track-t units)
  const COL_OFFSET = 4;

  for (const slot of gridSlots) {
    // Place each row at a different track-t so cars follow the curve
    const rowT = ((0 - slot.row * ROW_SPACING) % 1 + 1) % 1;
    const { point: rowPt, tangent: rowTan, side: rowSide } = frame(rowT);
    const rowHeading = Math.atan2(rowTan.x, rowTan.z);
    const pos = rowPt.clone().add(rowSide.clone().multiplyScalar(slot.col * COL_OFFSET));

    if (slot.type === 'player') {
      G.player.x = pos.x;
      G.player.z = pos.z;
      G.player.heading = rowHeading;
      G.player.velHeading = rowHeading;
      G.player.lap = 0;
      playerCar.position.set(pos.x, 0.05, pos.z);
      playerCar.rotation.set(0, rowHeading, 0);
    } else {
      const ai = aiCars[slot.idx];
      ai.x = pos.x;
      ai.z = pos.z;
      ai.heading = rowHeading;
      ai.velHeading = rowHeading;
      ai.speed = 0;
      ai.impulseX = 0;
      ai.impulseZ = 0;
      ai.lap = 0;
      ai.prevTrackT = 0;
      ai.finished = false;
      ai.finishTime = 0;
      ai.hasPassedHalf = false;
      ai.mesh.position.set(pos.x, 0.05, pos.z);
      ai.mesh.rotation.set(0, rowHeading, 0);
    }
  }
}

// Place AI cars around track for attract mode
function positionForAttract() {
  for (let i = 0; i < aiCars.length; i++) {
    const ai = aiCars[i];
    const t = (0.1 + i * 0.22) % 1; // spread around the track
    const lateral = (i % 2 === 0 ? 0.3 : -0.3); // alternate sides
    const { point, tangent, side } = frame(t);
    const heading = Math.atan2(tangent.x, tangent.z);
    ai.x = point.x + side.x * lateral * 3;
    ai.z = point.z + side.z * lateral * 3;
    ai.heading = heading;
    ai.velHeading = heading;
    ai.speed = 30 + Math.random() * 10; // start with some speed
    ai.lap = 0;
    ai.prevTrackT = t;
    ai._trackT = t;
    ai.finished = false;
    ai.finishTime = 0;
    ai.hasPassedHalf = false;
    ai.impulseX = 0;
    ai.impulseZ = 0;
    ai.mesh.position.set(ai.x, 0.05, ai.z);
    ai.mesh.rotation.set(0, heading, 0);
  }
}
positionForAttract();

// ══ COUNTDOWN OVERLAY ══
let countdownEl = document.getElementById('countdown-overlay');
if (countdownEl) countdownEl.remove();
countdownEl = document.createElement('div');
countdownEl.id = 'countdown-overlay';
countdownEl.style.cssText = `
  position: fixed; top: 25%; left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Orbitron', sans-serif;
  font-weight: 900; font-size: 200px;
  color: white;
  text-shadow: 0 0 80px rgba(255,255,255,0.6), 0 4px 20px rgba(0,0,0,0.8);
  z-index: 200; pointer-events: none;
  opacity: 0; transition: opacity 0.15s;
`;
document.body.appendChild(countdownEl);

// ══ RESULTS OVERLAY ══
let resultsEl = document.getElementById('results-overlay');
if (resultsEl) resultsEl.remove();
resultsEl = document.createElement('div');
resultsEl.id = 'results-overlay';
resultsEl.style.cssText = `
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.0);
  display: flex; align-items: center; justify-content: center;
  z-index: 300; pointer-events: none;
  font-family: 'Orbitron', sans-serif;
  transition: background 1s;
`;
document.body.appendChild(resultsEl);

// ══ LAP NOTIFICATION ══
let lapNotifyEl = document.getElementById('lap-notify-overlay');
if (lapNotifyEl) lapNotifyEl.remove();
lapNotifyEl = document.createElement('div');
lapNotifyEl.id = 'lap-notify-overlay';
lapNotifyEl.style.cssText = `
  position: fixed; top: 35%; left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Orbitron', sans-serif;
  font-weight: 900; font-size: 48px;
  color: #ffd700;
  text-shadow: 0 0 30px rgba(255,215,0,0.6), 0 2px 10px rgba(0,0,0,0.8);
  z-index: 200; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
`;
document.body.appendChild(lapNotifyEl);
let lapNotifyTimer = 0;

// ══ ATTRACT MODE OVERLAY ══
let attractEl = document.getElementById('attract-overlay');
if (attractEl) attractEl.remove();
attractEl = document.createElement('div');
attractEl.id = 'attract-overlay';
attractEl.style.cssText = `
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding-top: ${window.matchMedia('(pointer: coarse)').matches ? '0px' : '15vh'};
  z-index: 250; pointer-events: none;
  font-family: 'Orbitron', sans-serif;
`;

// ── Wave Icon Element ──
const waveIcon = document.createElement('img');
waveIcon.className = 'wave-icon';
waveIcon.src = '/WaveIcon.png';
waveIcon.alt = 'WaveIcon';

const attractTitle = document.createElement('div');
attractTitle.className = 'attract-title';
attractTitle.innerHTML = '<span style="background: linear-gradient(135deg, #00ffd5 0%, #00a2ff 45%, #a200ff 80%, #ff00c8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">WAVE</span> RACING';

const attractSub = document.createElement('div');
attractSub.className = 'attract-sub';
attractSub.textContent = window.matchMedia('(pointer: coarse)').matches
  ? '' // On touch devices we show the big startBtn in the center, so we don't need text
  : 'PRESIONA ESPACIO PARA CORRER';

// Add pulse and credit animations/styles
let attractStyle = document.getElementById('attract-style');
if (attractStyle) attractStyle.remove();
attractStyle = document.createElement('style');
attractStyle.id = 'attract-style';
attractStyle.textContent = `
  @keyframes attractPulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.05); }
  }

  .attract-title {
    font-weight: 900;
    font-size: clamp(32px, 8vw, 68px);
    color: #ffffff;
    filter: drop-shadow(0 0 15px rgba(0,255,213,0.4)) drop-shadow(0 4px 10px rgba(0,0,0,0.9));
    margin-bottom: 24px;
    letter-spacing: clamp(2px, 0.8vw, 6px);
    text-align: center;
    word-break: break-word;
    max-width: 90vw;
  }

  .attract-sub {
    font-weight: 700;
    font-size: clamp(14px, 3vw, 24px);
    color: rgba(255,255,255,0.9);
    text-shadow: 0 0 20px rgba(255,255,255,0.4), 0 2px 8px rgba(0,0,0,0.8);
    text-align: center;
    max-width: 90vw;
    animation: attractPulse 1.2s ease-in-out infinite;
  }

  .wave-icon {
    width: clamp(110px, 18vw, 160px);
    height: auto;
    margin-bottom: 20px;
    filter: drop-shadow(0 0 20px rgba(255, 60, 30, 0.7));
    animation: floatIcon 3.5s ease-in-out infinite;
  }

  @keyframes floatIcon {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(-8px) rotate(3deg); }
  }

  @media (pointer: coarse) {
    .attract-title {
      font-size: clamp(26px, 6vw, 44px);
      margin-bottom: 12px;
    }
    .wave-icon {
      width: clamp(75px, 10vw, 95px);
      margin-bottom: 12px;
    }
  }
`;
document.head.appendChild(attractStyle);
attractEl.appendChild(waveIcon);
attractEl.appendChild(attractTitle);
attractEl.appendChild(attractSub);
document.body.appendChild(attractEl);

function formatRaceTime(seconds) {
  if (!isFinite(seconds)) return 'DNF';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const wholeSecs = Math.floor(secs);
  const ms = Math.floor((secs - wholeSecs) * 1000);
  return `${mins}:${String(wholeSecs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function showResults() {
  raceResults.sort((a, b) => {
    if (a.dnf && !b.dnf) return 1;
    if (!a.dnf && b.dnf) return -1;
    return a.time - b.time;
  });

  const posLabels = ['1ER', '2DO', '3ER', '4TO', '5TO'];
  const posColors = ['#ffd700', '#e0e0e0', '#cd7f32', '#cccccc', '#aaaaaa'];

  let html = '<div style="text-align:center; color:white;">';
  html += '<div style="font-size:52px; margin-bottom:8px; color:#ffd700;">🏁</div>';

  const playerResult = raceResults.find(r => r.name === 'VOS');
  const playerPos = raceResults.indexOf(playerResult) + 1;

  if (playerPos === 1) {
    html += '<div style="font-size:42px; font-weight:900; color:#ffd700; margin-bottom:20px;">¡GANASTE!</div>';
  } else {
    html += `<div style="font-size:36px; font-weight:900; color:${posColors[playerPos-1]}; margin-bottom:20px;">${posLabels[playerPos-1]} PUESTO</div>`;
  }

  for (let i = 0; i < raceResults.length; i++) {
    const r = raceResults[i];
    const isPlayer = r.name === 'VOS';
    const bg = isPlayer ? 'background:rgba(255,34,0,0.3); border:2px solid #ff2200;' : 'background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);';
    const carColors = { 
      'VOS': '#ff2200', 
      'F. Colapinto': '#3366ff', 
      'A. Senna': '#ffcc00', 
      'L. Hamilton': '#00cc66', 
      'M. Verstappen': '#ff6600' 
    };
    html += `<div style="display:flex; align-items:center; justify-content:center; gap:24px; padding:10px 36px; margin:6px auto; max-width:460px; ${bg} border-radius:8px;">`;
    html += `<span style="font-size:28px; font-weight:900; color:${posColors[i]}; min-width:55px;">${posLabels[i]}</span>`;
    html += `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${carColors[r.name] || '#fff'};"></span>`;
    html += `<span style="font-size:22px; font-weight:700; min-width:140px; text-align:left; ${isPlayer ? 'color:#ff4422;' : ''}">${r.name}</span>`;
    html += `<span style="font-size:18px; color:#aaa; min-width:90px;">${r.dnf ? 'DNF' : formatRaceTime(r.time)}</span>`;
    html += '</div>';
  }

  html += '<div style="margin-top:36px; font-size:15px; color:#666; letter-spacing:3px; margin-bottom: 12px;">PRESIONA R PARA REINICIAR</div>';
  html += '<div style="font-size:10px; color:#444; letter-spacing:1px; font-family:\'Montserrat\', sans-serif;">DESARROLLADO POR WAVEFRAME STUDIO</div>';
  html += '</div>';

  resultsEl.innerHTML = html;
  resultsEl.style.background = 'rgba(0,0,0,0.85)';
  resultsEl.style.pointerEvents = 'auto';
}

function startRace() {
  raceState = 'grid';
  gridTimer = 1.5;
  raceResults = [];
  playerFinished = false;
  playerFinishTime = 0;
  playerHasPassedHalf = false;
  raceEndTimer = -1;
  resultsShown = false;
  prevTrackT = 0;
  lapNotifyTimer = 0;

  G.player.speed = 0;
  G.player.impulseX = 0;
  G.player.impulseZ = 0;

  for (const ai of aiCars) {
    ai.speed = 0;
    ai.impulseX = 0;
    ai.impulseZ = 0;
  }

  // Reset sound engines to idle
  if (sound) sound.reset();
  if (aiSound) aiSound.reset();

  positionOnGrid();
  playerCar.visible = true;

  // Hide attract overlay
  attractEl.style.display = 'none';

  resultsEl.innerHTML = '';
  resultsEl.style.background = 'rgba(0,0,0,0.0)';
  resultsEl.style.pointerEvents = 'none';
  countdownEl.style.opacity = '0';
  lapNotifyEl.style.opacity = '0';

  if (touchControls) touchControls.update('grid');

  clock.start();
}

function restartRace() {
  raceState = 'grid';
  gridTimer = 1.5;
  raceResults = [];
  playerFinished = false;
  playerFinishTime = 0;
  playerHasPassedHalf = false;
  raceEndTimer = -1;
  resultsShown = false;
  prevTrackT = 0;
  lapNotifyTimer = 0;

  G.player.speed = 0;
  G.player.impulseX = 0;
  G.player.impulseZ = 0;

  for (const ai of aiCars) {
    ai.speed = 0;
    ai.impulseX = 0;
    ai.impulseZ = 0;
  }

  // Reset sound engines to idle
  if (sound) sound.reset();
  if (aiSound) aiSound.reset();

  positionOnGrid();
  playerCar.visible = true;

  resultsEl.innerHTML = '';
  resultsEl.style.background = 'rgba(0,0,0,0.0)';
  resultsEl.style.pointerEvents = 'none';
  countdownEl.style.opacity = '0';
  lapNotifyEl.style.opacity = '0';

  if (touchControls) touchControls.update('grid');

  clock.start();
}


// ══════════════════════════════════════
//  PAUSE SYSTEM & OVERLAY
// ══════════════════════════════════════
let sfxEnabled = true;
let musicEnabled = true;
let isPaused = false;

let pauseStyle = document.getElementById('pause-style');
if (pauseStyle) pauseStyle.remove();
pauseStyle = document.createElement('style');
pauseStyle.id = 'pause-style';
pauseStyle.textContent = `
  #pause-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 2000;
    align-items: center;
    justify-content: center;
    font-family: 'Orbitron', sans-serif;
  }
  .pause-box {
    background: rgba(10, 15, 20, 0.85);
    border: 2px solid rgba(0, 255, 213, 0.3);
    box-shadow: 0 0 40px rgba(0, 255, 213, 0.15), inset 0 0 20px rgba(0, 255, 213, 0.05);
    border-radius: 20px;
    width: 90%;
    max-width: 420px;
    padding: 30px;
    text-align: center;
  }
  .pause-title {
    font-size: clamp(28px, 6vw, 36px);
    font-weight: 900;
    letter-spacing: 5px;
    color: #fff;
    background: linear-gradient(135deg, #00ffd5 0%, #00a2ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 10px rgba(0, 255, 213, 0.5));
    margin-bottom: 25px;
  }
  .pause-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pause-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.85);
    padding: 12px 18px;
    font-family: 'Orbitron', sans-serif;
    font-size: clamp(12px, 2.5vw, 14px);
    font-weight: 700;
    letter-spacing: 2px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .pause-btn:active {
    transform: scale(0.97);
  }
  .pause-btn:hover {
    background: rgba(0, 255, 213, 0.1);
    border-color: rgba(0, 255, 213, 0.5);
    color: #fff;
    box-shadow: 0 0 15px rgba(0, 255, 213, 0.2);
  }
  .pause-btn.resume-btn {
    background: linear-gradient(135deg, rgba(0, 255, 213, 0.2), rgba(0, 162, 255, 0.2));
    border-color: rgba(0, 255, 213, 0.6);
    color: #fff;
    font-weight: 900;
    box-shadow: 0 0 20px rgba(0, 255, 213, 0.2);
    font-size: clamp(13px, 2.8vw, 15px);
  }
  .pause-btn.resume-btn:hover {
    background: linear-gradient(135deg, rgba(0, 255, 213, 0.35), rgba(0, 162, 255, 0.35));
    border-color: rgba(0, 255, 213, 0.9);
    box-shadow: 0 0 25px rgba(0, 255, 213, 0.4);
  }
  .pause-btn.restart-btn {
    border-color: rgba(255, 80, 40, 0.3);
  }
  .pause-btn.restart-btn:hover {
    background: rgba(255, 80, 40, 0.15);
    border-color: rgba(255, 80, 40, 0.7);
    color: #ffaa99;
    box-shadow: 0 0 15px rgba(255, 80, 40, 0.25);
  }
  .pause-btn.exit-btn {
    border-color: rgba(255, 170, 0, 0.3);
  }
  .pause-btn.exit-btn:hover {
    background: rgba(255, 170, 0, 0.15);
    border-color: rgba(255, 170, 0, 0.7);
    color: #ffe0aa;
    box-shadow: 0 0 15px rgba(255, 170, 0, 0.25);
  }
`;
document.head.appendChild(pauseStyle);

let pauseEl = document.getElementById('pause-overlay');
if (pauseEl) pauseEl.remove();
pauseEl = document.createElement('div');
pauseEl.id = 'pause-overlay';
pauseEl.innerHTML = `
  <div class="pause-box">
    <div class="pause-title">PAUSA</div>
    <div class="pause-options">
      <button class="pause-btn resume-btn">CONTINUAR</button>
      <button class="pause-btn sfx-btn">SONIDO: ON</button>
      <button class="pause-btn music-btn">MÚSICA: ON</button>
      <button class="pause-btn cam-btn">CÁMARA: TERCERA PERSONA</button>
      <button class="pause-btn restart-btn">REINICIAR CARRERA</button>
      <button class="pause-btn exit-btn">SALIR AL MENÚ</button>
    </div>
  </div>
`;
document.body.appendChild(pauseEl);

function updatePauseMenuUI() {
  const sfxBtn = pauseEl.querySelector('.sfx-btn');
  const musicBtn = pauseEl.querySelector('.music-btn');
  const camBtn = pauseEl.querySelector('.cam-btn');

  if (sfxBtn) sfxBtn.textContent = `SONIDO: ${sfxEnabled ? 'ON' : 'OFF'}`;
  if (musicBtn) musicBtn.textContent = `MÚSICA: ${musicEnabled ? 'ON' : 'OFF'}`;
  
  const camLabels = ['TERCERA PERSONA', 'CAPOT', 'PARAGOLPES', 'AÉREA'];
  if (camBtn) camBtn.textContent = `CÁMARA: ${camLabels[cameraMode]}`;
}

function showPauseMenu() {
  updatePauseMenuUI();
  pauseEl.style.display = 'flex';
}

function hidePauseMenu() {
  pauseEl.style.display = 'none';
}

function resetKeys() {
  for (const k in G.keys) {
    G.keys[k] = false;
  }
}

function togglePause() {
  if (raceState === 'attract' || raceState === 'finished') return;

  isPaused = !isPaused;

  if (isPaused) {
    clock.stop();
    resetKeys();
    if (sound && sound.ctx) sound.ctx.suspend().catch(() => {});
    if (music && music.ctx) music.ctx.suspend().catch(() => {});
    showPauseMenu();
  } else {
    clock.start();
    if (sound && sound.ctx) sound.ctx.resume().catch(() => {});
    if (music && music.ctx) music.ctx.resume().catch(() => {});
    hidePauseMenu();
  }
}
window.togglePause = togglePause;

// Wire up events with hybrid touch/click helper to prevent iOS Safari input blocking
function bindTap(btn, callback) {
  if (!btn) return;
  const handler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    callback(e);
  };
  btn.addEventListener('touchstart', handler, { passive: false });
  btn.addEventListener('click', handler);
}

bindTap(pauseEl.querySelector('.resume-btn'), () => {
  togglePause();
});

bindTap(pauseEl.querySelector('.sfx-btn'), () => {
  sfxEnabled = !sfxEnabled;
  if (sound && sound.master) {
    sound.master.gain.value = sfxEnabled ? 0.75 : 0;
  }
  updatePauseMenuUI();
});

bindTap(pauseEl.querySelector('.music-btn'), () => {
  musicEnabled = !musicEnabled;
  if (music && music.master) {
    music.master.gain.value = musicEnabled ? 0.50 : 0;
  }
  updatePauseMenuUI();
});

bindTap(pauseEl.querySelector('.cam-btn'), () => {
  cameraMode = (cameraMode + 1) % 4;
  updatePauseMenuUI();
});

bindTap(pauseEl.querySelector('.restart-btn'), () => {
  togglePause();
  restartRace();
});

bindTap(pauseEl.querySelector('.exit-btn'), () => {
  togglePause();
  raceState = 'attract';
  positionForAttract();
  playerCar.visible = false;
  attractEl.style.display = 'flex';
  
  if (sound) sound.reset();
  if (aiSound) aiSound.reset();
  
  resultsEl.innerHTML = '';
  resultsEl.style.background = 'rgba(0,0,0,0.0)';
  resultsEl.style.pointerEvents = 'none';
  countdownEl.style.opacity = '0';
  lapNotifyEl.style.opacity = '0';
});

// Space to start, R to restart, Esc/P to pause
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && raceState === 'attract') {
    startRace();
  }
  if (e.code === 'KeyR' && (raceState === 'finished' || raceState === 'racing' || raceState === 'countdown' || raceState === 'grid')) {
    restartRace();
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && (raceState === 'racing' || raceState === 'countdown' || raceState === 'grid')) {
    togglePause();
  }
});

// ══ GAME LOOP ══
const clock = new THREE.Clock();
let prevTrackT = 0;

// ── Check if car crosses finish line ──
function checkLapCrossing(prevT, currentT, speed) {
  // Forward lap: prev was near end of lap (>0.9), now near start (<0.1)
  if (prevT > 0.9 && currentT < 0.1 && speed > 0) return 1;
  // Backward lap: prev near start, now near end, going backward
  if (prevT < 0.1 && currentT > 0.9 && speed < 0) return -1;
  return 0;
}

// ── Check if car has passed halfway point (anti-cheat) ──
function updateHalfPassed(currentT, car) {
  if (currentT > 0.4 && currentT < 0.6) {
    car.hasPassedHalf = true;
  }
}

// ── Calculate race position (1st = most progress) ──
function getPosition(playerT) {
  // Total progress = completed laps + current track position
  const playerProgress = G.player.lap + playerT;
  let pos = 1;
  for (const ai of aiCars) {
    const aiProgress = ai.lap + ai._trackT;
    if (aiProgress > playerProgress) pos++;
  }
  return pos;
}

// ── Player physics (extracted so we can skip it during grid/countdown) ──
function updatePlayerPhysics(dt) {
  const p = G.player;

  const nearest = nearestTrackT(p.x, p.z);
  const onRoad = nearest.dist < TRACK_WIDTH / 2;
  p.onTrack = onRoad;

  const handbrake = G.keys['Space'] || false;
  if (G.keys['KeyW'] || G.keys['ArrowUp']) p.speed += ACCEL * dt;
  else if (G.keys['KeyS'] || G.keys['ArrowDown']) p.speed -= BRAKE * dt;
  else {
    if (p.speed > 0) p.speed = Math.max(0, p.speed - DRAG * dt);
    else p.speed = Math.min(0, p.speed + DRAG * dt);
  }
  if (handbrake && Math.abs(p.speed) > 2) {
    const hbDrag = 18;
    if (p.speed > 0) p.speed = Math.max(0, p.speed - hbDrag * dt);
    else p.speed = Math.min(0, p.speed + hbDrag * dt);
  }

  if (!onRoad) {
    const grassDrag = 25;
    p.speed *= Math.max(0, 1 - grassDrag * dt / Math.max(Math.abs(p.speed), 8));
  }

  p.speed = THREE.MathUtils.clamp(p.speed, -MAX_SPEED * 0.3, MAX_SPEED);

  const absSpeed = Math.abs(p.speed);
  const steerInput = (G.keys['KeyA'] || G.keys['ArrowLeft']) ? 1 :
                     (G.keys['KeyD'] || G.keys['ArrowRight']) ? -1 : 0;

  const turnAuthority = Math.min(absSpeed / 12, 1) * Math.max(0.45, 1 - (absSpeed / MAX_SPEED) * 0.55);
  const isBraking = (G.keys['KeyS'] || G.keys['ArrowDown']) && p.speed > 2;
  const brakeTurnBonus = isBraking ? 1.45 : 1.0;
  const handbrakeTurnBonus = handbrake ? 1.8 : 1.0;

  const turnDelta = steerInput * TURN_RATE * turnAuthority * brakeTurnBonus * handbrakeTurnBonus * dt;
  p.heading += turnDelta;

  let grip = onRoad ? GRIP_TRACK : GRIP_GRASS;
  if (handbrake) grip *= 0.35;

  let velHeadingDiff = p.heading - p.velHeading;
  while (velHeadingDiff > Math.PI) velHeadingDiff -= 2 * Math.PI;
  while (velHeadingDiff < -Math.PI) velHeadingDiff += 2 * Math.PI;
  p.velHeading += velHeadingDiff * grip * 5 * dt;
  while (p.velHeading > Math.PI) p.velHeading -= 2 * Math.PI;
  while (p.velHeading < -Math.PI) p.velHeading += 2 * Math.PI;

  const moveDir = new THREE.Vector3(Math.sin(p.velHeading), 0, Math.cos(p.velHeading));
  p.x += moveDir.x * p.speed * dt;
  p.z += moveDir.z * p.speed * dt;

  const surfaceFrame = frame(nearest.t);
  const surfaceY = surfaceFrame.point.y + 0.05;
  playerCar.position.set(p.x, surfaceY, p.z);
  playerCar.rotation.y = p.heading;

  // Front wheel visual
  const frontWheels = playerCar.userData.frontWheels;
  if (frontWheels) {
    const maxSteerAngle = 0.44 * Math.max(0.35, 1 - (absSpeed / MAX_SPEED) * 0.5);
    const targetSteerAngle = steerInput * maxSteerAngle;
    const currentSteer = frontWheels[0].rotation.y;
    const newSteer = THREE.MathUtils.lerp(currentSteer, targetSteerAngle, 8 * dt);
    for (const fw of frontWheels) fw.rotation.y = newSteer;
  }

  // Drift visuals
  const driftAngle = (() => {
    let d = p.heading - p.velHeading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  })();
  const targetRoll = driftAngle * 0.4;
  playerCar.rotation.z = THREE.MathUtils.lerp(playerCar.rotation.z, targetRoll, 5 * dt);
  const targetPitch = (G.keys['KeyW'] || G.keys['ArrowUp']) ? -0.03 :
                      (G.keys['KeyS'] || G.keys['ArrowDown']) ? 0.04 : 0;
  playerCar.rotation.x = THREE.MathUtils.lerp(playerCar.rotation.x, targetPitch * (p.speed / MAX_SPEED), 5 * dt);

  // Brake lights
  const isBrakingOrReversing = (G.keys['KeyS'] || G.keys['ArrowDown']) || handbrake || p.speed < -1;
  const tlm = playerCar.userData.tailLightMat;
  if (tlm) {
    tlm.emissive.setHex(isBrakingOrReversing ? 0xff0000 : 0x000000);
    tlm.emissiveIntensity = isBrakingOrReversing ? 1.5 : 0;
  }

  // Tire marks
  const absDrift = Math.abs(driftAngle);
  const isDrifting = absDrift > 0.15 && absSpeed > 3;
  const isHardBraking = handbrake && absSpeed > 3;
  const isAggressiveTurn = absDrift > 0.08 && absSpeed > 10 && onRoad;
  if (isDrifting || isHardBraking || isAggressiveTurn) {
    const intensity = Math.min(1, (absSpeed / MAX_SPEED) * (absDrift / 0.5 + 0.3));
    const rearOffset = -1.3;
    const rearX = p.x + moveDir.x * rearOffset;
    const rearZ = p.z + moveDir.z * rearOffset;
    const rightX = Math.cos(p.heading);
    const rightZ = -Math.sin(p.heading);
    const sideDist = 1.1;
    tireMarks.addMark(rearX - rightX * sideDist, rearZ - rightZ * sideDist, p.heading, intensity, -1, 'player');
    tireMarks.addMark(rearX + rightX * sideDist, rearZ + rightZ * sideDist, p.heading, intensity, 1, 'player');
  } else {
    tireMarks.breakChain('player');
  }

  // Particles
  if ((absSpeed > 15 && absDrift > 0.2) || (absSpeed > 25 && absDrift > 0.1)) {
    const behindOffset = moveDir.clone().multiplyScalar(-2);
    for (const side of [-1.2, 1.2]) {
      const sideVec = new THREE.Vector3(moveDir.z, 0, -moveDir.x).multiplyScalar(side);
      smoke.emit(
        p.x + behindOffset.x + sideVec.x, 0.2, p.z + behindOffset.z + sideVec.z,
        (Math.random() - 0.5) * 3, 1.5 + Math.random(), (Math.random() - 0.5) * 3
      );
    }
  }
  if (!onRoad && Math.abs(p.speed) > 5 && Math.random() < 0.4) {
    const behindOffset = moveDir.clone().multiplyScalar(-1.5);
    dust.emit(p.x + behindOffset.x + (Math.random() - 0.5), 0.3, p.z + behindOffset.z + (Math.random() - 0.5));
  }

  return { nearest, absSpeed, moveDir, driftAngle };
}

function update() {
  if (isPaused) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const p = G.player;
  const elapsed = clock.elapsedTime;

  // ── Sync touch controls visibility with race state ──
  if (touchControls) touchControls.update(raceState);

  // ── Sync HUD / Minimap visibility with race state ──
  const hudCanvas = document.getElementById('hud-canvas');
  const hudOverlay = document.getElementById('hud-overlay');
  const minimapCanvas = document.getElementById('minimap');
  const controlsEl = document.getElementById('controls');
  const showHUD = raceState === 'racing' || raceState === 'countdown' || raceState === 'grid';
  if (hudCanvas) hudCanvas.style.display = showHUD ? 'block' : 'none';
  if (hudOverlay) hudOverlay.style.display = showHUD ? 'block' : 'none';
  if (minimapCanvas) minimapCanvas.style.display = showHUD ? 'block' : 'none';
  if (controlsEl) controlsEl.style.display = showHUD ? 'block' : 'none';

  // ══════════════════════════════════════════
  //  STATE: ATTRACT — AI car racing, helicopter cam
  // ══════════════════════════════════════════
  if (raceState === 'attract') {
    // Run AI cars around the track
    const fakePlayer = { x: 99999, z: 99999, heading: 0, speed: 0, impulseX: 0, impulseZ: 0 };
    try { updateAI(aiCars, fakePlayer, dt, 'racing'); } catch(e) {}

    // Update AI sound
    if (aiSound) {
      const leadAI = aiCars[attractAIIdx];
      const px = leadAI.x;
      const py = 0;
      const pz = leadAI.z;
      for (const ai of aiCars) {
        if (ai.soundIdx !== undefined) {
          aiSound.updateCar(ai.soundIdx,
            ai.mesh.position.x, ai.mesh.position.y, ai.mesh.position.z,
            ai.speed, px, py, pz, leadAI.heading, dt);
        }
      }
    }
    if (sound) sound.update(0, 0, false, dt);

    // Follow lead AI car with helicopter camera
    const leadAI = aiCars[attractAIIdx];
    const leadPos = leadAI.mesh.position;
    const leadDir = new THREE.Vector3(Math.sin(leadAI.heading), 0, Math.cos(leadAI.heading));

    // Helicopter cam: high above and behind, slightly to the side for cinematic feel
    const heliHeight = 35;
    const heliBehind = 30;
    const heliSide = 15;
    const targetCamPos = leadPos.clone()
      .add(leadDir.clone().multiplyScalar(-heliBehind))
      .add(new THREE.Vector3(0, heliHeight, 0))
      .add(new THREE.Vector3(leadDir.z, 0, -leadDir.x).multiplyScalar(heliSide));

    camera.position.lerp(targetCamPos, 1.5 * dt);
    const lookTarget = leadPos.clone();
    lookTarget.y += 2;
    camera.lookAt(lookTarget);

    sun.position.copy(leadPos).add(new THREE.Vector3(60, 80, 40));
    sun.target.position.copy(leadPos);

    minimap.draw(leadAI);
    hud.draw(Math.abs(Math.round(leadAI.speed * 4)), true, 0, 1, TOTAL_LAPS, aiCars.length + 1, elapsed);

    smoke.update(dt);
    dust.update(dt);
    speedLines.update(dt, leadAI);

    return;
  }

  // ══════════════════════════════════════════
  //  STATE: GRID — cars staged, brief pause
  // ══════════════════════════════════════════
  if (raceState === 'grid') {
    gridTimer -= dt;
    if (gridTimer <= 0) {
      raceState = 'countdown';
      countdownStartTime = elapsed;
    }

    // Camera behind player on grid
    const moveDir = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const camBehind = moveDir.clone().multiplyScalar(-14);
    const camUp = new THREE.Vector3(0, 7, 0);
    const targetCamPos = playerCar.position.clone().add(camBehind).add(camUp);
    camera.position.lerp(targetCamPos, 3 * dt);
    const lookTarget = playerCar.position.clone();
    lookTarget.y += 1;
    camera.lookAt(lookTarget);
    sun.position.copy(playerCar.position).add(new THREE.Vector3(60, 80, 40));
    sun.target.position.copy(playerCar.position);

    minimap.draw(p);
    hud.draw(0, true, 0, 5, TOTAL_LAPS, aiCars.length + 1, elapsed);

    smoke.update(dt);
    dust.update(dt);
    speedLines.update(dt, p);
    return;
  }

  // ══════════════════════════════════════════
  //  STATE: COUNTDOWN — 3, 2, 1, GO!
  // ══════════════════════════════════════════
  if (raceState === 'countdown') {
    const countdownElapsed = elapsed - countdownStartTime;

    // Show 3, 2, 1, GO
    if (countdownElapsed < 1) {
      countdownEl.textContent = '3';
      countdownEl.style.color = '#ff3333';
      countdownEl.style.opacity = '1';
    } else if (countdownElapsed < 2) {
      countdownEl.textContent = '2';
      countdownEl.style.color = '#ffaa00';
      countdownEl.style.opacity = '1';
    } else if (countdownElapsed < 3) {
      countdownEl.textContent = '1';
      countdownEl.style.color = '#00ff66';
      countdownEl.style.opacity = '1';
    } else if (countdownElapsed < 3.8) {
      countdownEl.textContent = '¡YA!';
      countdownEl.style.color = '#ffffff';
      countdownEl.style.opacity = '1';
    } else {
      countdownEl.style.opacity = '0';
    }

    // Transition to racing 0.4s after GO!
    if (countdownElapsed >= 3.4) {
      countdownEl.style.opacity = '0';
      if (raceState !== 'racing') {
        raceState = 'racing';
        raceStartTime = elapsed;
        prevTrackT = 0;
        for (const ai of aiCars) {
          ai.prevTrackT = 0;
        }
      }
    }

    // Camera behind player
    const moveDir = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    const camBehind = moveDir.clone().multiplyScalar(-14);
    const camUp = new THREE.Vector3(0, 7, 0);
    const targetCamPos = playerCar.position.clone().add(camBehind).add(camUp);
    camera.position.lerp(targetCamPos, 3 * dt);
    const lookTarget = playerCar.position.clone();
    lookTarget.y += 1;
    camera.lookAt(lookTarget);
    sun.position.copy(playerCar.position).add(new THREE.Vector3(60, 80, 40));
    sun.target.position.copy(playerCar.position);

    minimap.draw(p);
    hud.draw(0, true, 0, 5, TOTAL_LAPS, aiCars.length + 1, elapsed);

    smoke.update(dt);
    dust.update(dt);
    speedLines.update(dt, p);
    return;
  }

  // ══════════════════════════════════════════
  //  STATE: FINISHED — show results, slow cars
  // ══════════════════════════════════════════
  if (raceState === 'finished') {
    // Show results on first frame of finished state
    if (!resultsShown) {
      // DNF any car that hasn't finished
      if (!playerFinished) {
        raceResults.push({ name: 'VOS', time: 0, dnf: true });
      }
      for (const ai of aiCars) {
        if (!ai.finished) {
          raceResults.push({ name: ai.name, time: 0, dnf: true });
        }
      }
      showResults();
      resultsShown = true;
      countdownEl.style.opacity = '0';
    }

    // Gradually slow player
    p.speed *= Math.max(0, 1 - 3 * dt);
    const moveDir = new THREE.Vector3(Math.sin(p.velHeading), 0, Math.cos(p.velHeading));
    p.x += moveDir.x * p.speed * dt;
    p.z += moveDir.z * p.speed * dt;

    const nearest = nearestTrackT(p.x, p.z);
    const surfaceFrame = frame(nearest.t);
    playerCar.position.set(p.x, surfaceFrame.point.y + 0.05, p.z);

    // Update AI positions (they're already decelerating in updateAI)
    G.player._trackT = nearest.t;
    try { updateAI(aiCars, G.player, dt, 'finished'); } catch(e) {}

    // Camera
    const camBehind = moveDir.clone().multiplyScalar(-14);
    const camUp = new THREE.Vector3(0, 7, 0);
    const targetCamPos = playerCar.position.clone().add(camBehind).add(camUp);
    camera.position.lerp(targetCamPos, 3 * dt);
    const lookTarget = playerCar.position.clone();
    lookTarget.y += 1;
    camera.lookAt(lookTarget);
    sun.position.copy(playerCar.position).add(new THREE.Vector3(60, 80, 40));
    sun.target.position.copy(playerCar.position);

    smoke.update(dt);
    dust.update(dt);
    minimap.draw(p);
    hud.draw(Math.abs(Math.round(p.speed * 4)), p.onTrack, TOTAL_LAPS, getPosition(nearest.t), TOTAL_LAPS, aiCars.length + 1, elapsed);
    return;
  }

  // ══════════════════════════════════════════
  //  STATE: RACING — full gameplay
  // ══════════════════════════════════════════

  // ── Player physics ──
  const { nearest, absSpeed, moveDir } = updatePlayerPhysics(dt);
  const currentTrackT = nearest.t;

  // ── Player lap tracking (anti-cheat: must pass halfway) ──
  if (!playerFinished) {
    // Only set hasPassedHalf when ACTUALLY near the halfway point
    if (currentTrackT > 0.4 && currentTrackT < 0.6) {
      playerHasPassedHalf = true;
    }

    const lapCross = checkLapCrossing(prevTrackT, currentTrackT, p.speed);
    if (lapCross === 1 && playerHasPassedHalf) {
      p.lap++;
      playerHasPassedHalf = false; // reset for next lap

      // Show lap notification
      if (p.lap < TOTAL_LAPS) {
        lapNotifyEl.textContent = `VUELTA ${p.lap + 1} / ${TOTAL_LAPS}`;
        lapNotifyEl.style.opacity = '1';
        lapNotifyTimer = 2;
      }

      // Check finish
      if (p.lap >= TOTAL_LAPS) {
        playerFinished = true;
        playerFinishTime = elapsed - raceStartTime;
        raceResults.push({ name: 'VOS', time: playerFinishTime, dnf: false });
        lapNotifyEl.textContent = '🏁 ¡TERMINASTE!';
        lapNotifyEl.style.opacity = '1';
        lapNotifyTimer = 3;
      }
    }
  }
  prevTrackT = currentTrackT;

  // ── AI lap tracking ──
  for (const ai of aiCars) {
    if (ai.finished) continue;

    // Anti-cheat: must actually pass halfway point
    if (ai._trackT > 0.4 && ai._trackT < 0.6) {
      ai.hasPassedHalf = true;
    }

    const aiLapCross = checkLapCrossing(ai.prevTrackT, ai._trackT, ai.speed);
    if (aiLapCross === 1 && ai.hasPassedHalf) {
      ai.lap++;
      ai.hasPassedHalf = false;

      if (ai.lap >= TOTAL_LAPS) {
        ai.finished = true;
        ai.finishTime = elapsed - raceStartTime;
        raceResults.push({ name: ai.name, time: ai.finishTime, dnf: false });
      }
    }
    ai.prevTrackT = ai._trackT;
  }

  // ── AI update ──
  G.player._trackT = currentTrackT;
  try {
    updateAI(aiCars, G.player, dt, 'racing');
  } catch(e) {
    console.error('AI error:', e.message, e.stack);
  }

  // ── AI tire marks & particles ──
  for (const ai of aiCars) {
    const aiAbsSpeed = Math.abs(ai.speed);
    let aiDrift = ai.heading - ai.velHeading;
    while (aiDrift > Math.PI) aiDrift -= 2 * Math.PI;
    while (aiDrift < -Math.PI) aiDrift += 2 * Math.PI;
    const aiAbsDrift = Math.abs(aiDrift);

    if ((aiAbsDrift > 0.15 && aiAbsSpeed > 3) || ai.handbrake && aiAbsSpeed > 3) {
      const aiMoveX = Math.sin(ai.velHeading);
      const aiMoveZ = Math.cos(ai.velHeading);
      const rearX = ai.x + aiMoveX * -1.3;
      const rearZ = ai.z + aiMoveZ * -1.3;
      const rightX = Math.cos(ai.heading);
      const rightZ = -Math.sin(ai.heading);
      tireMarks.addMark(rearX - rightX * 1.1, rearZ - rightZ * 1.1, ai.heading, 0.5, -1, 'ai_' + aiCars.indexOf(ai));
      tireMarks.addMark(rearX + rightX * 1.1, rearZ + rightZ * 1.1, ai.heading, 0.5, 1, 'ai_' + aiCars.indexOf(ai));
    } else {
      tireMarks.breakChain('ai_' + aiCars.indexOf(ai));
    }

    if (aiAbsSpeed > 15 && aiAbsDrift > 0.2) {
      const behindX = -Math.sin(ai.velHeading) * 2;
      const behindZ = -Math.cos(ai.velHeading) * 2;
      for (const side of [-1.2, 1.2]) {
        smoke.emit(
          ai.x + behindX + Math.cos(ai.heading) * side,
          0.2,
          ai.z + behindZ - Math.sin(ai.heading) * side,
          (Math.random() - 0.5) * 3, 1.5 + Math.random(), (Math.random() - 0.5) * 3
        );
      }
    }
  }

  // ── Particle updates ──
  smoke.update(dt);
  dust.update(dt);
  speedLines.update(dt, p);

  // ── Lap notification fade ──
  if (lapNotifyTimer > 0) {
    lapNotifyTimer -= dt;
    if (lapNotifyTimer <= 0) {
      lapNotifyEl.style.opacity = '0';
    }
  }

  // ── Telemetry ──
  telemetry.update(p, currentTrackT, dt, elapsed);
  if (Math.floor(elapsed) % 5 === 0 && Math.floor(elapsed) !== telemetry._lastSave) {
    telemetry._lastSave = Math.floor(elapsed);
    scheduleSave(telemetry);
  }

  // ── Camera follow ──
  if (cameraMode === 0) {
    // 0: Third Person (Original)
    const camBehind = moveDir.clone().multiplyScalar(-14);
    const camUp = new THREE.Vector3(0, 7, 0);
    const targetCamPos = playerCar.position.clone().add(camBehind).add(camUp);
    camera.position.lerp(targetCamPos, 5 * dt);
    const lookTarget = playerCar.position.clone();
    lookTarget.y += 1;
    camera.lookAt(lookTarget);
    
    // Show player car and cabin in third person
    playerCar.visible = (raceState !== 'attract');
    const cabinMesh = playerCar.getObjectByName('cabin');
    if (cabinMesh) cabinMesh.visible = true;
    cockpitGroup.visible = false;
  } else if (cameraMode === 1) {
    // 1: First Person / Cockpit
    const cockpitOffset = moveDir.clone().multiplyScalar(-0.1);
    const cockpitUp = new THREE.Vector3(0, 1.15, 0);
    const targetCamPos = playerCar.position.clone().add(cockpitOffset).add(cockpitUp);
    camera.position.lerp(targetCamPos, 15 * dt);
    
    const lookTarget = playerCar.position.clone().add(moveDir.clone().multiplyScalar(20));
    lookTarget.y += 1.0;
    camera.lookAt(lookTarget);
    
    // Hide player car body in cockpit view to prevent clipping.
    // Instead we render the custom hood mesh inside cockpitGroup!
    playerCar.visible = false;
    
    // Position and update the cockpit models
    cockpitGroup.visible = true;
    
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const cockpitPos = camera.position.clone()
      .add(camDir.clone().multiplyScalar(0.65))
      .add(new THREE.Vector3(0, -0.22, 0));
    cockpitGroup.position.copy(cockpitPos);
    
    cockpitGroup.lookAt(camera.position);
    cockpitGroup.rotateX(0.1); // slight angle towards driver
    
    // Steer the wheel based on keys
    let targetAngle = 0;
    if (G.keys['KeyA'] || G.keys['ArrowLeft']) targetAngle = Math.PI / 2;
    if (G.keys['KeyD'] || G.keys['ArrowRight']) targetAngle = -Math.PI / 2;
    
    wheelGroup.rotation.z = THREE.MathUtils.lerp(wheelGroup.rotation.z, targetAngle, 10 * dt);
  } else if (cameraMode === 2) {
    // 2: Bumper / Road level
    const bumperOffset = moveDir.clone().multiplyScalar(2.6);
    const bumperUp = new THREE.Vector3(0, 0.4, 0);
    const targetCamPos = playerCar.position.clone().add(bumperOffset).add(bumperUp);
    camera.position.lerp(targetCamPos, 15 * dt);
    
    const lookTarget = playerCar.position.clone().add(moveDir.clone().multiplyScalar(20));
    lookTarget.y += 0.4;
    camera.lookAt(lookTarget);
    
    playerCar.visible = false;
    cockpitGroup.visible = false;
  } else if (cameraMode === 3) {
    // 3: Aerial / Bird's-eye view
    const aerialOffset = moveDir.clone().multiplyScalar(-4);
    const aerialUp = new THREE.Vector3(0, 22, 0);
    const targetCamPos = playerCar.position.clone().add(aerialOffset).add(aerialUp);
    camera.position.lerp(targetCamPos, 4 * dt);
    
    const lookTarget = playerCar.position.clone();
    camera.lookAt(lookTarget);
    
    playerCar.visible = (raceState !== 'attract');
    const cabinMesh = playerCar.getObjectByName('cabin');
    if (cabinMesh) cabinMesh.visible = true;
    cockpitGroup.visible = false;
  }

  const targetFov = 65 + (Math.abs(p.speed) / MAX_SPEED) * 15;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 3 * dt);
  camera.updateProjectionMatrix();

  sun.position.copy(playerCar.position).add(new THREE.Vector3(60, 80, 40));
  sun.target.position.copy(playerCar.position);

  // ── AI car sounds ──
  if (aiSound) {
    const px = p.x, pz = p.z, py = playerCar.position.y;
    for (const ai of aiCars) {
      if (ai.soundIdx !== undefined) {
        aiSound.updateCar(ai.soundIdx,
          ai.mesh.position.x, ai.mesh.position.y, ai.mesh.position.z,
          ai.speed, px, py, pz, p.heading, dt);
      }
    }
  }

  // ── HUD ──
  const displaySpeed = Math.abs(Math.round(p.speed * 4));
  const pos = getPosition(currentTrackT);
  const playerLap = Math.min(p.lap + 1, TOTAL_LAPS);
  hud.draw(displaySpeed, p.onTrack, playerLap, pos, TOTAL_LAPS, aiCars.length + 1, elapsed);

  // ── Minimap ──
  minimap.draw(p);

  // ── Sound engine ──
  if (sound) {
    const isThrottle = G.keys['KeyW'] || G.keys['ArrowUp'];
    sound.update(p.speed, absSpeed, isThrottle, dt);
  }

  // ── Check if race is finished ──
  const allCarsFinished = playerFinished && aiCars.every(ai => ai.finished);
  const anyCarFinished = playerFinished || aiCars.some(ai => ai.finished);

  if (anyCarFinished && raceEndTimer < 0) {
    raceEndTimer = 30;
  }
  if (raceEndTimer >= 0) {
    raceEndTimer -= dt;
  }

  // Transition to finished state
  if (allCarsFinished || (raceEndTimer >= 0 && raceEndTimer <= 0.01)) {
    raceState = 'finished';
  }
}

function animate() {
  requestAnimationFrame(animate);
  update();
  renderer.render(scene, camera);
}

animate();

// ══ RESIZE ══
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ══ HMR RELOAD ══
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
