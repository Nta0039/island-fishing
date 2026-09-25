'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e5,
});

const PORT = process.env.PORT || 3000;
/* Render sets RENDER_GIT_COMMIT on every deploy, so /health (and the boot
   log) can tell you exactly which build is live. */
const BUILD = (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'dev').slice(0, 10);
const MAX_PLAYERS = 10;
const ISLAND_RADIUS = 38;
const WALK_LIMIT = 56.0;

/* Pier corridor + observation platform — kept in sync with world.js */
const PIER = {
  startX: 28,
  endX: 58,
  halfZ: 1.7,
  platform: { x0: 50, x1: 58.5, halfZ: 5.0 },
};

const PALETTE = [
  '#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#cc5de8',
  '#ff922b', '#20c997', '#f06595', '#74c0fc', '#a9e34b',
];

/*
 * Loot table — 20 species.
 * Rarity distribution: Common 40% | Medium 30% | High 20% | Rare 10%
 * 8 common x 5 = 40 | 6 medium x 5 = 30 | 4 high x 5 = 20 | 2 rare x 5 = 10
 */
const FISH_TABLE = [
  /* ---- Common (40%) ---- */
  { id: 'anchovy',    name: 'Anchovy',            rarity: 'common', weight: 5, color: '#a8dadc', emoji: '🐟',
    desc: 'A tiny silver shoaler. Anchovies swarm in their thousands and feed almost everything bigger than themselves.' },
  { id: 'sardine',    name: 'Sardine',            rarity: 'common', weight: 5, color: '#bde0fe', emoji: '🐟',
    desc: 'A sleek, oily little fish that travels in vast glittering schools along the coast.' },
  { id: 'mackerel',   name: 'Mackerel',           rarity: 'common', weight: 5, color: '#90e0ef', emoji: '🐟',
    desc: 'A fast, striped hunter of open water. Mackerel flash silver whenever they turn.' },
  { id: 'herring',    name: 'Herring',            rarity: 'common', weight: 5, color: '#caf0f8', emoji: '🐟',
    desc: 'Silvery and slab-sided, herring gather in shoals so large they once fed whole islands.' },
  { id: 'sprat',      name: 'Sprat',              rarity: 'common', weight: 5, color: '#ade8f4', emoji: '🐟',
    desc: 'A small, speckled cousin of the herring, happiest in shallow coastal water.' },
  { id: 'smelt',      name: 'Smelt',              rarity: 'common', weight: 5, color: '#d0f4de', emoji: '🐟',
    desc: 'A slender, almost translucent fish that gives off a faint scent of cucumber.' },
  { id: 'perch',      name: 'Perch',              rarity: 'common', weight: 5, color: '#b7e4c7', emoji: '🐟',
    desc: 'A bold favourite banded in dark stripes, with fins of bright orange.' },
  { id: 'bleak',      name: 'Bleak',              rarity: 'common', weight: 5, color: '#e0fbfc', emoji: '🐟',
    desc: 'A restless little minnow that dimples the surface on still mornings.' },

  /* ---- Medium (30%) ---- */
  { id: 'seabass',    name: 'Sea Bass',           rarity: 'medium', weight: 5, color: '#48cae4', emoji: '🐠',
    desc: 'A powerful, broad-shouldered fish with heavy scales and a taste for rough surf.' },
  { id: 'snapper',    name: 'Red Snapper',        rarity: 'medium', weight: 5, color: '#ff8fab', emoji: '🐠',
    desc: 'A rosy reef dweller with a big eye, a bigger appetite, and a temper to match.' },
  { id: 'tuna',       name: 'Bluefin Tuna',       rarity: 'medium', weight: 5, color: '#0077b6', emoji: '🐠',
    desc: 'A torpedo of the deep ocean. Bluefin can cross entire seas without ever stopping.' },
  { id: 'trout',      name: 'Rainbow Trout',      rarity: 'medium', weight: 5, color: '#f4a261', emoji: '🐠',
    desc: 'Spangled with spots and split by a rose-coloured stripe that runs nose to tail.' },
  { id: 'mahimahi',   name: 'Mahi-Mahi',          rarity: 'medium', weight: 5, color: '#8ac926', emoji: '🐠',
    desc: 'The dolphin-fish: brilliant gold and green, and one of the fastest fish in the sea.' },
  { id: 'barracuda',  name: 'Barracuda',          rarity: 'medium', weight: 5, color: '#9d8189', emoji: '🐠',
    desc: 'A long, pike-toothed ambusher that hangs motionless, then strikes like lightning.' },

  /* ---- High (20%) ---- */
  { id: 'swordfish',  name: 'Swordfish',          rarity: 'high',   weight: 5, color: '#5e60ce', emoji: '🐡',
    desc: 'Its flattened bill is used to slash through shoals of smaller fish before feeding.' },
  { id: 'marlin',     name: 'Blue Marlin',        rarity: 'high',   weight: 5, color: '#4361ee', emoji: '🐡',
    desc: 'A heavyweight billfish famous for greyhounding and leaping clear of the surface.' },
  { id: 'sturgeon',   name: 'Sturgeon',           rarity: 'high',   weight: 5, color: '#6c757d', emoji: '🐡',
    desc: 'An armoured living fossil that wears bony scutes instead of ordinary scales.' },
  { id: 'anglerfish', name: 'Anglerfish',         rarity: 'high',   weight: 5, color: '#3a0ca3', emoji: '🐡',
    desc: 'A deep-water hunter that dangles a glowing lure right in front of its own jaws.' },

  /* ---- Rare (10%) ---- */
  { id: 'leviathan',  name: 'Golden Leviathan',   rarity: 'rare',   weight: 5, color: '#ffd60a', emoji: '🐉',
    desc: 'A golden sea-serpent of legend. Sailors who glimpse one rarely agree on what they saw.' },
  { id: 'crystalkoi', name: 'Crystal Koi',        rarity: 'rare',   weight: 5, color: '#7ef0ff', emoji: '🦈',
    desc: 'A rare, glass-scaled koi said to surface only in the clearest and calmest water.' },
];

/* Cumulative time the reeling indicator must stay inside the red zone. */
const RARITY_TIME = { common: 5, medium: 5, high: 10, rare: 15 };

/* Fishing timings. A bite gives you BITE_WINDOW seconds to start working
   the line before the fish slips off. */
const BITE_WINDOW = 5;

/* After a catch there is a STRUGGLE_CHANCE of a gull trying to steal it.
   Win by keeping the input going for STRUGGLE_NEED seconds inside
   STRUGGLE_WINDOW, otherwise the bird gets the fish. */
const STRUGGLE_CHANCE = 0.25;
const STRUGGLE_WINDOW = 6;
const STRUGGLE_NEED = 3.0;

/* A brand-new angler is guaranteed exactly one gull within this many catches. */
const BEGINNER_CATCHES = 3;

/* Coins earned per fish sold to the merchant. */
const RARITY_VALUE = { common: 6, medium: 15, high: 40, rare: 120 };

/*
 * Beach collectibles. These spawn on the sand, are picked up by walking
 * over them, and are sold to the merchant exactly like fish.
 */
const COLLECTIBLES = [
  { id: 'seashell', name: 'Sea Shell',      emoji: '🐚', rarity: 'common', value: 12, color: '#f7e3d0' },
  { id: 'starfish', name: 'Starfish',       emoji: '⭐', rarity: 'common', value: 18, color: '#ff8a5c' },
  { id: 'coconut',  name: 'Fallen Coconut', emoji: '🥥', rarity: 'common', value: 24, color: '#8a5a33' },
  { id: 'crab',     name: 'Beach Crab',     emoji: '🦀', rarity: 'medium', value: 34, color: '#e05a47' },
  { id: 'conch',    name: 'Conch Shell',    emoji: '🐚', rarity: 'high',   value: 60, color: '#ffd9b3' },
];

const COLLECTIBLE_WEIGHTS = { seashell: 26, starfish: 30, coconut: 14, crab: 22, conch: 10 };

const MAX_COLLECTIBLES = 12;
const COLLECTIBLE_RESPAWN_MS = 15000;
const COLLECT_RANGE = 2.8;

/* --------------------------- Merchant catalogue --------------------------- */

const RODS = [
  { id: 'rod_bamboo',  slot: 'rod', name: 'Bamboo Rod',   price: 0,   color: '#8a6a3a', desc: 'The classic starter rod.' },
  { id: 'rod_crimson', slot: 'rod', name: 'Crimson Rod',  price: 110, color: '#c0392b', desc: 'Bold red lacquer.' },
  { id: 'rod_azure',   slot: 'rod', name: 'Azure Rod',    price: 110, color: '#2b6fc0', desc: 'Ocean-blue finish.' },
  { id: 'rod_verdant', slot: 'rod', name: 'Verdant Rod',  price: 110, color: '#2e9e5b', desc: 'Living green wrap.' },
  { id: 'rod_violet',  slot: 'rod', name: 'Violet Rod',   price: 220, color: '#8e44ad', desc: 'Merchant favourite.' },
  { id: 'rod_gold',    slot: 'rod', name: 'Golden Rod',   price: 380, color: '#e8b923', desc: 'Polished to a shine.' },
  { id: 'rod_neon',    slot: 'rod', name: 'Neon Rod',     price: 650, color: '#39ff14', desc: 'Glows in the dark.', emissive: true },
  /* `bite` scales the wait before a fish bites: 0.7 means 30% faster than
     the starter rod. `style: 'carbon'` gives it its own 3D model. */
  { id: 'rod_carbon',  slot: 'rod', name: 'Carbon Fiber Rod', price: 1000, color: '#33383d', desc: 'Feather-light weave — fish bite 30% sooner.', style: 'carbon', bite: 0.7 },
];

const BOBBERS = [
  { id: 'bobber_classic', slot: 'bobber', name: 'Classic Bobber', price: 0,   color: '#ff3b3b', cap: '#ffffff', desc: 'Red and white.' },
  { id: 'bobber_lime',    slot: 'bobber', name: 'Lime Bobber',    price: 70,  color: '#3ddc84', cap: '#ffffff', desc: 'Easy to spot.' },
  { id: 'bobber_ocean',   slot: 'bobber', name: 'Ocean Bobber',   price: 70,  color: '#2b8fd8', cap: '#ffffff', desc: 'Blends with the sea.' },
  { id: 'bobber_violet',  slot: 'bobber', name: 'Violet Bobber',  price: 140, color: '#9b59b6', cap: '#ffe066', desc: 'Merchant favourite.' },
  { id: 'bobber_gold',    slot: 'bobber', name: 'Golden Bobber',  price: 300, color: '#ffd60a', cap: '#ffffff', desc: 'A tiny golden buoy.' },
  { id: 'bobber_prism',   slot: 'bobber', name: 'Prism Bobber',   price: 520, color: '#ff5ea8', cap: '#7ef0ff', desc: 'Cycles through colours.', rainbow: true },
];

const COSMETICS = [...RODS, ...BOBBERS];
const DEFAULT_OWNED = ['rod_bamboo', 'bobber_classic'];
const DEFAULT_EQUIPPED = { rod: 'rod_bamboo', bobber: 'bobber_classic' };

/* Every new angler starts with a purse, so the shop is usable immediately. */
const START_COINS = 500;

/* The cooler holds this many things in total — fish and beach finds together,
   counting each individual item rather than each distinct species. */
const INVENTORY_CAP = 50;

/** How many things the player is carrying, counting duplicates. */
function inventoryCount(p) {
  let total = 0;
  for (const n of Object.values(p.inventory || {})) total += Number(n) || 0;
  return total;
}

const players = new Map();

/* Live beach collectibles: id -> { id, type, x, z } */
const collectibles = new Map();
let collectibleSeq = 1;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => {
  res.json({ ok: true, players: players.size, max: MAX_PLAYERS, build: BUILD });
});

function rand(a, b) { return a + Math.random() * (b - a); }

function rollFish() {
  const total = FISH_TABLE.reduce((sum, f) => sum + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FISH_TABLE) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return FISH_TABLE[0];
}

const RARE_TIER = 'rare';
const BEGINNER_CASTS = 5;

/**
 * Beginner luck: a new angler is guaranteed a top-tier fish by their
 * fifth cast. Until they have landed one, the fifth attempt is forced to
 * the rarest tier; every other cast rolls the normal table.
 */
function rollFishFor(p) {
  const casts = p.casts || 0;
  const hasRare = (p.rareCatches || 0) > 0;
  if (!hasRare && casts >= BEGINNER_CASTS - 1) {
    const rares = FISH_TABLE.filter((f) => f.rarity === RARE_TIER);
    if (rares.length) return rares[Math.floor(Math.random() * rares.length)];
  }
  return rollFish();
}

/**
 * Whether a gull should dive on the catch the player is reeling in.
 *
 * A brand-new angler is guaranteed exactly one tug-of-war inside their first
 * few catches: random gulls are suppressed until the reel that would land
 * their third fish, where one is forced. Once it has happened (win or lose)
 * the flag sticks, so it never repeats — and everyone past that point, and
 * anyone who has already met the gull, just gets the usual random chance.
 */
function wantsStruggle(p) {
  const catches = p.casts || 0;
  if (!p.gullSeen && catches < BEGINNER_CATCHES) {
    return catches === BEGINNER_CATCHES - 1;
  }
  return Math.random() < STRUGGLE_CHANCE;
}

function safeName(n) {
  const cleaned = String(n || '')
    .replace(/[^\w \-]/g, '')
    .trim()
    .slice(0, 14);
  return cleaned || 'Angler';
}

/* The outfit colour the player picked, or a palette colour by turn. */
function pickColor(c, index) {
  if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  return PALETTE[index % PALETTE.length];
}

/*
 * Everyone starts on the wooden pier, island-side of the sunshade canopy
 * over the observation platform, with their back to it and their face
 * towards the middle of the island. The avatar's yaw is atan2(x, z), so
 * -PI/2 looks down -x, straight at the island centre. x is kept well
 * short of the canopy's near edge (~48.6) so the follow camera, which
 * sits about 9.5u behind the character, also clears the roof.
 */
const SPAWN = { x: 37.5, z: 0, rotation: -Math.PI / 2 };

function spawnPoint() {
  return { ...SPAWN };
}

/*
 * Terrain model mirrored from public/js/world.js. Keep these in sync.
 * The island is deliberately irregular, so walkability is derived from
 * the height field rather than a fixed radius.
 */
const SEA_LEVEL = -1.0;

const LIGHTHOUSE = { x: -22, z: 1 };

function islandShape(angle) {
  /* Rounded, roughly circular outline — mirrors public/js/world.js. */
  return (
    1 +
    0.052 * Math.sin(angle * 2 + 0.7) +
    0.035 * Math.sin(angle * 3 - 1.2) +
    0.022 * Math.sin(angle * 5 + 2.1) +
    0.013 * Math.sin(angle * 7 - 0.4) +
    0.008 * Math.sin(angle * 11 + 1.6) +
    0.005 * Math.sin(angle * 13 - 2.3)
  );
}

function rawGround(x, z) {
  const d = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const R = ISLAND_RADIUS * islandShape(a);
  const t = Math.max(0, 1 - d / R);

  const prof = t * t * (3 - 2 * t);
  let h = prof * 4.4;

  const ramp = Math.min(1, Math.max(0, (PIER.startX - x) / (PIER.startX - LIGHTHOUSE.x)));
  h += Math.pow(ramp, 1.5) * 6.0 * t;

  const hillD = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
  const hill = Math.max(0, 1 - hillD / 26);
  const coastal = t;
  h += Math.pow(hill, 1.3) * 7.2 * coastal;

  h += Math.sin(x * 0.16) * Math.cos(z * 0.14) * 0.30 * t;
  const spine = 0.25 + 0.75 * Math.min(1, Math.abs(z) / 14);
  h += Math.sin(x * 0.32) * Math.cos(z * 0.27) * 0.22 * spine * t;
  h += Math.sin(x * 0.95 + z * 0.6) * 0.075 * spine * t;
  h += Math.sin(x * 2.3 - z * 1.7) * 0.022 * spine * t;

  h -= 1.5;

  /* Broad flat sandy shelf — mirrors public/js/world.js. */
  const above = h - SEA_LEVEL;
  if (above > 0) {
    const SHELF_W = 6.0;
    const SHELF_K = 0.26;
    const s = above / (above + SHELF_W);
    h = SEA_LEVEL + above * (SHELF_K + (1 - SHELF_K) * s);
  }

  if (d > R) h -= (d - R) * 0.35;
  return h;
}

/* Levelled building plot — mirrors SHOP_PAD in public/js/world.js. */
const SHOP_PAD = { x: 1.5, z: -1.0, halfW: 5.5, halfD: 4.5, blend: 6.5, y: 0 };
/* Footprint of the shop building itself — mirrors SHOP in world.js. */
const SHOP = { x: 1.5, z: -2.0 };
SHOP_PAD.y = rawGround(1.5, -2.0) - 0.35;
/* Dead-level plaza — mirrors public/js/world.js. */
function shopPadTarget() {
  return SHOP_PAD.y;
}

function shopPadWeight(x, z) {
  const dx = Math.abs(x - SHOP_PAD.x) - SHOP_PAD.halfW;
  const dz = Math.abs(z - SHOP_PAD.z) - SHOP_PAD.halfD;
  const d = Math.max(dx, dz);
  if (d <= 0) return 1;
  if (d >= SHOP_PAD.blend) return 0;
  const t = 1 - d / SHOP_PAD.blend;
  return t * t * (3 - 2 * t);
}

function groundHeight(x, z) {
  const h = rawGround(x, z);
  const pad = shopPadWeight(x, z);
  return pad > 0 ? h + (shopPadTarget(x, z) - h) * pad : h;
}

function onPier(x, z) {
  if (x >= PIER.startX && x <= PIER.endX && Math.abs(z) <= PIER.halfZ) return true;
  const p = PIER.platform;
  return x >= p.x0 && x <= p.x1 && Math.abs(z) <= p.halfZ;
}

/* Lighthouse interior — mirrors LIGHT and its helpers in
   public/js/world.js. The tower is solid except for the doorway, the
   internal ramp and the gallery, so the server rejects the same cells
   the client refuses to walk into. */
const LIGHT = {
  rCore: 1.6,
  rIn: 5.0,
  rWall: 5.5,
  rDeck: 6.3,
  rBase: 6.8,
  doorHalf: 0.18,
  topStart: 4.0,
  topEnd: 5.82,
  towerH: 14.0,
};
/* Angular gap left in the gallery either side of the doorway. */
const GALLERY_GAP = 0.30;
/* Open ground every tree keeps around the tower — mirrors world.js. */
const LIGHT_CLEARANCE = 4.0;

function lighthouseZone(x, z) {
  const dx = x - LIGHTHOUSE.x;
  const dz = z - LIGHTHOUSE.z;
  const d = Math.hypot(dx, dz);
  if (d > LIGHT.rBase) return null;
  let rel = Math.atan2(dz, dx);
  if (rel < 0) rel += Math.PI * 2;
  return { d, rel };
}

function lighthouseWalkable(L) {
  const { d, rel } = L;
  if (d < LIGHT.rCore) return false;
  if (rel <= LIGHT.doorHalf || rel >= Math.PI * 2 - LIGHT.doorHalf) return true;
  if (rel >= LIGHT.topStart && rel <= LIGHT.topEnd) return d <= LIGHT.rDeck;
  /* The gallery runs all the way round, bar a panel either side of the door. */
  if (rel >= LIGHT.doorHalf + GALLERY_GAP && rel <= Math.PI * 2 - LIGHT.doorHalf - GALLERY_GAP) {
    return d > LIGHT.rWall && d <= LIGHT.rDeck;
  }
  return d <= LIGHT.rIn && rel > LIGHT.doorHalf && rel < LIGHT.topStart;
}

/* The shop building is solid — mirrors insideShop() in world.js. */
function insideShop(x, z) {
  return Math.abs(x - SHOP.x) < SHOP.halfW + 0.32
    && Math.abs(z - SHOP.z) < SHOP.halfD + 0.32;
}

function isWalkable(x, z) {
  if (onPier(x, z)) return true;
  if (insideShop(x, z)) return false;
  const L = lighthouseZone(x, z);
  if (L) return lighthouseWalkable(L);
  if (Math.hypot(x, z) > WALK_LIMIT) return false;
  return groundHeight(x, z) > SEA_LEVEL - 1.45;
}

/* Deterministic palm layout — mirrors palmSpots() in public/js/world.js.
   Same seed, same RNG order, same height field, so the two agree. */
function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function palmSpots() {
  const rng = makeRng(90210);
  const out = [];
  const target = SEA_LEVEL + 0.6;

  /* Radius of the looping trail — mirrors loopPathRadius() in world.js. */
  const loopPathRadius = (a) => 17.4
    + Math.sin(a * 3 + 0.6) * 1.5
    + Math.cos(a * 2 - 1.1) * 1.2
    + Math.sin(a * 5 + 2.4) * 0.6;

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

  /* Same grove-and-loner scatter as world.js, RNG consumed in the same
     order, so the two layouts stay identical. */
  const plant = (a) => {
    const r = beachAt(a) + (rng() - 0.5) * 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = groundHeight(x, z);

    if (y < SEA_LEVEL + 0.35 || y > SEA_LEVEL + 1.8) return false;
    if (x > PIER.startX - 3 && Math.abs(z - PIER.z) < PIER.halfZ + 2.6) return false;
    if (Math.hypot(x - SHOP.x, z - SHOP.z) < 7.5) return false;
    if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < LIGHT.rBase + LIGHT_CLEARANCE) return false;
    if (Math.abs(Math.hypot(x, z) - loopPathRadius(Math.atan2(z, x))) < 2.0) return false;

    for (const p of out) {
      if (Math.hypot(p.x - x, p.z - z) < 1.7) return false;
    }

    out.push({ x, y, z, a: rng() * Math.PI * 2, s: 0.7 + rng() * 0.7 });
    return true;
  };

  /* Dense stand crowding the pier approach — mirrors world.js. */
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = side * (0.155 + i * 0.052 + rng() * 0.035);
      plant(a);
      plant(a + side * 0.016);
    }
  }

  const groves = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < groves; i++) {
    const centre = rng() * Math.PI * 2;
    const count = 2 + Math.floor(rng() * 4);
    const spread = 0.09 + rng() * 0.26;
    for (let k = 0; k < count; k++) {
      plant(centre + (rng() - 0.5) * spread * 2);
    }
  }

  const loners = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < loners; i++) plant(rng() * Math.PI * 2);

  return out;
}

const PALMS = palmSpots();

/** A spot on the sand directly beneath a coconut palm, kept dry. */
/**
 * A spot on the open sand beside a palm, clear of every trunk and root
 * flare so the nut never clips a tree. Rings outward from 1.6u (past the
 * roots) and only ever lands on dry, walkable sand.
 */
function coconutPoint() {
  const p = PALMS[Math.floor(Math.random() * PALMS.length)];
  const clear = (x, z) => !PALMS.some((q) => Math.hypot(q.x - x, q.z - z) < 1.5);
  for (let ring = 0; ring < 5; ring++) {
    const r = 1.6 + ring * 0.55;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (groundHeight(x, z) <= SEA_LEVEL + 0.25) continue;
      if (!isWalkable(x, z)) continue;
      if (!clear(x, z)) continue;
      return { x, z };
    }
  }
  /* Nothing clean near this palm — take the first clear sand anywhere. */
  for (const q of PALMS) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = q.x + Math.cos(a) * 2.4;
      const z = q.z + Math.sin(a) * 2.4;
      if (groundHeight(x, z) > SEA_LEVEL + 0.25 && isWalkable(x, z) && clear(x, z)) return { x, z };
    }
  }
  return { x: p.x + 2.4, z: p.z };
}

function publicPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    x: p.x,
    z: p.z,
    rotation: p.rotation,
    moving: p.moving,
    fishing: p.fishing,
    equipped: p.equipped,
  };
}

  function privatePlayer(p) {
    return {
      inventory: p.inventory,
      coins: p.coins,
      owned: p.owned,
      equipped: p.equipped,
      /* Species the player has ever landed — drives the encyclopedia. */
      discovered: p.discovered,
      /* How full the cooler is, so the HUD can show "12 / 50" without
         hard-coding the limit on the client. */
      carrying: inventoryCount(p),
      capacity: INVENTORY_CAP,
    };
  }

function findCosmetic(id) {
  return COSMETICS.find((c) => c.id === id) || null;
}

/**
 * Milliseconds until the next bite. The base wait is 5–10s; a rod whose
 * `bite` factor is below 1 shortens it (the carbon rod is 0.7, so fish
 * bite 30% sooner than with the starter rod).
 */
function biteDelay(p) {
  const rod = findCosmetic(p && p.equipped && p.equipped.rod);
  const mod = rod && Number(rod.bite) > 0 ? Number(rod.bite) : 1;
  return rand(5000, 10000) * mod;
}

/* A "catch" is either a fish or a beach collectible. */
function findCatch(id) {
  return (
    FISH_TABLE.find((f) => f.id === id) ||
    COLLECTIBLES.find((c) => c.id === id) ||
    null
  );
}

function catchValue(item) {
  return item.value !== undefined ? item.value : RARITY_VALUE[item.rarity];
}

function rollCollectibleType() {
  const total = Object.values(COLLECTIBLE_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [type, w] of Object.entries(COLLECTIBLE_WEIGHTS)) {
    r -= w;
    if (r <= 0) return type;
  }
  return 'starfish';
}

/**
 * Find a point on the dry beach for a given bearing by bisecting the
 * height field. Works for any coastline shape, unlike a fixed radius.
 */
function beachPoint(angle) {
  const target = SEA_LEVEL + 0.6;
  let lo = 0;
  let hi = 45;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (groundHeight(Math.cos(angle) * mid, Math.sin(angle) * mid) > target) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2 + (Math.random() - 0.5) * 1.2;
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function spawnCollectible() {
  const type = rollCollectibleType();

  /* Coconuts land right under a trunk; everything else on the sand. */
  const p = type === 'coconut' ? coconutPoint() : beachPoint(Math.random() * Math.PI * 2);

  const item = {
    id: `c${collectibleSeq++}`,
    type,
    x: p.x,
    z: p.z,
  };
  collectibles.set(item.id, item);
  io.emit('collectibleAdded', item);
  return item;
}

function removeCollectible(id) {
  if (!collectibles.has(id)) return;
  collectibles.delete(id);
  io.emit('collectibleRemoved', { id });
  setTimeout(() => spawnCollectible(), COLLECTIBLE_RESPAWN_MS);
}

function clearTimer(p) {
  if (p.timer) {
    clearTimeout(p.timer);
    p.timer = null;
  }
}

function resetFishing(p, broadcast) {
  clearTimer(p);
  p.fishing = 'idle';
  p.fish = null;
  p.struggle = null;
  if (broadcast) io.emit('fishingState', { id: p.id, state: 'idle' });
}

/* ------------------------------------------------------------------ */
/*  Sessions                                                           */
/* ------------------------------------------------------------------ */

/**
 * A dropped socket used to mean starting over at the spawn point, which
 * looked to the player like being randomly teleported home. We now keep
 * the last known state against a client-generated session id, so a
 * reconnect resumes exactly where the player was standing — position,
 * heading, catch, coins and encyclopedia included.
 */
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function saveSession(id, p) {
  if (!id) return;
  sessions.set(id, {
    at: Date.now(),
    x: p.x,
    z: p.z,
    rotation: p.rotation,
    inventory: { ...p.inventory },
    coins: p.coins,
    owned: [...p.owned],
    equipped: { ...p.equipped },
    discovered: { ...p.discovered },
    casts: p.casts || 0,
    rareCatches: p.rareCatches || 0,
    gullSeen: !!p.gullSeen,
  });
  for (const [key, s] of sessions) {
    if (Date.now() - s.at > SESSION_TTL_MS) sessions.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/*  Persistent progress                                                */
/* ------------------------------------------------------------------ */

/**
 * Writes are batched: a player's progress is pushed to Supabase at most
 * once every SAVE_DEBOUNCE_MS while they play, and once more the moment
 * they leave. That keeps a busy island from hammering the API.
 */
const SAVE_DEBOUNCE_MS = 2500;

function queueSave(p) {
  /* persistBlocked means the login lookup failed, so we never learned what is
     already stored. Writing now could replace a real history with a blank one. */
  if (!db.enabled || !p || p.persistBlocked) return;
  p.saveDirty = true;
  if (p.saveTimer) return;
  p.saveTimer = setTimeout(() => {
    p.saveTimer = null;
    if (!p.saveDirty) return;
    p.saveDirty = false;
    db.savePlayer(p).catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

/** Flushes immediately, for when the player is about to disappear. */
function saveNow(p) {
  if (!db.enabled || !p || p.persistBlocked) return;
  if (p.saveTimer) { clearTimeout(p.saveTimer); p.saveTimer = null; }
  /* Nothing has changed since the last successful write — a disconnect on its
     own is not a reason to hit the API, and writing anyway would let a player
     who merely logged in restamp the row's display name. */
  if (!p.saveDirty) return;
  p.saveDirty = false;
  db.savePlayer(p).catch(() => {});
}

io.on('connection', (socket) => {
  if (players.size >= MAX_PLAYERS) {
    socket.emit('serverFull', { max: MAX_PLAYERS });
    setTimeout(() => socket.disconnect(true), 250);
    return;
  }

  let joined = false;

  socket.on('join', async (data) => {
    if (joined) return;

    /* Active-username lock: two players cannot share a name at the same time.
       Matched case- and space-insensitively, exactly like the database does,
       so "Big Mike" and "big mike" are the same angler. */
    const name = safeName(data && data.name);
    const nameTaken = [...players.values()].some(
      (q) => db.nameKey(q.name) === db.nameKey(name),
    );
    if (nameTaken) {
      socket.emit('nameTaken', { name });
      return;
    }

    joined = true;

    const sessionId = typeof (data && data.session) === 'string'
      ? data.session.slice(0, 48)
      : null;
    const saved = sessionId ? sessions.get(sessionId) : null;
    /* Only trust a saved spot that is still somewhere a player can stand. */
    const resume = !!(saved && isWalkable(saved.x, saved.z));

    const sp = spawnPoint();
    const p = {
      id: socket.id,
      session: sessionId,
      name,
      color: pickColor(data && data.color, players.size),
      x: resume ? saved.x : sp.x,
      z: resume ? saved.z : sp.z,
      rotation: resume ? saved.rotation : sp.rotation,
      moving: false,
      fishing: 'idle',
      fish: null,
      struggle: null,
      timer: null,
      inventory: resume ? { ...saved.inventory } : {},
      coins: resume ? saved.coins : START_COINS,
      owned: resume ? [...saved.owned] : [...DEFAULT_OWNED],
      equipped: resume ? { ...saved.equipped } : { ...DEFAULT_EQUIPPED },
      discovered: resume ? { ...saved.discovered } : {},
      casts: resume ? (saved.casts || 0) : 0,
      rareCatches: resume ? (saved.rareCatches || 0) : 0,
      gullSeen: resume ? !!saved.gullSeen : false,
      saveTimer: null,
      saveDirty: false,
    };

    /* A live session is fresher than the database, so it wins. Otherwise
       pull this name's stored progress in before the player spawns. */
    let restored = false;
    let loadFailed = false;
    if (!resume && db.enabled) {
      const res = await db.loadPlayer(p.name);
      /* That lookup is a network round-trip, so the tab may have been closed
         while it was in flight. Bailing here keeps an already-departed player
         out of the roster — otherwise they linger as a ghost whose socket
         never fires 'disconnect' again, quietly eating the player cap. */
      if (!socket.connected) return;
      if (res.ok) {
        if (res.row && db.applyRow(p, res.row)) restored = true;
      } else {
        /* We could not tell a brand new name from an existing one, so this
           session must never write: saving the fresh-start state would wipe
           whatever is really stored under this name. */
        loadFailed = true;
        console.warn(`[db] ${p.name}: lookup failed (${res.error}) — this session will not be saved`);
      }
    }
    p.restored = restored;          // progress came back from the database
    p.resumed = resume;             // progress came back from this page's session
    p.persistBlocked = loadFailed;  // never write over a history we could not read

    players.set(socket.id, p);
    if (sessionId) sessions.delete(sessionId);

    socket.emit('init', {
      id: socket.id,
      you: { ...publicPlayer(p), ...privatePlayer(p) },
      players: [...players.values()].map(publicPlayer),
      fishTable: FISH_TABLE,
      collectibleTable: COLLECTIBLES,
      collectibles: [...collectibles.values()],
      rarityTime: RARITY_TIME,
      rarityValue: RARITY_VALUE,
      shop: { rods: RODS, bobbers: BOBBERS },
      maxPlayers: MAX_PLAYERS,
      islandRadius: ISLAND_RADIUS,
      walkLimit: WALK_LIMIT,
      /* Cooler size, so the HUD never has to hard-code it. */
      inventoryCap: INVENTORY_CAP,
      /* True when we pulled this name's history back out of the database. */
      restored: !!p.restored,
      /* True when this page's own reconnect resumed an earlier session. */
      resumed: !!p.resumed,
      persistence: db.enabled,
      /* Persistence is on, but the login lookup failed, so this session is
         deliberately not being written — the client should say so. */
      persistBlocked: !!p.persistBlocked,
    });

    socket.broadcast.emit('playerJoined', publicPlayer(p));
    io.emit('online', { count: players.size, max: MAX_PLAYERS });
    console.log(`+ ${p.name} joined (${socket.id}) — ${players.size}/${MAX_PLAYERS}`);
  });

  socket.on('move', (d) => {
    const p = players.get(socket.id);
    if (!p || !d) return;
    const x = Number(d.x);
    const z = Number(d.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (!isWalkable(x, z)) return;

    p.x = x;
    p.z = z;
    p.rotation = Number.isFinite(d.rotation) ? d.rotation : p.rotation;
    p.moving = !!d.moving;

    socket.broadcast.emit('playerMoved', {
      id: p.id,
      x: p.x,
      z: p.z,
      rotation: p.rotation,
      moving: p.moving,
    });
  });

  /* ---------------------------- Fishing ---------------------------- */

  socket.on('castLine', () => {
    const p = players.get(socket.id);
    if (!p || p.fishing !== 'idle') return;

    p.fishing = 'waiting';
    io.emit('fishingState', { id: p.id, state: 'waiting' });

    clearTimer(p);
    p.timer = setTimeout(() => {
      const pl = players.get(socket.id);
      if (!pl || pl.fishing !== 'waiting') return;

      pl.fishing = 'hooked';
      pl.fish = rollFishFor(pl);
      io.emit('fishingState', {
        id: pl.id,
        state: 'hooked',
        name: pl.name,
        fish: pl.fish,
      });

      /* Nothing happens for five seconds and the fish is off the hook. */
      clearTimer(pl);
      pl.timer = setTimeout(() => {
        const q = players.get(socket.id);
        if (!q || q.fishing !== 'hooked') return;
        io.emit('fishEscaped', { id: q.id, name: q.name, fish: q.fish, reason: 'timeout' });
        resetFishing(q, true);
      }, BITE_WINDOW * 1000);
    }, biteDelay(p));
  });

  socket.on('startMinigame', () => {
    const p = players.get(socket.id);
    if (!p || p.fishing !== 'hooked') return;
    clearTimer(p);
    p.fishing = 'minigame';
    io.emit('fishingState', { id: p.id, state: 'minigame' });
  });

  /** Puts a landed fish in the player's cooler and tells everyone. */
  function awardCatch(sock, p, fish) {
    /* A full cooler turns the catch away rather than quietly overfilling. */
    if (inventoryCount(p) >= INVENTORY_CAP) {
      if (sock) sock.emit('inventoryFull', { cap: INVENTORY_CAP });
      io.emit('fishEscaped', { id: p.id, name: p.name, fish, reason: 'full' });
      resetFishing(p, true);
      return;
    }

    p.inventory[fish.id] = (p.inventory[fish.id] || 0) + 1;
    /* First time this species is landed it unlocks its encyclopedia entry. */
    const isNew = !p.discovered[fish.id];
    p.discovered[fish.id] = true;
    p.casts = (p.casts || 0) + 1;
    if (fish.rarity === RARE_TIER) p.rareCatches = (p.rareCatches || 0) + 1;

    io.emit('fishCaught', { id: p.id, name: p.name, fish, time: Date.now(), isNew });
    if (sock) sock.emit('playerData', privatePlayer(p));
    /* A landed fish changes the cooler, the encyclopedia, the cast count and
       possibly the rare tally — all four are progression, so it is written
       back the same way a trade is. */
    queueSave(p);
    resetFishing(p, true);
  }

  /** Ends a gull struggle, handing over or losing the fish. */
  function resolveStruggle(id, won) {
    const p = players.get(id);
    if (!p || p.fishing !== 'struggle' || !p.struggle) return;
    const fish = p.struggle.fish;
    p.struggle = null;
    clearTimer(p);

    if (won) {
      const sock = io.sockets.sockets.get(id);
      awardCatch(sock, p, fish);
    } else {
      io.emit('fishEscaped', { id: p.id, name: p.name, fish, reason: 'seagull' });
      resetFishing(p, true);
    }
  }

  socket.on('catchSuccess', () => {
    const p = players.get(socket.id);
    if (!p || !p.fish) return;
    const fish = p.fish;

    /* Every so often a gull dives in and tries to make off with it — and a
       new angler is guaranteed one within their first few catches. */
    if (wantsStruggle(p)) {
      /* Mark the beginner encounter as spent so it cannot repeat, even if
         the gull wins this time. */
      if (!p.gullSeen) {
        p.gullSeen = true;
        queueSave(p);
      }
      p.fishing = 'struggle';
      p.struggle = { fish, got: 0 };
      io.emit('fishingState', {
        id: p.id,
        state: 'struggle',
        name: p.name,
        fish,
      });
      socket.emit('struggleStart', { fish, need: STRUGGLE_NEED, window: STRUGGLE_WINDOW });

      clearTimer(p);
      p.timer = setTimeout(() => resolveStruggle(socket.id, false), STRUGGLE_WINDOW * 1000);
      return;
    }

    awardCatch(socket, p, fish);
  });

  /* The client reports how long the input has been held; the server adds
     it up so a slow connection cannot lose the struggle. */
  socket.on('struggleInput', (d) => {
    const p = players.get(socket.id);
    if (!p || p.fishing !== 'struggle' || !p.struggle) return;
    const dt = Math.min(0.3, Math.max(0, Number(d && d.dt) || 0));
    p.struggle.got += dt;
    if (p.struggle.got >= STRUGGLE_NEED) resolveStruggle(socket.id, true);
  });

  socket.on('cancelFishing', () => {
    const p = players.get(socket.id);
    if (p) resetFishing(p, true);
  });

  /* ------------------------ Beach collectibles ------------------------ */

  socket.on('collect', (d) => {
    const p = players.get(socket.id);
    if (!p || !d || p.fishing !== 'idle') return;

    const item = collectibles.get(d.id);
    if (!item) return;

    /* Must actually be standing next to it. */
    if (Math.hypot(p.x - item.x, p.z - item.z) > COLLECT_RANGE) return;

    const def = COLLECTIBLES.find((c) => c.id === item.type);
    if (!def) return;

    /* The cooler is shared with fish, so a full one blocks beach finds too. */
    if (inventoryCount(p) >= INVENTORY_CAP) {
      socket.emit('inventoryFull', { cap: INVENTORY_CAP });
      return;
    }

    p.inventory[def.id] = (p.inventory[def.id] || 0) + 1;
    removeCollectible(item.id);

    queueSave(p);
    socket.emit('playerData', privatePlayer(p));
    io.emit('collected', { id: p.id, name: p.name, item: def });
  });

  /* ---------------------------- Merchant ---------------------------- */

  socket.on('sellFish', (d) => {
    const p = players.get(socket.id);
    if (!p || !d) return;
    const fish = findCatch(d.fishId);
    if (!fish) return;

    const have = p.inventory[fish.id] || 0;
    if (have <= 0) return;

    let qty = Math.floor(Number(d.qty) || 0);
    if (!Number.isFinite(qty) || qty <= 0) qty = have;
    qty = Math.min(qty, have);

    const unit = catchValue(fish);
    const gain = unit * qty;

    p.inventory[fish.id] = have - qty;
    if (p.inventory[fish.id] <= 0) delete p.inventory[fish.id];
    p.coins += gain;

    queueSave(p);
    socket.emit('playerData', privatePlayer(p));
    socket.emit('tradeResult', { ok: true, kind: 'sell', fish: fish.name, qty, gain });
  });

  socket.on('sellAll', () => {
    const p = players.get(socket.id);
    if (!p) return;

    let gain = 0;
    let qty = 0;
    for (const [fishId, count] of Object.entries(p.inventory)) {
      const fish = findCatch(fishId);
      if (!fish) continue;
      gain += catchValue(fish) * count;
      qty += count;
    }
    if (qty <= 0) return;

    p.inventory = {};
    p.coins += gain;

    queueSave(p);
    socket.emit('playerData', privatePlayer(p));
    socket.emit('tradeResult', { ok: true, kind: 'sellAll', qty, gain });
  });

  socket.on('buyItem', (d) => {
    const p = players.get(socket.id);
    if (!p || !d) return;
    const item = findCosmetic(d.itemId);
    if (!item) return;
    if (p.owned.includes(item.id)) {
      socket.emit('tradeResult', { ok: false, message: 'Already owned.' });
      return;
    }
    if (p.coins < item.price) {
      socket.emit('tradeResult', { ok: false, message: `Need ${item.price - p.coins} more coins.` });
      return;
    }

    p.coins -= item.price;
    p.owned.push(item.id);
    p.equipped[item.slot] = item.id;

    queueSave(p);
    socket.emit('playerData', privatePlayer(p));
    socket.emit('tradeResult', { ok: true, kind: 'buy', item: item.name });
    io.emit('playerCosmetics', { id: p.id, equipped: p.equipped });
  });

  socket.on('equipItem', (d) => {
    const p = players.get(socket.id);
    if (!p || !d) return;
    const item = findCosmetic(d.itemId);
    if (!item) return;
    if (!p.owned.includes(item.id)) return;

    p.equipped[item.slot] = item.id;

    queueSave(p);
    socket.emit('playerData', privatePlayer(p));
    socket.emit('tradeResult', { ok: true, kind: 'equip', item: item.name });
    io.emit('playerCosmetics', { id: p.id, equipped: p.equipped });
  });

  /* ---------------------------- Manual save ---------------------------- */

  /**
   * The pause menu's save buttons. Unlike the debounced writes, this is an
   * explicit and immediate push of everything the player owns — cooler,
   * encyclopedia, purse, shop purchases and lifetime tallies — and it answers
   * with a result so the UI can say whether it genuinely landed.
   */
  socket.on('saveNow', (ack) => {
    const p = players.get(socket.id);
    const reply = (payload) => { if (typeof ack === 'function') ack(payload); };
    if (!p) return reply({ ok: false, reason: 'not-playing' });

    /* Keep the in-page session in step too, so a reconnect resumes cleanly. */
    saveSession(p.session, p);

    if (!db.enabled) return reply({ ok: false, reason: 'disabled' });
    if (p.persistBlocked) return reply({ ok: false, reason: 'blocked' });

    /* This write supersedes any pending debounced one. */
    if (p.saveTimer) { clearTimeout(p.saveTimer); p.saveTimer = null; }

    db.savePlayer(p)
      .then((ok) => {
        /* Only clear the dirty flag on success, so a failed save is still
           picked up by the autosave sweep. */
        if (ok) p.saveDirty = false;
        reply(ok
          ? { ok: true, coins: p.coins, items: inventoryCount(p), at: Date.now() }
          : { ok: false, reason: 'error' });
      })
      .catch(() => reply({ ok: false, reason: 'error' }));
  });

  /* ---------------------------- Disconnect ---------------------------- */

  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p) {
      clearTimer(p);
      saveSession(p.session, p);
      saveNow(p);
      players.delete(socket.id);
    }
    io.emit('playerLeft', { id: socket.id });
    io.emit('online', { count: players.size, max: MAX_PLAYERS });
    console.log(`- ${socket.id} left — ${players.size}/${MAX_PLAYERS}`);
  });
});

/* Seed the beach with collectibles before anyone connects. */
for (let i = 0; i < MAX_COLLECTIBLES; i++) spawnCollectible();

/* ------------------------------------------------------------------ */
/*  Durability safety net                                              */
/* ------------------------------------------------------------------ */

/**
 * The debounced writes above only fire while the process is alive to run the
 * timer. Two things can still swallow progress: a host that suspends or kills
 * the process without a clean disconnect (Render does this on every deploy and
 * whenever a free instance idles out), and a crash. So anything still dirty is
 * swept up on a timer, and one last time on a shutdown signal.
 */
const AUTOSAVE_MS = 20000;

const autosave = setInterval(() => {
  if (!db.enabled) return;
  for (const p of players.values()) {
    if (p.saveDirty) saveNow(p);
  }
}, AUTOSAVE_MS);
/* Never let the timer by itself keep the process awake. */
if (autosave.unref) autosave.unref();

let shuttingDown = false;

function flushAll(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!db.enabled) return;
  const dirty = [...players.values()].filter((p) => p.saveDirty);
  if (!dirty.length) return;
  console.log(`[db] flushing ${dirty.length} unsaved player(s) on ${reason}`);
  /* Best effort: the process may be gone before these settle. */
  Promise.all(dirty.map((p) => db.savePlayer(p))).catch(() => {});
}

process.on('SIGTERM', () => flushAll('SIGTERM'));
process.on('SIGINT', () => flushAll('SIGINT'));

server.listen(PORT, () => {
  console.log(`\n  🏝️  Island Fishing server running`);
  console.log(`  → Local:   http://localhost:${PORT}`);
  console.log(`  → Build:   ${BUILD}`);
  console.log(`  → Max concurrent players: ${MAX_PLAYERS}`);
  console.log(`  → ${FISH_TABLE.length} fish species | ${COLLECTIBLES.length} collectibles`);
  console.log(`  → ${RODS.length} rods | ${BOBBERS.length} bobbers\n`);
});
