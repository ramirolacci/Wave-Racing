// ═══════════════════════════════════════════════════════
//  TOUCH CONTROLS — Landscape-optimized virtual controls
//  Layout: [Joystick | 3D Game View | Gas/Brake/Drift]
// ═══════════════════════════════════════════════════════

export function createTouchControls(keys) {
  // ── Only activate on touch devices ──
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return null;

  // ══════════════════════════════════════
  //  ROTATE OVERLAY — inject into DOM
  // ══════════════════════════════════════
  let rotateEl = document.getElementById('rotate-overlay');
  if (rotateEl) rotateEl.remove();
  rotateEl = document.createElement('div');
  rotateEl.id = 'rotate-overlay';
  rotateEl.innerHTML = `
    <span class="rotate-icon">📱</span>
    <div class="rotate-title">GIRÁ EL DISPOSITIVO</div>
    <div class="rotate-bar"></div>
    <div class="rotate-sub">EL JUEGO REQUIERE MODO HORIZONTAL</div>
  `;
  document.body.appendChild(rotateEl);

  // Try to lock orientation (works on Android Chrome, ignored on iOS)
  function tryLockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }
  tryLockLandscape();

  // ══════════════════════════════════════
  //  PAUSE GAME on portrait, resume on landscape
  // ══════════════════════════════════════
  let isPortrait = window.matchMedia('(orientation: portrait)').matches;

  function checkOrientation() {
    isPortrait = window.matchMedia('(orientation: portrait)').matches;
    // Pause all keys when rotating to portrait
    if (isPortrait) {
      keys['ArrowUp'] = false; keys['KeyW'] = false;
      keys['ArrowDown'] = false; keys['KeyS'] = false;
      keys['ArrowLeft'] = false; keys['KeyA'] = false;
      keys['ArrowRight'] = false; keys['KeyD'] = false;
      keys['Space'] = false;
      resetJoystick();
    } else {
      tryLockLandscape();
    }
  }

  window.addEventListener('orientationchange', () => {
    setTimeout(checkOrientation, 300);
  });
  window.matchMedia('(orientation: portrait)').addEventListener('change', checkOrientation);

  // ══════════════════════════════════════
  //  STYLES — injected once
  // ══════════════════════════════════════
  let styleEl = document.getElementById('tc-style');
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.id = 'tc-style';
  styleEl.textContent = `
    /* ── Joystick base ── */
    #tc-joystick-base {
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: rgba(255,255,255,0.06);
      border: 2px solid rgba(255,255,255,0.15);
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 24px rgba(0,255,213,0.12), inset 0 0 20px rgba(0,0,0,0.3);
    }

    /* ── Outer glow ring ── */
    #tc-joystick-base::before {
      content: '';
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 1px solid rgba(0,255,213,0.12);
      pointer-events: none;
    }

    /* ── Crosshair guides ── */
    #tc-joystick-base::after {
      content: '';
      position: absolute;
      width: 100%;
      height: 1px;
      background: rgba(255,255,255,0.06);
      pointer-events: none;
    }

    #tc-joystick-knob {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: radial-gradient(circle at 38% 32%,
        rgba(255,255,255,0.45) 0%,
        rgba(0,200,170,0.5) 45%,
        rgba(0,120,100,0.4) 100%);
      border: 2px solid rgba(255,255,255,0.3);
      box-shadow: 0 3px 14px rgba(0,0,0,0.5), 0 0 8px rgba(0,255,213,0.25);
      position: absolute;
      will-change: transform;
      pointer-events: none;
    }

    /* ── Action buttons ── */
    .tc-btn {
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 2px solid rgba(255,255,255,0.18);
      cursor: pointer;
      will-change: transform;
      transition: transform 0.06s ease, box-shadow 0.06s ease;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    .tc-btn:active,
    .tc-btn.pressed {
      transform: scale(0.88) !important;
    }

    .tc-btn-icon {
      line-height: 1;
      pointer-events: none;
    }

    .tc-btn-label {
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      letter-spacing: 1px;
      pointer-events: none;
      margin-top: 3px;
    }

    /* ── Start / Restart buttons ── */
    #tc-start-btn, #tc-restart-btn {
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    #tc-start-btn:active { transform: translateX(-50%) scale(0.96) !important; }
    #tc-restart-btn:active { transform: translateX(-50%) scale(0.96) !important; }

    /* ── Pulse animation ── */
    @keyframes tcPulse {
      0%, 100% { opacity: 0.75; transform: translateX(-50%) scale(1); }
      50%       { opacity: 1;    transform: translateX(-50%) scale(1.04); }
    }

    /* ── Touch area visual feedback ── */
    @keyframes joySplash {
      0%   { box-shadow: 0 0 0 0 rgba(0,255,213,0.4); }
      100% { box-shadow: 0 0 0 18px rgba(0,255,213,0); }
    }
    .joystick-splash {
      animation: joySplash 0.35s ease-out forwards;
    }

    /* ── Fullscreen Button ── */
    #tc-fullscreen-btn {
      position: fixed;
      top: max(env(safe-area-inset-top, 0px), 12px);
      right: max(env(safe-area-inset-right, 0px), 12px);
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.45);
      border: 2px solid rgba(0, 255, 213, 0.35);
      box-shadow: 0 0 15px rgba(0, 255, 213, 0.15), inset 0 0 8px rgba(0, 255, 213, 0.1);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all 0.15s ease;
      -webkit-tap-highlight-color: transparent;
      outline: none;
      padding: 0;
    }

    #tc-fullscreen-btn:active {
      transform: scale(0.9);
      border-color: rgba(0, 255, 213, 0.85);
      box-shadow: 0 0 20px rgba(0, 255, 213, 0.45), inset 0 0 10px rgba(0, 255, 213, 0.25);
    }

    #tc-fullscreen-btn svg {
      width: 22px;
      height: 22px;
      fill: #00ffd5;
      filter: drop-shadow(0 0 4px rgba(0, 255, 213, 0.5));
      pointer-events: none;
    }

    /* ── Pause Button ── */
    #tc-pause-btn {
      position: fixed;
      top: max(env(safe-area-inset-top, 0px), 12px);
      right: max(env(safe-area-inset-right, 0px), 68px);
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.45);
      border: 2px solid rgba(0, 255, 213, 0.35);
      box-shadow: 0 0 15px rgba(0, 255, 213, 0.15), inset 0 0 8px rgba(0, 255, 213, 0.1);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      transition: all 0.15s ease;
      -webkit-tap-highlight-color: transparent;
      outline: none;
      padding: 0;
    }

    #tc-pause-btn:active {
      transform: scale(0.9);
      border-color: rgba(0, 255, 213, 0.85);
      box-shadow: 0 0 20px rgba(0, 255, 213, 0.45), inset 0 0 10px rgba(0, 255, 213, 0.25);
    }

    #tc-pause-btn svg {
      width: 20px;
      height: 20px;
      fill: #00ffd5;
      filter: drop-shadow(0 0 4px rgba(0, 255, 213, 0.5));
      pointer-events: none;
    }
  `;
  document.head.appendChild(styleEl);

  // ══════════════════════════════════════
  //  MAIN CONTAINER
  // ══════════════════════════════════════
  let container = document.getElementById('touch-controls');
  if (container) container.remove();
  container = document.createElement('div');
  container.id = 'touch-controls';
  container.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 500;
    user-select: none;
    -webkit-user-select: none;
    display: none;
  `;

  // ══════════════════════════════════════
  //  LEFT — JOYSTICK ZONE (full left 35%)
  // ══════════════════════════════════════
  const joystickZone = document.createElement('div');
  joystickZone.id = 'tc-joystick-zone';
  joystickZone.style.cssText = `
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 38%;
    pointer-events: auto;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: env(safe-area-inset-bottom, 20px);
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 20px);
    padding-left: env(safe-area-inset-left, 12px);
    padding-left: max(env(safe-area-inset-left, 0px), 12px);
  `;

  // Direction label strip (top of joystick zone)
  const dirLabel = document.createElement('div');
  dirLabel.style.cssText = `
    position: absolute;
    top: 16px; left: 0; right: 0;
    text-align: center;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 3px;
    color: rgba(255,255,255,0.2);
    pointer-events: none;
  `;
  dirLabel.textContent = 'DIRECCIÓN';
  joystickZone.appendChild(dirLabel);

  const joystickBase = document.createElement('div');
  joystickBase.id = 'tc-joystick-base';

  // Arrow hints
  const arrows = [
    { text: '◀', style: 'position:absolute;left:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.2);font-size:13px;pointer-events:none;' },
    { text: '▶', style: 'position:absolute;right:8px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.2);font-size:13px;pointer-events:none;' },
  ];
  arrows.forEach(a => {
    const el = document.createElement('div');
    el.textContent = a.text;
    el.style.cssText = a.style;
    joystickBase.appendChild(el);
  });

  const joystickKnob = document.createElement('div');
  joystickKnob.id = 'tc-joystick-knob';
  joystickBase.appendChild(joystickKnob);

  joystickZone.appendChild(joystickBase);
  container.appendChild(joystickZone);

  // ══════════════════════════════════════
  //  RIGHT — BUTTONS (right 35%, bottom)
  // ══════════════════════════════════════
  const btnZone = document.createElement('div');
  btnZone.id = 'tc-btn-zone';
  btnZone.style.cssText = `
    position: absolute;
    right: 0; top: 0; bottom: 0;
    width: 38%;
    pointer-events: none;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 20px);
    padding-right: max(env(safe-area-inset-right, 0px), 12px);
  `;

  // Layout: 2-col grid — Gas (top-right), Drift (bottom-left), Brake (bottom-right)
  const btnGrid = document.createElement('div');
  btnGrid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 14px;
    pointer-events: none;
    align-items: end;
  `;

  function makeBtn({ id, icon, label, size = 76, bgColor, glowColor, gridArea = '' }) {
    const btn = document.createElement('div');
    btn.id = id;
    btn.className = 'tc-btn';
    btn.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      background: ${bgColor};
      box-shadow: 0 0 20px ${glowColor}, 0 4px 14px rgba(0,0,0,0.5);
      pointer-events: auto;
      ${gridArea ? `grid-area: ${gridArea};` : ''}
    `;
    btn.innerHTML = `
      <span class="tc-btn-icon" style="font-size:${Math.round(size * 0.36)}px">${icon}</span>
      <span class="tc-btn-label" style="font-size:${Math.round(size * 0.115)}px; color:rgba(255,255,255,0.75)">${label}</span>
    `;
    return btn;
  }

  // Gas button — top right
  const gasBtn = makeBtn({
    id: 'tc-gas',
    icon: '▲',
    label: 'GAS',
    size: 82,
    bgColor: 'radial-gradient(circle at 38% 32%, rgba(0,255,140,0.45), rgba(0,150,80,0.3))',
    glowColor: 'rgba(0,255,130,0.25)',
    gridArea: '1 / 2',
  });

  // Drift button — top left (smaller, accent)
  const driftBtn = makeBtn({
    id: 'tc-drift',
    icon: '⚡',
    label: 'DRIFT',
    size: 68,
    bgColor: 'radial-gradient(circle at 38% 32%, rgba(255,200,0,0.45), rgba(180,120,0,0.3))',
    glowColor: 'rgba(255,210,0,0.25)',
    gridArea: '1 / 1',
  });

  // Brake button — bottom right
  const brakeBtn = makeBtn({
    id: 'tc-brake',
    icon: '▼',
    label: 'FRENO',
    size: 82,
    bgColor: 'radial-gradient(circle at 38% 32%, rgba(255,80,40,0.45), rgba(150,30,10,0.3))',
    glowColor: 'rgba(255,60,30,0.25)',
    gridArea: '2 / 2',
  });

  // Empty bottom-left slot
  const emptySlot = document.createElement('div');
  emptySlot.style.cssText = 'grid-area: 2 / 1; pointer-events: none;';

  // Label strip
  const btnLabel = document.createElement('div');
  btnLabel.style.cssText = `
    position: absolute;
    top: 16px; left: 0; right: 0;
    text-align: center;
    font-family: 'Orbitron', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 3px;
    color: rgba(255,255,255,0.2);
    pointer-events: none;
  `;
  btnLabel.textContent = 'CONTROLES';
  btnZone.appendChild(btnLabel);

  btnGrid.appendChild(driftBtn);
  btnGrid.appendChild(gasBtn);
  btnGrid.appendChild(emptySlot);
  btnGrid.appendChild(brakeBtn);
  btnZone.appendChild(btnGrid);
  container.appendChild(btnZone);
  document.body.appendChild(container);

  // ══════════════════════════════════════
  //  START BUTTON
  // ══════════════════════════════════════
  let startBtn = document.getElementById('tc-start-btn');
  if (startBtn) startBtn.remove();
  startBtn = document.createElement('div');
  startBtn.id = 'tc-start-btn';
  startBtn.style.cssText = `
    position: fixed;
    bottom: max(env(safe-area-inset-bottom, 0px), 50px);
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    z-index: 600;
    background: linear-gradient(135deg, rgba(0,255,213,0.2), rgba(0,160,255,0.2));
    border: 2px solid rgba(0,255,213,0.45);
    border-radius: 60px;
    padding: 18px 52px;
    font-family: 'Orbitron', sans-serif;
    font-weight: 900;
    font-size: clamp(14px, 3vw, 18px);
    color: white;
    letter-spacing: 3px;
    text-shadow: 0 0 20px rgba(0,255,213,0.6);
    box-shadow: 0 0 36px rgba(0,255,213,0.18), 0 6px 24px rgba(0,0,0,0.6);
    cursor: pointer;
    animation: tcPulse 1.2s ease-in-out infinite;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  `;
  startBtn.innerHTML = '🏁 <span>TOCA PARA CORRER</span>';
  document.body.appendChild(startBtn);

  // ══════════════════════════════════════
  //  RESTART BUTTON
  // ══════════════════════════════════════
  let restartBtn = document.getElementById('tc-restart-btn');
  if (restartBtn) restartBtn.remove();
  restartBtn = document.createElement('div');
  restartBtn.id = 'tc-restart-btn';
  restartBtn.style.cssText = `
    position: fixed;
    bottom: max(env(safe-area-inset-bottom, 0px), 30px);
    left: 50%;
    transform: translateX(-50%);
    pointer-events: auto;
    z-index: 600;
    background: rgba(255,34,0,0.25);
    border: 2px solid rgba(255,80,40,0.5);
    border-radius: 50px;
    padding: 15px 44px;
    font-family: 'Orbitron', sans-serif;
    font-weight: 700;
    font-size: clamp(13px, 2.5vw, 16px);
    color: white;
    letter-spacing: 2px;
    box-shadow: 0 0 24px rgba(255,34,0,0.18), 0 4px 18px rgba(0,0,0,0.6);
    cursor: pointer;
    display: none;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    white-space: nowrap;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  `;
  restartBtn.textContent = '🔄  REINICIAR';
  document.body.appendChild(restartBtn);

  // ══════════════════════════════════════
  //  JOYSTICK LOGIC
  // ══════════════════════════════════════
  const MAX_DIST = 42;
  const DEAD_ZONE = 10; // px before steering registers

  const joy = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };

  function updateJoystick() {
    const normX = Math.abs(joy.dx) > DEAD_ZONE ? joy.dx / MAX_DIST : 0;

    keys['ArrowLeft']  = normX < -0.28;
    keys['KeyA']       = normX < -0.28;
    keys['ArrowRight'] = normX > 0.28;
    keys['KeyD']       = normX > 0.28;

    // Clamp knob visually
    const cx = Math.max(-MAX_DIST, Math.min(MAX_DIST, joy.dx));
    const cy = Math.max(-MAX_DIST, Math.min(MAX_DIST, joy.dy));
    joystickKnob.style.transform = `translate(${cx}px, ${cy}px)`;
  }

  function resetJoystick() {
    joy.active = false;
    joy.id = null;
    joy.dx = 0;
    joy.dy = 0;
    keys['ArrowLeft']  = false; keys['KeyA'] = false;
    keys['ArrowRight'] = false; keys['KeyD'] = false;
    joystickKnob.style.transform = 'translate(0px, 0px)';
  }

  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joy.active) return;
    const t = e.changedTouches[0];
    joy.active = true;
    joy.id = t.identifier;
    // Use touch point as center for floating joystick feel
    const rect = joystickZone.getBoundingClientRect();
    const localX = t.clientX - rect.left;
    const localY = t.clientY - rect.top;
    // Clamp center so knob stays inside the zone
    joy.cx = Math.max(60, Math.min(rect.width - 60, localX));
    joy.cy = Math.max(60, Math.min(rect.height - 60, localY));
    // Move base to touch point
    joystickBase.style.position = 'absolute';
    joystickBase.style.left = `${joy.cx - 55}px`;
    joystickBase.style.top  = `${joy.cy - 55}px`;
    joystickBase.style.margin = '0';
    // Splash feedback
    joystickBase.classList.add('joystick-splash');
    setTimeout(() => joystickBase.classList.remove('joystick-splash'), 350);
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joy.id) continue;
      const rect = joystickZone.getBoundingClientRect();
      joy.dx = (t.clientX - rect.left) - joy.cx;
      joy.dy = (t.clientY - rect.top)  - joy.cy;
      updateJoystick();
    }
  }, { passive: false });

  const joyEnd = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        resetJoystick();
        // Reset base to default centered position
        joystickBase.style.position = 'relative';
        joystickBase.style.left = '';
        joystickBase.style.top = '';
        joystickBase.style.margin = '';
      }
    }
  };
  joystickZone.addEventListener('touchend', joyEnd, { passive: false });
  joystickZone.addEventListener('touchcancel', joyEnd, { passive: false });

  // ══════════════════════════════════════
  //  BUTTON TOUCH LOGIC
  // ══════════════════════════════════════
  function bindBtn(el, key1, key2 = null) {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      keys[key1] = true;
      if (key2) keys[key2] = true;
    }, { passive: false });

    const up = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      keys[key1] = false;
      if (key2) keys[key2] = false;
    };
    el.addEventListener('touchend',   up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  }

  bindBtn(gasBtn,   'ArrowUp',   'KeyW');
  bindBtn(brakeBtn, 'ArrowDown', 'KeyS');
  bindBtn(driftBtn, 'Space');

  // ══════════════════════════════════════
  //  VISIBILITY STATE MACHINE
  // ══════════════════════════════════════
  let lastState = null;

  function update(raceState) {
    if (raceState === lastState) return;
    lastState = raceState;

    const pauseBtn = document.getElementById('tc-pause-btn');

    if (raceState === 'attract') {
      startBtn.style.display   = 'flex';
      restartBtn.style.display = 'none';
      container.style.display  = 'none';
      if (pauseBtn) pauseBtn.style.display = 'none';
    } else if (raceState === 'finished') {
      startBtn.style.display   = 'none';
      restartBtn.style.display = 'block';
      container.style.display  = 'none';
      if (pauseBtn) pauseBtn.style.display = 'none';
    } else {
      // grid · countdown · racing
      startBtn.style.display   = 'none';
      restartBtn.style.display = 'none';
      container.style.display  = 'block';
      if (pauseBtn) pauseBtn.style.display = 'flex';
    }
  }

  // ══════════════════════════════════════
  //  FULLSCREEN BUTTON
  // ══════════════════════════════════════
  let fsBtn = document.getElementById('tc-fullscreen-btn');
  if (fsBtn) fsBtn.remove();
  fsBtn = document.createElement('button');
  fsBtn.id = 'tc-fullscreen-btn';
  fsBtn.setAttribute('aria-label', 'Pantalla completa');
  fsBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path class="enter-path" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
      <path class="exit-path" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" style="display: none;"/>
    </svg>
  `;
  document.body.appendChild(fsBtn);

  // ══════════════════════════════════════
  //  PAUSE BUTTON
  // ══════════════════════════════════════
  let pauseBtn = document.getElementById('tc-pause-btn');
  if (pauseBtn) pauseBtn.remove();
  pauseBtn = document.createElement('button');
  pauseBtn.id = 'tc-pause-btn';
  pauseBtn.setAttribute('aria-label', 'Pausa');
  pauseBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
    </svg>
  `;
  document.body.appendChild(pauseBtn);

  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.togglePause) window.togglePause();
  });

  // Initial: attract state
  startBtn.style.display   = 'flex';
  restartBtn.style.display = 'none';
  container.style.display  = 'none';
  pauseBtn.style.display   = 'none';

  function toggleFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;

    const requestFS = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    const exitFS = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    const isFS = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);

    if (!isFS) {
      if (requestFS) {
        requestFS.call(docEl).catch(err => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
    } else {
      if (exitFS) {
        exitFS.call(doc);
      }
    }
  }

  fsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleFullscreen();
  });

  function updateFullscreenIcon() {
    const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    const enterPath = fsBtn.querySelector('.enter-path');
    const exitPath = fsBtn.querySelector('.exit-path');
    if (enterPath && exitPath) {
      if (isFS) {
        enterPath.style.display = 'none';
        exitPath.style.display = 'block';
      } else {
        enterPath.style.display = 'block';
        exitPath.style.display = 'none';
      }
    }
  }

  document.addEventListener('fullscreenchange', updateFullscreenIcon);
  document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
  document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
  document.addEventListener('MSFullscreenChange', updateFullscreenIcon);

  return { update, startBtn, restartBtn };
}
