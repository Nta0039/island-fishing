import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, tint, part, flatShade, applyWind, updateWind } from './toon.js';

/* Semi-major axis. The island is stretched along X and pinched across Z
   (see islandShape) to give a long, narrow strip of land. */
export const ISLAND_RADIUS = 38;

/* Loose outer bound only. The real limit is the terrain itself — see
   isWalkable() — because the coastline is no longer a circle. */
export const WALK_LIMIT = 56.0;

/* Sea level was lowered so the beach and grass sit clearly above the water. */
export const SEA_LEVEL = -1.0;
export const WATER_LEVEL = SEA_LEVEL;

/* Walkable wooden pier + observation platform (kept in sync with server.js). */
export const PIER = {
  startX: 28,
  rampEndX: 31,
  endX: 58,
  halfZ: 1.7,
  deckY: 0.25,
  z: 0,
  platform: { x0: 50, x1: 58.5, halfZ: 5.0 },
};

/* Two long benches on the observation deck. Each faces out to sea. */
export const BENCHES = [
  { x: 54.2, z: 3.0, facing: 0 },
  { x: 54.2, z: -3.0, facing: Math.PI },
];

/* Lighthouse at the far (western) end — the island's highest ground. */
export const LIGHTHOUSE = { x: -22, z: 1 };

/**
 * Outfit colours offered on the start screen. Mirrored by PALETTE in
 * server.js, which falls back to it if a client sends nothing valid.
 */
export const PLAYER_COLORS = [
  '#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8',
  '#ff922b', '#20c997', '#f06595', '#74c0fc', '#a9e34b',
];

/**
 * Where everyone starts: on the wooden pier, island-side of the sunshade
 * canopy, facing the middle of the island. Mirrored by SPAWN in server.js.
 */
export const SPAWN_POINT = { x: 37.5, z: 0, rotation: -Math.PI / 2 };

export const SEAT_OFFSETS = [-1.4, 0, 1.4];

/** Every sittable spot on the platform. */
export function seatSlots() {
  const slots = [];
  for (const b of BENCHES) {
    for (const dx of SEAT_OFFSETS) {
      slots.push({ x: b.x + dx, z: b.z, y: PIER.deckY, rotation: b.facing });
    }
  }
  return slots;
}

/* Two-storey island shop; the merchant trades from inside it. It sits
   mid-island, halfway along the pier -> house -> lighthouse route. */
export const SHOP = { x: 1.5, z: -2.0, rotation: 0, halfW: 3.2, halfD: 3.0 };

/* The spot in front of the shop counter where customers stand. */
export const MERCHANT = { x: 1.5, z: 2.9, radius: 6.2 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/*  Terrain height field                                               */
/* ------------------------------------------------------------------ */

/**
 * Angle-dependent radius multiplier. Summing a few harmonics of different
 * frequencies gives a coastline with bays and headlands instead of a
 * perfect circle. Range is roughly 0.77 .. 1.23.
 */
export function islandShape(angle) {
  /* Rounded, roughly circular outline — the harmonics below only add
     organic wobble, they do not stretch it along an axis. */
  return (
    1
    + 0.052 * Math.sin(angle * 2 + 0.7)
    + 0.035 * Math.sin(angle * 3 - 1.2)
    + 0.022 * Math.sin(angle * 5 + 2.1)
    + 0.013 * Math.sin(angle * 7 - 0.4)
    + 0.008 * Math.sin(angle * 11 + 1.6)
    + 0.005 * Math.sin(angle * 13 - 2.3)
  );
}

/** Radius at which the shore meets sea level, for a given bearing. */
export function shoreRadius(angle) {
  return ISLAND_RADIUS * islandShape(angle) * 0.9364;
}

/**
 * Raw terrain before the building plot is levelled: the main island
 * mass, a second hill that carries the lighthouse, and layered noise
 * that gives the slopes real vertical relief.
 */
function rawGround(x, z) {
  const d = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const R = ISLAND_RADIUS * islandShape(a);

  const t = Math.max(0, 1 - d / R);

  /* Smoothstep profile: almost no gradient at the shore, steepest in
     the middle, flattening again at the summit. That gives broad gentle
     beaches and removes the steep bank a power curve would leave. */
  const prof = t * t * (3 - 2 * t);
  let h = prof * 4.4;

  /* Continuous ramp: near sea level at the pier, climbing steadily
     westward past the house to the lighthouse. Scaled by `t` so the
     coast itself still meets the water. */
  const ramp = Math.min(1, Math.max(0, (PIER.startX - x) / (PIER.startX - LIGHTHOUSE.x)));
  h += Math.pow(ramp, 1.5) * 6.0 * t;

  /* The lighthouse hill caps the ramp — the island's highest ground.
     It fades out near the coast (via `coastal`) so a sandy beach
     survives all the way around instead of the hillside running
     straight into the water. */
  const hillD = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  const hill = Math.max(0, 1 - hillD / 26);
  /* Generous coastal fade so the hill never crowds the shoreline — the
     western beach ends up as broad as the one by the pier. */
  const coastal = t;
  h += Math.pow(hill, 1.3) * 7.2 * coastal;

  /* Gentle, long-wavelength relief. */
  h += Math.sin(x * 0.16) * Math.cos(z * 0.14) * 0.30 * t;

  /* Finer relief fades out along the island's spine, so the walking
     route from the pier to the lighthouse stays smooth and steadily
     climbing while the flanks keep their character. */
  const spine = 0.25 + 0.75 * Math.min(1, Math.abs(z) / 14);
  h += Math.sin(x * 0.32) * Math.cos(z * 0.27) * 0.22 * spine * t;
  h += Math.sin(x * 0.95 + z * 0.6) * 0.075 * spine * t;
  h += Math.sin(x * 2.3 - z * 1.7) * 0.022 * spine * t;

  h -= 1.5;

  /* Compress the first couple of metres above the waterline. Heights and
     the value at the waterline stay continuous, so the shore becomes a
     broad flat sandy shelf instead of a steep bank — and because it only
     touches land above sea level the seabed keeps its own slope. */
  const above = h - SEA_LEVEL;
  if (above > 0) {
    const SHELF_W = 6.0;
    const SHELF_K = 0.26;
    /* Smoothly ramps the vertical compression from K at the waterline to
       1 further inland — no slope kink where the beach meets the hill. */
    const s = above / (above + SHELF_W);
    h = SEA_LEVEL + above * (SHELF_K + (1 - SHELF_K) * s);
  }

  if (d > R) h -= (d - R) * 0.35;
  return h;
}

/* A levelled building plot. Without this the hillside rises through the
   shop floor on the uphill side while dropping away on the downhill
   side, so the building would either float or be half-buried. */
const SHOP_PAD = {
  x: SHOP.x,
  /* Centred on the plaza in front of the door, not on the building. */
  z: SHOP.z + 1.0,
  halfW: 5.5,
  halfD: 4.5,
  blend: 6.5,
  y: 0,
};

function shopPadWeight(x, z) {
  const dx = Math.abs(x - SHOP_PAD.x) - SHOP_PAD.halfW;
  const dz = Math.abs(z - SHOP_PAD.z) - SHOP_PAD.halfD;
  const d = Math.max(dx, dz);
  if (d <= 0) return 1;
  if (d >= SHOP_PAD.blend) return 0;
  const t = 1 - d / SHOP_PAD.blend;
  return t * t * (3 - 2 * t);
}

/* Sit the plaza a touch below the building's own ground. The shop's
   foundation absorbs the difference, while the surrounding hillside
   only has to fall a little way to meet the plaza — which keeps the
   transition at the plaza edge gentle. */
SHOP_PAD.y = rawGround(SHOP.x, SHOP.z) - 0.35;

/* A dead-level plaza. The whole pad resolves to one height, so the shop
   doorway and the approach to it are never on a slope; the long blend
   keeps the transition into the surrounding hillside smooth. */
function shopPadTarget() {
  return SHOP_PAD.y;
}

export function groundHeight(x, z) {
  const h = rawGround(x, z);
  const pad = shopPadWeight(x, z);
  return pad > 0 ? h + (shopPadTarget(x, z) - h) * pad : h;
}

export function onPier(x, z) {
  if (x >= PIER.startX && x <= PIER.endX && Math.abs(z - PIER.z) <= PIER.halfZ) return true;
  const p = PIER.platform;
  return x >= p.x0 && x <= p.x1 && Math.abs(z - PIER.z) <= p.halfZ;
}

/* ------------------------------------------------------------------ */
/*  Lighthouse interior                                                */
/* ------------------------------------------------------------------ */

/**
 * The lighthouse is a hollow tower with a doorway on the island-facing
 * side, a spiral ramp that climbs the inside, and an open gallery on
 * top. These radii describe that walkable shell and are shared by the
 * collision helpers here and by buildLighthouse() below.
 *
 * The ramp's height depends on the angle alone, so the entire climb is a
 * pure function of position — no per-player state that could desync.
 */
export const LIGHT = {
  rCore: 1.6,      // solid central column / lantern room
  rIn: 5.0,        // walkable interior radius (the spiral ramp)
  rWall: 5.5,      // outer face of the tower
  rDeck: 6.3,      // outer edge of the gallery
  rBase: 6.8,      // stone base footprint; the railing band sits inside it
  doorHalf: 0.18,  // half-angle of the doorway
  topStart: 4.0,   // angle where the ramp tops out — the hatch mouth
  topEnd: 5.82,    // far end of the observation deck
  towerH: 14.0,
};

/** Angular gap left in the gallery either side of the doorway. */
const GALLERY_GAP = 0.30;

/**
 * Interior floor. Taken from the terrain right at the doorway so the
 * threshold meets the hillside exactly — no step in, and no bank of
 * ground poking up through the base.
 */
export function lighthouseFloorY() {
  return groundHeight(LIGHTHOUSE.x + LIGHT.rWall, LIGHTHOUSE.z);
}

export function lighthouseDeckY() {
  return lighthouseFloorY() + LIGHT.towerH;
}

/** Polar coordinates about the tower, or null outside its footprint. */
function lighthouseZone(x, z) {
  const dx = x - LIGHTHOUSE.x;
  const dz = z - LIGHTHOUSE.z;
  const d = Math.hypot(dx, dz);
  if (d > LIGHT.rBase) return null;
  let rel = Math.atan2(dz, dx);
  if (rel < 0) rel += Math.PI * 2;
  return { d, rel };
}

const inDoorway = (rel) => rel <= LIGHT.doorHalf || rel >= Math.PI * 2 - LIGHT.doorHalf;
const onDeck = (rel) => rel >= LIGHT.topStart && rel <= LIGHT.topEnd;
/* The gallery runs all the way round, bar a short panel either side of
   the doorway where the entrance ramp passes underneath. */
const onGallery = (rel) =>
  rel >= LIGHT.doorHalf + GALLERY_GAP && rel <= Math.PI * 2 - LIGHT.doorHalf - GALLERY_GAP;

/**
 * How much open ground every tree is guaranteed around the tower. Wide
 * enough for the largest canopy on the island (~2.6u) plus the gallery
 * overhang, so nothing can ever poke into the lighthouse.
 */
export const LIGHT_CLEARANCE = 4.0;

/**
 * True while the player is shut inside the tower below the gallery, so
 * the shell can be hidden and the follow camera can see through the wall.
 * Pass the player's standing height so the gallery itself stays intact.
 */
export function insideLighthouse(x, z, y = -Infinity) {
  const L = lighthouseZone(x, z);
  if (!L || L.d > LIGHT.rWall) return false;
  return y < lighthouseDeckY() - 1.2;
}

/**
 * Height of the lighthouse floor at this spot, or null when there is no
 * surface there (the wall, the base or the central column) — in which
 * case the caller falls back to the terrain.
 *
 * Three surfaces share the tower footprint, separated by angle:
 *   doorway  — level entry at the bottom, on the island-facing side
 *   ramp     — the spiral, whose height depends on angle alone
 *   deck     — the observation floor at the top, ending at the hatch
 */
function lighthouseHeight(x, z) {
  const L = lighthouseZone(x, z);
  if (!L) return null;
  const { d, rel } = L;
  if (d < LIGHT.rCore) return null;

  /* Doorway: a level passage, then a short ramp down to the hillside. */
  if (inDoorway(rel)) {
    if (d <= LIGHT.rWall) return lighthouseFloorY();
    const t = Math.min(1, (d - LIGHT.rWall) / (LIGHT.rDeck - LIGHT.rWall));
    return lighthouseFloorY() * (1 - t) + groundHeight(x, z) * t;
  }

  /* Observation deck: the top floor, and the gallery that rings it. */
  if (onDeck(rel)) return d <= LIGHT.rDeck ? lighthouseDeckY() : null;
  if (onGallery(rel) && d > LIGHT.rWall && d <= LIGHT.rDeck) return lighthouseDeckY();

  /* The spiral ramp itself. */
  if (d <= LIGHT.rIn && rel > LIGHT.doorHalf && rel < LIGHT.topStart) {
    const t = (rel - LIGHT.doorHalf) / (LIGHT.topStart - LIGHT.doorHalf);
    return lighthouseFloorY() + t * LIGHT.towerH;
  }
  return null;
}

/** Height the player actually stands on (terrain, pier deck, or tower). */
export function surfaceHeight(x, z) {
  if (onPier(x, z)) {
    if (x < PIER.rampEndX) {
      const g = groundHeight(x, z);
      const t = clamp((x - PIER.startX) / (PIER.rampEndX - PIER.startX), 0, 1);
      return g + (PIER.deckY - g) * t;
    }
    return PIER.deckY;
  }
  const h = lighthouseHeight(x, z);
  if (h !== null) return h;
  return groundHeight(x, z);
}

/** True while standing on the sandy beach band. */
export function isSand(x, z) {
  if (Math.hypot(x, z) > ISLAND_RADIUS + 0.5) return false;
  const h = groundHeight(x, z);
  return h > SEA_LEVEL - 0.55 && h < SEA_LEVEL + 1.5;
}

/**
 * True when the player is looking away from the island — used to gate the
 * fishing prompt, so you can only cast with your back to the grass. The
 * island is roughly round, so the outward direction is simply the bearing
 * from the middle. A small positive threshold means you must be facing
 * mostly seaward, not merely sideways along the beach.
 */
export function facingOcean(x, z, rotation) {
  const r = Math.hypot(x, z);
  if (r < 0.001) return false;
  const facingX = Math.sin(rotation);
  const facingZ = Math.cos(rotation);
  return (facingX * x + facingZ * z) / r > 0.15;
}

/** The full casting condition: sand underfoot, sea ahead. */
export function canCast(x, z, rotation) {
  return isSand(x, z) && facingOcean(x, z, rotation);
}

/**
 * Beach loungers, dotted along the sand and all facing out to sea. Each
 * is placed at the middle of the sand band on its bearing, and `rotation`
 * follows the same convention as the avatar: facing (sin r, cos r).
 */
export const BEACH_CHAIRS = (() => {
  const palms = palmSpots();
  const out = [];
  const CLEAR = 2.9;   // lounger half-length plus a trunk's root flare
  const clearOfPalms = (x, z) => !palms.some((p) => Math.hypot(p.x - x, p.z - z) < CLEAR);

  const beachR = (a) => {
    let lo = 0;
    let hi = 70;
    for (let k = 0; k < 48; k++) {
      const mid = (lo + hi) / 2;
      if (groundHeight(Math.cos(a) * mid, Math.sin(a) * mid) > SEA_LEVEL + 0.7) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const bearings = [0.62, 1.28, 2.62, 4.35, 5.28];
  bearings.forEach((a0, i) => {
    let spot = null;
    /* Search outward from the requested bearing, both ways, until the
       lounger has a clear patch of sand away from every palm. */
    for (let step = 0; step < 26 && !spot; step++) {
      for (const dir of (step === 0 ? [0] : [1, -1])) {
        const a = a0 + dir * step * 0.045;
        const r = beachR(a);
        for (const dr of [0, -1.7, 1.7]) {
          const x = Math.cos(a) * (r + dr);
          const z = Math.sin(a) * (r + dr);
          if (groundHeight(x, z) < SEA_LEVEL + 0.25) continue;
          if (!clearOfPalms(x, z)) continue;
          spot = {
            x, z,
            rotation: Math.PI / 2 - a,
            y: groundHeight(x, z),
            umbrella: i % 2 === 0,
            umbrellaColor: ['#e8574a', '#4a9ec0', '#f0c14b'][i % 3],
          };
          break;
        }
        if (spot) break;
      }
    }
    if (spot) out.push(spot);
  });
  return out;
})();

/**
 * One continuous canopy surface for a beach umbrella.
 *
 * A real canopy is a single sheet of fabric: it rises to a point, falls
 * away toward the rim, sags between the ribs, and carries a valance on
 * the same piece of cloth. Building it as one mesh (rather than a dozen
 * separate wedges) gives clean, seam-free geometry with correct normals.
 *
 * Vertex colours alternate gore by gore, so the stripes cost nothing.
 */
function buildUmbrellaCanopy({ radius, apexY, drop, sag, gores, valance, segments = 72 }) {
  const RINGS = 10;      // apex -> rim
  const VAL_RINGS = 3;   // valance hanging below the rim
  const rows = RINGS + VAL_RINGS + 1;
  const cols = segments + 1;   // duplicate the seam so UVs stay clean

  const pos = new Float32Array(rows * cols * 3);
  const col = new Float32Array(rows * cols * 3);
  const idx = [];
  const goreArc = (Math.PI * 2) / gores;
  const dark = new THREE.Color('#000000');

  /* Alternate between the umbrella's colour and a pale cream. */
  const colour = new THREE.Color('#ffffff');
  const pale = new THREE.Color('#f4f1e8');

  for (let j = 0; j < rows; j++) {
    const onValance = j > RINGS;
    const k = onValance ? j - RINGS : 0;
    const t = onValance ? 1 : j / RINGS;

    for (let i = 0; i < cols; i++) {
      const a = (i / segments) * Math.PI * 2;
      /* 0 along a rib, 1 halfway between two ribs. */
      const between = (1 - Math.cos(gores * a)) / 2;

      const r = onValance
        ? radius * (1 + 0.035 * k)          // the skirt flares very slightly
        : radius * t;

      const y = onValance
        ? apexY - drop - sag * between - (valance * k) / VAL_RINGS
        : apexY - drop * Math.pow(t, 1.3) - sag * t * t * between;

      const o = (j * cols + i) * 3;
      pos[o] = Math.cos(a) * r;
      pos[o + 1] = y;
      pos[o + 2] = Math.sin(a) * r;

      /* Stripe by gore; the valance alternates one step out of phase so
         the skirt reads as a separate band of cloth. */
      const gore = Math.floor(i / (segments / gores));
      const stripe = onValance ? (gore + 1) % 2 : gore % 2;
      const c = stripe ? pale : colour;
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
  }

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A wooden beach lounger. Built facing +z with the reclined back at -z,
 * so a lounging avatar lines up with it directly.
 */
function buildBeachChair(chair) {
  const g = new THREE.Group();
  const frame = toonMaterial({ color: '#c9b28a' });
  const frameDark = toonMaterial({ color: '#a08a63' });
  const cushion = toonMaterial({ color: '#e8574a' });
  const cushionPale = toonMaterial({ color: '#f4f1e8' });
  const ironMat = toonMaterial({ color: '#4a5560' });
  const brassMat = toonMaterial({ color: '#c9a227' });

  /* Legs. */
  for (const [lx, lz] of [[-0.3, 0.8], [0.3, 0.8], [-0.3, -0.5], [0.3, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), frameDark);
    leg.position.set(lx, 0.18, lz);
    g.add(leg);
  }

  /* Side rails along the seat. */
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 1.5), frame);
    rail.position.set(sx * 0.32, 0.36, 0.2);
    g.add(rail);
  }

  /* Seat slats, alternating so the cushion reads as striped. */
  for (let i = 0; i < 7; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.15), i % 2 ? cushion : cushionPale);
    slat.position.set(0, 0.39, 0.86 - i * 0.19);
    g.add(slat);
  }

  /* Reclined back, laid well back so a lounging avatar is nearly flat. */
  const BACK_TILT = 0.4;
  const back = new THREE.Group();
  back.position.set(0, 0.36, -0.28);
  back.rotation.x = BACK_TILT;
  g.add(back);
  for (let i = 0; i < 8; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.15), i % 2 ? cushionPale : cushion);
    slat.position.set(0, 0, -0.12 - i * 0.19);
    back.add(slat);
  }
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 1.62), frame);
    rail.position.set(sx * 0.32, 0, -0.75);
    back.add(rail);
  }

  /* A little side table with a cool drink. */
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14), frame);
  table.position.set(0.62, 0.34, 0.15);
  g.add(table);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 8), frameDark);
  tableLeg.position.set(0.62, 0.17, 0.15);
  g.add(tableLeg);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.045, 0.16, 10),
    toonMaterial({ color: '#ffd98a', transparent: true, opacity: 0.85 })
  );
  glass.position.set(0.62, 0.45, 0.15);
  g.add(glass);
  /* A slice of citrus on the rim and a paperback left face-down. */
  const citrus = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.016, 12),
    toonMaterial({ color: '#ffd166' })
  );
  citrus.position.set(0.62, 0.53, 0.15);
  citrus.rotation.z = 0.5;
  g.add(citrus);
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.28), toonMaterial({ color: '#2f6f86' }));
  book.position.set(0.62, 0.38, -0.16);
  book.rotation.y = 0.4;
  g.add(book);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.26), toonMaterial({ color: '#f4f1e8' }));
  pages.position.set(0.62, 0.405, -0.16);
  pages.rotation.y = 0.4;
  g.add(pages);

  /* Armrests down both sides, on little uprights. */
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.62), frame);
    arm.position.set(sx * 0.34, 0.5, 0.28);
    g.add(arm);
    for (const az of [0.04, 0.52]) {
      const up = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.06), frameDark);
      up.position.set(sx * 0.34, 0.42, az);
      g.add(up);
    }
  }

  /* A rolled headrest cushion and a folded towel over the back. */
  const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 12), cushionPale);
  pillow.rotation.z = Math.PI / 2;
  pillow.position.set(0, 0.72, -0.62);
  pillow.rotation.y = 0.02;
  g.add(pillow);
  const towel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.34), cushion);
  towel.position.set(0, 0.86, -0.72);
  towel.rotation.x = 0.4;
  g.add(towel);
  const towelFold = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.16), cushionPale);
  towelFold.position.set(0, 0.905, -0.83);
  towelFold.rotation.x = 0.4;
  g.add(towelFold);

  /* A foot bar across the seaward end. */
  const footBar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.07), frameDark);
  footBar.position.set(0, 0.2, 0.9);
  g.add(footBar);
  for (const sx of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), frameDark);
    strut.position.set(sx * 0.28, 0.3, 0.9);
    g.add(strut);
  }

  /* The rod, planted upright in the sand beside the chair. Hidden until
     somebody is actually sunbathing here. */
  const rod = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 2.6, 9), toonMaterial({ color: '#8a5a2b' }));
  shaft.position.y = 1.3;
  rod.add(shaft);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 9), frameDark);
  grip.position.y = 0.21;
  rod.add(grip);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), ironMat);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0.11, 0.5, 0);
  rod.add(reel);
  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 8), ironMat);
  butt.position.y = -0.05;
  rod.add(butt);
  rod.position.set(-0.72, 0.02, 0.5);
  rod.rotation.z = 0.12;
  rod.visible = false;
  g.add(rod);

  /* A mound of sand where the rod is planted, so it reads as stuck in. */
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 8),
    toonMaterial({ color: '#e6d6ac' })
  );
  mound.scale.set(1, 0.35, 1);
  mound.position.set(-0.72, 0.03, 0.5);
  g.add(mound);

  /* --- sun umbrella, on the loungers that have one --- */
  if (chair.umbrella) {
    const UX = -1.4;
    const UZ = -0.25;

    /* Real beach-umbrella proportions: a canopy about 2m across on a
       pole a little over 2m tall, so it clears a seated head easily. */
    const RADIUS = 1.05;
    const POLE_TOP = 2.15;
    const APEX = 2.24;
    const DROP = 0.34;
    const SAG = 0.075;
    const GORES = 8;
    const VALANCE = 0.18;

    const fabric = toonMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });

    /* The canopy and its valance are one continuous sheet of cloth. */
    const canopy = new THREE.Mesh(
      buildUmbrellaCanopy({
        radius: RADIUS,
        apexY: APEX,
        drop: DROP,
        sag: SAG,
        gores: GORES,
        valance: VALANCE,
      }),
      fabric
    );
    canopy.position.set(UX, 0, UZ);
    g.add(canopy);

    /* Eight ribs following the canopy underside, hub to rim. */
    const ribParts = [];
    for (let i = 0; i < GORES; i++) {
      const a = (i / GORES) * Math.PI * 2;
      const len = Math.hypot(RADIUS, DROP) - 0.06;
      const rib = new THREE.BoxGeometry(len, 0.022, 0.022);
      /* Build it along +x, tip it to match the canopy's slope, swing it
         to its bearing, and only then slide it out from the hub. */
      rib.rotateZ(-Math.atan2(DROP, RADIUS));
      rib.rotateY(-a);
      rib.translate(Math.cos(a) * (len / 2), -0.035, Math.sin(a) * (len / 2));
      tint(rib, '#7d766c');
      ribParts.push(rib);
    }
    const ribs = new THREE.Mesh(
      mergeGeometries(ribParts, false),
      toonMaterial({ vertexColors: true })
    );
    ribs.position.set(UX, APEX, UZ);
    g.add(ribs);

    /* Hub the ribs meet under. */
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.07, 16), brassMat);
    hub.position.set(UX, APEX - 0.03, UZ);
    g.add(hub);

    /* Pole: one tapered shaft with a collar, a ferrule at the top and a
       weighted foot at the bottom. */
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.034, POLE_TOP, 16), frameDark
    );
    pole.position.set(UX, POLE_TOP / 2, UZ);
    g.add(pole);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.08, 16), brassMat);
    collar.position.set(UX, 1.18, UZ);
    g.add(collar);

    const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 16), brassMat);
    ferrule.position.set(UX, POLE_TOP + 0.05, UZ);
    g.add(ferrule);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 10), brassMat);
    finial.position.set(UX, POLE_TOP + 0.15, UZ);
    g.add(finial);

    /* Base: a low plate with a domed weight, so it reads as standing on
       the sand under its own mass. */
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 22), ironMat);
    plate.position.set(UX, 0.03, UZ);
    g.add(plate);
    const weight = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), ironMat
    );
    weight.scale.set(1, 0.5, 1);
    weight.position.set(UX, 0.06, UZ);
    g.add(weight);
  }
  g.userData.chair = chair;
  g.userData.rod = rod;

  g.position.set(chair.x, chair.y, chair.z);
  g.rotation.y = chair.rotation;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}


/**
 * The shop building's footprint. Its walls are solid, so the player
 * trades from the step outside and can never walk through the storefront
 * or clip into the shelves.
 */
export function insideShop(x, z) {
  return Math.abs(x - SHOP.x) < SHOP.halfW + 0.32
    && Math.abs(z - SHOP.z) < SHOP.halfD + 0.32;
}

/**
 * Walkability follows the terrain rather than a fixed radius, so the
 * irregular coastline is respected and players can wade to the waterline
 * wherever it happens to be.
 */
export function isWalkable(x, z) {
  if (onPier(x, z)) return true;
  /* Buildings are solid — no walking through the shop. */
  if (insideShop(x, z)) return false;
  /* The tower is solid apart from its doorway, ramp and deck, so
     anything else inside its footprint is wall. */
  if (lighthouseZone(x, z)) return lighthouseHeight(x, z) !== null;
  /* Wading depth. The seabed stays within a metre of the waterline for
     several units past the shore, so allowing a full body of depth lets
     players walk the whole sand shelf instead of being stopped at the
     water's edge. */
  return groundHeight(x, z) > SEA_LEVEL - 1.45;
}

/* ------------------------------------------------------------------ */
/*  Path from the shop down to the pier                               */
/* ------------------------------------------------------------------ */

/**
 * The main trail — lighthouse -> house -> pier — as one continuous run.
 */
const TRAIL_POINTS = (() => {
  const pts = [];
  const addCurve = (p0, p1, p2, n) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const mt = 1 - t;
      pts.push({
        x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
        z: mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z,
      });
    }
  };

  /* Starts right in front of the lighthouse doorway, then winds east.
     The start and the control point are both pushed clear of the tower's
     footprint so the curve bows away from it instead of cutting through
     the masonry. */
  addCurve(
    { x: LIGHTHOUSE.x + LIGHT.rBase + 1.2, z: LIGHTHOUSE.z },
    { x: LIGHTHOUSE.x + LIGHT.rBase + 1.6, z: LIGHTHOUSE.z + 7.5 },
    { x: -10.0, z: -2.0 },
    24
  );

  /* Up to the shop, arriving right outside its front step. */
  addCurve(
    { x: -10.0, z: -2.0 },
    { x: -4.0, z: 5.0 },
    { x: SHOP.x, z: SHOP.z + SHOP.halfD + 2.5 },
    22
  );

  /* Away from the shop, winding north then south again. */
  addCurve(
    { x: SHOP.x, z: SHOP.z + SHOP.halfD + 2.5 },
    { x: 9.0, z: 6.0 },
    { x: 17.0, z: -2.0 },
    20
  );

  /* And on to the pier. */
  addCurve(
    { x: 17.0, z: -2.0 },
    { x: 26.0, z: 5.0 },
    { x: PIER.startX - 0.5, z: 0 },
    20
  );

  return pts;
})();

/**
 * Radius of the looping trail at a given bearing. Shared by the trail
 * builder and the palm scatter, so nothing is ever planted on it.
 */
function loopPathRadius(a) {
  return 17.4
    + Math.sin(a * 3 + 0.6) * 1.5
    + Math.cos(a * 2 - 1.1) * 1.2
    + Math.sin(a * 5 + 2.4) * 0.6;
}

/**
 * A second, closed trail that rings the island's central green. The
 * radius breathes in and out with a couple of slow harmonics so the loop
 * wanders like a worn footpath instead of tracing a compass circle.
 */
const LOOP_POINTS = (() => {
  const pts = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = loopPathRadius(a);
    pts.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return pts;
})();

/** Every stone in the network: the main trail plus the circling loop. */
const PATH_POINTS = [...TRAIL_POINTS, ...LOOP_POINTS];

function nearPath(x, z, clearance) {
  const c2 = clearance * clearance;
  for (const p of PATH_POINTS) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < c2) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Ocean                                                              */
/* ------------------------------------------------------------------ */

/** Analytic wave height — mirrors the ocean vertex shader exactly, so
    floating objects can ride the swell instead of being clipped by it. */
export function waveHeight(x, z, t) {
  const a = x * 0.045 + t * 0.90;
  const b = z * 0.055 + t * 0.75;
  const c = (x + z) * 0.028 + t * 0.50;
  const d = (x - z) * 0.100 + t * 1.35;
  return Math.sin(a) * 0.15 + Math.cos(b) * 0.12 + Math.sin(c) * 0.16 + Math.sin(d) * 0.07;
}

function buildOcean() {
  const geo = new THREE.PlaneGeometry(4000, 4000, 220, 220);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color('#052742') },
    uShallow: { value: new THREE.Color('#1aa7c9') },
    uSky: { value: new THREE.Color('#bfe9ff') },
    uSun: { value: new THREE.Vector3(0.55, 0.78, 0.3).normalize() },
    uFogColor: { value: new THREE.Color('#a8dcf5') },
    uFogNear: { value: 160 },
    uFogFar: { value: 900 },
    uFoamColor: { value: new THREE.Color('#f4fcff') },
  };

  const vertexShader = /* glsl */`
    uniform float uTime;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vWave;

    void main() {
      vec3 p = position;

      float a = p.x * 0.045 + uTime * 0.90;
      float b = p.z * 0.055 + uTime * 0.75;
      float c = (p.x + p.z) * 0.028 + uTime * 0.50;
      float d = (p.x - p.z) * 0.100 + uTime * 1.35;

      /* Rolling swell: 0.5 units total. Sea level sits at -1.0, so the
         crest only ever washes a couple of metres up the sand. */
      float w = sin(a) * 0.15 + cos(b) * 0.12 + sin(c) * 0.16 + sin(d) * 0.07;
      p.y += w;

      float dwdx = cos(a) * 0.045 * 0.15 + cos(c) * 0.028 * 0.16 + cos(d) * 0.100 * 0.07;
      float dwdz = -sin(b) * 0.055 * 0.12 + cos(c) * 0.028 * 0.16 - cos(d) * 0.100 * 0.07;

      vNormal = normalize(vec3(-dwdx, 1.0, -dwdz));
      vWave = w;

      vec4 wp = modelMatrix * vec4(p, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  const fragmentShader = /* glsl */`
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    uniform vec3 uSky;
    uniform vec3 uSun;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform vec3 uFoamColor;
    uniform float uTime;
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vWave;

    /* Mirrors islandShape() + groundHeight() in JS so the foam hugs the
       real, irregular coastline rather than a circle. */
    float islandShape(float a) {
      return 1.0
        + 0.052 * sin(a * 2.0 + 0.7)
        + 0.035 * sin(a * 3.0 - 1.2)
        + 0.022 * sin(a * 5.0 + 2.1)
        + 0.013 * sin(a * 7.0 - 0.4)
        + 0.008 * sin(a * 11.0 + 1.6)
        + 0.005 * sin(a * 13.0 - 2.3);
    }

    /* Mirrors groundHeight() in JS. The foam band and the water clarity
       both key off real depth, so this has to track the actual terrain —
       a stale approximation paints foam across the shallows and hides
       the reef. */
    float terrainApprox(vec2 xz) {
      float d = length(xz);
      float a = atan(xz.y, xz.x);
      float R = 38.0 * islandShape(a);
      float t = max(0.0, 1.0 - d / R);

      float prof = t * t * (3.0 - 2.0 * t);
      float h = prof * 4.4;

      float ramp = clamp((28.0 - xz.x) / 50.0, 0.0, 1.0);
      h += pow(ramp, 1.5) * 6.0 * t;

      float hillD = length(xz - vec2(-22.0, 1.0));
      float hill = max(0.0, 1.0 - hillD / 26.0);
      h += pow(hill, 1.3) * 7.2 * t;

      h -= 1.5;

      float above = h + 1.0;
      if (above > 0.0) {
        float s = above / (above + 6.0);
        h = -1.0 + above * (0.26 + 0.74 * s);
      }
      return h;
    }

    void main() {
      vec2 pxz = vWorld.xz;
      float dist = length(cameraPosition - vWorld);

      /* --- fine ripple detail, evaluated per pixel -------------------
         The mesh grid is far too coarse for short waves, so the small
         chop is added as a normal perturbation instead. */
      vec2 g = vec2(0.0);

      vec2 d1 = normalize(vec2(1.0, 0.35));
      float p1 = 1.9 * dot(d1, pxz) + uTime * 2.2;
      g += d1 * (0.035 * 1.9 * cos(p1));

      vec2 d2 = normalize(vec2(-0.4, 1.0));
      float p2 = 2.6 * dot(d2, pxz) + uTime * 2.9;
      g += d2 * (0.028 * 2.6 * cos(p2));

      vec2 d3 = normalize(vec2(0.8, -0.6));
      float p3 = 4.1 * dot(d3, pxz) + uTime * 3.7;
      g += d3 * (0.018 * 4.1 * cos(p3));

      vec2 d4 = normalize(vec2(-0.9, -0.3));
      float p4 = 6.4 * dot(d4, pxz) + uTime * 4.6;
      g += d4 * (0.010 * 6.4 * cos(p4));

      /* Fade the chop out with distance to avoid shimmer at the horizon. */
      g *= 1.0 - smoothstep(70.0, 320.0, dist);

      vec3 n = normalize(vec3(vNormal.x - g.x, vNormal.y, vNormal.z - g.y));
      vec3 v = normalize(cameraPosition - vWorld);
      vec3 sunDir = normalize(uSun);

      float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      vec3 base = mix(uDeep, uShallow, clamp(vWave * 0.7 + 0.5, 0.0, 1.0));

      /* Cel-shaded diffuse: quantise into flat bands. */
      float diff = max(dot(n, sunDir), 0.0);
      float banded = floor(diff * 4.0 + 0.5) / 4.0;
      vec3 col = base * (0.5 + 0.62 * banded);

      /* Hard toon highlight, now broken up by the ripples. */
      vec3 h = normalize(sunDir + v);
      float spec = smoothstep(0.972, 0.995, dot(n, h));
      col += vec3(1.0) * spec * 0.9;

      col = mix(col, uSky, fres * 0.55);

      /* --- shore foam ------------------------------------------------
         Driven by the real water depth, so the white water hugs the
         actual waterline and washes in and out with the swell. */
      float r = length(vWorld.xz);
      float bearing = atan(vWorld.z, vWorld.x);
      float depth = vWorld.y - terrainApprox(vWorld.xz);

      float shallow = 1.0 - smoothstep(0.0, 0.90, depth);
      float ripple = 0.5 + 0.5 * sin(r * 2.2 - uTime * 1.7 + vWave * 26.0);
      float lace = 0.5 + 0.5 * sin(r * 6.5 + uTime * 1.0 + vWave * 46.0);
      float foam = shallow * (0.55 + 0.45 * ripple) * (0.70 + 0.30 * lace);
      foam = smoothstep(0.20, 0.70, foam);

      /* Crisp bright line exactly at the water's edge. */
      float edge = 1.0 - smoothstep(0.0, 0.10, depth);
      float foamAmt = clamp(max(foam, edge * 0.95), 0.0, 1.0);

      col = mix(col, uFoamColor, foamAmt);
      col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));

      /* Shallow water is much clearer, so the seabed and the coral
         gardens read through it; deep water stays opaque. */
      float clarity = mix(0.42, 0.95, smoothstep(0.5, 9.0, depth));
      gl_FragColor = vec4(col, mix(clarity, 1.0, foamAmt));

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    /* Nudge the surface toward the camera so it never z-fights with the
       sand along the waterline. */
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = SEA_LEVEL;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/* ------------------------------------------------------------------ */
/*  Island terrain                                                     */
/* ------------------------------------------------------------------ */

const C_SEABED = new THREE.Color('#8f7f58');
const C_WETSAND = new THREE.Color('#c9b183');
const C_SAND = new THREE.Color('#eeddb0');
const C_GRASS = new THREE.Color('#5aa84f');
const C_GRASS_DARK = new THREE.Color('#3c7d3a');

function terrainColor(y) {
  const c = new THREE.Color();
  if (y < SEA_LEVEL + 0.5) {
    c.copy(C_SEABED).lerp(C_WETSAND, clamp((y - (SEA_LEVEL - 1.8)) / 2.3, 0, 1));
    if (y > SEA_LEVEL - 0.15) {
      c.lerp(C_SAND, clamp((y - (SEA_LEVEL - 0.15)) / 0.65, 0, 1));
    }
  } else {
    c.copy(C_SAND).lerp(C_GRASS, clamp((y - (SEA_LEVEL + 0.5)) / 1.05, 0, 1));
    c.lerp(C_GRASS_DARK, clamp((y - (SEA_LEVEL + 1.6)) / 3.0, 0, 1) * 0.6);
  }
  return c;
}

function buildIsland() {
  const rings = 84;
  const sectors = 148;
  const maxR = ISLAND_RADIUS * 1.7;

  const positions = [];
  const colors = [];
  const indices = [];

  for (let r = 0; r <= rings; r++) {
    /* The innermost ring gets a hair of radius: collapsing it to a single
       point produces degenerate triangles with zero-length normals. */
    const rw = r === 0 ? maxR * 1e-4 : maxR * Math.pow(r / rings, 0.95);
    for (let s = 0; s <= sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      const x = Math.cos(a) * rw;
      const z = Math.sin(a) * rw;
      const y = groundHeight(x, z);
      positions.push(x, y, z);

      const c = terrainColor(y);
      const n = Math.sin(x * 3.1) * Math.cos(z * 2.7) * 0.5 + 0.5;
      c.offsetHSL(0, 0, (n - 0.5) * 0.06);
      colors.push(c.r, c.g, c.b);
    }
  }

  /*
   * Winding matters: with the vertices laid out radially (s increasing =
   * counter-clockwise seen from above), the triangles must be wound
   * a -> a+1 -> b so the computed face normals point UP. The previous
   * order produced downward normals, which made the terrain vanish from
   * above and show its underside at eye level.
   */
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * (sectors + 1) + s;
      const b = a + sectors + 1;
      indices.push(a, a + 1, b);
      indices.push(a + 1, b + 1, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  /* Safety net: any vertex that ended up with a null normal (degenerate
     face) would render black, so force it to point up. */
  const normals = geo.attributes.normal;
  for (let i = 0; i < normals.count; i++) {
    if (normals.getX(i) === 0 && normals.getY(i) === 0 && normals.getZ(i) === 0) {
      normals.setXYZ(i, 0, 1, 0);
    }
  }
  normals.needsUpdate = true;

  const mat = toonMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shadowSide: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Scatter helpers                                                    */
/* ------------------------------------------------------------------ */

function scatter(rng, count, minR, maxR, minHeight, opts = {}) {
  const out = [];
  const exclude = opts.exclude;
  /* The island is elongated, so spreads are stretched along X to match. */
  const stretchX = opts.stretchX || 1;
  let guard = 0;
  while (out.length < count && guard < count * 90) {
    guard++;
    const a = rng() * Math.PI * 2;
    const r = minR + rng() * (maxR - minR);
    const x = Math.cos(a) * r * stretchX;
    const z = Math.sin(a) * r;
    const y = groundHeight(x, z);
    if (y < minHeight) continue;
    if (opts.maxHeight !== undefined && y > opts.maxHeight) continue;
    if (opts.avoidCenter && Math.hypot(x, z) < opts.avoidCenter) continue;
    if (exclude && exclude(x, z)) continue;
    out.push({ x, y, z, a: rng() * Math.PI * 2, s: 0.7 + rng() * 0.7 });
  }
  return out;
}

function structureExclude(x, z) {
  if (Math.abs(x - SHOP.x) < SHOP.halfW + 1.4 && Math.abs(z - SHOP.z) < SHOP.halfD + 1.4) return true;
  if (Math.hypot(x - MERCHANT.x, z - MERCHANT.z) < 5.0) return true;
  if (nearPath(x, z, 2.0)) return true;
  if (onPier(x, z) || (x > PIER.startX - 2 && x < PIER.endX + 2 && Math.abs(z) < 3.5)) return true;
  /* Strict clearing around the lighthouse. The margin covers the widest
     canopy on the island (a large round tree is ~2.6u across) plus the
     gallery overhang, so no trunk or branch can reach the tower. */
  if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < LIGHT.rBase + LIGHT_CLEARANCE) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Trees — several distinct silhouettes                               */
/* ------------------------------------------------------------------ */

function buildPineGeo() {
  const parts = [];

  /* Tapered trunk in stacked segments, so the silhouette narrows
     smoothly instead of stepping, plus a root flare at the base. */
  const TRUNK_H = 2.7;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    parts.push(part(
      new THREE.CylinderGeometry(0.30 - 0.19 * t1, 0.30 - 0.19 * t0, TRUNK_H / segs, 14),
      i % 2 ? '#6b4a2b' : '#755130',
      { pos: [0, TRUNK_H * (t0 + t1) / 2, 0] }
    ));
  }
  parts.push(part(new THREE.CylinderGeometry(0.31, 0.45, 0.38, 16), '#5c3f24', { pos: [0, 0.19, 0] }));

  /* Five overlapping tiers of needles. Each tier carries a skirt of
     drooping sprays, so the tree keeps its conifer read from any angle. */
  const TIERS = 5;
  const shades = ['#2b7230', '#2f7d32', '#37903c', '#3fa044', '#47ab4b'];
  for (let i = 0; i < TIERS; i++) {
    const t = i / (TIERS - 1);
    const y = 2.15 + t * 2.8;
    const r = 1.68 * (1 - t * 0.74);
    const h = 1.55 * (1 - t * 0.34);
    parts.push(part(new THREE.ConeGeometry(r, h, 18), shades[i], { pos: [0, y + h * 0.34, 0] }));

    const sprays = 7;
    for (let k = 0; k < sprays; k++) {
      const a = (k / sprays) * Math.PI * 2 + i * 0.45;
      parts.push(part(new THREE.ConeGeometry(0.17, 0.92, 7), shades[Math.max(0, i - 1)], {
        rot: [Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15],
        pos: [Math.cos(a) * r * 0.8, y + 0.05, Math.sin(a) * r * 0.8],
      }));
    }
  }
  return mergeGeometries(parts, false);
}

function buildRoundGeo() {
  const parts = [
    part(new THREE.CylinderGeometry(0.19, 0.36, 2.5, 16), '#7a5330', { pos: [0, 1.25, 0] }),
  ];

  /* Three limbs splitting out of the crown. */
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.16, 1.6, 9), '#6d4a2b', {
      rot: [Math.sin(a) * 0.72, 0, -Math.cos(a) * 0.72],
      pos: [Math.cos(a) * 0.44, 2.6, Math.sin(a) * 0.44],
    }));
  }

  /* A big lobed canopy plus smaller clumps, subdivided twice so the
     silhouette stays round when the light catches it. */
  parts.push(part(new THREE.IcosahedronGeometry(1.5, 2), '#3f9142', { scale: [1.2, 1.0, 1.2], pos: [0, 3.35, 0] }));
  parts.push(part(new THREE.IcosahedronGeometry(1.06, 2), '#4aa64c', { pos: [0.95, 2.62, 0.5] }));
  parts.push(part(new THREE.IcosahedronGeometry(0.98, 2), '#357c39', { pos: [-0.86, 2.92, -0.58] }));
  parts.push(part(new THREE.IcosahedronGeometry(0.86, 2), '#48a04a', { pos: [0.12, 2.15, -1.0] }));
  parts.push(part(new THREE.IcosahedronGeometry(0.78, 2), '#3d8c40', { pos: [-0.3, 4.0, 0.42] }));
  parts.push(part(new THREE.IcosahedronGeometry(0.7, 1), '#57ab57', { pos: [0.6, 3.95, -0.5] }));
  return mergeGeometries(parts, false);
}

function buildBirchGeo() {
  const H = 4.1;
  const parts = [
    part(new THREE.CylinderGeometry(0.10, 0.18, H, 16), '#e9e5d8', { pos: [0, H / 2, 0] }),
  ];

  /* The signature dark lenticels. */
  const marks = [[1.1, 0.12], [1.85, 0.09], [2.5, 0.13], [3.15, 0.08], [3.62, 0.11]];
  for (const [y, w] of marks) {
    parts.push(part(new THREE.CylinderGeometry(0.185, 0.185, w, 16), '#4a4a4a', { pos: [0, y, 0] }));
  }

  /* Two slender branches leaving the trunk high up. */
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.CylinderGeometry(0.045, 0.09, 1.3, 8), '#d9d4c6', {
      rot: [0, 0, s * 0.85],
      pos: [s * 0.44, 3.5, 0],
    }));
  }

  parts.push(part(new THREE.SphereGeometry(1.08, 22, 18), '#7fbf4f', { scale: [1, 1.5, 1], pos: [0, 5.0, 0] }));
  parts.push(part(new THREE.SphereGeometry(0.84, 20, 16), '#6fb03f', { pos: [0.66, 4.15, 0.4] }));
  parts.push(part(new THREE.SphereGeometry(0.76, 20, 16), '#8ecf5c', { pos: [-0.66, 4.3, -0.44] }));
  parts.push(part(new THREE.SphereGeometry(0.68, 18, 14), '#74b845', { pos: [0.2, 4.55, -0.85] }));
  parts.push(part(new THREE.SphereGeometry(0.62, 18, 14), '#9ada66', { pos: [-0.5, 5.45, 0.5] }));
  return mergeGeometries(parts, false);
}

/**
 * One feathery palm frond: a drooping rachis lined with long leaflets.
 * Leaflets are broad blades that sweep back along the rib, and they get
 * shorter toward the tip so the frond tapers the way a real one does.
 */
function buildFrond(len, sweep, colorA, colorB) {
  const parts = [];
  const stations = 11;
  const droop = 0.34;

  const px = (t) => t * len;
  const py = (t) => -droop * len * t * t;

  for (let i = 0; i < stations - 1; i++) {
    const t0 = i / (stations - 1);
    const t1 = (i + 1) / (stations - 1);
    const x0 = px(t0);
    const y0 = py(t0);
    const x1 = px(t1);
    const y1 = py(t1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.hypot(dx, dy);
    const seg = new THREE.CylinderGeometry(0.018, 0.030, segLen, 7).toNonIndexed();
    seg.rotateZ(Math.atan2(dy, dx) - Math.PI / 2);
    seg.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    tint(seg, '#6f8f3f');
    parts.push(seg);
  }

  for (let i = 0; i < stations; i++) {
    const t = i / (stations - 1);
    const x = px(t);
    const y = py(t);

    /* Long in the middle, tapering to the tip and the base. */
    const taper = Math.sin(Math.PI * Math.min(1, t * 0.86 + 0.12));
    const ll = 0.95 * taper;

    for (const side of [-1, 1]) {
      const leaf = new THREE.BoxGeometry(ll, 0.016, 0.115).toNonIndexed();
      leaf.rotateY(side * (Math.PI / 2 - 0.55 - sweep));
      leaf.rotateZ(-0.20 - 0.26 * t);
      leaf.translate(x + 0.05, y - 0.03, side * 0.05);
      tint(leaf, side > 0 ? colorA : colorB);
      parts.push(leaf);
    }
  }
  return parts;
}

function buildPalmGeo() {
  const parts = [];

  /* --- Trunk: tall, gently curving, ringed with bark bands --- */
  const segs = 14;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const h = 0.5;
    const lean = 0.10 * t;
    const r0 = 0.24 - 0.10 * t;
    const r1 = 0.23 - 0.10 * (t + 1 / (segs - 1));
    const seg = new THREE.CylinderGeometry(r1, r0, h, 12).toNonIndexed();
    seg.rotateZ(-lean);
    seg.translate(cx + Math.sin(lean) * h * 0.5, cy + Math.cos(lean) * h * 0.5, 0);
    tint(seg, i % 2 === 0 ? '#8a6a45' : '#9c7c53');
    parts.push(seg);
    cx += Math.sin(lean) * h;
    cy += Math.cos(lean) * h;
  }

  /* Base flare */
  parts.push(part(new THREE.CylinderGeometry(0.30, 0.42, 0.34, 12), '#7d5f3c', { pos: [0, 0.17, 0] }));

  /* --- Crown shaft --- */
  parts.push(part(new THREE.CylinderGeometry(0.155, 0.215, 0.72, 12), '#7fa64a', {
    rot: [0, 0, -0.09],
    pos: [cx + 0.03, cy + 0.30, 0],
  }));

  const crownX = cx + 0.06;
  const crownY = cy + 0.66;

  /* --- A heavy cluster of coconuts hanging under the crown --- */
  const nutPositions = [
    [0.30, -0.02, 0.16], [0.18, -0.07, -0.28], [0.34, -0.14, -0.02],
    [0.13, 0.02, 0.30], [0.05, -0.11, 0.07], [-0.16, -0.05, 0.24],
    [-0.26, -0.10, -0.06], [0.02, -0.17, -0.18],
  ];
  for (const [nx, ny, nz] of nutPositions) {
    parts.push(part(new THREE.SphereGeometry(0.155, 14, 11), '#6b4a28', {
      scale: [1, 1.06, 1],
      pos: [crownX + nx, crownY + ny, nz],
    }));
    /* Germination pores, facing down and outward. */
    parts.push(part(new THREE.SphereGeometry(0.042, 8, 6), '#3a2415', {
      pos: [crownX + nx, crownY + ny - 0.13, nz + (nz >= 0 ? 0.08 : -0.08)],
    }));
  }

  /* --- Crown of long, drooping fronds --- */
  const N = 11;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 + 0.18;
    const len = 3.20 + ((i * 7) % 5) * 0.19;
    const frond = buildFrond(len, ((i * 3) % 4) * 0.06, '#2e8b57', '#3ea86c');

    for (const g of frond) {
      g.rotateZ(-0.40 - ((i * 5) % 3) * 0.08);   // lift the base, then droop
      g.rotateY(angle);
      g.translate(crownX, crownY + 0.18, 0);
    }
    parts.push(...frond);
  }

  return mergeGeometries(parts, false);
}

function buildBushGeo() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8), '#6b4a2b', { pos: [0, 0.25, 0] }),
    part(new THREE.SphereGeometry(0.72, 14, 12), '#4a9a4e', { scale: [1.1, 0.85, 1.1], pos: [0, 0.78, 0] }),
    part(new THREE.SphereGeometry(0.55, 14, 12), '#3d8a43', { pos: [0.58, 0.62, 0.3] }),
    part(new THREE.SphereGeometry(0.5, 14, 12), '#57ab57', { pos: [-0.5, 0.6, -0.3] }),
    part(new THREE.SphereGeometry(0.42, 12, 10), '#4a9a4e', { pos: [0.1, 0.5, -0.55] }),
  ], false);
}

function buildDeadTreeGeo() {
  const parts = [
    /* Split, weathered trunk. */
    part(new THREE.CylinderGeometry(0.12, 0.30, 2.0, 14), '#8a7a63', { pos: [0, 1.0, 0] }),
  ];
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.CylinderGeometry(0.055, 0.13, 1.9, 10), '#94836b', {
      rot: [0, 0, s * 0.34],
      pos: [s * 0.32, 2.75, 0],
    }));
  }

  /* Angular bare limbs, each tapered and canted a different way. */
  const limbs = [
    [0.70, 0.0, 1.15, 0.92, 2.35, 0.0],
    [-0.62, 0.10, 1.05, -0.82, 2.55, 0.12],
    [0.20, 0.85, 0.98, 0.25, 3.15, -0.52],
    [-0.15, -0.80, 0.85, -0.20, 2.95, 0.60],
    [0.95, 0.40, 0.75, 0.60, 2.05, 0.55],
  ];
  for (const [rx, ry, len, px, py, pz] of limbs) {
    parts.push(part(new THREE.CylinderGeometry(0.035, 0.08, len, 8), '#8a7a63', {
      rot: [rx, ry, 0.55],
      pos: [px, py, pz],
    }));
  }
  return mergeGeometries(parts, false);
}

function buildInstanced(geo, spots, rng, windOpts) {
  const mat = toonMaterial({ vertexColors: true });
  if (windOpts) applyWind(mat, windOpts);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.a, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Deterministic coconut-palm layout. Exported so the server can drop
 * fallen coconuts directly under the trunks. The RNG is consumed in a
 * fixed order so both sides always agree.
 *
 * Palms grow in loose groves rather than an even ring: a handful of
 * randomly placed clumps, each with its own spread and headcount, plus
 * a few loners out on their own. Long stretches of empty sand are left
 * between groves so the coastline never reads as evenly planted.
 */
export function palmSpots() {
  const rng = makeRng(90210);
  const out = [];
  const target = SEA_LEVEL + 0.6;

  /* Radius at which the beach reaches the palm band on a given bearing. */
  const beachAt = (angle) => {
    let lo = 0;
    let hi = 70;
    for (let k = 0; k < 48; k++) {
      const mid = (lo + hi) / 2;
      if (groundHeight(Math.cos(angle) * mid, Math.sin(angle) * mid) > target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const plant = (a) => {
    const r = beachAt(a) + (rng() - 0.5) * 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = groundHeight(x, z);

    /* Sand only, and never on the pier, in the shop or against the tower. */
    if (y < SEA_LEVEL + 0.35 || y > SEA_LEVEL + 1.8) return false;
    if (x > PIER.startX - 3 && Math.abs(z - PIER.z) < PIER.halfZ + 2.6) return false;
    if (Math.hypot(x - SHOP.x, z - SHOP.z) < 7.5) return false;
    if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < LIGHT.rBase + LIGHT_CLEARANCE) return false;
    if (Math.abs(Math.hypot(x, z) - loopPathRadius(Math.atan2(z, x))) < 2.0) return false;

    /* Keep trunks from growing through each other. */
    for (const p of out) {
      if (Math.hypot(p.x - x, p.z - z) < 1.7) return false;
    }

    out.push({ x, y, z, a: rng() * Math.PI * 2, s: 0.7 + rng() * 0.7 });
    return true;
  };

  /* A dense stand of palms crowding the pier approach, planted on both
     flanks of the boardwalk so the walk out to the pier runs through
     shade. These are placed first so they always win the spacing test. */
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = side * (0.155 + i * 0.052 + rng() * 0.035);
      plant(a);
      plant(a + side * 0.016);
    }
  }

  /* Groves: a clump of palms around a scattered bearing. */
  const groves = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < groves; i++) {
    const centre = rng() * Math.PI * 2;
    const count = 2 + Math.floor(rng() * 4);
    const spread = 0.09 + rng() * 0.26;
    for (let k = 0; k < count; k++) {
      plant(centre + (rng() - 0.5) * spread * 2);
    }
  }

  /* Loners, dropped anywhere on the shore so the groves are not the only
     pattern the eye can find. */
  const loners = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < loners; i++) plant(rng() * Math.PI * 2);

  return out;
}

function buildTrees(rng) {
  const group = new THREE.Group();

  const pines = buildPineGeo();
  const rounds = buildRoundGeo();
  const birches = buildBirchGeo();
  const palms = buildPalmGeo();
  const bushes = buildBushGeo();
  const deads = buildDeadTreeGeo();

  const opts = { avoidCenter: 5.5, exclude: structureExclude };

  /* Deliberately sparse planting so the island reads as open rather than
     cluttered — roughly half the previous tree count. */
  const treeOpts = { ...opts, stretchX: 1.7 };
  const pineSpots = scatter(rng, 24, 4, 33, 1.7, treeOpts);
  const roundSpots = scatter(rng, 22, 4, 32, 1.5, treeOpts);
  const birchSpots = scatter(rng, 13, 5, 31, 2.1, treeOpts);
  const bushSpots = scatter(rng, 34, 3, 38, 1.1, treeOpts);
  const palmPlacements = palmSpots();
  const deadSpots = scatter(rng, 8, 32, 52, -0.6, { maxHeight: 0.8, exclude: structureExclude, stretchX: 1.6 });

  /* Each species gets its own sway character. Palms are the flexiest. */
  group.add(buildInstanced(pines, pineSpots, rng, { strength: 0.7, bend: 2.0 }));
  group.add(buildInstanced(rounds, roundSpots, rng, { strength: 0.85, bend: 2.0 }));
  group.add(buildInstanced(birches, birchSpots, rng, { strength: 0.95, bend: 2.0 }));
  group.add(buildInstanced(bushes, bushSpots, rng, { strength: 1.7, bend: 1.6 }));
  group.add(buildInstanced(palms, palmPlacements, rng, { strength: 1.5, bend: 2.2 }));
  group.add(buildInstanced(deads, deadSpots, rng, { strength: 0.55, bend: 2.0 }));

  return group;
}

/* ------------------------------------------------------------------ */
/*  Ground cover                                                       */
/* ------------------------------------------------------------------ */

/** A single curved petal blade, base at the origin, tip along +Y. */
function petalBlade(w, h, curl) {
  const g = new THREE.PlaneGeometry(w, h, 1, 2).toNonIndexed();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) + curl * (y / (h * 0.5)));
  }
  g.computeVertexNormals();
  g.translate(0, h * 0.5, 0);
  return g;
}

/**
 * Builds a real flower: a stem, a pollen centre and distinct petals
 * arranged radially. Petals are thin curved blades rather than spheres.
 */
function buildFlowerGeo(opts) {
  const {
    stemHeight = 0.34,
    petalCount = 8,
    petalW = 0.055,
    petalH = 0.115,
    petalCurl = 0.02,
    petalTilt = 1.22,
    petalRadius = 0.035,
    centerR = 0.05,
    centerColor = '#ffd23f',
    petalColor = '#ffffff',
    stemColor = '#4f8f3a',
  } = opts;

  const parts = [
    part(new THREE.CylinderGeometry(0.016, 0.024, stemHeight, 6), stemColor, { pos: [0, stemHeight / 2, 0] }),
  ];

  /* Two small leaves on the stem. */
  for (const side of [-1, 1]) {
    const leaf = petalBlade(0.07, 0.11, 0.012);
    leaf.rotateX(Math.PI * 0.42);
    leaf.rotateY(side * 1.1);
    leaf.translate(side * 0.045, stemHeight * 0.42, 0);
    tint(leaf, '#3f7d33');
    parts.push(leaf);
  }

  const headY = stemHeight + 0.02;

  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2;
    const petal = petalBlade(petalW, petalH, petalCurl);
    petal.rotateX(petalTilt);
    petal.rotateY(a);
    petal.translate(Math.sin(a) * petalRadius, headY, Math.cos(a) * petalRadius);
    tint(petal, petalColor);
    parts.push(petal);
  }

  parts.push(part(new THREE.SphereGeometry(centerR, 10, 8), centerColor, {
    scale: [1, 0.7, 1],
    pos: [0, headY + 0.012, 0],
  }));

  return mergeGeometries(parts, false);
}

function buildFlowerPatch(rng, geo, count, palette) {
  const spots = scatter(rng, count, 3, 38, 1.1, { exclude: structureExclude, stretchX: 1.7 });
  const mat = toonMaterial({ vertexColors: true, side: THREE.DoubleSide });
  applyWind(mat, { strength: 5, bend: 1.0 });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();

  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.a, 0);
    dummy.scale.setScalar(0.75 + rng() * 0.9);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.set(palette[Math.floor(rng() * palette.length)]);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildFlowers(rng) {
  const group = new THREE.Group();

  /* Daisy: many slim petals, flat open face. */
  const daisy = buildFlowerGeo({
    petalCount: 10, petalW: 0.042, petalH: 0.115, petalCurl: 0.018,
    petalTilt: 1.30, petalRadius: 0.03, centerR: 0.048, petalColor: '#ffffff',
  });
  group.add(buildFlowerPatch(rng, daisy, 62,
    ['#ffffff', '#ffe9f0', '#ffd6e7', '#fff6c9', '#e8e0ff']));

  /* Cosmos: fewer, broader petals. */
  const cosmos = buildFlowerGeo({
    petalCount: 7, petalW: 0.072, petalH: 0.125, petalCurl: 0.026,
    petalTilt: 1.16, petalRadius: 0.032, centerR: 0.042,
    centerColor: '#f9a825', petalColor: '#ff6b8a', stemHeight: 0.42,
  });
  group.add(buildFlowerPatch(rng, cosmos, 56,
    ['#ff6b8a', '#f78fb3', '#c084fc', '#ff9f1c', '#ff5d5d']));

  /* Tulip: cupped petals pointing upward. */
  const tulip = buildFlowerGeo({
    petalCount: 5, petalW: 0.075, petalH: 0.13, petalCurl: 0.03,
    petalTilt: 0.30, petalRadius: 0.028, centerR: 0.032,
    centerColor: '#f4a259', petalColor: '#ffd166', stemHeight: 0.38,
  });
  group.add(buildFlowerPatch(rng, tulip, 46,
    ['#ffd166', '#ffb703', '#fb8500', '#e76f51', '#ff8fab']));

  return group;
}

function buildGrass(rng) {
  const spots = scatter(rng, 1300, 3, 40, 1.1, { exclude: structureExclude, stretchX: 1.7 });

  const blades = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const b = new THREE.ConeGeometry(0.055, 0.46 + (i % 2) * 0.16, 5).toNonIndexed();
    b.rotateZ(0.22 * Math.sin(a));
    b.rotateY(a);
    b.translate(0.06 * Math.cos(a), 0.24, 0.06 * Math.sin(a));
    tint(b, '#ffffff');
    blades.push(b);
  }
  const geo = mergeGeometries(blades, false);

  const grassMat = toonMaterial({ vertexColors: true });
  applyWind(grassMat, { strength: 8, bend: 1.0 });
  const mesh = new THREE.InstancedMesh(geo, grassMat, spots.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set((rng() - 0.5) * 0.2, p.a, (rng() - 0.5) * 0.2);
    dummy.scale.set(1, 0.75 + rng() * 0.85, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28 + rng() * 0.06, 0.52, 0.4 + rng() * 0.16);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildBeachProps(rng) {
  const group = new THREE.Group();
  const spots = scatter(rng, 70, 28, 54, SEA_LEVEL - 0.4, { exclude: structureExclude, stretchX: 1.5 });

  const shellGeo = mergeGeometries([
    part(new THREE.SphereGeometry(0.12, 10, 8), '#fff4e0', { scale: [1, 0.5, 1] }),
    part(new THREE.SphereGeometry(0.06, 8, 6), '#ffd9b3', { pos: [0.07, 0.03, 0.05] }),
  ], false);

  const driftGeo = new THREE.CylinderGeometry(0.07, 0.1, 1.6, 7);

  const shells = new THREE.InstancedMesh(shellGeo, toonMaterial({ vertexColors: true }), spots.length);
  const drift = new THREE.InstancedMesh(driftGeo, toonMaterial({ color: '#9a7b52' }), spots.length);

  const dummy = new THREE.Object3D();
  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y + 0.07, p.z);
    dummy.rotation.set(0, p.a, 0);
    dummy.scale.setScalar(0.7 + rng() * 0.9);
    dummy.updateMatrix();
    shells.setMatrixAt(i, dummy.matrix);

    dummy.position.set(p.x, p.y + 0.09, p.z);
    dummy.rotation.set(0, p.a, Math.PI / 2);
    dummy.scale.setScalar(0.7 + rng() * 0.7);
    dummy.updateMatrix();
    drift.setMatrixAt(i, dummy.matrix);
  });
  shells.instanceMatrix.needsUpdate = true;
  drift.instanceMatrix.needsUpdate = true;
  shells.castShadow = true;
  drift.castShadow = true;
  group.add(shells, drift);
  return group;
}

function buildRocks(rng) {
  const spots = [];

  /* Half of the rocks are spread evenly by bearing, so they ring the
     whole island rather than bunching wherever the ground is shallow. */
  const N = 26;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 + rng() * ((Math.PI * 2) / N) * 0.9;
    const target = SEA_LEVEL + (rng() * 2.0 - 0.6);
    let lo = 0;
    let hi = 60;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (groundHeight(Math.cos(angle) * mid, Math.sin(angle) * mid) > target) lo = mid;
      else hi = mid;
    }
    const r = (lo + hi) / 2 + (rng() - 0.5) * 3;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = groundHeight(x, z);
    if (y < SEA_LEVEL - 2.2) continue;
    if (structureExclude(x, z)) continue;
    spots.push({ x, y, z, a: rng() * Math.PI * 2, s: 0.7 + rng() * 0.7 });
  }

  /* The rest are scattered inland, so boulders appear across the island. */
  spots.push(...scatter(rng, 26, 6, 30, SEA_LEVEL + 0.2, { exclude: structureExclude, stretchX: 1.4 }));

  const geo = flatShade(new THREE.IcosahedronGeometry(0.7, 1));
  const mesh = new THREE.InstancedMesh(geo, toonMaterial({ color: '#8d8d94' }), spots.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  spots.forEach((p, i) => {
    dummy.position.set(p.x, p.y + 0.12, p.z);
    dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    dummy.scale.set(0.6 + rng() * 1.3, 0.5 + rng() * 0.9, 0.6 + rng() * 1.3);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.08, 0.04, 0.42 + rng() * 0.2);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Island shop                                                        */
/* ------------------------------------------------------------------ */

/** A canvas texture of a diamond fishing net. */
function makeNetTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3;
  const step = 20;
  for (let i = -128; i < 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1.5);
  return tex;
}

/** A surfboard: pointed nose, rounded tail, centre stripe and a fin. */
function surfboard(color, stripeColor, x, y, z, rotX, rotY) {
  const shape = new THREE.Shape();
  const N = 26;
  const halfW = (t) => 0.28 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - 0.22 * t);

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const yy = -1.05 + t * 2.1;
    if (i === 0) shape.moveTo(0, yy);
    else shape.lineTo(halfW(t), yy);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    shape.lineTo(-halfW(t), -1.05 + t * 2.1);
  }
  shape.closePath();

  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.07,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 2,
      curveSegments: 5,
    }),
    toonMaterial({ color })
  ));

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.7, 0.03), toonMaterial({ color: stripeColor }));
  stripe.position.set(0, 0.05, 0.1);
  g.add(stripe);

  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 4), toonMaterial({ color: stripeColor }));
  fin.rotation.x = Math.PI;
  fin.scale.set(1, 1, 0.35);
  fin.position.set(0, -0.85, -0.08);
  g.add(fin);

  g.position.set(x, y + 1.07, z);
  g.rotation.set(rotX, rotY, 0);
  return g;
}

/** A glazed window with a wooden frame and optional louvred shutters. */
function windowUnit(w, h, frameMat, glassMat, shutterMat) {
  const g = new THREE.Group();

  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), glassMat);
  g.add(glass);

  const fw = 0.08;
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + fw * 2, fw, 0.1), frameMat);
  top.position.y = h / 2;
  g.add(top);
  const bot = top.clone();
  bot.position.y = -h / 2;
  g.add(bot);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(fw, h + fw * 2, 0.1), frameMat);
    side.position.x = (sx * w) / 2;
    g.add(side);
  }
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.09), frameMat);
  g.add(mullion);
  const transom = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.09), frameMat);
  g.add(transom);

  if (shutterMat) {
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.52, h * 1.04, 0.05), shutterMat);
      panel.position.set(sx * (w * 0.79), 0, 0.08);
      g.add(panel);
      for (let i = 0; i < 5; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(w * 0.46, 0.045, 0.07), frameMat);
        slat.position.set(sx * (w * 0.79), -h * 0.36 + i * (h * 0.18), 0.11);
        slat.rotation.x = 0.35;
        g.add(slat);
      }
    }
  }
  return g;
}

/**
 * Standard two-storey island building: whitewashed walls, blue louvred
 * shutters and a terracotta hip roof. The ground floor keeps the
 * semi-open storefront — an open front with a low counter and a
 * striped porch awning — with the merchant trading from behind it.
 */
function buildIslandShop() {
  const g = new THREE.Group();
  const H = SHOP.halfW;
  const D = SHOP.halfD;

  const wall = toonMaterial({ color: '#f2ece0' });
  const wallShade = toonMaterial({ color: '#ddd4c4' });
  const trim = toonMaterial({ color: '#2f6f86' });
  const trimDark = toonMaterial({ color: '#245a6e' });
  const timber = toonMaterial({ color: '#6b4a30' });
  const timberDark = toonMaterial({ color: '#4a3220' });
  const glassMat = toonMaterial({ color: '#bfe0ef', emissive: 0x1e2f3a });
  const tile = toonMaterial({ color: '#a8563a' });
  const stone = toonMaterial({ color: '#9c9488' });
  const floorMat = toonMaterial({ color: '#b08a58' });
  const canvasMat = toonMaterial({ color: '#f4f1e8', side: THREE.DoubleSide });
  const canvasStripe = toonMaterial({ color: '#2f6f86', side: THREE.DoubleSide });

  const FLOOR = 0.56;
  /* A generous ground-floor ceiling — tall enough to walk in and stand
     under the header beam without ducking into it. */
  const GROUND_H = 3.4;
  const UPPER = FLOOR + GROUND_H;

  /* ------------------------------------------------------------------
     Foundation. Sampled against the real terrain so the base is buried
     at every corner — the building can never appear to float.
     ------------------------------------------------------------------ */
  const samples = [];
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      const wx = SHOP.x + ix * (H + 0.35);
      const wz = SHOP.z + iz * (D + 0.35);
      samples.push(groundHeight(wx, wz));
    }
  }
  const minGround = Math.min(...samples);
  const shopGround = groundHeight(SHOP.x, SHOP.z);
  const baseTop = FLOOR - 0.04;
  /* Sink the footing well below the lowest corner so it can never float. */
  const baseBottom = minGround - shopGround - 1.2;

  const baseHeight = baseTop - baseBottom;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(H * 2 + 0.7, baseHeight, D * 2 + 0.7),
    stone
  );
  plinth.position.y = (baseTop + baseBottom) / 2;
  g.add(plinth);

  /* Render skirt so the buried part reads as a solid footing. */
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(H * 2 + 0.86, 0.34, D * 2 + 0.86),
    wallShade
  );
  skirt.position.y = baseTop - 0.2;
  g.add(skirt);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.2, 0.16, D * 2 + 0.2), floorMat);
  floor.position.y = FLOOR;
  g.add(floor);

  /* Porch deck and step out front. */
  const deck = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 1.6, 0.16, 1.5), floorMat);
  deck.position.set(0, FLOOR - 0.02, D + 0.75);
  g.add(deck);

  const step = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 2.0, 0.16, 0.7), floorMat);
  step.position.set(0, FLOOR - 0.34, D + 1.7);
  g.add(step);

  /* -------------------------- ground floor -------------------------- */
  /* Everything here runs the full height of the new ground floor, so the
     walls meet the header beam with no gap at the top. */
  const postGeo = new THREE.BoxGeometry(0.28, GROUND_H, 0.28);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, wall);
      p.position.set(sx * (H - 0.14), FLOOR + GROUND_H / 2, sz * (D - 0.14));
      g.add(p);
    }
  }
  /* Porch columns, stopping just under the awning. */
  const porchH = GROUND_H - 0.35;
  const porchPostGeo = new THREE.BoxGeometry(0.28, porchH, 0.28);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(porchPostGeo, timber);
    p.position.set(sx * (H + 0.5), FLOOR + porchH / 2, D + 1.35);
    g.add(p);
  }

  const back = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 0.3, GROUND_H, 0.2), wall);
  back.position.set(0, FLOOR + GROUND_H / 2, -D + 0.1);
  g.add(back);

  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, GROUND_H, D * 2 - 0.3), wall);
    side.position.set(sx * (H - 0.1), FLOOR + GROUND_H / 2, 0);
    g.add(side);

    const win = windowUnit(1.9, 1.3, timber, glassMat, trim);
    win.rotation.y = Math.PI / 2;
    win.position.set(sx * (H + 0.02), FLOOR + 1.35, 0.5);
    g.add(win);
  }

  /* Interior shelving and stock. */
  for (const sy of [1.0, 1.55]) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 0.6, 0.12, 0.5), timber);
    shelf.position.set(0, FLOOR + sy, -D + 0.5);
    g.add(shelf);
  }
  for (let i = 0; i < 7; i++) {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.26, 10),
      toonMaterial({ color: ['#b87333', '#8a9a5b', '#7a5c8a', '#c4a484'][i % 4] })
    );
    jar.position.set(-1.9 + i * 0.62, FLOOR + 1.19, -D + 0.5);
    g.add(jar);
  }

  /* Low counter across the open front. */
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 0.5, 0.15, 0.66), floorMat);
  counterTop.position.set(0, FLOOR + 0.55, D - 0.75);
  g.add(counterTop);
  const counterFace = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 0.5, 0.52, 0.12), trim);
  counterFace.position.set(0, FLOOR + 0.26, D - 0.45);
  g.add(counterFace);

  /* Header beam over the opening. */
  const beam = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.4, 0.32, 0.3), timber);
  beam.position.set(0, FLOOR + GROUND_H - 0.18, D - 0.1);
  g.add(beam);

  /* ---------------- interior dressing: a well-stocked tackle shop ---------------- */
  {
    const ropeMat = toonMaterial({ color: '#c9b184' });
    const netMat = toonMaterial({ color: '#7d8f6a', side: THREE.DoubleSide });
    const corkMat = toonMaterial({ color: '#c98f4a' });
    const ironMat = toonMaterial({ color: '#4a5560' });
    const barrelMat = toonMaterial({ color: '#8a6a3f' });
    const crateMat = toonMaterial({ color: '#b08a58' });
    const crateDark = toonMaterial({ color: '#8d6b3f' });
    const glassJar = toonMaterial({ color: '#cfe6ef', transparent: true, opacity: 0.6 });

    /* --- rod rack leaning against the left wall --- */
    const rackX = -H + 0.46;
    for (const sy of [0.95, 1.75]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 1.7), timberDark);
      rail.position.set(rackX, FLOOR + sy, -0.5);
      g.add(rail);
    }
    for (let i = 0; i < 4; i++) {
      const rod = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.034, 2.3, 8),
        toonMaterial({ color: ['#8a5a2b', '#c0392b', '#2b6fc0', '#2e9e5b'][i] })
      );
      shaft.position.y = 1.15;
      rod.add(shaft);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.34, 8), timberDark);
      grip.position.y = 0.17;
      rod.add(grip);
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 12), ironMat);
      reel.rotation.z = Math.PI / 2;
      reel.position.set(0.1, 0.38, 0);
      rod.add(reel);
      rod.position.set(rackX + 0.12, FLOOR + 0.12, -1.15 + i * 0.44);
      rod.rotation.z = 0.07;
      g.add(rod);
    }

    /* --- hanging nets and cork floats on the right wall --- */
    for (let i = 0; i < 2; i++) {
      const net = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.25), netMat);
      net.rotation.y = -Math.PI / 2;
      net.position.set(H - 0.2, FLOOR + 1.6 - i * 0.02, -0.7 + i * 1.5);
      g.add(net);
      for (let k = 0; k < 3; k++) {
        const float = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), corkMat);
        float.position.set(H - 0.32, FLOOR + 2.05, -1.25 + i * 1.5 + k * 0.34);
        g.add(float);
      }
    }
    const netPole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 8), timber);
    netPole.position.set(H - 0.24, FLOOR + 1.6, 0.1);
    g.add(netPole);

    /* --- barrels tucked into the back corners --- */
    for (const [bx, bz] of [[-H + 0.7, -D + 0.85], [H - 0.75, -D + 0.8]]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.86, 14), barrelMat);
      barrel.position.set(bx, FLOOR + 0.43, bz);
      g.add(barrel);
      for (const by of [0.18, 0.68]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.365, 0.025, 6, 16), ironMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.set(bx, FLOOR + by, bz);
        g.add(hoop);
      }
    }

    /* --- stacked crates and a lobster pot on the right --- */
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.62), i % 2 ? crateDark : crateMat);
      crate.position.set(H - 0.95 + (i % 2) * 0.12, FLOOR + 0.21 + Math.floor(i / 2) * 0.44, -D + 1.85);
      crate.rotation.y = i * 0.22;
      g.add(crate);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.66), timberDark);
      band.position.copy(crate.position);
      band.position.y += 0.14;
      band.rotation.y = crate.rotation.y;
      g.add(band);
    }
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.5, 6),
      toonMaterial({ color: '#6f7d5a', side: THREE.DoubleSide })
    );
    pot.position.set(-H + 1.05, FLOOR + 0.25, D - 1.5);
    g.add(pot);
    const potTop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 6), ropeMat);
    potTop.rotation.x = Math.PI / 2;
    potTop.position.set(-H + 1.05, FLOOR + 0.5, D - 1.5);
    g.add(potTop);

    /* --- a bucket of the morning's catch by the counter --- */
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.42, 14), ironMat);
    bucket.position.set(1.35, FLOOR + 0.21, D - 1.45);
    g.add(bucket);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const fish = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 8),
        toonMaterial({ color: ['#9fb8c8', '#c0d4de', '#8fa9bb', '#b6c9d4'][i] })
      );
      fish.scale.set(0.55, 0.75, 1.7);
      fish.position.set(1.35 + Math.cos(a) * 0.12, FLOOR + 0.42, D - 1.45 + Math.sin(a) * 0.12);
      fish.rotation.y = a;
      g.add(fish);
    }

    /* --- coils of rope on the floor --- */
    for (const [rx, rz] of [[-1.1, -D + 0.6], [H - 1.7, D - 0.9]]) {
      for (let i = 0; i < 3; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.03, 0.035, 6, 18), ropeMat);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(rx, FLOOR + 0.04 + i * 0.07, rz);
        g.add(coil);
      }
    }

    /* --- glass jars of bait on the counter --- */
    for (let i = 0; i < 3; i++) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.3, 12), glassJar);
      jar.position.set(-1.5 + i * 0.42, FLOOR + 0.78, D - 0.72);
      g.add(jar);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 12), timber);
      lid.position.set(-1.5 + i * 0.42, FLOOR + 0.95, D - 0.72);
      g.add(lid);
    }

    /* --- a mounted trophy fish on the back wall --- */
    const trophy = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), toonMaterial({ color: '#5f7d8c' }));
    body.scale.set(0.7, 1, 1.9);
    trophy.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 6), toonMaterial({ color: '#4a6673' }));
    tail.rotation.x = Math.PI / 2;
    tail.scale.set(1, 1, 0.35);
    tail.position.z = -0.62;
    trophy.add(tail);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.07), timber);
    board.position.z = -0.28;
    trophy.add(board);
    trophy.position.set(1.9, FLOOR + 1.85, -D + 0.22);
    trophy.rotation.y = 0.15;
    g.add(trophy);

    /* --- buoys slung from the header beam --- */
    for (let i = 0; i < 4; i++) {
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), toonMaterial({
        color: ['#e05a47', '#f0c14b', '#4a9ec0', '#e05a47'][i],
      }));
      buoy.scale.set(1, 1.15, 1);
      buoy.position.set(-2.1 + i * 1.4, FLOOR + 1.95, D - 0.28);
      g.add(buoy);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), ropeMat);
      line.position.set(-2.1 + i * 1.4, FLOOR + 2.2, D - 0.28);
      g.add(line);
    }
  }

  /* -------------------------- upper floor -------------------------- */
  const upperBack = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 0.3, 2.4, 0.2), wall);
  upperBack.position.set(0, UPPER + 1.2, -D + 0.1);
  g.add(upperBack);

  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, D * 2 - 0.3), wall);
    side.position.set(sx * (H - 0.1), UPPER + 1.2, 0);
    g.add(side);

    const win = windowUnit(1.6, 1.3, timber, glassMat, trim);
    win.rotation.y = Math.PI / 2;
    win.position.set(sx * (H + 0.02), UPPER + 1.3, 0.4);
    g.add(win);
  }

  const upperFront = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 0.3, 2.4, 0.2), wall);
  upperFront.position.set(0, UPPER + 1.2, D - 0.1);
  g.add(upperFront);

  for (const sx of [-1, 1]) {
    const win = windowUnit(1.7, 1.3, timber, glassMat, trim);
    win.position.set(sx * 1.6, UPPER + 1.3, D + 0.02);
    g.add(win);
  }

  /* Balcony across the front. */
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 1.4, 0.16, 1.3), floorMat);
  balcony.position.set(0, UPPER - 0.02, D + 0.65);
  g.add(balcony);

  const balRail = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 1.4, 0.1, 0.12), trim);
  balRail.position.set(0, UPPER + 0.62, D + 1.24);
  g.add(balRail);
  for (let i = -3; i <= 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.66, 0.09), trim);
    p.position.set(i * 0.95, UPPER + 0.31, D + 1.24);
    g.add(p);
  }

  /* --------------------------- flat roof --------------------------- */
  const roofDeck = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.7, 0.26, D * 2 + 0.7), wallShade);
  roofDeck.position.y = UPPER + 2.52;
  g.add(roofDeck);

  /* Parapet wall around the roof edge. */
  for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.9, 0.62, 0.18), wall);
    p.position.set(0, UPPER + 2.9, sz * (D + 0.36));
    g.add(p);
  }
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, D * 2 + 0.9), wall);
    p.position.set(sx * (H + 0.36), UPPER + 2.9, 0);
    g.add(p);
  }

  /* Roof furniture: water tank and a stair hatch. */
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 16), toonMaterial({ color: '#8f9aa3' }));
  tank.position.set(-1.5, UPPER + 3.2, -1.4);
  g.add(tank);
  const tankLid = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 16), toonMaterial({ color: '#6f7a83' }));
  tankLid.position.set(-1.5, UPPER + 3.8, -1.4);
  g.add(tankLid);

  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 0.9), timber);
  hatch.position.set(1.4, UPPER + 2.82, 1.2);
  g.add(hatch);

  /* ------------------ striped porch awning over the shop ------------------ */
  const awning = new THREE.Group();
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 1.7, 0.09, 2.1), canvasMat);
  awning.add(canvas);
  for (let i = -2; i <= 2; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 2.12), canvasStripe);
    stripe.position.set(i * 1.3, 0.005, 0);
    awning.add(stripe);
  }
  awning.position.set(0, FLOOR + GROUND_H - 0.35, D + 1.0);
  awning.rotation.x = 0.16;
  g.add(awning);

  /* Hanging shop sign under the awning. */
  const signArm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.07), timberDark);
  signArm.position.set(-H - 0.1, FLOOR + GROUND_H - 0.62, D + 1.0);
  g.add(signArm);
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.62), timberDark);
  signBoard.position.set(-H - 0.42, FLOOR + 1.98, D + 1.0);
  g.add(signBoard);
  const signFace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.78, 0.5), trim);
  signFace.position.set(-H - 0.48, FLOOR + 1.98, D + 1.0);
  g.add(signFace);

  /* Wall lamp beside the entrance. */
  const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), timberDark);
  lampArm.position.set(H + 0.14, FLOOR + 2.2, D - 0.2);
  g.add(lampArm);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 10),
    toonMaterial({ color: '#ffe9b8', emissive: 0x6a5426 })
  );
  lamp.position.set(H + 0.28, FLOOR + 2.06, D - 0.2);
  g.add(lamp);

  /* A barrel and crate by the step. */
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.72, 16), timber);
  barrel.position.set(H + 0.9, 0.36, D + 1.2);
  g.add(barrel);
  for (const by of [0.16, 0.56]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 6, 16), trimDark);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(H + 0.9, by, D + 1.2);
    g.add(hoop);
  }

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.66), toonMaterial({ color: '#a87c4a' }));
  crate.position.set(-H - 1.0, 0.33, D + 1.3);
  g.add(crate);

  /* -------------------- marine-themed decorations -------------------- */

  /* Two surfboards leaning against the side walls. */
  g.add(surfboard('#e8f1f5', '#2f6f86', -(H - 0.45), 0.02, 0.9, -0.2, Math.PI / 2));
  g.add(surfboard('#ffd166', '#c0392b', H - 0.45, 0.02, 1.7, 0.2, Math.PI / 2));

  /* Life ring mounted on the front wall. */
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 10, 22), toonMaterial({ color: '#f6f3ec' }));
  ring.position.set(0.95, FLOOR + 1.55, D + 0.08);
  g.add(ring);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.31), toonMaterial({ color: '#c0392b' }));
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    seg.position.set(0.95 + Math.cos(a) * 0.42, FLOOR + 1.55 + Math.sin(a) * 0.42, D + 0.08);
    seg.rotation.z = a;
    g.add(seg);
  }

  /* Fishing net draped over a frame beside the step. */
  const netFrame = new THREE.Group();
  for (const dx of [-1.1, 1.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 8), timber);
    post.position.set(dx, 0.85, 0);
    netFrame.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 8), timber);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 1.68;
  netFrame.add(bar);

  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.5),
    new THREE.MeshBasicMaterial({
      map: makeNetTexture(),
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      color: 0xd8cfae,
    })
  );
  net.position.set(0, 1.05, 0.06);
  netFrame.add(net);

  netFrame.position.set(-H - 1.3, 0.16, D + 0.9);
  netFrame.rotation.y = -0.4;
  g.add(netFrame);

  /* Mooring buoy and a crab pot. */
  const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), toonMaterial({ color: '#ff8a3d' }));
  buoy.scale.set(1, 1.15, 1);
  buoy.position.set(H + 1.5, 0.4, D + 0.6);
  g.add(buoy);
  const buoyBand = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 18), toonMaterial({ color: '#f6f3ec' }));
  buoyBand.rotation.x = Math.PI / 2;
  buoyBand.position.set(H + 1.5, 0.4, D + 0.6);
  g.add(buoyBand);
  const buoyTop = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.34, 8), timberDark);
  buoyTop.position.set(H + 1.5, 0.86, D + 0.6);
  g.add(buoyTop);

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.44, 0.62, 10), toonMaterial({ color: '#7d6a4a' }));
  pot.position.set(-H - 1.6, 0.31, D - 1.4);
  g.add(pot);
  for (const py of [0.12, 0.5]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.035, 6, 14), timberDark);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(-H - 1.6, py, D - 1.4);
    g.add(hoop);
  }

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/**
 * A tall, hollow lighthouse the player can actually climb: a banded stone
 * tower with a doorway, an internal spiral ramp winding around a central
 * newel, a hatch that opens onto the observation deck, and a railed
 * gallery carrying a lantern room and a working telescope.
 *
 * The shell is grouped separately so main.js can hide it while the player
 * is inside, letting the follow camera see through the wall.
 */
function buildLighthouse() {
  const g = new THREE.Group();
  const F = lighthouseFloorY();
  g.position.set(LIGHTHOUSE.x, F, LIGHTHOUSE.z);

  const white = toonMaterial({ color: '#f7f4ed' });
  const red = toonMaterial({ color: '#c0392b' });
  const dark = toonMaterial({ color: '#2b3540' });
  const stone = toonMaterial({ color: '#9c9488' });
  const stoneDark = toonMaterial({ color: '#7d766c' });
  const stoneLight = toonMaterial({ color: '#b5ac9e' });
  const brass = toonMaterial({ color: '#c9a227' });
  const iron = toonMaterial({ color: '#3c4654' });
  const deckMat = toonMaterial({ color: '#c9bfa8' });
  const shellWhite = toonMaterial({ color: '#f7f4ed', side: THREE.DoubleSide });
  const shellRed = toonMaterial({ color: '#c0392b', side: THREE.DoubleSide });
  const glass = toonMaterial({
    color: '#bfe9ff', transparent: true, opacity: 0.32, side: THREE.DoubleSide,
  });

  const { rCore, rIn, rWall, rDeck, doorHalf, topStart, topEnd, towerH } = LIGHT;
  const H = towerH;
  const TWO = Math.PI * 2;
  const SEG = 72;

  /* three.js measures cylinder theta from +z toward +x, our `rel` from +x
     toward +z, so the two run opposite ways. */
  const thetaOf = (rel) => Math.PI / 2 - rel;

  /** A partial cylinder covering relA..relB (relA < relB). */
  function sector(relA, relB, radius, height, y, mat, openEnded = true) {
    const geo = new THREE.CylinderGeometry(
      radius, radius, height, SEG, 1, openEnded, thetaOf(relB), relB - relA
    );
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    return m;
  }

  /** A cylinder covering everything EXCEPT relA..relB. */
  function wallWithGap(relA, relB, radius, height, y, mat) {
    const geo = new THREE.CylinderGeometry(
      radius, radius, height, SEG, 1, true, thetaOf(relA), TWO - (relB - relA)
    );
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    return m;
  }

  /* Everything that forms the outer skin, hidden while the player is in. */
  const shell = new THREE.Group();
  g.add(shell);

  /* ---- foundation: a wide stone drum, its top flush with the floor ---- */
  let minG = 0;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TWO;
    minG = Math.min(
      minG,
      groundHeight(LIGHTHOUSE.x + Math.cos(a) * rDeck, LIGHTHOUSE.z + Math.sin(a) * rDeck) - F
    );
  }
  const foundH = 0.04 - minG;
  const foundation = new THREE.Mesh(
    new THREE.CylinderGeometry(rWall + 0.75, rDeck, foundH, SEG),
    stone
  );
  foundation.position.y = minG + foundH / 2;
  shell.add(foundation);

  /* A stepped plinth, dressed with a course of cut stone blocks. */
  const plinthLow = new THREE.Mesh(
    new THREE.CylinderGeometry(rWall + 0.75, rWall + 0.85, 0.26, SEG), stoneDark
  );
  plinthLow.position.y = 0.13;
  shell.add(plinthLow);

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(rWall + 0.55, rWall + 0.75, 0.42, SEG), stoneLight
  );
  plinth.position.y = 0.47;
  shell.add(plinth);

  const blockCount = 30;
  for (let i = 0; i < blockCount; i++) {
    const a = (i / blockCount) * TWO + 0.05;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.3, 0.14), stone);
    block.position.set(Math.cos(a) * (rWall + 0.72), 0.47, Math.sin(a) * (rWall + 0.72));
    block.rotation.y = -a;
    shell.add(block);
  }

  /* ---- tower wall, eight banded courses ---- */
  const bands = 8;
  const bandH = H / bands;
  const shellMats = [shellWhite, shellRed];
  for (let i = 0; i < bands; i++) {
    const y0 = i * bandH;
    const y1 = y0 + bandH;
    if (i <= 1) {
      /* The bottom two courses are split by the doorway, so the opening
         is tall enough to walk through without ducking into the wall. */
      shell.add(wallWithGap(-doorHalf, doorHalf, rWall, bandH, (y0 + y1) / 2, shellMats[i % 2]));
    } else if (i === bands - 1) {
      /* Top course opens onto the observation deck. */
      shell.add(wallWithGap(topStart, topEnd, rWall, bandH, (y0 + y1) / 2, shellMats[i % 2]));
    } else {
      shell.add(sector(0, TWO, rWall, bandH, (y0 + y1) / 2, shellMats[i % 2]));
    }
    /* A shallow string course between bands — skipped across the doorway. */
    if (i > 0 && i !== 2) {
      const course = new THREE.Mesh(
        new THREE.CylinderGeometry(rWall + 0.1, rWall + 0.1, 0.07, SEG), stoneDark
      );
      course.position.y = y0;
      shell.add(course);
    }
  }

  /* ---- interior lining, so the wall reads as masonry from inside ---- */
  const lining = new THREE.Mesh(
    new THREE.CylinderGeometry(rIn, rIn, H, SEG, 1, true),
    toonMaterial({ color: '#efe8da', side: THREE.BackSide })
  );
  lining.position.y = H / 2;
  g.add(lining);

  /* ---- interior floor: a flagged stone pavement, always visible ----
     This lives outside the shell group on purpose — the shell is hidden
     while the player is inside, and the floor has to stay put or they end
     up looking at the island's grass through the base. */
  {
    const parts = [];
    const floorR = rWall;

    /* The slab the flags sit on. */
    const slab = new THREE.CylinderGeometry(floorR, floorR, 0.3, SEG, 1, false);
    slab.translate(0, -0.21, 0);
    tint(slab, '#6f685d');
    parts.push(slab);

    /* Concentric courses of wedge-shaped flagstones. */
    const RINGS = 3;
    for (let ring = 0; ring < RINGS; ring++) {
      const r0 = rCore + (ring / RINGS) * (floorR - rCore);
      const r1 = rCore + ((ring + 1) / RINGS) * (floorR - rCore);
      const rm = (r0 + r1) / 2;
      const n = 10 + ring * 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TWO;
        const tile = new THREE.BoxGeometry(r1 - r0 - 0.07, 0.06, rm * (TWO / n) * 0.86);
        tile.rotateY(-a);
        tile.translate(Math.cos(a) * rm, -0.03, Math.sin(a) * rm);
        tint(tile, (ring + i) % 2 ? '#9a9284' : '#877f71');
        parts.push(tile);
      }
    }

    /* A brass compass rose set into the middle of the floor. */
    const rose = new THREE.TorusGeometry(1.15, 0.05, 8, 40);
    rose.rotateX(-Math.PI / 2);
    rose.translate(0, 0.005, 0);
    tint(rose, '#b9a45a');
    parts.push(rose);

    g.add(new THREE.Mesh(mergeGeometries(parts, false), toonMaterial({ vertexColors: true })));
    g.children[g.children.length - 1].userData.interiorFloor = true;
  }

  /* ---- central newel the ramp winds around ---- */
  const newel = new THREE.Mesh(new THREE.CylinderGeometry(rCore, rCore, H, 32), stone);
  newel.position.y = H / 2;
  g.add(newel);

  /* ---- doorway: jambs, a lintel and a threshold ---- */
  const doorZ = rWall;
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.7, 0.55), stoneDark);
    jamb.position.set(s * 0.72, 1.85, doorZ - 0.12);
    shell.add(jamb);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.36, 0.6), stoneDark);
  lintel.position.set(0, 3.88, doorZ - 0.12);
  shell.add(lintel);
  /* A stone threshold, its top exactly level with the hillside outside. */
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.3), stoneLight);
  threshold.position.set(0, -0.02, doorZ + 0.35);
  shell.add(threshold);

  /* ---- the door leaf, hung open against the inner wall ---- */
  {
    const leafW = 2 * doorHalf * rWall - 0.14;
    const leafH = 3.5;
    const doorPivot = new THREE.Group();
    doorPivot.position.set(rWall, 0, 0);
    shell.add(doorPivot);

    const hinge = new THREE.Group();
    hinge.position.set(0, 0, -leafW / 2);
    doorPivot.add(hinge);

    const leafParts = [];
    const slab = new THREE.BoxGeometry(0.11, leafH, leafW);
    slab.translate(0, leafH / 2 + 0.02, leafW / 2);
    tint(slab, '#6d4a28');
    leafParts.push(slab);
    /* Vertical planks and two iron bands. */
    for (let i = 0; i < 4; i++) {
      const plank = new THREE.BoxGeometry(0.05, leafH * 0.94, 0.06);
      plank.translate(0.08, leafH / 2 + 0.02, 0.16 + i * (leafW - 0.32) / 3);
      tint(plank, '#5a3c20');
      leafParts.push(plank);
    }
    for (const by of [leafH * 0.24, leafH * 0.74]) {
      const band = new THREE.BoxGeometry(0.07, 0.18, leafW * 0.96);
      band.translate(0.09, by, leafW / 2);
      tint(band, '#3c4654');
      leafParts.push(band);
    }
    /* A ring handle on the swinging edge. */
    const handle = new THREE.TorusGeometry(0.1, 0.022, 6, 14);
    handle.rotateY(Math.PI / 2);
    handle.translate(0.14, leafH * 0.5, leafW - 0.24);
    tint(handle, '#c9a227');
    leafParts.push(handle);

    const leaf = new THREE.Mesh(
      mergeGeometries(leafParts, false),
      toonMaterial({ vertexColors: true })
    );
    leaf.userData.door = true;
    hinge.add(leaf);
    /* Swung back into the tower, clear of the walkway. */
    hinge.rotation.y = -1.85;
  }

  /* ---- the spiral ramp: flat treads winding up to the hatch ---- */
  const STEPS = 56;
  const a0 = doorHalf;
  const a1 = topStart;
  const stepParts = [];
  for (let i = 0; i < STEPS; i++) {
    const t0 = i / STEPS;
    const t1 = (i + 1) / STEPS;
    const rel0 = a0 + (a1 - a0) * t0;
    const rel1 = a0 + (a1 - a0) * t1;
    const mid = (rel0 + rel1) / 2;
    const rm = (rCore + rIn) / 2;
    const wide = rIn - rCore;
    const deep = rm * (rel1 - rel0) * 1.2;

    const geo = new THREE.BoxGeometry(wide, 0.16, deep);
    geo.rotateY(-mid);
    geo.translate(Math.cos(mid) * rm, H * t1 - 0.08, Math.sin(mid) * rm);
    tint(geo, i % 2 ? '#8a6a3f' : '#7d5f38');
    stepParts.push(geo);
  }
  const steps = new THREE.Mesh(mergeGeometries(stepParts, false), toonMaterial({ vertexColors: true }));
  g.add(steps);

  /* A brass handrail following the outer edge of the ramp. */
  const railPts = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const rel = a0 + (a1 - a0) * t;
    const rr = rIn - 0.28;
    railPts.push(new THREE.Vector3(Math.cos(rel) * rr, H * t + 0.95, Math.sin(rel) * rr));
  }
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 72, 0.045, 6, false),
    brass
  ));
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const rel = a0 + (a1 - a0) * t;
    const rr = rIn - 0.28;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), brass);
    post.position.set(Math.cos(rel) * rr, H * t + 0.48, Math.sin(rel) * rr);
    g.add(post);
  }

  /* ---- observation deck: the top floor, stopping at the hatch ---- */
  const deck = sector(topStart, topEnd, rDeck, 0.3, H - 0.15, deckMat, false);
  g.add(deck);

  /* ---- the gallery floor: a continuous ring all the way round ---- */
  {
    const gA = doorHalf + GALLERY_GAP;
    const gB = TWO - doorHalf - GALLERY_GAP;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rDeck, -gB, -gA, false);
    shape.absarc(0, 0, rWall, -gA, -gB, true);
    const ringGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.3, bevelEnabled: false, curveSegments: SEG,
    });
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.translate(0, H - 0.3, 0);
    const ring = new THREE.Mesh(ringGeo, deckMat);
    g.add(ring);
  }

  /* A moulded cornice ringing the outside, just under the deck. */
  const cornice = new THREE.Mesh(
    new THREE.CylinderGeometry(rWall + 0.42, rWall + 0.2, 0.4, SEG), stoneDark
  );
  cornice.position.y = H - 0.55;
  shell.add(cornice);

  /* ---- the hatch: a raised kerb round the stairwell mouth ---- */
  const hatchCoaming = (() => {
    const parts = [];
    const dirX = Math.cos(topStart);
    const dirZ = Math.sin(topStart);
    /* The deck ends on the radial line rel = topStart. Run a low kerb
       along it, leaving a gap in the middle to step through. */
    for (let i = 0; i <= 12; i++) {
      const r = rCore + 0.15 + (i / 12) * (rIn - rCore - 0.35);
      if (r > rCore + 1.1 && r < rCore + 2.4) continue;
      const kerb = new THREE.BoxGeometry(0.3, 0.42, 0.26);
      kerb.rotateY(-topStart);
      kerb.translate(dirX * r, H + 0.21, dirZ * r);
      tint(kerb, i % 2 ? '#8d867b' : '#9c9488');
      parts.push(kerb);
    }
    /* A brass sill plate right at the threshold. */
    const sillPlate = new THREE.BoxGeometry(rIn - rCore - 0.4, 0.05, 0.5);
    sillPlate.rotateY(-topStart);
    sillPlate.translate(dirX * ((rCore + rIn) / 2), H + 0.02, dirZ * ((rCore + rIn) / 2));
    tint(sillPlate, '#b9a45a');
    parts.push(sillPlate);
    return new THREE.Mesh(mergeGeometries(parts, false), toonMaterial({ vertexColors: true }));
  })();
  g.add(hatchCoaming);

  /* ---- gallery railing: one continuous 360° ring ---- */
  const RAIL = rDeck - 0.2;
  const POSTS = 60;
  for (let i = 0; i < POSTS; i++) {
    const rel = (i / POSTS) * TWO;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 8), dark);
    post.position.set(Math.cos(rel) * RAIL, H + 0.52, Math.sin(rel) * RAIL);
    g.add(post);
  }
  const railPts2 = [];
  for (let i = 0; i <= 72; i++) {
    const rel = (i / 72) * TWO;
    railPts2.push(new THREE.Vector3(Math.cos(rel) * RAIL, H + 1.05, Math.sin(rel) * RAIL));
  }
  const railCurve = new THREE.CatmullRomCurve3(railPts2, true);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(railCurve, 140, 0.055, 7, true), dark));
  const railPts3 = railPts2.map((p) => new THREE.Vector3(p.x, H + 0.58, p.z));
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts3, true), 140, 0.032, 6, true), dark
  ));

  /* Solid parapet panels either side of the doorway, where the entrance
     ramp passes beneath the gallery — these fence off the one part of the
     ring you cannot walk on. */
  for (const side of [1, -1]) {
    const relA = side > 0 ? doorHalf : TWO - doorHalf - GALLERY_GAP;
    const relB = relA + GALLERY_GAP;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rDeck, -relB, -relA, false);
    shape.absarc(0, 0, rDeck - 0.34, -relA, -relB, true);
    const panelGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 1.0, bevelEnabled: false, curveSegments: 20,
    });
    panelGeo.rotateX(-Math.PI / 2);
    panelGeo.translate(0, H, 0);
    g.add(new THREE.Mesh(panelGeo, stone));
  }

  /* ---- lantern room ---- */
  const lanternH = 2.2;
  shell.add(sector(0, TWO, rCore, lanternH, H + lanternH / 2, glass));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TWO;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.075, lanternH, 0.075), dark);
    bar.position.set(Math.cos(a) * rCore, H + lanternH / 2, Math.sin(a) * rCore);
    shell.add(bar);
  }
  const sill = new THREE.Mesh(new THREE.CylinderGeometry(rCore + 0.22, rCore + 0.22, 0.22, 32), dark);
  sill.position.y = H + 0.11;
  shell.add(sill);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.68, 20, 16), toonMaterial({ color: '#dfe8ee' }));
  lamp.position.y = H + 1.1;
  shell.add(lamp);
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(rCore + 0.24, 32, 18, 0, TWO, 0, Math.PI * 0.52), red
  );
  cap.position.y = H + lanternH + 0.02;
  shell.add(cap);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), dark);
  finial.position.y = H + lanternH + 1.1;
  shell.add(finial);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), dark);
  rod.position.y = H + lanternH + 1.6;
  shell.add(rod);

  /* ---- windows punched up the tower ---- */
  for (let i = 1; i < bands; i++) {
    const y = i * bandH + bandH * 0.5;
    const count = i < 3 ? 2 : 3;
    for (let k = 0; k < count; k++) {
      const rel = 1.15 + i * 0.72 + k * 2.1;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.36), dark);
      win.position.set(Math.cos(rel) * (rWall - 0.12), y, Math.sin(rel) * (rWall - 0.12));
      win.rotation.y = -rel;
      shell.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.18, 0.18), stoneDark);
      frame.position.set(Math.cos(rel) * (rWall + 0.03), y, Math.sin(rel) * (rWall + 0.03));
      frame.rotation.y = -rel;
      shell.add(frame);
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.3), stoneLight);
      ledge.position.set(Math.cos(rel) * (rWall + 0.06), y - 0.62, Math.sin(rel) * (rWall + 0.06));
      ledge.rotation.y = -rel;
      shell.add(ledge);
    }
  }

  /* ---- the telescope on the observation deck ---- */
  const TEL_REL = 5.0;
  const TEL_R = rDeck - 1.5;
  const telescope = new THREE.Group();
  telescope.position.set(Math.cos(TEL_REL) * TEL_R, H, Math.sin(TEL_REL) * TEL_R);
  /* Yaw the whole rig so the barrel points straight out to sea. */
  const telYaw = Math.PI / 2 - TEL_REL;
  telescope.rotation.y = telYaw;
  telescope.userData.telescope = true;

  const TILT = -0.05;
  telescope.userData.aim = new THREE.Vector3(0, -Math.sin(TILT), Math.cos(TILT))
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), telYaw)
    .normalize();

  /* Cast-iron pedestal on a bolted base plate. */
  const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.1, 20), iron);
  basePlate.position.y = 0.05;
  telescope.add(basePlate);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TWO;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 6), brass);
    bolt.position.set(Math.cos(a) * 0.34, 0.12, Math.sin(a) * 0.34);
    telescope.add(bolt);
  }
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.05, 16), iron);
  column.position.y = 0.6;
  telescope.add(column);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16), brass);
  collar.position.y = 1.16;
  telescope.add(collar);

  /* The tube, on a trunnion so it can tilt. */
  const yoke = new THREE.Group();
  yoke.position.y = 1.22;
  telescope.add(yoke);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.1), iron);
    arm.position.set(0, 0.21, s * 0.3);
    yoke.add(arm);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), brass);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(0, 0.4, s * 0.3);
    yoke.add(pin);
  }
  const barrel = new THREE.Group();
  barrel.position.y = 0.42;
  yoke.add(barrel);

  /* The main tube is an open-ended shell so you can see straight through
     the instrument — no solid cylinder cap. */
  const barrelMat = toonMaterial({ color: '#3c4654', side: THREE.DoubleSide });
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.19, 1.7, 28, 1, true), barrelMat
  );
  tube.rotation.x = Math.PI / 2;
  barrel.add(tube);

  /* Dark inner sleeve, so the bore reads as a hollow tube. */
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.128, 0.166, 1.72, 28, 1, true),
    toonMaterial({ color: '#161b22', side: THREE.BackSide })
  );
  bore.rotation.x = Math.PI / 2;
  barrel.add(bore);

  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 28), brass);
    ring.position.z = -0.55 + i * 0.55;
    barrel.add(ring);
  }

  /* Flared objective bell, open at the mouth. */
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.19, 0.34, 28, 1, true), barrelMat
  );
  bell.rotation.x = Math.PI / 2;
  bell.position.z = 0.98;
  barrel.add(bell);

  /* A bright brass bezel around the aperture. */
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.028, 10, 30), brass);
  bezel.position.z = 1.15;
  barrel.add(bezel);

  /* The objective lens itself: a shallow glass disc set just inside the
     mouth, catching the light the way a real optic does. */
  const lensMat = toonMaterial({
    color: '#bfe9ff',
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.225, 30, 12, 0, TWO, 0, Math.PI * 0.22), lensMat);
  lens.rotation.x = -Math.PI / 2;
  lens.position.z = 1.05;
  lens.scale.set(1, 1, 0.42);
  barrel.add(lens);

  /* A specular glint across the glass. */
  const glint = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), toonMaterial({
    color: '#ffffff', transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  }));
  glint.position.set(-0.075, 0.08, 1.1);
  barrel.add(glint);

  /* The crosshair the player sees through the eyepiece. */
  const reticle = new THREE.Group();
  reticle.position.z = -0.9;
  for (const rot of [0, Math.PI / 2]) {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.004), dark);
    wire.rotation.z = rot;
    reticle.add(wire);
  }
  barrel.add(reticle);

  const eyepiece = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.095, 0.3, 20, 1, true),
    toonMaterial({ color: '#c9a227', side: THREE.DoubleSide })
  );
  eyepiece.rotation.x = Math.PI / 2;
  eyepiece.position.z = -1.0;
  barrel.add(eyepiece);
  /* A dark pupil at the back so the eyepiece is not a see-through hole. */
  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(0.062, 18),
    toonMaterial({ color: '#0b1016', side: THREE.DoubleSide })
  );
  pupil.position.z = -1.14;
  barrel.add(pupil);

  /* Focus knob, a back counterweight and a sighting vane. */
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 14), brass);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.21, 0.06, 0.18);
  barrel.add(knob);
  const weight = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.24, 16), iron);
  weight.rotation.x = Math.PI / 2;
  weight.position.z = -0.82;
  barrel.add(weight);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.1), brass);
  vane.position.set(0, 0.2, 0.55);
  barrel.add(vane);
  barrel.rotation.x = TILT;

  /* Where the camera sits when the player looks through it. This is in
     front of the objective bell, not at the eyepiece: the barrel, lens
     and railing all sit behind the camera, so the line of sight out to
     sea is completely clear. */
  telescope.userData.eyeLocal = new THREE.Vector3(0, 1.74, 1.95);

  g.add(telescope);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  g.userData.shell = shell;
  g.userData.telescope = telescope;
  /* Deliberately no perch points here — seagulls never land on the tower. */
  return g;
}

/**
 * One massive organically-deformed boulder. A high-detail icosahedron is
 * pushed around by a few sine lobes and tapered toward the top, so a
 * single mesh reads as a solid reef mound rather than a pile of pebbles.
 */
function buildReefRock(radius, height, seed) {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    const n = 1
      + 0.26 * Math.sin(v.x * 4.1 + seed)
      + 0.20 * Math.cos(v.y * 5.3 - seed * 1.7)
      + 0.13 * Math.sin(v.z * 7.7 + seed * 2.3);

    const t = (v.y + 1) * 0.5;
    const taper = 1 - 0.62 * t * t;

    pos.setXYZ(i, v.x * n * taper, v.y * n, v.z * n * taper * 0.9);
  }

  geo.scale(radius, height, radius);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A few reefs, each one massive mound (plus at most two large companion
 * boulders). Every reef runs from well below the seabed to above the
 * waterline, so nothing floats mid-water. Also reports a perch point
 * per reef for the seagulls.
 */
function buildReefs(rng) {
  const group = new THREE.Group();
  const mats = [
    toonMaterial({ color: '#6f6f76' }),
    toonMaterial({ color: '#7e7e86' }),
    toonMaterial({ color: '#5c5c64' }),
  ];
  const kelpMat = toonMaterial({ color: '#3f7d4a', side: THREE.DoubleSide });

  const CLUSTERS = 7;
  const perches = [];

  for (let i = 0; i < CLUSTERS; i++) {
    const a = (i / CLUSTERS) * Math.PI * 2 + rng() * 0.7;
    const r = 58 + rng() * 36;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;

    const cluster = new THREE.Group();
    cluster.position.set(cx, 0, cz);

    const bottom = groundHeight(cx, cz) - 1.5;
    const top = SEA_LEVEL + 1.4 + rng() * 1.6;

    /* The whole reef body, one solid mesh. */
    const radius = 5.2 + rng() * 3.6;
    const mound = new THREE.Mesh(
      buildReefRock(radius, (top - bottom) / 2.4, rng() * 10),
      mats[Math.floor(rng() * mats.length)]
    );
    mound.position.set(0, (top + bottom) / 2, 0);
    cluster.add(mound);

    /* At most two massive companions — no scattered debris. */
    const companions = Math.floor(rng() * 2);
    for (let k = 0; k < companions; k++) {
      const ca = rng() * Math.PI * 2;
      const cd = radius * (0.85 + rng() * 0.5);
      const cr = 3.0 + rng() * 2.4;
      const rock = new THREE.Mesh(
        buildReefRock(cr, cr * (1.0 + rng() * 0.8), rng() * 10),
        mats[Math.floor(rng() * mats.length)]
      );
      rock.position.set(Math.cos(ca) * cd, SEA_LEVEL - 0.4 + rng() * 1.2, Math.sin(ca) * cd);
      rock.rotation.y = rng() * 3;
      cluster.add(rock);
    }

    /* A little kelp for life. */
    for (let k = 0; k < 6; k++) {
      const h = 1.4 + rng() * 1.4;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, 0.05), kelpMat);
      blade.position.set((rng() - 0.5) * 9, SEA_LEVEL - 1.0 + h / 2, (rng() - 0.5) * 9);
      blade.rotation.set((rng() - 0.5) * 0.3, rng() * 3, (rng() - 0.5) * 0.3);
      cluster.add(blade);
    }

    cluster.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    group.add(cluster);

    perches.push({ x: cx, y: top, z: cz });
  }

  group.userData.perches = perches;
  return group;
}

function buildPath() {
  const group = new THREE.Group();
  const mats = [
    toonMaterial({ color: '#b9a888' }),
    toonMaterial({ color: '#a89574' }),
    toonMaterial({ color: '#c6b596' }),
  ];
  const geo = flatShade(new THREE.CylinderGeometry(0.62, 0.68, 0.14, 9));

  PATH_POINTS.forEach((p, i) => {
    const y = groundHeight(p.x, p.z);
    if (y < SEA_LEVEL - 0.2) return;
    const m = new THREE.Mesh(geo, mats[i % mats.length]);
    m.position.set(p.x, y + 0.03, p.z);
    m.rotation.y = (i * 0.7) % (Math.PI * 2);
    m.scale.setScalar(0.75 + ((i * 37) % 30) / 100);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });
  return group;
}

/* --- 5-passenger speedboat ---------------------------------------- */
/* Built with the bow towards +Z and the waterline at local y = 0. */

const BOAT = { halfLength: 3.5, halfBeam: 1.26, depth: 1.02 };

/* How far the hull sits above the waterline. Big enough that the cockpit
   sole stays dry while the keel remains properly submerged. */
const BOAT_FLOAT = 0.62;

function boatHalfWidth(u) {
  if (u < 0.16) return BOAT.halfBeam * (0.88 + 0.12 * (u / 0.16));
  const k = (u - 0.16) / 0.84;
  return BOAT.halfBeam * Math.pow(Math.max(0, 1 - k * k), 0.6);
}

function boatDepth(u) {
  return BOAT.depth * (0.66 + 0.34 * Math.pow(1 - u, 0.7));
}

function boatZ(u) {
  return -BOAT.halfLength + u * 2 * BOAT.halfLength;
}

/**
 * Deep-V planing hull built as a *solid* shell: an outer surface, an
 * inset inner surface and a rim joining them at the gunwale. The
 * thickness means the transparent ocean can never be seen through the
 * hull, and the transom is capped so there is no open back end.
 */
function buildHullGeometry() {
  const stations = 26;
  const RING = 5;
  const positions = [];
  const indices = [];

  const outerRing = (u) => {
    const z = boatZ(u);
    const w = boatHalfWidth(u);
    const dy = boatDepth(u);
    const cy = -dy * 0.44;
    return [
      [-w * 1.03, 0, z],
      [-w, cy, z],
      [0, -dy, z],
      [w, cy, z],
      [w * 1.03, 0, z],
    ];
  };

  const innerRing = (u) => {
    const z = boatZ(u);
    const w = boatHalfWidth(u) * 0.86;
    const dy = boatDepth(u);
    const cy = -dy * 0.44 + 0.07;
    return [
      [-w * 1.03, 0.06, z],
      [-w, cy, z],
      [0, -dy + 0.17, z],
      [w, cy, z],
      [w * 1.03, 0.06, z],
    ];
  };

  const addSurface = (ringFn, flip) => {
    const base = positions.length / 3;
    for (let i = 0; i <= stations; i++) {
      for (const p of ringFn(i / stations)) positions.push(p[0], p[1], p[2]);
    }
    for (let i = 0; i < stations; i++) {
      const a = base + i * RING;
      const b = base + (i + 1) * RING;
      for (let j = 0; j < RING - 1; j++) {
        if (flip) {
          indices.push(a + j, b + j, a + j + 1);
          indices.push(a + j + 1, b + j, b + j + 1);
        } else {
          indices.push(a + j, a + j + 1, b + j);
          indices.push(a + j + 1, b + j + 1, b + j);
        }
      }
    }
    return base;
  };

  const oBase = addSurface(outerRing, false);
  const iBase = addSurface(innerRing, true);

  /* Gunwale rim closing the top of both sides. */
  for (let i = 0; i < stations; i++) {
    const o0 = oBase + i * RING;
    const o1 = oBase + (i + 1) * RING;
    const n0 = iBase + i * RING;
    const n1 = iBase + (i + 1) * RING;

    indices.push(o0, o1, n0);
    indices.push(n0, o1, n1);

    indices.push(o0 + 4, n0 + 4, o1 + 4);
    indices.push(n0 + 4, n1 + 4, o1 + 4);
  }

  /* Transom cap. */
  for (let j = 0; j < RING - 1; j++) {
    indices.push(oBase + j, iBase + j, oBase + j + 1);
    indices.push(iBase + j, iBase + j + 1, oBase + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  /* Outer: dark antifouling, red boot stripe, bright topsides.
     Inner: pale gelcoat liner. */
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  const lower = new THREE.Color('#1f3d5c');
  const upper = new THREE.Color('#f4f7fa');
  const stripe = new THREE.Color('#c0392b');
  const liner = new THREE.Color('#dde3e8');
  const c = new THREE.Color();

  for (let i = 0; i < n; i++) {
    if (i >= iBase) {
      c.copy(liner);
    } else {
      const y = pos.getY(i);
      if (y < -0.34) c.copy(lower);
      else if (y < -0.22) c.copy(stripe);
      else c.copy(upper);
    }
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function boatOutline(scale, from, to, N = 18) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const u = from + (i / N) * (to - from);
    pts.push([boatHalfWidth(u) * scale, boatZ(u)]);
  }
  for (let i = N; i >= 0; i--) {
    const u = from + (i / N) * (to - from);
    pts.push([-boatHalfWidth(u) * scale, boatZ(u)]);
  }
  return pts;
}

function shapeFromPts(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

function extrudeFlat(shape, thickness, yTop) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, yTop, 0);
  geo.computeVertexNormals();
  return geo;
}

function buildSpeedboat() {
  const g = new THREE.Group();

  const hullMat = toonMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const deckMat = toonMaterial({ color: '#e9e4d6' });
  const railMat = toonMaterial({ color: '#c9cdd2' });
  const trimMat = toonMaterial({ color: '#1f3d5c' });
  const chromeMat = toonMaterial({ color: '#b8c2cc' });
  const glassMat = toonMaterial({ color: '#8fd0ef', transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const seatMat = toonMaterial({ color: '#8f3030' });
  const seatDark = toonMaterial({ color: '#5e1f1f' });
  const motorMat = toonMaterial({ color: '#2b3540' });
  const motorTrim = toonMaterial({ color: '#9aa4ad' });

  g.add(new THREE.Mesh(buildHullGeometry(), hullMat));

  /* Rub rail ring around the gunwale. */
  const outer = shapeFromPts(boatOutline(1.05, 0, 1));
  const innerPts = boatOutline(0.95, 0, 1).slice().reverse().map(([x, y]) => new THREE.Vector2(x, y));
  outer.holes.push(new THREE.Path(innerPts));
  g.add(new THREE.Mesh(extrudeFlat(outer, 0.07, 0.07), railMat));

  /* Foredeck and stern deck, leaving the cockpit open. */
  g.add(new THREE.Mesh(extrudeFlat(shapeFromPts(boatOutline(1.0, 0.46, 1.0)), 0.06, 0.05), deckMat));
  g.add(new THREE.Mesh(extrudeFlat(shapeFromPts(boatOutline(1.0, 0, 0.12)), 0.06, 0.05), deckMat));

  /* Cockpit sole — kept above the waterline so no water shows inside. */
  const sole = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 3.0), deckMat);
  sole.position.set(0, -0.30, -1.5);
  g.add(sole);

  /* --- seats: 2 buckets forward, a 3-up bench aft = 5 passengers --- */
  for (const sx of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.6), seatMat);
    base.position.set(sx * 0.55, -0.12, -1.35);
    g.add(base);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.14), seatDark);
    back.position.set(sx * 0.55, 0.14, -1.63);
    back.rotation.x = -0.14;
    g.add(back);

    const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.1), seatDark);
    bolster.position.set(sx * 0.55, 0.42, -1.68);
    g.add(bolster);
  }

  const benchBase = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.18, 0.62), seatMat);
  benchBase.position.set(0, -0.10, -2.55);
  g.add(benchBase);

  const benchBack = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.6, 0.15), seatDark);
  benchBack.position.set(0, 0.17, -2.83);
  benchBack.rotation.x = -0.12;
  g.add(benchBack);

  /* --- helm console + wheel --- */
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.5), trimMat);
  console_.position.set(0.34, -0.02, -0.62);
  console_.rotation.x = -0.2;
  g.add(console_);

  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.16), chromeMat);
  dash.position.set(0.34, 0.3, -0.74);
  dash.rotation.x = -0.2;
  g.add(dash);

  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 20), chromeMat);
  wheel.position.set(0.34, 0.24, -0.55);
  wheel.rotation.x = 1.15;
  g.add(wheel);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), chromeMat);
    spoke.position.copy(wheel.position);
    spoke.rotation.x = 1.15;
    spoke.rotation.z = (i / 3) * Math.PI;
    g.add(spoke);
  }

  const throttle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), chromeMat);
  throttle.position.set(0.72, 0.24, -0.5);
  throttle.rotation.x = -0.5;
  g.add(throttle);

  /* --- raked windshield --- */
  const wsShape = new THREE.Shape();
  wsShape.moveTo(-0.98, 0);
  wsShape.lineTo(0.98, 0);
  wsShape.lineTo(0.78, 0.62);
  wsShape.lineTo(-0.78, 0.62);
  wsShape.closePath();
  const windshield = new THREE.Mesh(new THREE.ShapeGeometry(wsShape), glassMat);
  windshield.position.set(0, 0.06, -0.34);
  windshield.rotation.x = -0.42;
  g.add(windshield);

  const wsFrame = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.07, 0.07), chromeMat);
  wsFrame.position.set(0, 0.06 + 0.62 * Math.cos(0.42), -0.34 - 0.62 * Math.sin(0.42));
  wsFrame.rotation.x = -0.42;
  g.add(wsFrame);

  /* --- outboard motor on the transom --- */
  const motor = new THREE.Group();
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.74), motorMat);
  cowl.position.y = 0.12;
  motor.add(cowl);
  const cowlTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.66), motorTrim);
  cowlTop.position.y = 0.46;
  motor.add(cowlTop);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.72, 0.36), motorMat);
  shaft.position.y = -0.4;
  motor.add(shaft);
  const skeg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.5), motorTrim);
  skeg.position.set(0, -0.82, 0.06);
  motor.add(skeg);
  const propHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), motorTrim);
  propHub.rotation.x = Math.PI / 2;
  propHub.position.set(0, -0.78, -0.22);
  motor.add(propHub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.03), motorTrim);
    blade.position.set(0, -0.78, -0.22);
    blade.rotation.z = (i / 3) * Math.PI * 2;
    blade.translateY(0.16);
    motor.add(blade);
  }
  motor.position.set(0, 0.34, -BOAT.halfLength - 0.16);
  g.add(motor);

  /* --- bow rail --- */
  const railGeo = new THREE.CylinderGeometry(0.028, 0.028, 1, 6);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const u = 0.55 + i * 0.1;
      const post = new THREE.Mesh(railGeo, chromeMat);
      post.scale.y = 0.42;
      post.position.set(sx * boatHalfWidth(u) * 0.92, 0.26, boatZ(u));
      g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 6), chromeMat);
    rail.rotation.x = Math.PI / 2;
    rail.scale.y = 2.6;
    rail.position.set(sx * boatHalfWidth(0.72) * 0.9, 0.47, boatZ(0.72));
    rail.rotation.z = sx * 0.18;
    g.add(rail);
  }

  /* --- navigation lights --- */
  const port = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    toonMaterial({ color: '#e04b4b', emissive: 0x5a0f0f })
  );
  port.position.set(-boatHalfWidth(0.9) * 0.95, 0.14, boatZ(0.9));
  g.add(port);

  const stbd = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    toonMaterial({ color: '#3ddc84', emissive: 0x0f5a2a })
  );
  stbd.position.set(boatHalfWidth(0.9) * 0.95, 0.14, boatZ(0.9));
  g.add(stbd);

  const sternPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), chromeMat);
  sternPole.position.set(0, 0.4, -BOAT.halfLength + 0.2);
  g.add(sternPole);

  const sternLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    toonMaterial({ color: '#ffffff', emissive: 0x666655 })
  );
  sternLight.position.set(0, 0.76, -BOAT.halfLength + 0.2);
  g.add(sternLight);

  /* --- cleats and fenders --- */
  for (const [cx, cz] of [[0.9, 1.4], [-0.9, 1.4], [0.95, -2.2], [-0.95, -2.2]]) {
    const cleat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), chromeMat);
    cleat.rotation.z = Math.PI / 2;
    cleat.position.set(cx, 0.11, cz);
    g.add(cleat);
  }

  for (let i = 0; i < 3; i++) {
    const fender = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.11, 0.24, 6, 10),
      toonMaterial({ color: '#e8e4d8' })
    );
    fender.position.set(boatHalfWidth(0.3 + i * 0.1) * 1.1, -0.24, boatZ(0.3 + i * 0.1));
    g.add(fender);
  }

  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), toonMaterial({ color: '#c0392b', side: THREE.DoubleSide }));
  flag.position.set(0.19, 0.66, -BOAT.halfLength + 0.2);
  g.add(flag);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** A long wooden bench: seat plank, backrest and legs. */
function buildBench(bench) {
  const g = new THREE.Group();
  const wood = toonMaterial({ color: '#a97c4f' });
  const woodDark = toonMaterial({ color: '#7d5a33' });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.13, 0.62), wood);
  seat.position.set(0, 0.45, 0);
  g.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.52, 0.1), woodDark);
  back.position.set(0, 0.76, -0.3);
  back.rotation.x = -0.12;
  g.add(back);

  const backRail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.12), wood);
  backRail.position.set(0, 1.0, -0.33);
  backRail.rotation.x = -0.12;
  g.add(backRail);

  for (const dx of [-1.35, 1.35]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.5), woodDark);
    leg.position.set(dx, 0.22, 0);
    g.add(leg);

    const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.6, 0.11), woodDark);
    post.position.set(dx, 0.72, -0.31);
    post.rotation.x = -0.12;
    g.add(post);
  }

  g.position.set(bench.x, PIER.deckY, bench.z);
  g.rotation.y = bench.facing;
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

function buildPier() {
  const group = new THREE.Group();
  const plankMat = toonMaterial({ color: '#a97c4f' });
  const postMat = toonMaterial({ color: '#6f4c2c' });

  const deckTop = (x) => surfaceHeight(x, 0);
  const plankGeo = new THREE.BoxGeometry(1.0, 0.14, PIER.halfZ * 2);

  const P = PIER.platform;

  /* --- walkway planks --- */
  for (let x = PIER.startX + 0.5; x < P.x0; x += 1.15) {
    const top = deckTop(x);
    const plank = new THREE.Mesh(plankGeo, plankMat);
    plank.position.set(x, top - 0.07, PIER.z);
    plank.rotation.y = (((x * 13) % 5) - 2) * 0.006;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  /* --- observation platform deck (planks run across the pier) --- */
  const platformGeo = new THREE.BoxGeometry(1.0, 0.14, P.halfZ * 2);
  for (let x = P.x0 + 0.5; x <= P.x1 - 0.4; x += 1.15) {
    const plank = new THREE.Mesh(platformGeo, plankMat);
    plank.position.set(x, PIER.deckY - 0.07, PIER.z);
    plank.rotation.y = (((x * 13) % 5) - 2) * 0.006;
    plank.castShadow = true;
    plank.receiveShadow = true;
    group.add(plank);
  }

  /* --- pilings --- */
  const postGeo = new THREE.CylinderGeometry(0.13, 0.15, 1, 9);
  const addPost = (x, z, top) => {
    const g = groundHeight(x, z);
    const h = Math.max(0.5, top - g + 0.4);
    const post = new THREE.Mesh(postGeo, postMat);
    post.scale.y = h;
    post.position.set(x, top - h / 2, z);
    post.castShadow = true;
    group.add(post);
  };

  for (let x = PIER.startX + 1.2; x < P.x0; x += 3.2) {
    for (const sz of [-1, 1]) {
      addPost(x, PIER.z + sz * (PIER.halfZ - 0.15), deckTop(x) - 0.1);
    }
  }
  for (const px of [P.x0 + 1.0, (P.x0 + P.x1) / 2, P.x1 - 1.0]) {
    for (const sz of [-1, 1]) {
      addPost(px, PIER.z + sz * (P.halfZ - 0.4), PIER.deckY - 0.1);
    }
  }
  for (const sz of [-1, 1]) {
    addPost(P.x0 + 1.0, PIER.z + sz * (P.halfZ - 0.15), PIER.deckY - 0.1);
  }

  /* --- railings --- */
  const railGeo = new THREE.BoxGeometry(1, 0.09, 0.09);
  const railPostGeo = new THREE.CylinderGeometry(0.07, 0.07, 1, 7);
  const addRailPost = (x, z) => {
    const post = new THREE.Mesh(railPostGeo, postMat);
    post.position.set(x, PIER.deckY + 0.5, z);
    post.castShadow = true;
    group.add(post);
  };
  const addRail = (x0, x1, z) => {
    const rail = new THREE.Mesh(railGeo, plankMat);
    rail.scale.x = Math.abs(x1 - x0);
    rail.position.set((x0 + x1) / 2, PIER.deckY + 1.0, z);
    rail.castShadow = true;
    group.add(rail);
  };
  const addRailZ = (x, z0, z1) => {
    const rail = new THREE.Mesh(railGeo, plankMat);
    rail.scale.x = Math.abs(z1 - z0);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(x, PIER.deckY + 1.0, (z0 + z1) / 2);
    rail.castShadow = true;
    group.add(rail);
  };

  /* The railings run unbroken except for a deliberate opening on each
     side where the speedboats are tied up. */
  const MOOR = { x0: 37.5, x1: 47.5 };

  for (const sz of [-1, 1]) {
    const z = PIER.z + sz * (PIER.halfZ - 0.08);

    for (let x = PIER.rampEndX + 0.5; x < P.x0; x += 3.0) {
      if (x > MOOR.x0 - 0.3 && x < MOOR.x1 + 0.3) continue;
      addRailPost(x, z);
    }
    addRailPost(MOOR.x0, z);
    addRailPost(MOOR.x1, z);

    addRail(PIER.rampEndX + 0.5, MOOR.x0, z);
    addRail(MOOR.x1, P.x0 - 0.4, z);
  }

  /* Platform: open where the walkway joins, railed elsewhere. */
  for (const sz of [-1, 1]) {
    const z = PIER.z + sz * (P.halfZ - 0.1);
    for (let x = P.x0 + 1.0; x <= P.x1 - 0.4; x += 3.0) addRailPost(x, z);
    addRail(P.x0 + 0.6, P.x1 - 0.4, z);
    for (let zz = -P.halfZ + 0.6; zz <= P.halfZ - 0.6; zz += 2.4) {
      addRailPost(P.x1 - 0.15, PIER.z + zz);
    }
    addRailZ(P.x1 - 0.15, PIER.z - P.halfZ + 0.4, PIER.z + P.halfZ - 0.4);
  }

  /* --- benches --- */
  for (const b of BENCHES) group.add(buildBench(b));

  /* --- flat sunshade awning over the observation platform --- */
  const canvasMat = toonMaterial({ color: '#2f7f8f', side: THREE.DoubleSide });
  const canvasPale = toonMaterial({ color: '#eef3f5', side: THREE.DoubleSide });
  const cx = (P.x0 + P.x1) / 2;
  const top = PIER.deckY + 4.4;

  /* Flat canvas roof — no peak, just a slab with a fascia and valance. */
  const span = 5.4;
  const roofSlab = new THREE.Mesh(
    new THREE.BoxGeometry(span * 2 + 0.6, 0.22, span * 2 + 0.6),
    canvasMat
  );
  roofSlab.position.set(cx, top, PIER.z);
  roofSlab.castShadow = true;
  group.add(roofSlab);

  for (const sz of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.8, 0.3, 0.12), canvasPale);
    f.position.set(cx, top - 0.22, PIER.z + sz * (span + 0.24));
    group.add(f);
  }
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, span * 2 + 0.8), canvasPale);
    f.position.set(cx + sx * (span + 0.24), top - 0.22, PIER.z);
    group.add(f);
  }

  for (const sz of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(span * 2, 0.34, 0.06), canvasPale);
    strip.position.set(cx, top - 0.54, PIER.z + sz * (span + 0.24));
    group.add(strip);
  }
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, span * 2), canvasPale);
    strip.position.set(cx + sx * (span + 0.24), top - 0.54, PIER.z);
    group.add(strip);
  }

  /* Support posts around the platform rim, tall enough for the roof. */
  const postH = top - PIER.deckY;
  for (const px of [cx - 4.0, cx + 4.0]) {
    for (const pz of [-4.3, 4.3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, postH, 8), postMat);
      post.position.set(px, PIER.deckY + postH / 2, pz);
      post.castShadow = true;
      group.add(post);
    }
  }
  for (const pz of [-4.5, 4.5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, postH, 8), postMat);
    post.position.set(cx, PIER.deckY + postH / 2, pz);
    post.castShadow = true;
    group.add(post);
  }

  return group;
}

function makeLabel(text, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = Math.min(248, ctx.measureText(text).width + 30);
  const x = (256 - tw) / 2;
  const r = 18;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(x + r, 10);
  ctx.arcTo(x + tw, 10, x + tw, 54, r);
  ctx.arcTo(x + tw, 54, x, 54, r);
  ctx.arcTo(x, 54, x, 10, r);
  ctx.arcTo(x, 10, x + tw, 10, r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(12, 20, 30, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(text, 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.6, 0.65, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/** Rounded speech bubble with a tail, drawn to a canvas texture. */
function makeSpeechBubble() {
  const W = 640;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  sprite.renderOrder = 1000;
  sprite.visible = false;
  sprite.scale.set(4.6, 2.3, 1);

  function roundedRect(px, py, pw, ph, rad) {
    ctx.beginPath();
    ctx.moveTo(px + rad, py);
    ctx.arcTo(px + pw, py, px + pw, py + ph, rad);
    ctx.arcTo(px + pw, py + ph, px, py + ph, rad);
    ctx.arcTo(px, py + ph, px, py, rad);
    ctx.arcTo(px, py, px + pw, py, rad);
    ctx.closePath();
  }

  function setText(text) {
    ctx.clearRect(0, 0, W, H);
    ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxW = 520;
    const lines = [];
    let line = '';
    for (const word of String(text).split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);

    const lineH = 56;
    const boxH = lines.length * lineH + 52;
    const boxW = 600;
    const x = (W - boxW) / 2;
    const y = (H - boxH) / 2 - 18;
    const rad = 30;

    ctx.fillStyle = 'rgba(250, 252, 255, 0.97)';
    ctx.strokeStyle = '#0d141c';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(W / 2 - 28, y + boxH - 6);
    ctx.lineTo(W / 2, y + boxH + 40);
    ctx.lineTo(W / 2 + 28, y + boxH - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    roundedRect(x, y, boxW, boxH, rad);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#16202b';
    lines.forEach((l, i) => {
      ctx.fillText(l, W / 2, y + 30 + i * lineH + lineH / 2);
    });

    tex.needsUpdate = true;
  }

  return { sprite, setText };
}

function buildMerchant() {
  const g = new THREE.Group();

  /* Weathered, sun-beaten veteran fisherman. */
  const knitMat = toonMaterial({ color: '#2f5d6b' });     // heavy cable-knit sweater
  const knitDark = toonMaterial({ color: '#244a56' });
  const oilMat = toonMaterial({ color: '#c8912f' });      // oilskin overalls
  const oilDark = toonMaterial({ color: '#a3741f' });
  const skinMat = toonMaterial({ color: '#c98f5e' });     // tanned, ruddy
  const beardMat = toonMaterial({ color: '#e6e9ec' });
  const bootMat = toonMaterial({ color: '#2c3126' });
  const capMat = toonMaterial({ color: '#1f2f4a' });
  const brassMat = toonMaterial({ color: '#d9a521' });
  const eyeMat = toonMaterial({ color: 0x24282f });
  const woodMat = toonMaterial({ color: '#8a5a33' });
  const woodDark = toonMaterial({ color: '#6b4526' });

  /* ----------------------------- legs ----------------------------- */
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.3, 10, 14), oilMat);
    thigh.position.set(sx * 0.19, 0.52, 0);
    g.add(thigh);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.42, 18), bootMat);
    boot.position.set(sx * 0.19, 0.21, 0);
    g.add(boot);

    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), bootMat);
    toe.scale.set(1, 0.62, 1.55);
    toe.position.set(sx * 0.19, 0.09, 0.12);
    g.add(toe);
  }

  /* ------------------------- sweater + overalls ------------------------- */
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.5, 12, 24), knitMat);
  chest.position.y = 1.18;
  g.add(chest);

  /* Ribbed knit: horizontal bands around the torso. */
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.4 - i * 0.008, 0.022, 6, 24), knitDark);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 0.95 + i * 0.13;
    rib.scale.set(1, 1, 0.94);
    g.add(rib);
  }

  /* Oilskin bib + straps. */
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.12), oilMat);
  bib.position.set(0, 1.18, 0.35);
  g.add(bib);

  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.36, 24), oilDark);
  waist.position.y = 0.82;
  g.add(waist);

  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.52, 0.05), oilDark);
    strap.position.set(sx * 0.18, 1.42, 0.31);
    strap.rotation.x = -0.14;
    g.add(strap);

    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.06), brassMat);
    clip.position.set(sx * 0.18, 1.16, 0.36);
    g.add(clip);
  }

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 24), woodDark);
  belt.position.y = 0.64;
  g.add(belt);

  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.05), brassMat);
  beltBuckle.position.set(0, 0.64, 0.46);
  g.add(beltBuckle);

  /* Rolled turtleneck. */
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.22, 24), knitDark);
  collar.position.y = 1.55;
  g.add(collar);

  /* ------------------------------ arms ------------------------------ */
  const armGeo = new THREE.CapsuleGeometry(0.105, 0.42, 10, 14);
  const handGeo = new THREE.SphereGeometry(0.12, 16, 12);
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), knitMat);
    shoulder.position.set(sx * 0.42, 1.44, 0);
    g.add(shoulder);

    const arm = new THREE.Mesh(armGeo, knitMat);
    arm.position.set(sx * 0.5, 1.16, 0.08);
    arm.rotation.z = sx * 0.26;
    g.add(arm);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.028, 6, 16), knitDark);
    cuff.rotation.x = Math.PI / 2;
    cuff.rotation.z = sx * 0.26;
    cuff.position.set(sx * 0.6, 0.92, 0.1);
    g.add(cuff);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(sx * 0.64, 0.85, 0.11);
    g.add(hand);
  }

  /* ------------------------------ head ------------------------------ */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.16, 16), skinMat);
  neck.position.y = 1.63;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.275, 28, 20), skinMat);
  head.position.y = 1.78;
  g.add(head);

  /* Ruddy nose + weathered cheeks. */
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12), toonMaterial({ color: '#c47a4e' }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.77, 0.28);
  g.add(nose);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), eyeMat);
    eye.position.set(sx * 0.095, 1.83, 0.245);
    g.add(eye);

    /* Big bushy eyebrows. */
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.05), beardMat);
    brow.position.set(sx * 0.095, 1.9, 0.25);
    brow.rotation.z = sx * 0.3;
    g.add(brow);

    /* Crow's feet. */
    const wrinkle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), toonMaterial({ color: '#a9714a' }));
    wrinkle.position.set(sx * 0.175, 1.82, 0.19);
    g.add(wrinkle);
  }

  /* Full white beard, moustache and sideburns. */
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.66, 18), beardMat);
  beard.position.set(0, 1.47, 0.1);
  beard.rotation.x = Math.PI;
  g.add(beard);

  const moustache = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10), beardMat);
  moustache.scale.set(1.6, 0.55, 0.62);
  moustache.position.set(0, 1.7, 0.23);
  g.add(moustache);

  for (const sx of [-1, 1]) {
    const sideburn = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), beardMat);
    sideburn.scale.set(0.55, 1.5, 0.9);
    sideburn.position.set(sx * 0.25, 1.78, 0.02);
    g.add(sideburn);
  }

  /* Peaked captain's cap with a brass anchor badge. */
  const capTop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), capMat);
  capTop.position.y = 1.98;
  capTop.scale.set(1.12, 1.0, 1.12);
  g.add(capTop);

  const capBand = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.09, 26), toonMaterial({ color: '#141f33' }));
  capBand.position.y = 2.0;
  g.add(capBand);

  const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 0.045, 26), toonMaterial({ color: '#0f1826' }));
  peak.scale.set(1, 1, 1.35);
  peak.position.set(0, 1.95, 0.13);
  peak.rotation.x = 0.22;
  g.add(peak);

  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12), brassMat);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 2.02, 0.315);
  g.add(badge);

  /* Old pipe. */
  const pipe = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 8), woodDark);
  stem.rotation.z = Math.PI / 2;
  pipe.add(stem);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.11, 12), woodDark);
  bowl.position.set(0.17, 0.06, 0);
  pipe.add(bowl);
  pipe.position.set(0.52, 1.62, 0.24);
  pipe.rotation.y = -0.3;
  g.add(pipe);

  /* Everything added so far is the character. Move it into its own
     sub-group so he can turn to face customers without spinning the
     stall, canopy and wares around with him. */
  const npc = new THREE.Group();
  for (const child of g.children.slice()) {
    g.remove(child);
    npc.add(child);
  }
  g.add(npc);
  g.userData.npc = npc;
  const label = makeLabel('David', 'rgba(31, 111, 139, 0.88)');
  label.position.set(0, 3.55, 0);
  g.add(label);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return g;
}

/* ------------------------------------------------------------------ */
/*  Clouds & sky                                                       */
/* ------------------------------------------------------------------ */

/**
 * A cumulus blob: a squashed dome with a deliberately flat underside.
 * Vertices below the base line are clamped upwards, so each cloud rests
 * on a level bottom like real coastal cumulus instead of a floating
 * sphere. Detail 2 gives enough polygons for a soft, natural silhouette.
 */
function cloudBlobGeo(radius) {
  const g = flatShade(new THREE.IcosahedronGeometry(radius, 2));
  const pos = g.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);

  const top = new THREE.Color('#ffffff');
  const mid = new THREE.Color('#e4edf7');
  const bottom = new THREE.Color('#9db6d2');
  const c = new THREE.Color();

  const squash = 0.46;
  const floorY = -radius * 0.10;

  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = pos.getY(i) * squash;
    if (y < floorY) y = floorY;
    pos.setXYZ(i, x, y, z);

    const t = Math.min(1, Math.max(0, (y - floorY) / (radius * squash * 2)));
    if (t < 0.5) c.copy(bottom).lerp(mid, t * 2);
    else c.copy(mid).lerp(top, (t - 0.5) * 2);

    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }

  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.computeVertexNormals();
  /* Lift so the flat base sits at y = 0. */
  g.translate(0, -floorY, 0);
  return g;
}

function buildClouds(rng) {
  const group = new THREE.Group();
  const mat = toonMaterial({ vertexColors: true, transparent: true, opacity: 0.96 });
  /* Big, billowing coastal cumulus: many large flat-bottomed blobs per
     cloud, all sharing a common base level. */
  const COUNT = 40;

  for (let i = 0; i < COUNT; i++) {
    const parts = [];
    const blobs = 8 + Math.floor(rng() * 5);
    const spread = 38 + rng() * 52;

    for (let b = 0; b < blobs; b++) {
      const r = 10 + rng() * 14;
      const geo = cloudBlobGeo(r);
      geo.translate(
        (rng() - 0.5) * spread,
        rng() * 0.8,
        (rng() - 0.5) * spread * 0.75
      );
      parts.push(geo);
    }

    const cloud = new THREE.Mesh(mergeGeometries(parts, false), mat);
    const a = rng() * Math.PI * 2;
    const rad = 120 + rng() * 480;
    cloud.position.set(Math.cos(a) * rad, 82 + rng() * 58, Math.sin(a) * rad);
    cloud.userData.speed = 0.5 + rng() * 1.2;
    group.add(cloud);
  }
  return group;
}

function buildSky() {
  const geo = new THREE.SphereGeometry(1500, 40, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#2a6ea8') },
      mid: { value: new THREE.Color('#8fd0ef') },
      bottom: { value: new THREE.Color('#e9f6ff') },
    },
    vertexShader: /* glsl */`
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 top;
      uniform vec3 mid;
      uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bottom, pow(-h, 0.6));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/* ------------------------------------------------------------------ */
/*  Public factory                                                     */
/* ------------------------------------------------------------------ */

export function createWorld(scene) {
  scene.background = new THREE.Color('#8fd0ef');
  scene.fog = new THREE.Fog(0xa8dcf5, 160, 900);

  scene.add(buildSky());

  /* --- Lighting: key sun + cool rim + warm bounce + soft ambient --- */
  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x4a7a45, 0.75));

  const sun = new THREE.DirectionalLight(0xfff2cf, 2.0);
  sun.position.set(48, 70, 32);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  const s = 96;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x9fd8ff, 0.6);
  rim.position.set(-60, 34, -52);
  scene.add(rim);

  const bounce = new THREE.DirectionalLight(0xffe6b8, 0.28);
  bounce.position.set(10, -30, 20);
  scene.add(bounce);

  scene.add(new THREE.AmbientLight(0xffffff, 0.22));

  const rng = makeRng(1337);

  const island = buildIsland();
  scene.add(island);

  const ocean = buildOcean();
  scene.add(ocean.mesh);

  const reefs = buildReefs(rng);
  scene.add(reefs);
  scene.add(buildRocks(rng));
  /* Scenery the camera should see through when it blocks the player:
     trees and the taller ground cover, but not the low flowers. */
  const foliage = new THREE.Group();
  foliage.add(buildTrees(rng));
  foliage.add(buildGrass(rng));
  scene.add(foliage);
  scene.add(buildFlowers(rng));
  scene.add(buildBeachProps(rng));

  const shop = buildIslandShop();
  const shopGround = groundHeight(SHOP.x, SHOP.z);
  shop.position.set(SHOP.x, shopGround, SHOP.z);
  shop.rotation.y = SHOP.rotation;
  scene.add(shop);

  scene.add(buildPath());

  /* Beach loungers scattered along the sand. */
  const beachChairs = new THREE.Group();
  for (const c of BEACH_CHAIRS) beachChairs.add(buildBeachChair(c));
  scene.add(beachChairs);

  const pier = buildPier();
  scene.add(pier);

  /* Two speedboats moored on opposite sides of the pier. */
  const boats = [];
  for (const [bx, bz, ry] of [
    [41.0, 4.1, Math.PI / 2 - 0.1],
    [44.5, -4.1, Math.PI / 2 + 0.13],
  ]) {
    const b = buildSpeedboat();
    b.position.set(bx, SEA_LEVEL + BOAT_FLOAT, bz);
    b.rotation.y = ry;
    scene.add(b);
    boats.push(b);
  }
  const boat = boats[0];

  /* Lighthouse on the island's highest hill. buildLighthouse already
     places the group at the interior floor height, and it must not be
     rotated: the doorway is modelled facing +x so the collision helpers
     and the geometry agree. */
  const lighthouse = buildLighthouse();
  scene.add(lighthouse);

  /* The merchant trades from behind the shop counter, facing the street. */
  const merchant = buildMerchant();
  merchant.position.set(SHOP.x, shopGround + 0.56, SHOP.z + 1.3);
  merchant.rotation.y = 0;
  scene.add(merchant);

  const bubble = makeSpeechBubble();
  bubble.sprite.position.set(0, 4.75, 0);
  merchant.add(bubble.sprite);

  const BUBBLE_DUR = 5.5;
  let bubbleTimer = 0;

  const clouds = buildClouds(rng);
  scene.add(clouds);

  return {
    island,
    ocean: ocean.mesh,
    oceanUniforms: ocean.uniforms,
    sun,
    clouds,
    reefs,
    shop,
    pier,
    beachChairs,
    foliage,
    lighthouse,
    merchant,
    boat,
    boats,

    /** Pop a speech bubble above the merchant's head. */
    merchantSay(text, duration = BUBBLE_DUR) {
      bubble.setText(text);
      bubble.sprite.visible = true;
      bubble.sprite.material.opacity = 1;
      bubbleTimer = duration;
    },

    update(dt, elapsed, focus) {
      ocean.uniforms.uTime.value = elapsed;
      updateWind(elapsed);

      /* The merchant turns to face whoever is closest, so he never
         presents his back to a customer. */
      const npc = merchant.userData.npc;
      if (npc) {
        let targetYaw = 0;
        if (focus) {
          const dx = focus.x - merchant.position.x;
          const dz = focus.z - merchant.position.z;
          if (dx * dx + dz * dz < 18 * 18) {
            targetYaw = Math.atan2(dx, dz) - merchant.rotation.y;
          }
        }
        npc.rotation.y = lerpAngle(npc.rotation.y, targetYaw, 1 - Math.pow(0.02, dt));
      }

      for (const c of clouds.children) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 560) c.position.x = -560;
      }

      /* Ride the actual swell so the water never clips into the cockpit. */
      const e = 0.6;
      for (const b of boats) {
        const bx = b.position.x;
        const bz = b.position.z;
        b.position.y = SEA_LEVEL + BOAT_FLOAT + waveHeight(bx, bz, elapsed);

        const slopeX = (waveHeight(bx + e, bz, elapsed) - waveHeight(bx - e, bz, elapsed)) / (2 * e);
        const slopeZ = (waveHeight(bx, bz + e, elapsed) - waveHeight(bx, bz - e, elapsed)) / (2 * e);
        b.rotation.x = -slopeZ * 1.6;
        b.rotation.z = slopeX * 1.6;
      }

      if (bubbleTimer > 0) {
        bubbleTimer = Math.max(0, bubbleTimer - dt);
        const born = BUBBLE_DUR - bubbleTimer;
        const pop = Math.min(1, born * 6);
        const fade = Math.min(1, bubbleTimer * 1.8);
        const sp = bubble.sprite;
        sp.material.opacity = fade;
        const s = 0.86 + 0.14 * pop;
        sp.scale.set(4.6 * s, 2.3 * s, 1);
        sp.position.y = 4.75 + Math.sin(elapsed * 2.2) * 0.06;
        if (bubbleTimer <= 0) sp.visible = false;
      }
    },
  };
}
