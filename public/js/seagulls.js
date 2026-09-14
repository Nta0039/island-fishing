import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part } from './toon.js';

/* ------------------------------- models ------------------------------- */

/**
 * The head is built as its own cluster so it can pivot at the neck and
 * turn, peck and shake independently of the body. Everything here is
 * positioned relative to the neck joint, not the body origin.
 */
function buildGullHead() {
  const parts = [];
  const NECK = [0, 0.055, 0.11];   // offset from the body's neck joint

  /* Skull and a fuller nape behind it. */
  parts.push(part(new THREE.SphereGeometry(0.145, 26, 20), '#ffffff', { pos: NECK }));
  parts.push(part(new THREE.SphereGeometry(0.115, 22, 18), '#f2f6fb', {
    scale: [0.95, 0.9, 1.1],
    pos: [0, 0.0, 0.05],
  }));

  /* Beak: tapered upper mandible with a hooked tip, a slimmer lower
     mandible beneath it, and a pair of nostrils. */
  parts.push(part(new THREE.ConeGeometry(0.05, 0.30, 14), '#ffb703', {
    rot: [Math.PI / 2, 0, 0],
    pos: [0, 0.045, 0.35],
  }));
  parts.push(part(new THREE.ConeGeometry(0.038, 0.14, 12), '#f0a000', {
    rot: [Math.PI / 2 + 0.42, 0, 0],
    pos: [0, 0.028, 0.475],
  }));
  parts.push(part(new THREE.ConeGeometry(0.034, 0.24, 12), '#e08c00', {
    rot: [Math.PI / 2, 0, 0],
    pos: [0, -0.012, 0.34],
  }));
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(0.014, 8, 6), '#b06f00', {
      pos: [s * 0.026, 0.062, 0.275],
    }));
  }

  /* Eyes: iris, highlight and the gull's stern brow. */
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(0.038, 16, 14), '#20242c', { pos: [s * 0.082, 0.085, 0.175] }));
    parts.push(part(new THREE.SphereGeometry(0.016, 10, 8), '#ffffff', { pos: [s * 0.09, 0.096, 0.198] }));
    parts.push(part(new THREE.BoxGeometry(0.08, 0.022, 0.055), '#d8dee6', { pos: [s * 0.082, 0.123, 0.165] }));
  }
  return mergeGeometries(parts, false);
}

function buildGullBody() {
  const parts = [];

  /* Fuselage: a sculpted spindle, deepest at the breast and tapering to
     the tail, with a separate paler belly shell and a breast plate. */
  parts.push(part(new THREE.SphereGeometry(0.21, 28, 22), '#f8fbff', { scale: [0.95, 0.86, 2.05] }));
  parts.push(part(new THREE.SphereGeometry(0.185, 24, 18), '#ffffff', {
    scale: [0.92, 0.6, 1.75],
    pos: [0, -0.075, 0.06],
  }));
  parts.push(part(new THREE.SphereGeometry(0.17, 22, 18), '#ffffff', {
    scale: [0.95, 0.95, 0.85],
    pos: [0, 0.02, 0.3],
  }));

  /* The neck stub the head pivots on. */
  parts.push(part(new THREE.CylinderGeometry(0.085, 0.125, 0.2, 16), '#ffffff', {
    rot: [0.55, 0, 0],
    pos: [0, 0.12, 0.37],
  }));

  /* Tail: a fanned wedge of five overlapping feathers. */
  for (let i = -2; i <= 2; i++) {
    parts.push(part(
      new THREE.BoxGeometry(0.105, 0.018, 0.46 - Math.abs(i) * 0.05),
      i % 2 ? '#e2eaf2' : '#eef3f8',
      { rot: [0, i * 0.30, 0], pos: [i * 0.075, 0.02, -0.5] }
    ));
  }

  /* Legs and webbed feet, three toes per foot. */
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.CylinderGeometry(0.022, 0.024, 0.24, 8), '#e8a33d', {
      pos: [s * 0.075, -0.25, 0.06],
    }));
    for (let k = -1; k <= 1; k++) {
      parts.push(part(new THREE.BoxGeometry(0.05, 0.016, 0.13), '#e8a33d', {
        rot: [0, k * 0.45, 0],
        pos: [s * 0.075 + k * 0.022, -0.37, 0.12],
      }));
    }
  }
  return mergeGeometries(parts, false);
}

/**
 * A real aerofoil rather than a stack of slabs: the plan form is swept
 * out as a shape and extruded to give the wing thickness, then finished
 * with five long primary feathers trailing off the hand.
 */
function buildGullWing() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.20);
  shape.quadraticCurveTo(0.72, 0.26, 1.28, 0.10);
  shape.lineTo(1.66, -0.10);
  shape.quadraticCurveTo(1.10, -0.34, 0.55, -0.40);
  shape.quadraticCurveTo(0.18, -0.42, 0, -0.24);
  shape.lineTo(0, 0.20);

  const wing = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: false,
    curveSegments: 10,
  });
  /* Lay the plan form flat: span along x, chord along z, thickness in y. */
  wing.rotateX(Math.PI / 2);
  wing.translate(0, 0.025, 0);
  tint(wing, '#f8fbff');
  const parts = [wing];

  /* Primary feathers sweeping back off the tip. */
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    parts.push(part(
      new THREE.BoxGeometry(0.66 - t * 0.14, 0.018, 0.11),
      i % 2 ? '#8f9dab' : '#9aa9b8',
      { rot: [0, -0.30 - t * 0.32, 0], pos: [1.4 + t * 0.05, -0.005, -0.16 - t * 0.15] }
    ));
  }

  /* Faint feather divisions across the inner wing. */
  for (let i = 0; i < 3; i++) {
    parts.push(part(new THREE.BoxGeometry(0.02, 0.052, 0.34 - i * 0.05), '#dbe4ee', {
      pos: [0.34 + i * 0.3, 0.001, -0.06],
    }));
  }

  /* A darker trailing edge to sharpen the silhouette. */
  parts.push(part(new THREE.BoxGeometry(1.15, 0.02, 0.06), '#aab8c6', { pos: [0.62, -0.005, -0.33] }));

  return mergeGeometries(parts, false);
}

/* ------------------------------ behaviour ----------------------------- */

export function createSeagulls(scene, perches = []) {
  const bodyGeo = buildGullBody();
  const headGeo = buildGullHead();
  const wingGeo = buildGullWing();
  const bodyMat = toonMaterial({ vertexColors: true });
  const wingMat = toonMaterial({ vertexColors: true, side: THREE.DoubleSide });

  const flocks = [];
  const resters = [];
  let timer = 5 + Math.random() * 7;
  let restTimer = 6 + Math.random() * 8;

  function makeGull(scale) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, bodyMat));

    /* The head rides on its own pivot at the neck, so it can scan, shake
       and peck while the body stays put. */
    const head = new THREE.Group();
    head.position.set(0, 0.12, 0.37);
    head.add(new THREE.Mesh(headGeo, bodyMat));
    g.add(head);

    const wings = [];
    for (let side = 0; side < 2; side++) {
      const pivot = new THREE.Group();
      pivot.position.set(side ? -0.15 : 0.15, 0.06, 0.02);
      pivot.userData.baseY = side ? Math.PI : 0;
      pivot.userData.foldSign = side ? -1 : 1;
      pivot.rotation.y = pivot.userData.baseY;
      pivot.add(new THREE.Mesh(wingGeo, wingMat));
      g.add(pivot);
      wings.push(pivot);
    }
    g.userData.wings = wings;
    g.userData.head = head;
    g.scale.setScalar(scale);
    return g;
  }

  /** Sets both wings at once: `flap` lifts them, `fold` sweeps them back. */
  function setWings(g, flap, fold = 0) {
    for (const p of g.userData.wings) {
      p.rotation.z = flap;
      p.rotation.y = p.userData.baseY + p.userData.foldSign * fold;
    }
  }

  /** Eased 0..1 ramp between two thresholds. */
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  function spawnFlock() {
    const count = 3 + Math.floor(Math.random() * 5);
    const angle = Math.random() * Math.PI * 2;
    const radius = 110 + Math.random() * 80;
    /* Cruising height, kept well clear of the lighthouse. The tower tops
       out around y=23; with the flock spread and the bob factored in the
       lowest a gull ever gets is about y=29. */
    const height = 36 + Math.random() * 20;

    const start = new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    const dir = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
    dir.x += (Math.random() - 0.5) * 0.7;
    dir.z += (Math.random() - 0.5) * 0.7;
    dir.normalize();

    const group = new THREE.Group();
    const gulls = [];
    for (let i = 0; i < count; i++) {
      const gull = makeGull(1.5 + Math.random() * 0.8);
      gull.userData.offset = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 15
      );
      gull.userData.flap = 5 + Math.random() * 3.5;
      gull.userData.phase = Math.random() * Math.PI * 2;
      gull.userData.bob = 0.5 + Math.random() * 1.2;
      group.add(gull);
      gulls.push(gull);
    }
    scene.add(group);

    flocks.push({
      group,
      gulls,
      start,
      dir,
      speed: 7 + Math.random() * 5,
      travelled: 0,
      elapsed: 0,
      bank: (Math.random() - 0.5) * 0.28,
    });
  }

  /* Peel a gull off a passing flock and send it down to a reef. */
  function detachToPerch() {
    if (!perches.length || !flocks.length) return;
    const flock = flocks[Math.floor(Math.random() * flocks.length)];
    if (!flock.gulls.length) return;

    const src = flock.gulls[Math.floor(Math.random() * flock.gulls.length)];
    const perch = perches[Math.floor(Math.random() * perches.length)];

    const gull = makeGull(1.5 + Math.random() * 0.6);
    gull.position.copy(src.position);
    scene.add(gull);

    resters.push({
      gull,
      perch,
      state: 'toPerch',
      t: 0,
      restFor: 9 + Math.random() * 12,
      speed: 9 + Math.random() * 3,
      flap: 6 + Math.random() * 3,
      phase: Math.random() * 6,
      /* Idle personality, fixed at spawn so it stays consistent. */
      walkR: 0.22 + Math.random() * 0.3,
      walkSpeed: 0.16 + Math.random() * 0.22,
      walkStep: 3.2 + Math.random() * 2.2,
      walkPhase: Math.random() * Math.PI * 2,
      headBias: (Math.random() - 0.5) * 0.5,
    });
  }

  const _center = new THREE.Vector3();
  const _target = new THREE.Vector3();

  function update(dt, elapsed) {
    timer -= dt;
    restTimer -= dt;

    if (timer <= 0 && flocks.length < 3) {
      spawnFlock();
      timer = 12 + Math.random() * 18;
    }
    if (restTimer <= 0) {
      if (resters.length < 3 && flocks.length > 0) detachToPerch();
      restTimer = 7 + Math.random() * 12;
    }

    /* -------- flying flocks -------- */
    for (let i = flocks.length - 1; i >= 0; i--) {
      const f = flocks[i];
      f.elapsed += dt;
      f.travelled += f.speed * dt;

      _center.copy(f.start).addScaledVector(f.dir, f.travelled);
      const yaw = Math.atan2(f.dir.x, f.dir.z);

      for (const gull of f.gulls) {
        const u = gull.userData;
        gull.position.copy(_center).add(u.offset);
        gull.position.y += Math.sin(f.elapsed * 1.4 + u.phase) * u.bob;
        gull.rotation.set(0, yaw, f.bank + Math.sin(f.elapsed * 0.8 + u.phase) * 0.09);

        const flap = Math.sin(f.elapsed * u.flap + u.phase);
        u.wings[0].rotation.z = flap * 0.85;
        u.wings[1].rotation.z = flap * 0.85;
      }

      if (f.travelled > 330) {
        scene.remove(f.group);
        flocks.splice(i, 1);
      }
    }

    /* -------- gulls heading down to rest on a reef -------- */
    for (let i = resters.length - 1; i >= 0; i--) {
      const r = resters[i];
      const g = r.gull;
      r.t += dt;

      if (r.state === 'toPerch') {
        _target.set(r.perch.x, r.perch.y + 5.5, r.perch.z);
        const to = _target.clone().sub(g.position);
        const dist = to.length();
        if (dist < 1.2) {
          r.state = 'descend';
          r.t = 0;
        } else {
          to.normalize();
          g.position.addScaledVector(to, Math.min(r.speed * dt, dist));
          g.rotation.set(-0.12, Math.atan2(to.x, to.z), 0);
          const flap = Math.sin(elapsed * r.flap + r.phase);
          setWings(g, flap * 0.9, 0);
        }
      } else if (r.state === 'descend') {
        const k = Math.min(1, r.t / 1.7);
        const e = k * k * (3 - 2 * k);
        g.position.set(
          r.perch.x,
          r.perch.y + 5.5 * (1 - e),
          r.perch.z
        );
        /* Nose down on the approach, then level off into the touchdown. */
        g.rotation.set(-0.55 * (1 - e) + 0.14 * Math.sin(Math.PI * k) * (1 - k), g.rotation.y, 0);

        /* Landing wings, in two overlapping beats. First they stay out and
           flare to brake; from halfway they sweep back against the body on
           an eased curve that lingers at the start and eases out at the
           end, with a small overshoot as the primaries tuck — no stiff,
           linear snap from spread to folded. */
        const flare = Math.sin(Math.PI * Math.min(1, k / 0.8)) * 0.8;
        const foldK = smooth(0.5, 1.0, k);
        const settle = smooth(0.82, 1.0, k);
        const flap = (0.32 + flare) * (1 - foldK) + 0.05 * foldK;
        const fold = 1.15 * foldK + Math.sin(Math.PI * settle) * 0.06;
        setWings(g, flap, fold);

        if (k >= 1) {
          r.state = 'rest';
          r.t = 0;
          r.walkPhase = Math.random() * Math.PI * 2;
        }
      } else if (r.state === 'rest') {
        /* --- Idle: wings folded, shuffling in a small circle --- */
        const settle = Math.max(0, Math.sin(elapsed * 0.55 + r.phase * 3) - 0.7) / 0.3;
        setWings(g, 0.05 + settle * 0.2 + Math.sin(elapsed * 1.7 + r.phase) * 0.03, 1.15 - settle * 0.14);

        /* Pace round a tight circle, bobbing on each step. */
        const wa = elapsed * r.walkSpeed + r.walkPhase;
        const step = Math.abs(Math.sin(elapsed * r.walkStep + r.walkPhase));
        g.position.set(
          r.perch.x + Math.cos(wa) * r.walkR,
          r.perch.y + step * 0.035,
          r.perch.z + Math.sin(wa) * r.walkR
        );
        g.rotation.set(0, wa + Math.PI / 2 + Math.sin(elapsed * 0.6 + r.phase) * 0.2, 0);

        /* Head: slow scanning, sharp shakes, and the odd peck downward. */
        const shake = Math.max(0, Math.sin(elapsed * 0.8 + r.phase * 2.3) - 0.88) / 0.12;
        const peck = Math.max(0, Math.sin(elapsed * 0.45 + r.phase * 1.7) - 0.9) / 0.1;
        const h = g.userData.head;
        h.rotation.y = r.headBias + Math.sin(elapsed * 0.9 + r.phase) * 0.45
          + shake * Math.sin(elapsed * 30) * 0.55;
        h.rotation.x = peck * 0.8 + Math.sin(elapsed * 1.4 + r.phase) * 0.07;
        h.rotation.z = shake * Math.sin(elapsed * 30 + 1.1) * 0.16;

        if (r.t > r.restFor) {
          r.state = 'leave';
          r.t = 0;
          r.from = { x: g.position.x, y: g.position.y, z: g.position.z, yaw: g.rotation.y };
        }
      } else {
        /* --- Take off: crouch, unfold, beat hard, climb away --- */
        const t = r.t;
        const from = r.from;
        /* Wings unfold on the same eased curve they folded on. */
        const unfold = smooth(0, 0.55, t);
        const beat = Math.sin(elapsed * 11 + r.phase);
        setWings(g, beat * (0.3 + 0.8 * unfold), 1.15 * (1 - unfold));
        g.userData.head.rotation.set(0, 0, 0);

        /* A brief crouch, then a steady climb out over the water. */
        const crouch = t < 0.3 ? -0.11 * Math.sin((t / 0.3) * Math.PI) : 0;
        const climb = t < 0.3 ? 0 : (t - 0.3) * 5.5;
        const dist = t < 0.3 ? 0 : (t - 0.3) * 3.6;
        g.position.set(
          from.x + Math.sin(from.yaw) * dist,
          from.y + crouch + climb,
          from.z + Math.cos(from.yaw) * dist
        );
        g.rotation.set(-0.3 * Math.min(1, t / 0.6), from.yaw, 0);
        if (t > 7) {
          scene.remove(g);
          resters.splice(i, 1);
        }
      }
    }
  }

  return {
    update,
    get flockCount() {
      return flocks.length;
    },
    get restingCount() {
      return resters.filter((r) => r.state === 'rest').length;
    },
    get resters() {
      return resters;
    },
  };
}
