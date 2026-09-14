import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part } from './toon.js';
import { SEA_LEVEL } from './world.js';

/* --------------------------- models --------------------------- */
/* Built with the head pointing towards +Z. */

function finGeo(len, width, thickness, color) {
  const g = new THREE.ConeGeometry(width, len, 6).toNonIndexed();
  g.rotateX(Math.PI / 2);
  g.scale(1, thickness, 1);
  tint(g, color);
  return g;
}

function buildWhaleGeo() {
  const back = '#37485b';
  const belly = '#93a7ba';
  const fin = '#2c3a4a';

  const parts = [
    /* Main body */
    part(new THREE.SphereGeometry(2.0, 22, 16), back, { scale: [0.86, 0.8, 2.9] }),
    /* Head */
    part(new THREE.SphereGeometry(1.72, 20, 14), back, { scale: [0.92, 0.82, 1.25], pos: [0, -0.06, 2.4] }),
    /* Pale throat grooves */
    part(new THREE.SphereGeometry(1.6, 18, 12), belly, { scale: [0.9, 0.55, 1.3], pos: [0, -0.75, 2.1] }),
    /* Tail stock */
    part(new THREE.ConeGeometry(1.05, 4.6, 14), back, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0.15, -5.2] }),
    /* Dorsal fin */
    part(new THREE.ConeGeometry(0.42, 1.5, 8), fin, { scale: [1, 1, 0.35], rot: [-0.45, 0, 0], pos: [0, 1.35, -2.6] }),
    /* Blowhole mound */
    part(new THREE.CylinderGeometry(0.28, 0.34, 0.26, 12), fin, { pos: [0, 1.5, 1.9] }),
  ];

  /* Horizontal tail flukes. */
  for (const sx of [-1, 1]) {
    const fluke = new THREE.ConeGeometry(0.85, 2.5, 7).toNonIndexed();
    fluke.rotateX(Math.PI / 2);
    fluke.scale(1, 0.16, 1);
    fluke.rotateY(sx * 1.05);
    fluke.translate(sx * 1.0, 0.1, -6.8);
    tint(fluke, fin);
    parts.push(fluke);
  }

  /* Pectoral fins. */
  for (const sx of [-1, 1]) {
    const pec = new THREE.ConeGeometry(0.62, 2.0, 7).toNonIndexed();
    pec.rotateX(Math.PI / 2);
    pec.scale(1, 0.18, 1);
    pec.rotateZ(sx * 0.45);
    pec.rotateY(sx * 1.25);
    pec.translate(sx * 1.7, -0.5, 1.6);
    tint(pec, fin);
    parts.push(pec);
  }

  return mergeGeometries(parts, false);
}

function buildDolphinGeo() {
  const top = '#5f7f9c';
  const belly = '#d3dee8';
  const fin = '#4a6780';

  const parts = [
    part(new THREE.SphereGeometry(0.5, 18, 14), top, { scale: [0.74, 0.74, 2.3] }),
    part(new THREE.SphereGeometry(0.42, 16, 12), belly, { scale: [0.72, 0.5, 1.7], pos: [0, -0.2, 0.1] }),
    part(new THREE.SphereGeometry(0.4, 16, 12), top, { scale: [0.8, 0.82, 0.9], pos: [0, 0.03, 0.9] }),
    part(new THREE.ConeGeometry(0.13, 0.62, 9), top, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.02, 1.6] }),
    part(new THREE.ConeGeometry(0.3, 0.85, 8), fin, { scale: [1, 1, 0.32], rot: [-0.5, 0, 0], pos: [0, 0.5, -0.15] }),
    part(new THREE.ConeGeometry(0.26, 1.2, 8), top, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -1.5] }),
  ];

  for (const sx of [-1, 1]) {
    const fluke = new THREE.ConeGeometry(0.26, 0.72, 6).toNonIndexed();
    fluke.rotateX(Math.PI / 2);
    fluke.scale(1, 0.16, 1);
    fluke.rotateY(sx * 1.15);
    fluke.translate(sx * 0.3, 0, -2.1);
    tint(fluke, fin);
    parts.push(fluke);

    const pec = new THREE.ConeGeometry(0.17, 0.62, 6).toNonIndexed();
    pec.rotateX(Math.PI / 2);
    pec.scale(1, 0.2, 1);
    pec.rotateZ(sx * 0.5);
    pec.rotateY(sx * 1.3);
    pec.translate(sx * 0.45, -0.22, 0.55);
    tint(pec, fin);
    parts.push(pec);
  }

  return mergeGeometries(parts, false);
}

/* --------------------------- helpers --------------------------- */

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

/* --------------------------- systems --------------------------- */

export function createMarineLife(scene) {
  const whaleGeo = buildWhaleGeo();
  const dolphinGeo = buildDolphinGeo();
  const whaleMat = toonMaterial({ vertexColors: true });
  const dolphinMat = toonMaterial({ vertexColors: true });

  const spoutMat = new THREE.MeshBasicMaterial({
    color: 0xf2fbff,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const spoutGeo = new THREE.ConeGeometry(0.95, 4.6, 12, 1, true);

  const whales = [];
  const pods = [];
  let whaleTimer = 16 + Math.random() * 24;
  let dolphinTimer = 10 + Math.random() * 18;

  /* ----------------------------- whales ----------------------------- */
  function spawnWhale() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(whaleGeo, whaleMat);
    body.scale.setScalar(2.1);
    group.add(body);

    /* Spout plume, parented to the blowhole. */
    const spout = new THREE.Group();
    const plume = new THREE.Mesh(spoutGeo, spoutMat.clone());
    plume.position.y = 2.3;
    spout.add(plume);
    const drops = [];
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), spoutMat.clone());
      spout.add(d);
      drops.push(d);
    }
    spout.position.set(0, 2.1 * 2.1, 1.9 * 2.1);
    spout.visible = false;
    group.add(spout);

    /* Orbiting path at a fixed radius: whales never approach the island. */
    const radius = 240 + Math.random() * 170;
    const angle = Math.random() * Math.PI * 2;
    const dirSign = Math.random() < 0.5 ? 1 : -1;
    const speed = 1.4 + Math.random() * 1.2;

    group.position.set(Math.cos(angle) * radius, SEA_LEVEL - 9, Math.sin(angle) * radius);

    scene.add(group);
    whales.push({
      group,
      spout,
      plume,
      drops,
      radius,
      angle,
      dirSign,
      omega: speed / radius,
      sweep: 0,
      phase: 'rise',
      t: 0,
      spoutsLeft: 2 + Math.floor(Math.random() * 2),
      spoutTimer: 0,
      spoutT: 0,
      surfY: SEA_LEVEL - 1.1,
      deepY: SEA_LEVEL - 9,
    });
  }

  function fireSpout(w) {
    w.spout.visible = true;
    w.spoutT = 0.0001;
    for (const d of w.drops) {
      d.userData.v = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        3.2 + Math.random() * 2.4,
        (Math.random() - 0.5) * 2.2
      );
      d.position.set(0, 2.3, 0);
    }
  }

  /* ---------------------------- dolphins ---------------------------- */
  function spawnPod() {
    const count = 3 + Math.floor(Math.random() * 3);

    /* Far horizon only: dolphins orbit well outside the island. */
    const radius = 300 + Math.random() * 190;
    const angle = Math.random() * Math.PI * 2;
    const dirSign = Math.random() < 0.5 ? 1 : -1;
    const speed = 6 + Math.random() * 3;

    const group = new THREE.Group();
    const members = [];
    for (let i = 0; i < count; i++) {
      const d = new THREE.Mesh(dolphinGeo, dolphinMat);
      d.scale.setScalar(1.6);
      group.add(d);
      members.push({
        mesh: d,
        offset: new THREE.Vector3((i - (count - 1) / 2) * 3.4, 0, -i * 3.0),
        phase: Math.random() * 5,
      });
    }
    scene.add(group);
    pods.push({
      group,
      members,
      radius,
      angle,
      dirSign,
      omega: speed / radius,
      sweep: 0,
      elapsed: 0,
    });
  }

  const CYCLE = 4.6;
  const AIR = 1.7;
  const ARC = 2.4;

  function update(dt, elapsed) {
    whaleTimer -= dt;
    dolphinTimer -= dt;

    if (whaleTimer <= 0 && whales.length < 2) {
      spawnWhale();
      whaleTimer = 48 + Math.random() * 70;
    }
    if (dolphinTimer <= 0 && pods.length < 2) {
      spawnPod();
      dolphinTimer = 26 + Math.random() * 44;
    }

    /* -------- whales -------- */
    for (let i = whales.length - 1; i >= 0; i--) {
      const w = whales[i];
      w.t += dt;

      /* Orbit: the radius never changes, so whales stay far offshore. */
      w.angle += w.omega * w.dirSign * dt;
      w.sweep += w.omega * dt;
      w.group.position.x = Math.cos(w.angle) * w.radius;
      w.group.position.z = Math.sin(w.angle) * w.radius;
      w.group.rotation.y = Math.atan2(
        -Math.sin(w.angle) * w.dirSign,
        Math.cos(w.angle) * w.dirSign
      );

      if (w.phase === 'rise') {
        const u = Math.min(1, w.t / 4);
        w.group.position.y = lerp(w.deepY, w.surfY, easeInOut(u));
        w.group.rotation.x = -0.18 * (1 - u);
        if (u >= 1) {
          w.phase = 'surface';
          w.t = 0;
        }
      } else if (w.phase === 'surface') {
        w.group.position.y = w.surfY + Math.sin(elapsed * 1.3) * 0.14;
        w.group.rotation.x = Math.sin(elapsed * 1.3) * 0.05;

        w.spoutTimer -= dt;
        if (w.spoutTimer <= 0 && w.spoutsLeft > 0) {
          fireSpout(w);
          w.spoutsLeft--;
          w.spoutTimer = 2.3;
        }
        if (w.spoutsLeft <= 0 && w.spoutTimer <= -1.2) {
          w.phase = 'dive';
          w.t = 0;
        }
      } else {
        const u = Math.min(1, w.t / 3.6);
        w.group.position.y = lerp(w.surfY, w.deepY, u * u);
        w.group.rotation.x = 0.3 * u;
        if (u >= 1) {
          scene.remove(w.group);
          whales.splice(i, 1);
          continue;
        }
      }

      /* Spout plume animation */
      if (w.spoutT > 0) {
        w.spoutT += dt;
        const life = 1.4;
        const k = Math.min(1, w.spoutT / life);
        w.plume.scale.set(0.5 + k * 0.9, 0.25 + k * 1.0, 0.5 + k * 0.9);
        w.plume.material.opacity = 0.85 * (1 - k);
        for (const d of w.drops) {
          const v = d.userData.v;
          v.y -= 9 * dt;
          d.position.addScaledVector(v, dt);
          d.material.opacity = 0.8 * (1 - k);
          d.scale.setScalar(1 - k * 0.5);
        }
        if (w.spoutT >= life) {
          w.spoutT = 0;
          w.spout.visible = false;
        }
      }
    }

    /* -------- dolphins -------- */
    for (let i = pods.length - 1; i >= 0; i--) {
      const p = pods[i];
      p.elapsed += dt;

      /* Orbit at a fixed radius so a pod can never reach the shallows. */
      p.angle += p.omega * p.dirSign * dt;
      p.sweep += p.omega * dt;

      const cx = Math.cos(p.angle) * p.radius;
      const cz = Math.sin(p.angle) * p.radius;
      const yaw = Math.atan2(-Math.sin(p.angle) * p.dirSign, Math.cos(p.angle) * p.dirSign);
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);

      for (const m of p.members) {
        const local = p.elapsed + m.phase;
        const cycle = local % CYCLE;

        /* Formation offset rotated into the direction of travel. */
        const ox = m.offset.x;
        const oz = m.offset.z;
        m.mesh.position.set(cx + ox * cy + oz * sy, 0, cz - ox * sy + oz * cy);
        m.mesh.rotation.y = yaw;

        if (cycle < AIR) {
          const u = cycle / AIR;
          const arc = Math.sin(Math.PI * u);
          m.mesh.position.y = SEA_LEVEL + ARC * arc + 0.4;
          m.mesh.visible = true;
          /* Nose up on the way out, down on the way in. */
          m.mesh.rotation.x = -Math.cos(Math.PI * u) * 0.85;
        } else {
          m.mesh.position.y = SEA_LEVEL - 2.2;
          m.mesh.visible = false;
          m.mesh.rotation.x = 0;
        }
      }

      if (p.sweep > 1.0) {
        scene.remove(p.group);
        pods.splice(i, 1);
      }
    }
  }

  return {
    update,
    get whaleCount() {
      return whales.length;
    },
    get podCount() {
      return pods.length;
    },
    get whales() {
      return whales;
    },
    get pods() {
      return pods;
    },
  };
}
