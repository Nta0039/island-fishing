import * as THREE from 'three';
import { createAvatar, applyRod, updateAvatar } from './avatar.js';
import { toonMaterial } from './toon.js';

/**
 * A small, self-contained 3D turntable of the player, shown beside the
 * merchant's shop list. It owns its own canvas, renderer and lights so it
 * never touches the main scene, and it only draws while the shop is open.
 *
 * The avatar is built facing +z with the camera in front of it, so it looks
 * straight down the lens. Selecting a rod re-skins the rod it is holding;
 * selecting a bobber floats a rigged bobber beside it.
 */
export function createShopPreview() {
  const canvas = document.getElementById('shop-preview');
  if (!canvas) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 1.95, 5.7);
  camera.lookAt(0, 1.9, 0);

  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x2a3a4a, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(2.5, 5.5, 4.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb8ff, 0.9);
  rim.position.set(-3.5, 3, -2.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffe0b0, 0.4);
  fill.position.set(-2, 1.5, 4);
  scene.add(fill);

  /* A plinth so the character is not floating in a void. */
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.2, 0.16, 40),
    toonMaterial({ color: 0x21384f })
  );
  plinth.position.y = -0.08;
  scene.add(plinth);

  let avatar = null;
  let currentColor = null;

  function buildAvatar(color) {
    if (avatar) scene.remove(avatar);
    avatar = createAvatar(color, '', true);
    /* No floating name tag or hook mark in a shop window. */
    avatar.traverse((o) => { if (o.isSprite) o.visible = false; });
    scene.add(avatar);
  }

  /* A rigged bobber, floated beside the player when a bobber is previewed. */
  const bobber = new THREE.Group();
  const bobberMat = toonMaterial({ color: 0xff3b3b });
  const bobberCapMat = toonMaterial({ color: 0xffffff });
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), bobberMat));
  const bobberCap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12), bobberCapMat);
  bobberCap.position.y = 0.11;
  bobber.add(bobberCap);
  const bobberPeg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8),
    toonMaterial({ color: 0x222222 })
  );
  bobberPeg.position.y = 0.2;
  bobber.add(bobberPeg);
  bobber.position.set(0.98, 1.15, 0.3);
  bobber.visible = false;
  scene.add(bobber);

  const label = document.getElementById('trade-preview-label');
  let t = 0;

  function resize() {
    const w = canvas.clientWidth || 260;
    const h = canvas.clientHeight || 320;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    /** Rebuilds the model only when the outfit colour actually changes. */
    setColor(color) {
      const c = color || '#4dabf7';
      if (avatar && currentColor === c) return;
      currentColor = c;
      buildAvatar(c);
    },
    /** Show a rod in the player's hand. */
    showRod(rod) {
      if (!avatar || !rod) return;
      applyRod(avatar, rod);
      if (label) label.textContent = rod.name;
    },
    /** Float a bobber beside the player; pass null to hide it. */
    showBobber(bob) {
      if (!bob) { bobber.visible = false; return; }
      bobberMat.color.set(bob.color || '#ff3b3b');
      bobberCapMat.color.set(bob.cap || '#ffffff');
      bobber.visible = true;
      if (label) label.textContent = bob.name;
    },
    setLabel(text) { if (label) label.textContent = text || ''; },
    resize,
    render(dt) {
      if (!avatar) return;
      const step = Math.min(dt, 0.05);
      t += step;
      updateAvatar(avatar, step, false, 'idle', false, false);
      bobber.rotation.y += step * 1.1;
      bobber.position.y = 1.15 + Math.sin(t * 1.8) * 0.05;
      renderer.render(scene, camera);
    },
  };
}
