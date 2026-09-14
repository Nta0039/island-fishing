import * as THREE from 'three';
import { SEA_LEVEL } from './world.js';
import { getRodTipWorld } from './avatar.js';
import { toonMaterial } from './toon.js';

const _tip = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/* Minigame tuning */
const PULL_SPEED = 0.78;   // indicator travel per second while holding
const FALL_SPEED = 0.95;   // indicator fall per second while released
const TARGET_START = 0.41; // red zone left edge (0..1)
const TARGET_WIDTH = 0.18; // red zone width

export class Fishing {
  constructor(scene) {
    this.scene = scene;
    this.state = 'idle';
    this.t = 0;

    /* Bobber (colour is swappable from the merchant shop) */
    const bobGeo = new THREE.SphereGeometry(0.17, 18, 14);
    this.bobberMat = toonMaterial({ color: 0xff3b3b, emissive: 0x2a0000 });
    this.bobber = new THREE.Mesh(bobGeo, this.bobberMat);
    this.bobber.visible = false;
    this.scene.add(this.bobber);

    this.capMat = toonMaterial({ color: 0xffffff });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), this.capMat);
    cap.position.y = 0.11;
    this.bobber.add(cap);

    this.rainbow = false;

    /* Fishing line */
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.line = new THREE.Line(
      this.lineGeo,
      new THREE.LineBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.85 })
    );
    this.line.visible = false;
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    /* Splash ring */
    this.splash = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.3, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.splash.rotation.x = -Math.PI / 2;
    this.splash.visible = false;
    this.scene.add(this.splash);

    this.castT = 0;
    this.castDur = 0.7;
    this.castFrom = new THREE.Vector3();
    this.castTo = new THREE.Vector3();

    /* Minigame state */
    this.indicator = 0;
    this.targetStart = TARGET_START;
    this.targetWidth = TARGET_WIDTH;
    this.inZone = 0;
    this.targetTime = 5;
    this.rarity = 'common';
  }

  /* ----------------------------- Casting ----------------------------- */

  cast(avatar) {
    this.state = 'waiting';
    this.castT = 0;
    this.t = 0;

    _fwd.set(Math.sin(avatar.rotation.y), 0, Math.cos(avatar.rotation.y));

    /* Stable cast origin (the arm animation hasn't raised the rod yet). */
    this.castFrom.copy(avatar.position).addScaledVector(_fwd, 0.4);
    this.castFrom.y += 2.1;

    const target = avatar.position.clone().addScaledVector(_fwd, 12);
    target.y = SEA_LEVEL + 0.1;
    this.castTo.copy(target);

    this.bobber.position.copy(this.castFrom);
    this.bobber.visible = true;
    this.line.visible = true;
    this.splash.visible = false;
  }

  reset() {
    this.state = 'idle';
    this.bobber.visible = false;
    this.line.visible = false;
    this.splash.visible = false;
  }

  /** Apply a merchant bobber cosmetic. */
  setBobber(bobber) {
    if (!bobber) return;
    this.bobberMat.color.set(bobber.color);
    this.capMat.color.set(bobber.cap || '#ffffff');
    this.rainbow = !!bobber.rainbow;
    if (!this.rainbow) this.bobberMat.emissive.setHex(0x2a0000);
  }

  /* ---------------------------- Minigame ----------------------------- */

  beginMinigame(fish) {
    this.indicator = 0;
    this.inZone = 0;
    this.rarity = (fish && fish.rarity) || 'common';
    this.targetTime = this.rarity === 'rare' ? 15 : this.rarity === 'high' ? 10 : 5;
  }

  updateMinigame(dt, holding) {
    if (holding) this.indicator += PULL_SPEED * dt;
    else this.indicator -= FALL_SPEED * dt;
    this.indicator = Math.max(0, Math.min(1, this.indicator));

    const end = this.targetStart + this.targetWidth;
    const inTarget = this.indicator >= this.targetStart && this.indicator <= end;
    if (inTarget) this.inZone += dt;

    return {
      inTarget,
      progress: this.inZone / this.targetTime,
      done: this.inZone >= this.targetTime,
    };
  }

  /* ------------------------------ Frame ------------------------------ */

  update(dt, avatar, state) {
    if (!avatar || state === 'idle') {
      if (this.bobber.visible) this.reset();
      return;
    }

    this.state = state;
    this.t += dt;

    if (this.rainbow) {
      const hue = (this.t * 0.35) % 1;
      this.bobberMat.color.setHSL(hue, 0.85, 0.6);
      this.bobberMat.emissive.setHSL(hue, 0.85, 0.22);
      this.capMat.color.setHSL((hue + 0.5) % 1, 0.85, 0.7);
    }

    getRodTipWorld(avatar, _tip);

    if (this.castT < 1) {
      this.castT = Math.min(1, this.castT + dt / this.castDur);
      const e = 1 - Math.pow(1 - this.castT, 3);
      this.bobber.position.lerpVectors(this.castFrom, this.castTo, e);
      this.bobber.position.y += Math.sin(e * Math.PI) * 3.2;

      if (this.castT >= 1) {
        this.splash.visible = true;
        this.splash.position.set(this.bobber.position.x, SEA_LEVEL + 0.02, this.bobber.position.z);
      }
    } else {
      let dip = 0;
      if (state === 'hooked') dip = -Math.abs(Math.sin(this.t * 12)) * 0.18;
      else if (state === 'minigame') dip = Math.sin(this.t * 18) * 0.1;

      this.bobber.position.y = SEA_LEVEL + 0.1 + Math.sin(this.t * 2.4) * 0.06 + dip;

      if (this.splash.visible) {
        this.splash.position.set(this.bobber.position.x, SEA_LEVEL + 0.02, this.bobber.position.z);
        const s = 1 + Math.sin(this.t * 5) * 0.15;
        this.splash.scale.set(s, s, s);
        this.splash.material.opacity = 0.45 + Math.sin(this.t * 5) * 0.2;
      }
    }

    const pos = this.lineGeo.attributes.position;
    pos.setXYZ(0, _tip.x, _tip.y, _tip.z);
    pos.setXYZ(1, this.bobber.position.x, this.bobber.position.y, this.bobber.position.z);
    pos.needsUpdate = true;
    this.lineGeo.computeBoundingSphere();
  }
}
