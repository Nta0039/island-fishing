import { dom } from './ui.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Unified cross-platform input:
 *  - PC:     WASD / arrows to move, mouse drag to orbit, Space to reel.
 *  - Mobile: bottom-left virtual joystick, drag anywhere to orbit,
 *            press & hold the bottom-right zone to reel.
 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.joystick = { x: 0, y: 0 };
    this.hold = false;

    this.yaw = Math.PI;
    this.pitch = 0.34;
    this.camDist = 10.5;

    this.dragging = false;
    this.dragId = null;

    this.touch =
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      'ontouchstart' in window;
  }

  get moveInput() {
    let right = 0;
    let forward = 0;

    /* WASD and the arrow keys both drive the character. Arrow keys are
       listed under their `code` names (ArrowUp, …) and their `key` names
       (Up, …) so the mapping survives odd layouts. */
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;

    right += this.joystick.x;
    forward += -this.joystick.y;

    const len = Math.hypot(right, forward);
    if (len > 1) {
      right /= len;
      forward /= len;
    }
    return { right, forward, magnitude: Math.min(1, len) };
  }

  attach(canvas) {
    /* ---------------- Keyboard ---------------- */
    /* `e.code` is layout-independent and is what we key off; the legacy
       `e.key` spellings are mapped across as a fallback so arrow-key
       movement keeps working on older or unusual browsers. */
    const keyName = (e) => {
      if (e.code) return e.code;
      switch (e.key) {
        case 'Up': return 'ArrowUp';
        case 'Down': return 'ArrowDown';
        case 'Left': return 'ArrowLeft';
        case 'Right': return 'ArrowRight';
        default: return e.key;
      }
    };

    window.addEventListener('keydown', (e) => {
      const k = keyName(e);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        e.preventDefault();
      }
      this.keys.add(k);
      if (k === 'Space') this.hold = true;
    });

    window.addEventListener('keyup', (e) => {
      const k = keyName(e);
      this.keys.delete(k);
      if (k === 'Space') this.hold = false;
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.hold = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
      if (dom.joystickKnob) dom.joystickKnob.style.transform = 'translate(0px, 0px)';
    });

    /* ---------------- Camera drag (mouse + touch) ---------------- */
    canvas.addEventListener('pointerdown', (e) => {
      if (this.dragId !== null) return;
      this.dragId = e.pointerId;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.dragId) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch + dy * 0.004, 0.06, 1.15);
    });

    const endDrag = (e) => {
      if (e.pointerId !== this.dragId) return;
      this.dragging = false;
      this.dragId = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /* ---------------- Virtual joystick ---------------- */
    const zone = dom.joystickZone;
    const base = dom.joystickBase;
    const knob = dom.joystickKnob;
    let jId = null;
    let cx = 0;
    let cy = 0;
    let radius = 70;

    const jStart = (e) => {
      if (jId !== null) return;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      radius = r.width / 2;
      jId = e.pointerId;
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      jMove(e);
      e.preventDefault();
    };

    const jMove = (e) => {
      if (e.pointerId !== jId) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joystick.x = dx / radius;
      this.joystick.y = dy / radius;
      e.preventDefault();
    };

    const jEnd = (e) => {
      if (e.pointerId !== jId) return;
      jId = null;
      knob.style.transform = 'translate(0px, 0px)';
      this.joystick.x = 0;
      this.joystick.y = 0;
    };

    zone.addEventListener('pointerdown', jStart);
    zone.addEventListener('pointermove', jMove);
    zone.addEventListener('pointerup', jEnd);
    zone.addEventListener('pointercancel', jEnd);

    /* ---------------- Reel zone (bottom-right, mobile) ---------------- */
    const reel = dom.reelZone;
    reel.addEventListener('pointerdown', (e) => {
      this.hold = true;
      reel.classList.add('active');
      e.preventDefault();
    });
    const reelEnd = () => {
      this.hold = false;
      reel.classList.remove('active');
    };
    reel.addEventListener('pointerup', reelEnd);
    reel.addEventListener('pointercancel', reelEnd);
    reel.addEventListener('pointerleave', reelEnd);

    /* ---------------- Mobile zoom lock ----------------
       The viewport meta covers Android, but iOS Safari ignores
       user-scalable=no entirely, so pinch and double-tap zoom have to be
       refused in script. Scrolling inside the trade and codex panels is
       left alone. */
    const swallow = (e) => { if (e.cancelable) e.preventDefault(); };

    /* iOS fires these for a pinch. */
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, swallow, { passive: false });
    }
    /* The synthetic double-click that a fast double tap produces. */
    document.addEventListener('dblclick', swallow, { passive: false });

    /* Two fingers down anywhere is a pinch — never let it through. */
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    }, { passive: false });

    /* And swallow the second tap of a double tap, unless it landed on a
       real control (those already opt out via touch-action). */
    const isControl = (el) =>
      !!(el && el.closest && el.closest('button, input, textarea, select, a, label'));
    let lastTapAt = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      const isSecondTap = now - lastTapAt <= 320;
      lastTapAt = now;
      if (isSecondTap && !isControl(e.target) && e.cancelable) e.preventDefault();
    }, { passive: false });
  }
}
