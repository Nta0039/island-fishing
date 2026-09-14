import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part, applyWind } from './toon.js';
import { groundHeight, SEA_LEVEL } from './world.js';

/* ------------------------------ corals ------------------------------ */

function buildStaghorn(rng) {
  const parts = [];
  const palette = ['#ff7f9e', '#ff9f68', '#e05a8a', '#ff8fa8'];

  const base = new THREE.CylinderGeometry(0.13, 0.22, 0.28, 9).toNonIndexed();
  base.translate(0, 0.14, 0);
  tint(base, '#c26a8a');
  parts.push(base);

  const branches = 8;
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rng() * 0.5;
    const h = 0.7 + rng() * 0.8;
    const g = new THREE.CylinderGeometry(0.028, 0.08, h, 6).toNonIndexed();
    g.translate(0, h / 2, 0);
    g.rotateZ(-(0.30 + rng() * 0.4));
    g.rotateY(a);
    g.translate(Math.cos(a) * 0.06, 0.24, Math.sin(a) * 0.06);
    tint(g, palette[i % palette.length]);
    parts.push(g);

    /* A little fork on top of the taller branches. */
    if (h > 1.1) {
      const f = new THREE.CylinderGeometry(0.02, 0.045, 0.34, 5).toNonIndexed();
      f.translate(0, 0.17, 0);
      f.rotateZ(-(0.7 + rng() * 0.5));
      f.rotateY(a + 0.6);
      f.translate(Math.cos(a) * 0.4, 0.24 + h * 0.85, Math.sin(a) * 0.4);
      tint(f, palette[(i + 1) % palette.length]);
      parts.push(f);
    }
  }
  return mergeGeometries(parts, false);
}

function buildBrain(rng) {
  const parts = [];

  const dome = new THREE.SphereGeometry(0.56, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  dome.scale(1, 0.78, 1.12);
  tint(dome, '#d9a05b');
  parts.push(dome);

  for (let i = 0; i < 5; i++) {
    const r = 0.12 + i * 0.11;
    const g = new THREE.TorusGeometry(r, 0.032, 6, 22).toNonIndexed();
    g.rotateX(Math.PI / 2);
    g.scale(1, 1, 1.12);
    g.translate((rng() - 0.5) * 0.04, 0.42 - i * 0.035, 0);
    tint(g, '#b8834a');
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

function buildFan(rng) {
  const parts = [];

  const stem = new THREE.CylinderGeometry(0.05, 0.09, 0.36, 7).toNonIndexed();
  stem.translate(0, 0.18, 0);
  tint(stem, '#8a5a6a');
  parts.push(stem);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, 0.66, Math.PI * 0.16, Math.PI * 0.84, false);
  shape.lineTo(0, 0);
  const fan = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false, curveSegments: 10 });
  fan.translate(0, 0.34, -0.017);
  tint(fan, '#ff8fa8');
  parts.push(fan);

  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.2 + (i / 5) * 0.6);
    const rib = new THREE.BoxGeometry(0.62, 0.022, 0.05).toNonIndexed();
    rib.translate(0.31, 0, 0);   // grow outward from the hinge
    rib.rotateZ(a);              // radiate to match the arc
    rib.translate(0, 0.36, 0);
    tint(rib, '#e86f92');
    parts.push(rib);
  }
  return mergeGeometries(parts, false);
}

function buildSponge(rng) {
  const parts = [];
  const n = 4 + Math.floor(rng() * 3);
  const palette = ['#c46ad0', '#a85ac0', '#d47fe0'];

  for (let i = 0; i < n; i++) {
    const h = 0.5 + rng() * 0.75;
    const r = 0.085 + rng() * 0.06;
    const ox = (rng() - 0.5) * 0.34;
    const oz = (rng() - 0.5) * 0.34;

    const tube = new THREE.CylinderGeometry(r, r * 0.7, h, 11, 1, true).toNonIndexed();
    tube.translate(ox, h / 2, oz);
    tint(tube, palette[i % palette.length]);
    parts.push(tube);

    const mouth = new THREE.CircleGeometry(r * 0.72, 11).toNonIndexed();
    mouth.rotateX(-Math.PI / 2);
    mouth.translate(ox, h - 0.005, oz);
    tint(mouth, '#2a1030');
    parts.push(mouth);
  }
  return mergeGeometries(parts, false);
}

function buildSeaweed(rng) {
  const parts = [];
  const blades = 5 + Math.floor(rng() * 4);
  const palette = ['#3f8f5a', '#4fa86a', '#357a4c'];

  for (let i = 0; i < blades; i++) {
    const h = 0.7 + rng() * 0.9;
    const a = rng() * Math.PI * 2;
    const g = new THREE.BoxGeometry(0.09, h, 0.022).toNonIndexed();
    g.translate(0, h / 2, 0);
    g.rotateZ((rng() - 0.5) * 0.5);
    g.rotateY(a);
    g.translate((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
    tint(g, palette[i % palette.length]);
    parts.push(g);
  }
  return mergeGeometries(parts, false);
}

/* -------------------------------- fish -------------------------------- */

function buildFishGeo(color) {
  return mergeGeometries([
    part(new THREE.SphereGeometry(0.14, 12, 10), color, { scale: [0.62, 0.88, 1.7] }),
    part(new THREE.ConeGeometry(0.11, 0.17, 6), color, {
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 1, 0.35],
      pos: [0, 0, -0.3],
    }),
    part(new THREE.ConeGeometry(0.05, 0.13, 5), color, {
      rot: [-0.5, 0, 0],
      scale: [1, 1, 0.3],
      pos: [0, 0.13, -0.02],
    }),
    part(new THREE.ConeGeometry(0.035, 0.1, 5), color, {
      rot: [0, 0, Math.PI / 2],
      scale: [1, 1, 0.4],
      pos: [0.13, -0.03, 0.05],
    }),
    part(new THREE.ConeGeometry(0.035, 0.1, 5), color, {
      rot: [0, 0, -Math.PI / 2],
      scale: [1, 1, 0.4],
      pos: [-0.13, -0.03, 0.05],
    }),
  ], false);
}

/* ------------------------------ placement ------------------------------ */

/** Bisect the height field for a point at a given water depth. */
function shallowPoint(angle, depth) {
  const target = SEA_LEVEL - depth;
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 46; i++) {
    const mid = (lo + hi) / 2;
    if (groundHeight(Math.cos(angle) * mid, Math.sin(angle) * mid) > target) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, r };
}

/** Radius at which the seabed crosses sea level, for a given bearing. */
function waterlineRadius(angle) {
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 46; i++) {
    const mid = (lo + hi) / 2;
    if (groundHeight(Math.cos(angle) * mid, Math.sin(angle) * mid) > SEA_LEVEL) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function createReef(scene, rng = Math.random) {
  const coralMat = toonMaterial({ vertexColors: true });
  const weedMat = toonMaterial({ vertexColors: true, side: THREE.DoubleSide });
  applyWind(weedMat, { strength: 2.2, bend: 1.4, scale: 0.03 });

  const fishColors = ['#ffd166', '#ff8a5c', '#4dd4ff', '#ff6b9d', '#8fe36b'];
  const fishGeos = fishColors.map((c) => buildFishGeo(c));
  const fishMat = toonMaterial({ vertexColors: true });

  const group = new THREE.Group();
  scene.add(group);

  const schools = [];
  const clusters = [];

  const CLUSTERS = 30;
  for (let i = 0; i < CLUSTERS; i++) {
    const angle = (i / CLUSTERS) * Math.PI * 2 + rng() * 0.3;

    const cluster = new THREE.Group();
    cluster.rotation.y = rng() * Math.PI * 2;

    const pieces = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < pieces; k++) {
      const roll = rng();
      let geo;
      let mat = coralMat;
      if (roll < 0.3) geo = buildStaghorn(rng);
      else if (roll < 0.52) geo = buildBrain(rng);
      else if (roll < 0.72) geo = buildFan(rng);
      else if (roll < 0.88) geo = buildSponge(rng);
      else { geo = buildSeaweed(rng); mat = weedMat; }

      const m = new THREE.Mesh(geo, mat);
      m.position.set((rng() - 0.5) * 1.1, 0, (rng() - 0.5) * 1.1);
      m.rotation.y = rng() * Math.PI * 2;
      m.scale.setScalar(0.7 + rng() * 0.5);
      cluster.add(m);
    }

    /* Measure at unit scale, then pick a shallow berth close to the sand
       and shrink the cluster to whatever headroom that depth allows. A
       tall garden simply sits a little further out; a squat one hugs the
       beach. Either way the tallest tip clears a wave crest with room to
       spare, so the whole reef stays visible under clear shallow water. */
    cluster.updateMatrixWorld(true);
    const unitTop = new THREE.Box3().setFromObject(cluster).max.y;

    const depth = 2.0 + rng() * 1.8;
    const p = shallowPoint(angle, depth);
    const seabed = groundHeight(p.x, p.z);
    const headroom = (SEA_LEVEL - 0.70) - seabed;

    const fit = Math.min(2.0, (headroom / Math.max(unitTop, 0.001)) * (0.80 + rng() * 0.22));
    cluster.scale.setScalar(fit);
    cluster.position.set(p.x, seabed, p.z);
    group.add(cluster);
    clusters.push(cluster);

    /* Roughly every other reef hosts a school of little fish. */
    if (i % 2 === 0) {
      const count = 4 + Math.floor(rng() * 5);
      const fish = [];
      for (let k = 0; k < count; k++) {
        const mesh = new THREE.Mesh(fishGeos[Math.floor(rng() * fishGeos.length)], fishMat);
        mesh.scale.setScalar(0.7 + rng() * 0.7);
        group.add(mesh);
        fish.push({
          mesh,
          radius: 0.7 + rng() * 1.2,
          height: 0.35 + rng() * 1.1,
          phase: rng() * Math.PI * 2,
          speed: 0.5 + rng() * 0.5,
          wobble: 1.5 + rng() * 2,
        });
      }
      schools.push({ x: p.x, z: p.z, y: seabed, fish, t: rng() * 10 });
    }
  }

  /* Place every fish once up front so nothing sits at the origin on the
     first frame; update() then just advances the same maths. */
  function stepFish(dt) {
    for (const s of schools) {
      s.t += dt;
      for (const f of s.fish) {
        const a = s.t * f.speed + f.phase;
        const x = s.x + Math.cos(a) * f.radius;
        const z = s.z + Math.sin(a) * f.radius;
        /* Clamp so a fish never breaks the surface either. */
        const y = Math.min(
          s.y + f.height + Math.sin(s.t * f.wobble + f.phase) * 0.12,
          SEA_LEVEL - 0.5
        );

        f.mesh.position.set(x, y, z);
        f.mesh.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
        f.mesh.rotation.z = Math.sin(s.t * f.wobble * 1.6 + f.phase) * 0.22;
        f.mesh.rotation.x = Math.cos(s.t * f.wobble + f.phase) * 0.1;
      }
    }
  }

  stepFish(0);

  return {
    update(dt) {
      stepFish(dt);
    },
    get schoolCount() {
      return schools.length;
    },
    get fishCount() {
      return schools.reduce((n, s) => n + s.fish.length, 0);
    },
    get fishMeshes() {
      return schools.flatMap((s) => s.fish.map((f) => f.mesh));
    },
    get clusters() {
      return clusters;
    },
  };
}
