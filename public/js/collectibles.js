import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part } from './toon.js';
import { surfaceHeight } from './world.js';

/* ----------------------------- models ----------------------------- */

function armBlade(radius, len, flatten, angle, dist, y, color) {
  const g = new THREE.ConeGeometry(radius, len, 7).toNonIndexed();
  g.rotateX(Math.PI / 2);
  g.scale(1, flatten, 1);
  g.rotateY(angle);
  g.translate(Math.sin(angle) * dist, y, Math.cos(angle) * dist);
  tint(g, color);
  return g;
}

function buildStarfish() {
  const parts = [];
  const N = 5;
  parts.push(part(new THREE.SphereGeometry(0.11, 14, 10), '#ff7f50', {
    scale: [1.05, 0.5, 1.05],
    pos: [0, 0.055, 0],
  }));
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    parts.push(armBlade(0.072, 0.28, 0.5, a, 0.135, 0.05, i % 2 ? '#ff8a5c' : '#ff9f70'));
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const d of [0.14, 0.22]) {
      parts.push(part(new THREE.SphereGeometry(0.028, 8, 6), '#ffd0b0', {
        pos: [Math.sin(a) * d, 0.085, Math.cos(a) * d],
      }));
    }
  }
  return mergeGeometries(parts, false);
}

/** Crab body (shell, eyes, claws). Legs are separate so they can scuttle. */
function buildCrabBody() {
  const parts = [];
  const body = '#e05a47';
  const bodyLight = '#f2836f';
  const dark = '#b03a2a';
  const deep = '#8c2b1e';

  /* Carapace: a broad flattened shell, well subdivided, with a paler top
     plate, a dark under-rim and a couple of raised bumps. */
  parts.push(part(new THREE.SphereGeometry(0.16, 26, 20), body, {
    scale: [1.42, 0.66, 1.06],
    pos: [0, 0.13, 0],
  }));
  parts.push(part(new THREE.SphereGeometry(0.15, 24, 18), bodyLight, {
    scale: [1.28, 0.42, 0.94],
    pos: [0, 0.2, 0],
  }));
  parts.push(part(new THREE.SphereGeometry(0.145, 24, 16), dark, {
    scale: [1.34, 0.3, 1.0],
    pos: [0, 0.045, 0],
  }));
  for (const sx of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(0.045, 12, 10), bodyLight, {
      scale: [1, 0.72, 1],
      pos: [sx * 0.075, 0.205, -0.03],
    }));
  }
  /* The little notch between the eyes. */
  parts.push(part(new THREE.BoxGeometry(0.075, 0.03, 0.05), deep, { pos: [0, 0.19, 0.155] }));

  for (const sx of [-1, 1]) {
    /* Eye stalks with a dark ball, a glint and a brow ridge. */
    parts.push(part(new THREE.CylinderGeometry(0.017, 0.023, 0.12, 9), body, {
      pos: [sx * 0.07, 0.23, 0.14],
    }));
    parts.push(part(new THREE.SphereGeometry(0.038, 14, 12), '#2b3038', {
      pos: [sx * 0.07, 0.3, 0.15],
    }));
    parts.push(part(new THREE.SphereGeometry(0.017, 8, 6), '#ffffff', {
      pos: [sx * 0.078, 0.312, 0.177],
    }));
    parts.push(part(new THREE.SphereGeometry(0.043, 12, 8), dark, {
      scale: [1, 0.5, 1],
      pos: [sx * 0.07, 0.326, 0.14],
    }));

    /* Upper arm, elbow, forearm, then a proper two-jawed pincer. */
    parts.push(part(new THREE.CylinderGeometry(0.032, 0.043, 0.2, 10), body, {
      rot: [0, 0, sx * 0.95],
      pos: [sx * 0.22, 0.15, 0.14],
    }));
    parts.push(part(new THREE.SphereGeometry(0.038, 12, 10), dark, {
      pos: [sx * 0.3, 0.1, 0.17],
    }));
    parts.push(part(new THREE.CylinderGeometry(0.038, 0.05, 0.17, 10), body, {
      rot: [0, 0, sx * 1.5],
      pos: [sx * 0.38, 0.13, 0.2],
    }));
    parts.push(part(new THREE.SphereGeometry(0.072, 16, 12), body, {
      scale: [1.5, 0.85, 0.8],
      pos: [sx * 0.48, 0.13, 0.23],
    }));
    /* Fixed lower jaw and the hinged upper one above it. */
    parts.push(part(new THREE.ConeGeometry(0.032, 0.16, 10), dark, {
      rot: [0, 0, -sx * 1.35],
      pos: [sx * 0.6, 0.115, 0.27],
    }));
    parts.push(part(new THREE.ConeGeometry(0.027, 0.13, 10), dark, {
      rot: [0, 0, -sx * 1.95],
      pos: [sx * 0.575, 0.175, 0.27],
    }));
  }
  return mergeGeometries(parts, false);
}

function buildCrabLegs(side) {
  const parts = [];
  const dark = '#b03a2a';
  const deep = '#8c2b1e';

  for (let i = 0; i < 4; i++) {
    const z = 0.09 - i * 0.09;
    const spread = 1.5 + i * 0.11;

    /* Femur, angled out from the body. */
    const femur = new THREE.CylinderGeometry(0.017, 0.025, 0.2, 7).toNonIndexed();
    femur.translate(0, 0.1, 0);
    femur.rotateZ(-side * spread);
    femur.translate(side * 0.17, 0.11, z);
    tint(femur, dark);
    parts.push(femur);

    /* Knee. */
    const knee = new THREE.SphereGeometry(0.025, 8, 6).toNonIndexed();
    knee.translate(side * 0.345, 0.075, z);
    tint(knee, deep);
    parts.push(knee);

    /* Tibia, bending down to the sand. */
    const tibia = new THREE.CylinderGeometry(0.011, 0.02, 0.19, 6).toNonIndexed();
    tibia.translate(0, 0.095, 0);
    tibia.rotateZ(-side * 2.35);
    tibia.translate(side * 0.355, 0.07, z);
    tint(tibia, dark);
    parts.push(tibia);

    /* Pointed tip. */
    const tip = new THREE.ConeGeometry(0.016, 0.055, 6).toNonIndexed();
    tip.rotateZ(-side * Math.PI / 2);
    tip.translate(side * 0.53, 0.026, z);
    tint(tip, deep);
    parts.push(tip);
  }
  return mergeGeometries(parts, false);
}

function buildConch() {
  const parts = [];
  const shell = '#ffd9b3';
  const shellDark = '#e8b083';
  const lip = '#fff0dd';

  const steps = 11;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = 0.145 * (1 - 0.78 * t);
    const a = t * Math.PI * 2.6;
    const spin = 0.115 * (1 - 0.55 * t);
    parts.push(part(new THREE.SphereGeometry(r, 12, 10), i % 2 ? shell : shellDark, {
      pos: [Math.cos(a) * spin, 0.09 + t * 0.34, Math.sin(a) * spin],
    }));
  }

  const mouth = new THREE.ConeGeometry(0.2, 0.3, 14, 1, true).toNonIndexed();
  mouth.rotateX(1.25);
  mouth.translate(0, 0.12, 0.02);
  tint(mouth, lip);
  parts.push(mouth);

  const rim = new THREE.TorusGeometry(0.17, 0.035, 8, 20, Math.PI * 1.35).toNonIndexed();
  rim.rotateX(Math.PI / 2);
  rim.rotateY(-0.4);
  rim.translate(0, 0.1, 0.05);
  tint(rim, '#f7c9a0');
  parts.push(rim);

  return mergeGeometries(parts, false);
}

function buildSeashell() {
  const parts = [];
  const base = '#f7e3d0';
  const ridge = '#e0bda0';

  const fan = new THREE.SphereGeometry(0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  fan.scale(1, 0.45, 1);
  fan.rotateX(-0.35);
  fan.translate(0, 0.05, 0);
  tint(fan, base);
  parts.push(fan);

  for (let i = 0; i < 7; i++) {
    const a = -0.85 + (i / 6) * 1.7;
    const g = new THREE.BoxGeometry(0.016, 0.02, 0.15).toNonIndexed();
    g.rotateX(-0.35);
    g.rotateY(a);
    g.translate(Math.sin(a) * 0.085, 0.055, Math.cos(a) * 0.085);
    tint(g, ridge);
    parts.push(g);
  }

  parts.push(part(new THREE.SphereGeometry(0.055, 12, 10), ridge, {
    scale: [1.4, 0.8, 1],
    pos: [0, 0.045, -0.13],
  }));

  return mergeGeometries(parts, false);
}

/** A fallen coconut: husk, fibrous ridges, three eyes and a stem scar. */
function buildCoconut() {
  const parts = [];
  const husk = '#8a5a33';
  const huskDark = '#6b4426';

  parts.push(part(new THREE.SphereGeometry(0.25, 20, 16), husk, { scale: [1, 1.1, 0.95] }));

  for (let i = 0; i < 3; i++) {
    const g = new THREE.TorusGeometry(0.243, 0.022, 5, 20).toNonIndexed();
    g.rotateX(Math.PI / 2);
    g.rotateY(i * 0.7);
    g.rotateZ(0.35 - i * 0.3);
    tint(g, huskDark);
    parts.push(g);
  }

  /* The three germination pores. */
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(part(new THREE.SphereGeometry(0.045, 8, 6), '#3a2415', {
      pos: [Math.sin(a) * 0.085, 0.24, Math.cos(a) * 0.085],
    }));
  }

  parts.push(part(new THREE.CylinderGeometry(0.028, 0.05, 0.1, 8), '#5a3a20', { pos: [0, 0.29, 0] }));

  return mergeGeometries(parts, false);
}

/* ------------------------- type definitions ------------------------- */

const TYPES = {
  starfish: { build: buildStarfish, crawls: false },
  seashell: { build: buildSeashell, crawls: false },
  conch: { build: buildConch, crawls: false },
  coconut: { build: buildCoconut, crawls: false },
  crab: { build: () => ({ body: buildCrabBody(), legsL: buildCrabLegs(-1), legsR: buildCrabLegs(1) }), crawls: true },
};

/* --------------------------- live manager --------------------------- */

const CRAWL_RADIUS = 1.5;
const CRAWL_SPEED = 0.32;

export function createCollectibles(scene) {
  /* Build each model once and measure how far it must be lifted so its
     lowest vertex rests exactly on the sand. */
  const geometries = {};
  const restOffsets = {};

  for (const [type, def] of Object.entries(TYPES)) {
    const built = def.build();
    geometries[type] = built;

    const geos = built.isBufferGeometry
      ? [built]
      : [built.body, built.legsL, built.legsR];

    let minY = Infinity;
    for (const g of geos) {
      g.computeBoundingBox();
      minY = Math.min(minY, g.boundingBox.min.y);
    }
    restOffsets[type] = -minY;
  }

  const material = toonMaterial({ vertexColors: true });

  const ringGeo = new THREE.RingGeometry(0.3, 0.42, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const live = new Map();

  function make(item) {
    const def = TYPES[item.type] || TYPES.starfish;
    const built = geometries[item.type] || geometries.starfish;
    const restY = restOffsets[item.type] || 0;

    const group = new THREE.Group();
    const record = { group, restY, type: item.type, crawls: def.crawls };

    if (built.isBufferGeometry) {
      const mesh = new THREE.Mesh(built, material);
      mesh.position.y = restY;
      mesh.castShadow = true;
      group.add(mesh);
    } else {
      const body = new THREE.Mesh(built.body, material);
      body.position.y = restY;
      body.castShadow = true;
      group.add(body);
      record.body = body;

      record.legs = [];
      for (const lg of [built.legsL, built.legsR]) {
        const m = new THREE.Mesh(lg, material);
        m.position.y = restY;
        m.castShadow = true;
        group.add(m);
        record.legs.push(m);
      }
    }

    /* Each gets its own ring material so the glow can pulse alone. */
    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    ring.position.y = 0.015;
    group.add(ring);
    record.ring = ring;

    const y = Number.isFinite(item.y) ? item.y : surfaceHeight(item.x, item.z);
    group.position.set(item.x, y, item.z);
    group.scale.setScalar(1.35);
    scene.add(group);

    record.x = item.x;
    record.z = item.z;
    record.homeX = item.x;
    record.homeZ = item.z;
    record.phase = Math.random() * Math.PI * 2;

    if (def.crawls) {
      record.targetX = item.x;
      record.targetZ = item.z;
      record.crawlTimer = Math.random() * 3;
      record.scuttle = Math.random() * 6;
      record.speed = CRAWL_SPEED * (0.7 + Math.random() * 0.7);
      record.yaw = Math.random() * Math.PI * 2;
      group.rotation.y = record.yaw;
    }

    live.set(item.id, record);
  }

  function remove(id) {
    const it = live.get(id);
    if (!it) return;
    scene.remove(it.group);
    live.delete(id);
  }

  const lerpAngle = (a, b, t) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };

  return {
    setList(list) {
      for (const id of [...live.keys()]) remove(id);
      for (const item of list) make(item);
    },
    add(item) {
      if (!live.has(item.id)) make(item);
    },
    remove,

    nearest(x, z, maxDist) {
      let best = null;
      let bestD = maxDist * maxDist;
      for (const [id, it] of live) {
        const dx = x - it.x;
        const dz = z - it.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = { id, type: it.type, x: it.x, z: it.z };
        }
      }
      return best;
    },

    update(dt, elapsed) {
      for (const it of live.values()) {
        if (it.crawls) {
          /* --- crabs crawl slowly across the sand --- */
          it.crawlTimer -= dt;

          const dx = it.targetX - it.group.position.x;
          const dz = it.targetZ - it.group.position.z;
          const dist = Math.hypot(dx, dz);

          if (dist < 0.12 || it.crawlTimer <= 0) {
            const a = Math.random() * Math.PI * 2;
            const r = 0.4 + Math.random() * CRAWL_RADIUS;
            it.targetX = it.homeX + Math.cos(a) * r;
            it.targetZ = it.homeZ + Math.sin(a) * r;
            it.crawlTimer = 2.5 + Math.random() * 4;
          }

          if (dist > 0.02) {
            const step = Math.min(it.speed * dt, dist);
            const nx = it.group.position.x + (dx / dist) * step;
            const nz = it.group.position.z + (dz / dist) * step;

            it.group.position.x = nx;
            it.group.position.z = nz;
            it.group.position.y = surfaceHeight(nx, nz);

            it.yaw = lerpAngle(it.yaw, Math.atan2(dx, dz), 1 - Math.pow(0.002, dt));
            it.group.rotation.y = it.yaw;

            /* Leg scuttle + a small body bob. */
            it.scuttle += dt * 11;
            const s = Math.sin(it.scuttle);
            it.body.position.y = it.restY + Math.abs(s) * 0.02;
            it.legs[0].rotation.z = s * 0.3;
            it.legs[1].rotation.z = -s * 0.3;
          } else {
            it.legs[0].rotation.z *= 0.9;
            it.legs[1].rotation.z *= 0.9;
          }

          it.x = it.group.position.x;
          it.z = it.group.position.z;
        }

        /* Ground items simply lie there — no spinning, no floating. */
        const pulse = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 2.6 + it.phase));
        it.ring.material.opacity = pulse;
        const s = 0.92 + 0.1 * Math.sin(elapsed * 2.6 + it.phase);
        it.ring.scale.set(s, 1, s);
      }
    },

    get count() {
      return live.size;
    },
  };
}
