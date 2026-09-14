import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part } from './toon.js';

/* --------------------------- models --------------------------- */
/* Both aircraft are built with the nose pointing towards +Z. */

function buildJetGeo() {
  const parts = [
    /* Fuselage */
    part(new THREE.CylinderGeometry(1.05, 0.85, 20, 18), '#f2f5f8', { rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.ConeGeometry(1.05, 4.2, 18), '#f2f5f8', { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 12.1] }),
    part(new THREE.ConeGeometry(0.85, 4.0, 18), '#e6ebf0', { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -12] }),

    /* Livery stripe */
    part(new THREE.BoxGeometry(0.06, 0.34, 19), '#2f6fb0', { pos: [1.0, -0.1, 0.4] }),
    part(new THREE.BoxGeometry(0.06, 0.34, 19), '#2f6fb0', { pos: [-1.0, -0.1, 0.4] }),

    /* Swept wings */
    part(new THREE.BoxGeometry(9.6, 0.34, 3.6), '#e9eef3', { rot: [0, 0.46, 0], pos: [4.7, -0.15, -0.7] }),
    part(new THREE.BoxGeometry(9.6, 0.34, 3.6), '#e9eef3', { rot: [0, -0.46, 0], pos: [-4.7, -0.15, -0.7] }),
    part(new THREE.BoxGeometry(1.4, 0.4, 2.2), '#c0392b', { rot: [0, 0.46, 0], pos: [8.4, -0.12, -2.4] }),
    part(new THREE.BoxGeometry(1.4, 0.4, 2.2), '#c0392b', { rot: [0, -0.46, 0], pos: [-8.4, -0.12, -2.4] }),

    /* Tail */
    part(new THREE.BoxGeometry(0.34, 3.4, 2.9), '#e9eef3', { rot: [-0.3, 0, 0], pos: [0, 2.0, -9.4] }),
    part(new THREE.BoxGeometry(0.36, 1.5, 1.2), '#c0392b', { rot: [-0.3, 0, 0], pos: [0, 3.5, -9.9] }),
    part(new THREE.BoxGeometry(4.8, 0.28, 1.8), '#e9eef3', { rot: [0, 0.42, 0], pos: [2.4, 0.75, -10.2] }),
    part(new THREE.BoxGeometry(4.8, 0.28, 1.8), '#e9eef3', { rot: [0, -0.42, 0], pos: [-2.4, 0.75, -10.2] }),

    /* Engines */
    part(new THREE.CylinderGeometry(0.92, 0.92, 3.6, 16), '#5a646e', { rot: [Math.PI / 2, 0, 0], pos: [3.6, -1.05, 0.9] }),
    part(new THREE.CylinderGeometry(0.92, 0.92, 3.6, 16), '#5a646e', { rot: [Math.PI / 2, 0, 0], pos: [-3.6, -1.05, 0.9] }),
    part(new THREE.TorusGeometry(0.92, 0.09, 6, 18), '#3b434b', { pos: [3.6, -1.05, 2.7] }),
    part(new THREE.TorusGeometry(0.92, 0.09, 6, 18), '#3b434b', { pos: [-3.6, -1.05, 2.7] }),
    part(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14), '#2b3540', { rot: [Math.PI / 2, 0, 0], pos: [3.6, -1.05, 2.6] }),
    part(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14), '#2b3540', { rot: [Math.PI / 2, 0, 0], pos: [-3.6, -1.05, 2.6] }),
  ];

  /* Cabin windows */
  for (let i = 0; i < 14; i++) {
    const z = 7.6 - i * 1.15;
    parts.push(part(new THREE.BoxGeometry(0.14, 0.3, 0.5), '#2b3540', { pos: [0.98, 0.28, z] }));
    parts.push(part(new THREE.BoxGeometry(0.14, 0.3, 0.5), '#2b3540', { pos: [-0.98, 0.28, z] }));
  }

  /* Cockpit glass */
  parts.push(part(new THREE.BoxGeometry(1.5, 0.62, 1.7), '#2b3540', { rot: [-0.2, 0, 0], pos: [0, 0.5, 8.6] }));

  return mergeGeometries(parts, false);
}

function buildPropGeo() {
  return mergeGeometries([
    /* Fuselage */
    part(new THREE.CylinderGeometry(0.52, 0.4, 8.4, 16), '#eef2f6', { rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(0.56, 0.5, 1.1, 16), '#c0392b', { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 4.5] }),
    part(new THREE.ConeGeometry(0.24, 0.7, 12), '#d8dee5', { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 5.4] }),
    part(new THREE.ConeGeometry(0.4, 2.6, 16), '#eef2f6', { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -5.5] }),

    /* Straight wings */
    part(new THREE.BoxGeometry(11.5, 0.3, 2.0), '#eef2f6', { pos: [0, 0.2, 0.3] }),
    part(new THREE.BoxGeometry(1.6, 0.34, 1.4), '#c0392b', { pos: [5.2, 0.22, 0.3] }),
    part(new THREE.BoxGeometry(1.6, 0.34, 1.4), '#c0392b', { pos: [-5.2, 0.22, 0.3] }),

    /* Tail */
    part(new THREE.BoxGeometry(0.24, 1.8, 1.6), '#eef2f6', { rot: [-0.2, 0, 0], pos: [0, 1.1, -4.0] }),
    part(new THREE.BoxGeometry(0.26, 0.8, 0.9), '#c0392b', { rot: [-0.2, 0, 0], pos: [0, 1.9, -4.2] }),
    part(new THREE.BoxGeometry(3.9, 0.2, 1.1), '#eef2f6', { pos: [0, 0.35, -4.1] }),

    /* Canopy */
    part(new THREE.SphereGeometry(0.46, 16, 12), '#2b3540', { scale: [0.85, 0.75, 1.6], pos: [0, 0.5, 1.7] }),

    /* Fixed landing gear */
    part(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), '#5a646e', { rot: [0, 0, 0.22], pos: [1.5, -0.85, 0.9] }),
    part(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), '#5a646e', { rot: [0, 0, -0.22], pos: [-1.5, -0.85, 0.9] }),
    part(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12), '#2b3038', { rot: [0, 0, Math.PI / 2], pos: [1.85, -1.36, 0.9] }),
    part(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12), '#2b3038', { rot: [0, 0, Math.PI / 2], pos: [-1.85, -1.36, 0.9] }),
  ], false);
}

/** Three-bladed propeller, spun at runtime. */
function buildPropeller() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(0.1, 1.5, 0.06).toNonIndexed();
    blade.translate(0, 0.78, 0);
    blade.rotateZ(a);
    tint(blade, '#2b3038');
    parts.push(blade);
  }
  return mergeGeometries(parts, false);
}

function makeContrailTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/* --------------------------- traffic --------------------------- */

export function createAircraft(scene) {
  const jetGeo = buildJetGeo();
  const propGeo = buildPropGeo();
  const bladeGeo = buildPropeller();

  const jetMat = toonMaterial({ vertexColors: true });
  const propMat = toonMaterial({ vertexColors: true });
  const bladeMat = toonMaterial({ color: 0x2b3038 });

  const contrailTex = makeContrailTexture();
  const contrailMat = new THREE.MeshBasicMaterial({
    map: contrailTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });

  const active = [];
  let jetTimer = 5 + Math.random() * 10;
  let propTimer = 3 + Math.random() * 7;

  function spawn(kind) {
    const isJet = kind === 'jet';
    const group = new THREE.Group();

    const body = new THREE.Mesh(isJet ? jetGeo : propGeo, isJet ? jetMat : propMat);
    group.add(body);

    let prop = null;
    if (!isJet) {
      prop = new THREE.Mesh(bladeGeo, bladeMat);
      prop.position.set(0, 0, 5.05);
      group.add(prop);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.55, 20),
        new THREE.MeshBasicMaterial({ color: 0xdfe8f2, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
      );
      disc.position.set(0, 0, 5.1);
      group.add(disc);
    } else {
      /* Twin engine contrails. */
      for (const sx of [-3.6, 3.6]) {
        const g = new THREE.PlaneGeometry(1, 1);
        g.rotateX(-Math.PI / 2);
        g.rotateY(Math.PI / 2);
        const trail = new THREE.Mesh(g, contrailMat);
        trail.scale.set(46, 1, 1.9);
        trail.position.set(sx, -1.05, -13 - 23);
        group.add(trail);
      }
    }

    /* Fly a chord that passes near the island. */
    const a0 = Math.random() * Math.PI * 2;
    const a1 = a0 + Math.PI + (Math.random() - 0.5) * 1.1;
    const R = 340;
    const start = new THREE.Vector3(Math.cos(a0) * R, 0, Math.sin(a0) * R);
    const end = new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();

    const altitude = isJet
      ? 108 + Math.random() * 40
      : 38 + Math.random() * 20;

    group.position.set(start.x, altitude, start.z);
    group.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(group);

    active.push({
      kind,
      group,
      prop,
      dir,
      altitude,
      speed: isJet ? 30 + Math.random() * 14 : 12 + Math.random() * 7,
      travelled: 0,
      spin: 22 + Math.random() * 12,
      bank: (Math.random() - 0.5) * 0.12,
    });
  }

  function update(dt, elapsed) {
    jetTimer -= dt;
    propTimer -= dt;

    if (jetTimer <= 0 && active.filter((a) => a.kind === 'jet').length < 3) {
      spawn('jet');
      jetTimer = 22 + Math.random() * 30;
    }
    if (propTimer <= 0 && active.filter((a) => a.kind === 'prop').length < 3) {
      spawn('prop');
      propTimer = 16 + Math.random() * 26;
    }

    for (let i = active.length - 1; i >= 0; i--) {
      const a = active[i];
      a.travelled += a.speed * dt;

      a.group.position.addScaledVector(a.dir, a.speed * dt);
      a.group.position.y = a.altitude + Math.sin(elapsed * 0.6 + a.travelled * 0.01) * 1.4;
      a.group.rotation.z = a.bank + Math.sin(elapsed * 0.5 + a.travelled * 0.01) * 0.04;

      if (a.prop) a.prop.rotation.z += a.spin * dt;

      if (a.travelled > 760) {
        scene.remove(a.group);
        active.splice(i, 1);
      }
    }
  }

  return {
    update,
    get count() {
      return active.length;
    },
    get list() {
      return active;
    },
  };
}
