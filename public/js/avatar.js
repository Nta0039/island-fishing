import * as THREE from 'three';
import { toonMaterial } from './toon.js';
import { buildFootGeometry } from './foot.js';

const SKIN = 0xf2c9a0;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/* Length of the right-hand casting swing, in seconds. */
const CAST_DURATION = 0.6;

/* A small woven-carbon swatch, shared by every carbon-fiber rod. The blank
   is drawn in white so this map reads at its own colours. */
let carbonTexture = null;
function getCarbonTexture() {
  if (carbonTexture) return carbonTexture;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2e32';
  ctx.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 32; y += 4) {
    for (let x = 0; x < 32; x += 4) {
      const alt = (((x / 4) + (y / 4)) % 2) === 0;
      ctx.fillStyle = alt ? '#3a3f45' : '#212428';
      ctx.fillRect(x, y, 4, 4);
      ctx.fillStyle = alt ? '#474d54' : '#2b2f34';
      ctx.fillRect(x + 1, y + 1, 2, 2);
    }
  }
  carbonTexture = new THREE.CanvasTexture(c);
  carbonTexture.wrapS = THREE.RepeatWrapping;
  carbonTexture.wrapT = THREE.RepeatWrapping;
  carbonTexture.repeat.set(2, 6);
  carbonTexture.anisotropy = 4;
  return carbonTexture;
}

/* ---------------------------------------------------------------- */
/*  Text / icon sprites                                              */
/* ---------------------------------------------------------------- */

function makeTextSprite(draw, width, height, worldW, worldH) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(worldW, worldH, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function makeNameTag(name) {
  const sprite = makeTextSprite(
    (ctx, w, h) => {
      ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = name.length > 14 ? `${name.slice(0, 13)}…` : name;
      const tw = Math.min(w - 16, ctx.measureText(text).width + 34);
      ctx.fillStyle = 'rgba(6, 20, 34, 0.62)';
      const x = (w - tw) / 2;
      const r = 20;
      ctx.beginPath();
      ctx.moveTo(x + r, 12);
      ctx.arcTo(x + tw, 12, x + tw, h - 12, r);
      ctx.arcTo(x + tw, h - 12, x, h - 12, r);
      ctx.arcTo(x, h - 12, x, 12, r);
      ctx.arcTo(x, 12, x + tw, 12, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#eaf6ff';
      ctx.fillText(text, w / 2, h / 2 + 1);
    },
    256, 64, 2.4, 0.6
  );
  sprite.position.y = 2.86;
  return sprite;
}

function makeHookMark() {
  const sprite = makeTextSprite(
    (ctx, w, h) => {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(w / 2 - 8, h / 2 - 8, 2, w / 2, h / 2, 28);
      g.addColorStop(0, '#fff6b0');
      g.addColorStop(0.6, '#ffbe0b');
      g.addColorStop(1, '#ef8f00');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#5a3200';
      ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', w / 2, h / 2 + 3);
    },
    64, 64, 0.85, 0.85
  );
  sprite.position.y = 2.95;
  sprite.visible = false;
  return sprite;
}

/* ---------------------------------------------------------------- */
/*  Player: a dedicated sea angler                                   */
/* ---------------------------------------------------------------- */

export function createAvatar(color, name, isLocal = false) {
  const group = new THREE.Group();
  const base = new THREE.Color(color);

  const coatMat = toonMaterial({ color: base });
  const coatDark = toonMaterial({ color: base.clone().multiplyScalar(0.58) });
  const coatLight = toonMaterial({ color: base.clone().multiplyScalar(1.28) });
  const waderMat = toonMaterial({ color: 0x46512f });
  const waderDark = toonMaterial({ color: 0x333c22 });
  const bootMat = toonMaterial({ color: 0x24281d });
  const leatherMat = toonMaterial({ color: 0x4a3524 });
  const strapMat = toonMaterial({ color: 0x2f3540 });
  const skinMat = toonMaterial({ color: SKIN });
  const darkMat = toonMaterial({ color: 0x2b3038 });
  const eyeWhiteMat = toonMaterial({ color: 0xfdfdfd });
  const rodMat = toonMaterial({ color: 0x5a3b1e });
  const metalMat = toonMaterial({ color: 0x9aa4ad });

  const materials = [
    coatMat, coatDark, coatLight, waderMat, waderDark, bootMat,
    leatherMat, strapMat, skinMat, darkMat, eyeWhiteMat, rodMat, metalMat,
  ];

  /* ------------------------------ legs ------------------------------ */
  const footGeo = buildFootGeometry();
  const legGeo = new THREE.CapsuleGeometry(0.135, 0.34, 10, 16);
  const bootGeo = new THREE.CylinderGeometry(0.155, 0.145, 0.44, 18);

  const legs = {};
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.17, 0.78, 0);

    const thigh = new THREE.Mesh(legGeo, waderMat);
    thigh.position.y = -0.26;
    leg.add(thigh);

    /* Tall rubber wader boot. */
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.y = -0.56;
    leg.add(boot);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 18), waderDark);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.35;
    leg.add(cuff);

    const foot = new THREE.Mesh(footGeo, bootMat);
    foot.position.set(0, -0.78, 0);
    leg.add(foot);

    group.add(leg);
    if (side < 0) legs.left = leg;
    else legs.right = leg;
  }

  /* ----------------------------- torso ----------------------------- */
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.46, 12, 24), coatMat);
  torso.position.y = 1.14;
  group.add(torso);

  /* --- cloth: a flared coat hem and a back tail, both spring-driven --- */
  const cloth = [];

  const hemPivot = new THREE.Group();
  hemPivot.position.set(0, 0.99, 0);
  const hemMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.47, 0.34, 24), coatDark);
  hemMesh.position.y = -0.17;
  hemPivot.add(hemMesh);
  group.add(hemPivot);
  cloth.push({ pivot: hemPivot, x: 0, vx: 0, z: 0, vz: 0, gain: 1.0 });

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 1.06, -0.31);
  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.06), coatDark);
  tailMesh.position.y = -0.31;
  tailPivot.add(tailMesh);
  group.add(tailPivot);
  cloth.push({ pivot: tailPivot, x: 0, vx: 0, z: 0, vz: 0, gain: 1.4 });

  /* Storm flap down the front. */
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.92, 0.05), coatDark);
  flap.position.set(0, 1.16, 0.32);
  group.add(flap);

  /* Chest pockets + leather tackle pouches. */
  for (const sx of [-1, 1]) {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.06), coatLight);
    pocket.position.set(sx * 0.17, 1.28, 0.3);
    pocket.rotation.x = -0.12;
    group.add(pocket);

    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.13), leatherMat);
    pouch.position.set(sx * 0.3, 0.9, 0.16);
    group.add(pouch);

    /* Life-vest style shoulder straps. */
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.5, 0.055), strapMat);
    strap.position.set(sx * 0.15, 1.35, 0.28);
    strap.rotation.x = -0.16;
    group.add(strap);
  }

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.1, 24), leatherMat);
  belt.position.y = 0.94;
  group.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.05), metalMat);
  buckle.position.set(0, 0.94, 0.34);
  group.add(buckle);

  /* Rolled storm collar. */
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.265, 0.17, 24), coatDark);
  collar.position.y = 1.5;
  group.add(collar);

  /* ------------------------------ arms ------------------------------ */
  const upperGeo = new THREE.CapsuleGeometry(0.1, 0.26, 10, 16);
  const foreGeo = new THREE.CapsuleGeometry(0.088, 0.22, 10, 16);
  const gloveGeo = new THREE.SphereGeometry(0.115, 16, 12);

  const arms = {};
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.46, 1.48, 0);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), coatMat);
    arm.add(shoulder);

    const upper = new THREE.Mesh(upperGeo, coatMat);
    upper.position.y = -0.24;
    arm.add(upper);

    const fore = new THREE.Mesh(foreGeo, coatLight);
    fore.position.y = -0.5;
    arm.add(fore);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 16), coatDark);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.6;
    arm.add(cuff);

    const glove = new THREE.Mesh(gloveGeo, leatherMat);
    glove.position.y = -0.68;
    arm.add(glove);

    group.add(arm);
    if (side < 0) arms.left = arm;
    else arms.right = arm;
  }
  const leftArm = arms.left;
  const rightArm = arms.right;

  /* ------------------------------ head ------------------------------ */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.14, 0.16, 16), skinMat);
  neck.position.y = 1.6;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 28, 20), skinMat);
  head.position.y = 1.94;
  group.add(head);

  /* Salt-and-pepper stubble along the jaw. */
  const stubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.276, 24, 18, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.3),
    toonMaterial({ color: 0x6b5a4a })
  );
  stubble.position.y = 1.94;
  stubble.rotation.x = 0.1;
  group.add(stubble);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 12), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.92, 0.27);
  group.add(nose);

  for (const sx of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), eyeWhiteMat);
    white.position.set(sx * 0.1, 1.98, 0.235);
    group.add(white);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.027, 12, 10), darkMat);
    pupil.position.set(sx * 0.105, 1.98, 0.278);
    group.add(pupil);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.026, 0.04), toonMaterial({ color: 0x6b5a4a }));
    brow.position.set(sx * 0.1, 2.05, 0.25);
    brow.rotation.z = sx * 0.18;
    group.add(brow);
  }

  /* Sou'wester: domed crown with a long sloping back brim. */
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62),
    coatDark
  );
  crown.position.y = 2.03;
  crown.scale.set(1, 1.12, 1);
  group.add(crown);

  const brimGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.05, 26);
  const brim = new THREE.Mesh(brimGeo, coatDark);
  brim.scale.set(1, 1, 1.45);
  brim.position.set(0, 2.06, -0.08);
  brim.rotation.x = -0.17;
  group.add(brim);

  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.028, 8, 26), coatLight);
  hatBand.rotation.x = Math.PI / 2;
  hatBand.position.y = 2.11;
  group.add(hatBand);

  /* ------------------------------ rod ------------------------------ */
  const rod = new THREE.Group();
  const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 2.6, 12), rodMat);
  rodMesh.position.y = 1.3;
  rod.add(rodMesh);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.44, 14), toonMaterial({ color: '#3a2a1e' }));
  grip.position.y = 0.22;
  rod.add(grip);

  /* Line guides running up the blank. */
  for (let i = 0; i < 4; i++) {
    const guide = new THREE.Mesh(new THREE.TorusGeometry(0.035 + i * 0.006, 0.008, 6, 12), metalMat);
    guide.position.set(0, 0.75 + i * 0.5, 0.035);
    rod.add(guide);
  }

  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.1, 18), metalMat);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0, 0.62, 0.11);
  rod.add(reel);

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), darkMat);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0.09, 0.62, 0.11);
  rod.add(handle);

  const rodTip = new THREE.Object3D();
  rodTip.position.y = 2.6;
  rod.add(rodTip);

  /* --- carbon-fiber dressing, revealed only when the carbon rod is on.
     A thicker EVA foregrip, metal reel-seat hoods, a denser guide set, a
     rubber butt cap and a hook keeper all mark it out from the starter
     rod even before the woven blank texture is applied. --- */
  const carbonExtras = new THREE.Group();
  carbonExtras.visible = false;
  rod.add(carbonExtras);

  const rubberMat = toonMaterial({ color: 0x17191c });
  const seatMat = toonMaterial({ color: 0x6b7076 });
  materials.push(rubberMat, seatMat);

  const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 16), rubberMat);
  foregrip.position.y = 1.0;
  carbonExtras.add(foregrip);

  for (const hy of [0.47, 0.77]) {
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.09, 16), seatMat);
    hood.position.y = hy;
    carbonExtras.add(hood);
  }

  for (let i = 0; i < 4; i++) {
    const guide = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.004, 0.007, 6, 12), seatMat);
    guide.position.set(0, 1.02 + i * 0.5, 0.035);
    carbonExtras.add(guide);
  }

  const buttCap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.08, 16), rubberMat);
  buttCap.position.y = -0.02;
  carbonExtras.add(buttCap);

  const hookKeeper = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12), seatMat);
  hookKeeper.position.set(0, 0.86, 0.03);
  carbonExtras.add(hookKeeper);

  /* Two resting places for the rod:
     - idle: carried upright in the LEFT hand while walking or standing.
     - held: in the RIGHT hand, ~180° in arm-space so the tip points
       forward-up once the arm swings into the fishing pose. */
  const rodIdle = { parent: leftArm, pos: [0, -0.66, 0.09], rot: [0, 0, 0] };
  const rodHeld = { parent: rightArm, pos: [0, -0.62, 0.06], rot: [Math.PI - 0.15, 0, 0] };

  rod.position.set(rodIdle.pos[0], rodIdle.pos[1], rodIdle.pos[2]);
  rod.rotation.set(rodIdle.rot[0], rodIdle.rot[1], rodIdle.rot[2]);
  leftArm.add(rod);

  group.add(makeNameTag(name));

  const hookMark = makeHookMark();
  if (!isLocal) group.add(hookMark);

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });

  group.userData = {
    parts: { torso, head, leftArm, rightArm, leftLeg: legs.left, rightLeg: legs.right },
    materials,
    rod,
    rodHeld,
    rodIdle,
    rodIdleNow: true,
    cloth,
    castT: 0,
    wasFishing: false,
    lean: 0,
    reel: 0,
    rock: 0,
    rodMat,
    rodTip,
    carbonExtras,
    hookMark,
    phase: Math.random() * Math.PI * 2,
    flash: 0,
    isLocal,
  };

  return group;
}

/** Apply a merchant rod cosmetic (colour, weave and optional glow). */
export function applyRod(avatar, rod) {
  const u = avatar && avatar.userData;
  if (!u || !u.rodMat || !rod) return;
  const carbon = rod.style === 'carbon';
  const wantMap = carbon ? getCarbonTexture() : null;
  if (carbon) {
    /* White base so the woven map supplies the dark-grey colour itself. */
    u.rodMat.color.setHex(0xffffff);
  } else {
    u.rodMat.color.set(rod.color);
  }
  if (u.rodMat.map !== wantMap) {
    u.rodMat.map = wantMap;
    u.rodMat.needsUpdate = true;
  }
  if (u.carbonExtras) u.carbonExtras.visible = carbon;
  if (rod.emissive) {
    u.rodMat.emissive.set(rod.color);
    u.rodMat.emissiveIntensity = 0.9;
  } else {
    u.rodMat.emissive.setHex(0x000000);
    u.rodMat.emissiveIntensity = 1;
  }
}

export function updateAvatar(avatar, dt, moving, fishing, sitting, lying) {
  const u = avatar.userData;
  const p = u.parts;

  /* `fishing` arrives as the raw state string ('idle', 'waiting', …). */
  const isFishing = !!fishing && fishing !== 'idle';
  const reeling = fishing === 'minigame';
  const isSitting = !!sitting;
  const isLying = !!lying;

  u.phase += dt * (moving && !isSitting && !isLying ? 11 : 2.2);
  const amp = moving && !isSitting && !isLying ? 0.85 : 0.07;
  const swing = Math.sin(u.phase) * amp;

  if (isLying) {
    /* Sunbathing: legs stretched out flat along the lounger, arms loose
       at the sides, with a slow breathing rise. The group itself is
       reclined by the caller; this only shapes the limbs. */
    const k = Math.min(1, dt * 6);
    const breath = Math.sin(u.phase * 0.9) * 0.05;
    p.leftLeg.rotation.x += (-0.72 + breath - p.leftLeg.rotation.x) * k;
    p.rightLeg.rotation.x += (-0.72 + breath - p.rightLeg.rotation.x) * k;
    p.leftArm.rotation.x += (0.42 + breath - p.leftArm.rotation.x) * k;
    p.rightArm.rotation.x += (0.38 + breath - p.rightArm.rotation.x) * k;
    p.leftArm.rotation.z += (0.46 - p.leftArm.rotation.z) * k;
    p.rightArm.rotation.z += (-0.46 - p.rightArm.rotation.z) * k;
  } else if (isSitting) {
    /* Seated: thighs forward, hands resting on the knees. */
    const k = Math.min(1, dt * 8);
    p.leftLeg.rotation.x += (-1.45 - p.leftLeg.rotation.x) * k;
    p.rightLeg.rotation.x += (-1.45 - p.rightLeg.rotation.x) * k;
    p.leftArm.rotation.x += (0.3 - p.leftArm.rotation.x) * k;
    p.rightArm.rotation.x += (0.3 - p.rightArm.rotation.x) * k;
    p.leftArm.rotation.z += (0.16 - p.leftArm.rotation.z) * k;
    p.rightArm.rotation.z += (-0.16 - p.rightArm.rotation.z) * k;
  } else {
    p.leftLeg.rotation.x = swing;
    p.rightLeg.rotation.x = -swing;

    /* The left arm is raised and bent so it actually holds the rod up,
       instead of hanging limp like the empty right arm. When fishing the
       pose lerps below own this joint, so it must not be assigned here. */
    if (!isFishing) {
      const k = Math.min(1, dt * 6);
      p.leftArm.rotation.x += (-1.05 + swing * 0.05 - p.leftArm.rotation.x) * k;
      p.leftArm.rotation.z += (0.26 - p.leftArm.rotation.z) * k;
    }

    if (isFishing) {
      p.rightArm.rotation.x += (-2.05 - p.rightArm.rotation.x) * Math.min(1, dt * 8);
      p.rightArm.rotation.z += (-0.28 - p.rightArm.rotation.z) * Math.min(1, dt * 8);

      if (reeling) {
        /* Both hands on the rod — the left reaches across to assist. */
        p.leftArm.rotation.x += (-1.55 - p.leftArm.rotation.x) * Math.min(1, dt * 10);
        p.leftArm.rotation.z += (0.78 - p.leftArm.rotation.z) * Math.min(1, dt * 10);
      } else {
        p.leftArm.rotation.x += (-0.35 - p.leftArm.rotation.x) * Math.min(1, dt * 8);
        p.leftArm.rotation.z += (0 - p.leftArm.rotation.z) * Math.min(1, dt * 8);
      }
    } else {
      p.rightArm.rotation.x = swing * 0.9;
      p.rightArm.rotation.z += (0 - p.rightArm.rotation.z) * Math.min(1, dt * 8);
      /* The left arm's bend is owned by the carry pose above. */
    }
  }

  /* Start a cast the moment fishing begins. */
  if (isFishing && !u.wasFishing) u.castT = CAST_DURATION;
  u.wasFishing = isFishing;

  /* Only equip the rod into the right hand once actually fishing. */
  const wantIdle = !isFishing;
  if (u.rod && u.rodIdleNow !== wantIdle) {
    u.rodIdleNow = wantIdle;
    const t = wantIdle ? u.rodIdle : u.rodHeld;
    t.parent.add(u.rod);
    u.rod.position.set(t.pos[0], t.pos[1], t.pos[2]);
    u.rod.rotation.set(t.rot[0], t.rot[1], t.rot[2]);
  }

  /* While idle the rod stays upright no matter how the carrying arm is
     angled — cancel the arm's rotation exactly. */
  if (u.rod && !isFishing && u.rod.parent === u.rodIdle.parent) {
    u.rod.quaternion.copy(p.leftArm.quaternion).invert();
  }

  /* Sunbathing: the rod is stowed completely — nothing in the hands while
     lying on a lounger (the planted rod beside the chair stands in for it). */
  if (u.rod) u.rod.visible = !isLying;

  /* Right-hand casting swing: draw the rod back, then whip it forward. */
  if (u.castT > 0) {
    u.castT = Math.max(0, u.castT - dt);
    const k = 1 - u.castT / CAST_DURATION;
    if (k < 0.35) {
      p.rightArm.rotation.x = -0.4 + (k / 0.35) * 1.15;
    } else {
      const t = (k - 0.35) / 0.65;
      const e = 1 - Math.pow(1 - t, 2);
      p.rightArm.rotation.x = 0.75 + e * (-2.05 - 0.75);
    }
    p.rightArm.rotation.z = -0.12;
  }

  /* --- lean into the pull and rock forward/back ---
     The struggle is a pure translation along the body's forward axis:
     no roll, no twist, no yaw. */
  u.lean += ((reeling ? 1 : 0) - u.lean) * Math.min(1, dt * 6);
  u.reel += dt * (reeling ? 24 : 0);
  u.rock = Math.sin(u.reel) * u.lean;

  if (u.lean > 0.002) {
    const rock = u.rock;
    /* The rod-lean tips the whole body forward — but not while the
       avatar is reclined on a lounger, which owns that axis. */
    if (!isLying) avatar.rotation.x = 0.17 * u.lean;
    p.torso.position.z = rock * 0.055;
    p.head.position.z = rock * 0.05;
    p.leftArm.position.z = rock * 0.045;
    p.rightArm.position.z = rock * 0.045;
  } else {
    if (!isLying) avatar.rotation.x = 0;
    p.torso.position.z = 0;
    p.head.position.z = 0;
    p.leftArm.position.z = 0;
    p.rightArm.position.z = 0;
  }

  /* --- cloth: spring-damped so it trails the body's motion --- */
  const stride = moving && !isSitting ? Math.sin(u.phase * 2) * 0.09 : 0;
  for (const c of u.cloth) {
    const targetX = (-u.rock * 0.42 + (moving && !isSitting ? 0.14 : 0) + stride) * c.gain;
    const targetZ = (moving && !isSitting ? Math.sin(u.phase) * 0.06 : 0) * c.gain;

    c.vx += (targetX - c.x) * 140 * dt;
    c.vz += (targetZ - c.z) * 140 * dt;
    const d = Math.pow(0.86, dt * 60);
    c.vx *= d;
    c.vz *= d;
    c.x += c.vx * dt;
    c.z += c.vz * dt;

    c.pivot.rotation.x = c.x;
    c.pivot.rotation.z = c.z;
  }

  if (u.hookMark) {
    u.hookMark.visible = fishing === 'hooked';
    if (u.hookMark.visible) {
      u.hookMark.position.y = 2.95 + Math.sin(u.phase * 1.6) * 0.12;
    }
  }

  if (u.flash > 0) {
    u.flash = Math.max(0, u.flash - dt * 1.5);
    const f = u.flash;
    for (const m of u.materials) {
      if (m.emissive) m.emissive.setRGB(f * 1.0, f * 0.82, f * 0.12);
    }
  }
}

export function getRodTipWorld(avatar, out) {
  const tip = avatar.userData.rodTip;
  if (tip) {
    tip.getWorldPosition(out);
    return out;
  }
  return out
    .copy(avatar.position)
    .add(new THREE.Vector3(0.6, 2.4, 0.5).applyAxisAngle(Y_AXIS, avatar.rotation.y));
}
