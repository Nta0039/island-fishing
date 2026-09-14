import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part } from './toon.js';
import { SEA_LEVEL } from './world.js';

/* --------------------------- ship models --------------------------- */
/* All ships are built with the bow pointing towards +Z. */

function flattenBow(radius, length, squash) {
  const g = new THREE.ConeGeometry(radius, length, 4).toNonIndexed();
  g.rotateX(Math.PI / 2);      // apex -> +Z, base spans X and Y
  g.scale(1, squash, 1);
  return g;
}

function buildCargoGeo() {
  const parts = [
    part(new THREE.BoxGeometry(6.2, 2.6, 26), '#7a3b2e', { pos: [0, 1.5, 0] }),
    part(flattenBow(3.1, 6, 0.42), '#7a3b2e', { pos: [0, 1.5, 16] }),
    part(new THREE.BoxGeometry(6.2, 2.6, 1.6), '#6a3327', { pos: [0, 1.5, -13.6] }),
    part(new THREE.BoxGeometry(5.6, 0.3, 24), '#4a4f57', { pos: [0, 2.85, 0] }),
    part(new THREE.BoxGeometry(5.2, 4.2, 4.5), '#e8e4da', { pos: [0, 5.1, -8.5] }),
    part(new THREE.BoxGeometry(5.6, 0.4, 4.9), '#3b4048', { pos: [0, 7.4, -8.5] }),
    part(new THREE.BoxGeometry(5.0, 1.1, 0.2), '#2f5f8f', { pos: [0, 5.8, -6.2] }),
    part(new THREE.CylinderGeometry(0.9, 1.1, 3.4, 14), '#c0392b', { pos: [0, 7.1, -11.4] }),
  ];

  const crateColors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'];
  let k = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 5; col++) {
      for (let stack = 0; stack < 2; stack++) {
        parts.push(part(
          new THREE.BoxGeometry(1.7, 1.4, 2.9),
          crateColors[k % crateColors.length],
          { pos: [(row - 1) * 1.85, 3.75 + stack * 1.5, -4.5 + col * 3.2] }
        ));
        k++;
      }
    }
  }
  return mergeGeometries(parts, false);
}

function buildSailboatGeo() {
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(4.6, 0.1);
  sailShape.lineTo(0.5, 9.2);
  sailShape.lineTo(0, 9.2);
  sailShape.closePath();

  const jibShape = new THREE.Shape();
  jibShape.moveTo(0, 0);
  jibShape.lineTo(3.0, 0.1);
  jibShape.lineTo(0.35, 6.6);
  jibShape.lineTo(0, 6.6);
  jibShape.closePath();

  const main = new THREE.ShapeGeometry(sailShape, 4).toNonIndexed();
  main.rotateY(-Math.PI / 2);
  main.translate(0, 3.2, -2.4);
  tint(main, '#fbfaf4');

  const jib = new THREE.ShapeGeometry(jibShape, 4).toNonIndexed();
  jib.rotateY(-Math.PI / 2);
  jib.translate(0, 3.4, 1.1);
  tint(jib, '#f4f2e8');

  return mergeGeometries([
    part(new THREE.BoxGeometry(3.4, 1.8, 12), '#f2f2f0', { pos: [0, 0.95, 0] }),
    part(flattenBow(1.7, 3.6, 0.53), '#f2f2f0', { pos: [0, 0.95, 7.8] }),
    part(new THREE.BoxGeometry(3.0, 0.2, 10), '#c8b48a', { pos: [0, 1.9, 0] }),
    part(new THREE.BoxGeometry(1.9, 0.9, 3.2), '#e8e4da', { pos: [0, 2.45, -1.6] }),
    part(new THREE.CylinderGeometry(0.14, 0.18, 16, 10), '#d9c8a8', { pos: [0, 9.8, -0.6] }),
    part(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 8), '#c8b48a', { rot: [0, 0, Math.PI / 2], pos: [0, 4.4, -0.6] }),
    main,
    jib,
  ], false);
}

function buildYachtGeo() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(3.8, 2.0, 15), '#f6f7f9', { pos: [0, 1.05, 0] }),
    part(flattenBow(1.9, 4.0, 0.53), '#f6f7f9', { pos: [0, 1.05, 9.5] }),
    part(new THREE.BoxGeometry(3.4, 0.22, 13), '#d9dde3', { pos: [0, 2.1, 0] }),
    part(new THREE.BoxGeometry(2.9, 1.6, 6.2), '#eef1f5', { pos: [0, 2.95, -1.6] }),
    part(new THREE.BoxGeometry(2.95, 0.5, 5.8), '#2f5f8f', { pos: [0, 3.2, -1.6] }),
    part(new THREE.BoxGeometry(2.4, 1.3, 3.6), '#eef1f5', { pos: [0, 4.4, -2.7] }),
    part(new THREE.BoxGeometry(2.45, 0.42, 3.3), '#2f5f8f', { pos: [0, 4.6, -2.7] }),
    part(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), '#c8ccd2', { pos: [0, 6.2, -3.4] }),
    part(new THREE.BoxGeometry(2.6, 0.14, 3.0), '#eef1f5', { pos: [0, 5.0, 3.6] }),
  ], false);
}

function makeWakeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(128, 1);
  ctx.lineTo(128, 63);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/* --------------------------- traffic system --------------------------- */

const TYPES = [
  { key: 'cargo', geo: buildCargoGeo, scale: 1.35, length: 32, speed: [1.1, 2.0] },
  { key: 'sail', geo: buildSailboatGeo, scale: 1.15, length: 17, speed: [1.6, 2.8] },
  { key: 'yacht', geo: buildYachtGeo, scale: 1.15, length: 19, speed: [2.2, 3.6] },
];

export function createShips(scene, count = 8) {
  const wakeTex = makeWakeTexture();
  const wakeMat = new THREE.MeshBasicMaterial({
    map: wakeTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });

  const kinds = TYPES.map((t) => ({
    ...t,
    geometry: t.geo(),
    material: toonMaterial({ vertexColors: true }),
  }));

  const ships = [];

  function buildShip() {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const group = new THREE.Group();

    const hull = new THREE.Mesh(kind.geometry, kind.material);
    hull.scale.setScalar(kind.scale);
    hull.castShadow = false;
    hull.receiveShadow = false;
    group.add(hull);

    /* Foam wake trailing behind the stern. */
    const wakeLen = kind.length * 2.4;
    const wakeGeo = new THREE.PlaneGeometry(1, 1);
    wakeGeo.rotateX(-Math.PI / 2);
    wakeGeo.rotateY(Math.PI / 2);
    const wake = new THREE.Mesh(wakeGeo, wakeMat);
    wake.scale.set(wakeLen, 1, kind.length * 0.5);
    wake.position.set(0, 0.06, -kind.length * 0.5 - wakeLen * 0.5);
    group.add(wake);

    scene.add(group);
    return { group, kind };
  }

  function place(s) {
    s.radius = 280 + Math.random() * 200;
    s.angle = Math.random() * Math.PI * 2;
    s.dirSign = Math.random() < 0.5 ? 1 : -1;
    const [lo, hi] = s.kind.speed;
    s.speed = lo + Math.random() * (hi - lo);
    s.phase = Math.random() * Math.PI * 2;
  }

  for (let i = 0; i < count; i++) {
    const s = buildShip();
    place(s);
    ships.push(s);
  }

  const _dir = new THREE.Vector3();

  function update(dt, elapsed) {
    for (const s of ships) {
      s.angle += (s.speed / s.radius) * s.dirSign * dt;

      const x = Math.cos(s.angle) * s.radius;
      const z = Math.sin(s.angle) * s.radius;
      s.group.position.set(
        x,
        SEA_LEVEL + 0.15 + Math.sin(elapsed * 0.8 + s.phase) * 0.22,
        z
      );

      _dir.set(-Math.sin(s.angle) * s.dirSign, 0, Math.cos(s.angle) * s.dirSign);
      s.group.rotation.y = Math.atan2(_dir.x, _dir.z);
      s.group.rotation.z = Math.sin(elapsed * 0.7 + s.phase) * 0.028;
      s.group.rotation.x = Math.sin(elapsed * 1.1 + s.phase * 1.7) * 0.016;
    }
  }

  return { update, ships };
}
