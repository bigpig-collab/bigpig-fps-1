// EMBERLINE — keyboard / mouse / pointer-lock input. Lock failures never throw.
export function createInput() {
  const input = {
    keys: new Set(), mouseDX: 0, mouseDY: 0, firing: false, plantHeld: false,
    takeMouse() { const r = { dx: this.mouseDX, dy: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return r; },
  };
  return input;
}

export function bindInput(canvas, input, cb = {}) {
  const onMove = (e) => {
    if (document.pointerLockElement !== canvas) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  };
  const onDown = (e) => {
    if (document.pointerLockElement !== canvas || e.button !== 0) return;
    if (!input.firing) { input.firing = true; if (cb.onFireStart) cb.onFireStart(); }
  };
  const onUp = (e) => {
    if (e.button !== 0) return;
    if (input.firing) { input.firing = false; if (cb.onFireEnd) cb.onFireEnd(); }
  };
  const onKeyDown = (e) => {
    if (e.code === 'Space') e.preventDefault();
    input.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyR') { if (cb.onReload) cb.onReload(); }
    else if (e.code === 'KeyB') { if (cb.onBuy) cb.onBuy(); }
    else if (e.code === 'KeyG') { if (cb.onGrenade) cb.onGrenade(); }
    else if (e.code === 'KeyE') { input.plantHeld = true; if (cb.onPlant) cb.onPlant(); }
    else if (e.code === 'Space') { if (cb.onJump) cb.onJump(); }
    else if (e.code === 'Digit1') { if (cb.onSwitch) cb.onSwitch('rifle'); }
    else if (e.code === 'Digit2') { if (cb.onSwitch) cb.onSwitch('pistol'); }
  };
  const onKeyUp = (e) => {
    input.keys.delete(e.code);
    if (e.code === 'KeyE') { input.plantHeld = false; if (cb.onPlantEnd) cb.onPlantEnd(); }
  };
  const onBlur = () => {
    const wasFiring = input.firing;
    input.keys.clear(); input.firing = false; input.plantHeld = false;
    if (wasFiring && cb.onFireEnd) cb.onFireEnd();
  };
  const onClick = () => {
    if (document.pointerLockElement === canvas) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* pointer lock unavailable — mouse look stays off */ }
  };
  const onCtx = (e) => e.preventDefault();
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mousedown', onDown);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', onCtx);
  return () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('contextmenu', onCtx);
  };
}
