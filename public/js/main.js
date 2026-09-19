import * as THREE from 'three';
import {
  createWorld,
  surfaceHeight,
  isSand,
  isWalkable,
  onPier,
  insideLighthouse,
  canCast,
  seatSlots,
  BEACH_CHAIRS,
  PLAYER_COLORS,
  SPAWN_POINT,
  PIER,
  SEA_LEVEL,
  MERCHANT,
  LIGHTHOUSE,
} from './world.js';
import { createAvatar, updateAvatar, applyRod } from './avatar.js';
import { Input } from './input.js';
import { Fishing } from './fishing.js';
import { createRareVfx } from './vfx.js';
import { createFootprints } from './footprints.js';
import { createCollectibles } from './collectibles.js';
import { createPostFX } from './postfx.js';
import { createSeagulls } from './seagulls.js';
import { createShips } from './ships.js';
import { createAircraft } from './aircraft.js';
import { createMarineLife } from './marinelife.js';
import { createReef } from './reef.js';
import * as Music from './music.js';
import * as Qr from './qr.js';
import * as UI from './ui.js';

/* ------------------------------------------------------------------ */
/*  Renderer / scene                                                   */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 3000);

const world = createWorld(scene);
const fishing = new Fishing(scene);
const rareVfx = createRareVfx(scene);
const footprints = createFootprints(scene, 240);
const beachItems = createCollectibles(scene);
/* Seagulls only ever settle on the offshore reefs — never on the
   lighthouse, so any perch that falls inside the tower's footprint is
   dropped defensively. */
const GULL_NO_LANDING = 14;
const gullPerches = ((world.reefs && world.reefs.userData.perches) || [])
  .filter((p) => Math.hypot(p.x - LIGHTHOUSE.x, p.z - LIGHTHOUSE.z) > GULL_NO_LANDING);
const seagulls = createSeagulls(scene, gullPerches);
const ships = createShips(scene, 8);
const aircraft = createAircraft(scene);
const marineLife = createMarineLife(scene);
const reef = createReef(scene);
const postfx = createPostFX(renderer, scene, camera);
const input = new Input();
input.attach(canvas);
if (input.touch) document.body.classList.add('touch');

UI.initColorPicker(PLAYER_COLORS, 0);
UI.initInfoCards();

/* Names this device has played under, offered as chips and autocomplete. */
UI.renderNameHistory();
UI.onNamePicked((name) => {
  /* Tapping an old name is a clear intent to play as them; fill the field
     and clear any earlier "name required" warning. */
  UI.markNameInvalid(false);
  UI.setStartError('');
  void name;
});

/* ------------------------------------------------------------------ */
/*  "Join on your phone" QR code                                       */
/* ------------------------------------------------------------------ */

/* Only useful on a desktop — you cannot scan your own phone screen. */
if (input.touch) {
  UI.setQrAvailable(false);
} else {
  const shareUrl = window.location.origin + window.location.pathname;
  UI.setQrUrl(shareUrl);
  /* The encoder is a deferred CDN script; give it a moment to arrive. */
  let tries = 0;
  const drawQr = () => {
    if (Qr.render(UI.qrCanvas(), shareUrl)) {
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
      UI.setQrHint(local
        ? 'Local address — phones cannot reach this. Deploy it, or use your machine\'s IP.'
        : 'Point your camera at the code');
      return;
    }
    if (tries++ < 40) setTimeout(drawQr, 150);
    else UI.setQrAvailable(false);
  };
  drawQr();
}

/* ------------------------------------------------------------------ */
/*  Menu camera & spawn fly-in                                         */
/* ------------------------------------------------------------------ */

/* 'menu'  — slow clockwise orbit high above the island
   'intro' — the swoop down to the pier after Play
   'follow' — the normal third-person camera */
let cameraMode = 'menu';
let menuAngle = -0.9;

/* The orbit sits far above the lighthouse (whose peak is ~23u) and looks
   steeply down on the island. */
const MENU_RADIUS = 62;
const MENU_HEIGHT = 88;
const MENU_SPIN = 0.075;          // radians per second, clockwise from above
const INTRO_DUR = 1.25;
let introT = 0;
const _introPos = new THREE.Vector3();
const _introTarget = new THREE.Vector3();
const _introFromPos = new THREE.Vector3();
const _introFromTarget = new THREE.Vector3();
const _spawnCamPos = new THREE.Vector3();
const _spawnCamTarget = new THREE.Vector3();
const _menuLook = new THREE.Vector3(0, 0, 0);

/** Camera pose the follow rig will settle into at the spawn point. */
function spawnCameraPose() {
  const rot = SPAWN_POINT.rotation;
  const y = PIER.deckY + 1.7;
  _spawnCamTarget.set(SPAWN_POINT.x, y, SPAWN_POINT.z);
  const cp = Math.cos(0.26);
  _spawnCamPos.set(
    Math.sin(rot + Math.PI) * cp,
    Math.sin(0.26),
    Math.cos(rot + Math.PI) * cp
  ).multiplyScalar(9.5).add(_spawnCamTarget);
  _spawnCamPos.y = Math.max(_spawnCamPos.y, 1.3);
}

/** Kicks off the swoop from wherever the orbit camera is right now. */
function beginIntro() {
  if (cameraMode !== 'menu') return;
  spawnCameraPose();
  _introFromPos.copy(camera.position);
  _introFromTarget.copy(_menuLook);
  introT = 0;
  cameraMode = 'intro';
  UI.fadeStartScreen(true);
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------------ */
/*  Telescope                                                          */
/* ------------------------------------------------------------------ */

let telescopeMode = false;
/* Horizontal pan and vertical tilt, both clamped. */
let telescopePan = 0;
let telescopeTilt = 0;
const TEL_PAN_LIMIT = (75 * Math.PI) / 180;
const TEL_TILT_LIMIT = (30 * Math.PI) / 180;
const TEL_RANGE = 9.0;
const _telEye = new THREE.Vector3();
const _telAim = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _telRight = new THREE.Vector3();

function telescopeGroup() {
  return (world.lighthouse && world.lighthouse.userData.telescope) || null;
}

/** True when the player is up on the gallery and close to the eyepiece. */
function nearTelescope() {
  const tel = telescopeGroup();
  if (!tel || !local.group) return false;
  const p = tel.getWorldPosition(new THREE.Vector3());
  return Math.hypot(local.x - p.x, local.z - p.z) < TEL_RANGE
    && local.group.position.y > p.y - 3.5;
}

function enterTelescope() {
  if (telescopeMode) return;
  telescopeMode = true;
  telescopePan = 0;
  telescopeTilt = 0;
  /* Capture the mouse so it drives the view, exactly like normal
     mouse-look. This click is the gesture that allows the capture. */
  if (!input.touch && canvas.requestPointerLock) {
    const req = canvas.requestPointerLock();
    if (req && typeof req.catch === 'function') req.catch(() => {});
  }
  UI.setHint(input.touch
    ? 'Telescope — swipe to look around, tap to step back'
    : 'Telescope — move the mouse to look around, Esc to step back');
}

function exitTelescope() {
  if (!telescopeMode) return;
  telescopeMode = false;
  camera.fov = 60;
  camera.updateProjectionMatrix();
  UI.setHint('');
}

/* A tap that does not drag the camera counts as a click — used only to
   step back out of the telescope view. */
let _tap = null;
canvas.addEventListener('pointerdown', (e) => {
  _tap = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!_tap) return;
  const moved = Math.hypot(e.clientX - _tap.x, e.clientY - _tap.y);
  const held = performance.now() - _tap.t;
  _tap = null;
  if (moved > 8 || held > 500) return;
  if (telescopeMode) exitTelescope();
});

/* Telescope look: the mouse drives it directly, exactly like mouse-look
   in the rest of the game. Touch devices swipe instead, since they have
   no pointer to move. */
let _panLastX = null;
let _panLastY = null;

/** Shared by both the mouse and the touch swipe. */
function telescopeLookBy(dx, dy) {
  telescopePan = Math.max(-TEL_PAN_LIMIT, Math.min(TEL_PAN_LIMIT,
    telescopePan + dx * 0.0016));
  telescopeTilt = Math.max(-TEL_TILT_LIMIT, Math.min(TEL_TILT_LIMIT,
    telescopeTilt - dy * 0.0016));
}

/* Mouse-look. movementX/Y keeps working past the window edge, so the view
   turns as far as the limits allow without ever running out of desk. */
window.addEventListener('mousemove', (e) => {
  if (!telescopeMode) return;
  telescopeLookBy(e.movementX || 0, e.movementY || 0);
});

/* Swipe, for touch screens. */
canvas.addEventListener('pointerdown', (e) => {
  if (telescopeMode && e.pointerType !== 'mouse') {
    _panLastX = e.clientX;
    _panLastY = e.clientY;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!telescopeMode || _panLastX === null) return;
  telescopeLookBy(e.clientX - _panLastX, e.clientY - _panLastY);
  _panLastX = e.clientX;
  _panLastY = e.clientY;
});
canvas.addEventListener('pointerup', () => { _panLastX = null; _panLastY = null; });
canvas.addEventListener('pointercancel', () => { _panLastX = null; _panLastY = null; });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') exitTelescope();
});

/** Returns the aim direction for the current pan and tilt. */
function telescopeAim(tel) {
  _telAim.copy(tel.userData.aim).applyAxisAngle(_up, telescopePan);
  /* Tilt about the axis square to the view, so the horizon stays level.
     Positive tilt raises the aim. */
  _telRight.crossVectors(_telAim, _up).normalize();
  _telAim.applyAxisAngle(_telRight, telescopeTilt).normalize();
  return _telAim;
}

const clock = new THREE.Clock();

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const SPEED = 7.6;
const SEND_HZ = 15;
const COLLECT_RANGE = 2.8;

/* Sittable spots on the pier's observation platform. */
const SEATS = seatSlots();
const SIT_RANGE = 1.7;
let sittingSeat = null;
let lyingChair = null;

const local = {
  x: 0,
  z: 0,
  rotation: 0,
  moving: false,
  fishing: 'idle',
  fish: null,
  group: null,
  footInit: false,
  footSide: 1,
  lastFx: 0,
  lastFz: 0,
};

const players = new Map(); // id -> remote player
let socket = null;
let myId = null;
let myName = '';
let joined = false;
let connecting = false;
let sendAcc = 0;

/* Merchant / economy state. `catchById` covers fish AND beach collectibles. */
let catchById = new Map();
let rarityValue = { common: 6, medium: 15, high: 40, rare: 120 };
let shop = { rods: [], bobbers: [] };
let cosmeticById = new Map();
let playerData = { inventory: {}, coins: 0, owned: [], equipped: {}, discovered: {} };
let tradeOpen = false;
let tradeTab = 'sell';

const _camTarget = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _head = new THREE.Vector3();
const _promptAnchor = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _dir = new THREE.Vector3();

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function standY(x, z) {
  return Math.max(surfaceHeight(x, z), SEA_LEVEL - 0.4);
}

/** Drop a 3D footprint every ~1 unit while walking on sand. */
function stepFootprints(entity, moving, rotation, x, z) {
  if (!moving || !isSand(x, z)) {
    entity.footInit = false;
    return;
  }
  const d = entity.footInit ? Math.hypot(x - entity.lastFx, z - entity.lastFz) : Infinity;
  if (d < 1.0) return;

  entity.lastFx = x;
  entity.lastFz = z;
  entity.footInit = true;

  const px = Math.cos(rotation) * 0.17 * entity.footSide;
  const pz = -Math.sin(rotation) * 0.17 * entity.footSide;
  entity.footSide *= -1;

  const fx = x + px;
  const fz = z + pz;
  footprints.add(fx, surfaceHeight(fx, fz), fz, rotation);
}

/* ------------------------------------------------------------------ */
/*  Networking                                                         */
/* ------------------------------------------------------------------ */

/* One id per page load — survives socket reconnects, so the server can
   hand the character back exactly where it was. */
const SESSION_ID = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function connect(name, color) {
  UI.setStartError('');
  UI.setLoading(true);
  myName = name;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = io();

  /* A stable id for this page session, so a dropped connection resumes
     the same character instead of spawning a new one at the pier. */
  socket.on('connect', () => socket.emit('join', { name, color, session: SESSION_ID }));

  socket.on('connect_error', () => {
    connecting = false;
    UI.setStartError('Could not reach the server.');
    UI.setLoading(false);
    /* Only fall back to the menu orbit if we never got into the game —
       a dropped socket mid-session must never yank the camera back up. */
    if (!joined) {
      cameraMode = 'menu';
      camera.fov = 60;
      camera.updateProjectionMatrix();
      UI.fadeStartScreen(false);
    }
  });

  socket.on('serverFull', (data) => {
    connecting = false;
    UI.setLoading(false);
    UI.setStartError(`Server is full (${data.max}/${data.max}). Try again in a moment.`);
    if (!joined) {
      cameraMode = 'menu';
      camera.fov = 60;
      camera.updateProjectionMatrix();
      UI.fadeStartScreen(false);
    }
    socket.disconnect();
  });

  socket.on('init', onInit);
  socket.on('playerJoined', onPlayerJoined);
  socket.on('playerMoved', onPlayerMoved);
  socket.on('playerLeft', onPlayerLeft);
  socket.on('playerCosmetics', onPlayerCosmetics);
  socket.on('fishingState', onFishingState);
  socket.on('fishCaught', onFishCaught);
  socket.on('struggleStart', onStruggleStart);
  socket.on('fishEscaped', onFishEscaped);
  socket.on('playerData', onPlayerData);
  socket.on('tradeResult', onTradeResult);
  socket.on('collectibleAdded', (item) => beachItems.add(item));
  socket.on('collectibleRemoved', (d) => beachItems.remove(d.id));
  socket.on('collected', onCollected);
  socket.on('online', (d) => UI.setOnline(d.count, d.max));
}

function onInit(data) {
  myId = data.id;
  joined = true;
  connecting = false;

  /* Remember this name on the device so it is one tap next time, and say
     so when the server found history for it. */
  UI.rememberName(myName, data.restored);

  catchById = new Map(
    [...data.fishTable, ...(data.collectibleTable || [])].map((f) => [f.id, f])
  );
  rarityValue = data.rarityValue;
  shop = data.shop;
  cosmeticById = new Map([...shop.rods, ...shop.bobbers].map((c) => [c.id, c]));
  beachItems.setList(data.collectibles || []);

  playerData = {
    inventory: data.you.inventory || {},
    coins: data.you.coins || 0,
    owned: data.you.owned || [],
    equipped: data.you.equipped || {},
    discovered: data.you.discovered || {},
  };

  local.x = data.you.x;
  local.z = data.you.z;
  local.rotation = data.you.rotation;
  /* Put the follow camera directly behind the spawn facing, so the very
     first frame already looks the way the character does. The shorter
     boom keeps it clear of the pier's sunshade canopy. */
  input.yaw = local.rotation + Math.PI;
  input.pitch = 0.26;
  input.camDist = 9.5;

  /* Reconnecting (the socket dropped and came back) must not leave the
     old avatar in the scene or a stale one under our feet. */
  if (local.group) {
    scene.remove(local.group);
    local.group = null;
  }
  if (local.silhouette) {
    scene.remove(local.silhouette);
    local.silhouette = null;
  }
  for (const rp of players.values()) scene.remove(rp.group);
  players.clear();
  sittingSeat = null;
  lyingChair = null;

  local.group = createAvatar(data.you.color, data.you.name, true);
  /* Yaw first, then recline — so lying back on a lounger tips the body
     about the chair's own axis rather than the world's. */
  local.group.rotation.order = 'YXZ';

  /* X-ray stand-in, shown when foliage blocks the camera. */
  local.silhouette = makeSilhouette(local.group);
  scene.add(local.silhouette);
  local.occluded = false;
  local.group.position.set(local.x, standY(local.x, local.z), local.z);
  scene.add(local.group);

  for (const p of data.players) {
    if (p.id !== myId) addRemotePlayer(p);
  }

  applyCosmetics(local.group, playerData.equipped, true);

  UI.setOnline(data.players.length, data.maxPlayers);
  UI.showGame(true);
  UI.setHint('');
  if (data.restored) {
    UI.notify(`Welcome back, ${myName} — your catch and coins were restored.`);
  } else if (data.persistBlocked) {
    /* The save server could not be reached, so we refuse to overwrite whatever
       is stored under this name. Better to warn than to silently wipe it. */
    UI.notify('Save server unreachable — progress will not be kept this session.');
  }
  clock.getDelta();
}

function applyCosmetics(avatar, equipped, isLocalPlayer) {
  if (!avatar || !equipped) return;
  const rod = cosmeticById.get(equipped.rod);
  if (rod) applyRod(avatar, rod);
  if (isLocalPlayer) {
    const bobber = cosmeticById.get(equipped.bobber);
    if (bobber) fishing.setBobber(bobber);
  }
}

function addRemotePlayer(p) {
  if (players.has(p.id)) return;
  const group = createAvatar(p.color, p.name, false);
  group.position.set(p.x, standY(p.x, p.z), p.z);
  group.rotation.y = p.rotation;
  scene.add(group);

  applyCosmetics(group, p.equipped, false);

  players.set(p.id, {
    group,
    x: p.x,
    z: p.z,
    tx: p.x,
    tz: p.z,
    rotation: p.rotation,
    trot: p.rotation,
    moving: !!p.moving,
    fishing: p.fishing || 'idle',
    footInit: false,
    footSide: 1,
    lastFx: 0,
    lastFz: 0,
  });
}

function onPlayerJoined(p) {
  addRemotePlayer(p);
}

function onPlayerMoved(d) {
  const rp = players.get(d.id);
  if (!rp) return;
  rp.tx = d.x;
  rp.tz = d.z;
  rp.trot = d.rotation;
  rp.moving = !!d.moving;
}

function onPlayerLeft(d) {
  const rp = players.get(d.id);
  if (!rp) return;
  scene.remove(rp.group);
  players.delete(d.id);
}

function onPlayerCosmetics(d) {
  const rp = players.get(d.id);
  if (rp) applyCosmetics(rp.group, d.equipped, false);
}

function onFishingState(msg) {
  const isMe = msg.id === myId;

  if (isMe) {
    local.fishing = msg.state;
    if (msg.state === 'hooked') {
      local.fish = msg.fish;
      /* No more "!" to click — the bite drops straight into the reeling
         game, and the server gives you five seconds to start working it. */
      UI.showHook(false);
      if (socket && socket.connected) socket.emit('startMinigame');
      startMinigame();
    } else if (msg.state === 'struggle') {
      local.fish = msg.fish;
    } else if (msg.state === 'idle') {
      local.fish = null;
      local.struggle = null;
      fishing.reset();
      UI.showMinigame(false);
      UI.showHook(false);
      UI.showStruggle(false);
    } else if (msg.state === 'minigame') {
      UI.showHook(false);
    }
  } else {
    const rp = players.get(msg.id);
    if (rp) rp.fishing = msg.state;
  }

  if (msg.state === 'hooked' && msg.fish && msg.fish.rarity === 'rare') {
    const target = isMe ? local.group : (players.get(msg.id) || {}).group;
    rareVfx.trigger(target);
  }

  updateHint();
}

/* ---------------------- Seagull tug-of-war ---------------------- */

function onStruggleStart(d) {
  local.struggle = {
    fish: d && d.fish,
    need: (d && d.need) || 3,
    window: (d && d.window) || 6,
    got: 0,
    t: 0,
    lastSent: 0,
  };
  UI.showStruggle(true, local.struggle);
  UI.setStruggleProgress(0);
  updateHint();
}

function onFishEscaped(d) {
  if (!d || d.id !== myId) return;
  UI.showStruggle(false);
  local.struggle = null;
  if (d.reason === 'seagull') {
    UI.notify(`A seagull made off with your ${d.fish ? d.fish.name : 'fish'}!`);
  } else {
    UI.notify('The fish got away — you were too slow.');
  }
  updateHint();
}

/** Drives the tug-of-war bar and reports the held time to the server. */
function updateStruggle(dt) {
  const s = local.struggle;
  if (!s) return;
  s.t += dt;

  if (input.hold) {
    s.got += dt;
    s.lastSent += dt;
    /* Report in small batches so the server can credit the hold even if
       the struggle ends before the next frame. */
    if (s.lastSent >= 0.1) {
      if (socket && socket.connected) socket.emit('struggleInput', { dt: s.lastSent });
      s.lastSent = 0;
    }
  }

  UI.setStruggleProgress(Math.min(1, s.got / s.need), s.window - s.t);

  if (s.t >= s.window + 0.5) {
    UI.showStruggle(false);
    local.struggle = null;
  }
}

function onFishCaught(record) {
  UI.toast(record.name, record.fish);
  UI.addCatchLog(record.name, record.fish);
  if (record.id === myId) {
    if (record.isNew) playerData.discovered[record.fish.id] = true;
    UI.showCatchCard(record.fish, {
      value: rarityValue[record.fish.rarity],
      isNew: record.isNew,
    });
  }
}

function onCollected(record) {
  UI.addCatchLog(`${record.name} 🧺`, record.item);
  if (record.id === myId && local.group) {
    _head.set(local.x, local.group.position.y + 2.6, local.z);
    UI.pickupPopup(UI.projectToScreen(_head, camera), `+1 ${record.item.name}`);
  }
}

function onPlayerData(d) {
  playerData = {
    inventory: d.inventory || {},
    coins: d.coins || 0,
    owned: d.owned || [],
    equipped: d.equipped || {},
    discovered: d.discovered || playerData.discovered || {},
  };
  applyCosmetics(local.group, playerData.equipped, true);
  if (tradeOpen) refreshTrade();
}

function onTradeResult(r) {
  if (!r) return;
  if (!r.ok) {
    UI.setTradeMessage(r.message || 'Not enough coins.', true);
    return;
  }
  if (r.kind === 'sell') UI.setTradeMessage(`Sold ${r.qty}× ${r.fish} for 🪙 ${r.gain}`);
  else if (r.kind === 'sellAll') UI.setTradeMessage(`Sold ${r.qty} fish for 🪙 ${r.gain}`);
  else if (r.kind === 'buy') UI.setTradeMessage(`Purchased ${r.item}!`);
  else if (r.kind === 'equip') UI.setTradeMessage(`Equipped ${r.item}.`);
}

/* ------------------------------------------------------------------ */
/*  Merchant UI                                                        */
/* ------------------------------------------------------------------ */

function refreshTrade() {
  UI.renderTrade({
    tab: tradeTab,
    inventory: playerData.inventory,
    coins: playerData.coins,
    owned: playerData.owned,
    equipped: playerData.equipped,
    rods: shop.rods,
    bobbers: shop.bobbers,
    fishById: catchById,
    rarityValue,
  });
}

function openTrade() {
  if (tradeOpen) return;
  UI.showCodex(false);
  /* Give the cursor back so the shop can be clicked. */
  input.releasePointerLock();
  tradeOpen = true;
  UI.showTradePanel(true);
  refreshTrade();
  UI.setTradeMessage('');
}

function closeTrade() {
  if (!tradeOpen) return;
  tradeOpen = false;
  UI.showTradePanel(false);
}

/* The shop is opened from the context action prompt, not a fixed button. */
UI.onTradeClose(closeTrade);

/* ---------- Fish Encyclopedia ---------- */
function openCodex() {
  if (!joined) return;
  if (tradeOpen) closeTrade();
  /* Give the cursor back so the gallery can be clicked. */
  input.releasePointerLock();
  UI.renderCodex({ fish: [...catchById.values()].filter((f) => f.weight), discovered: playerData.discovered });
  UI.showCodex(true);
}
function closeCodex() {
  UI.showCodex(false);
}
UI.onCodexClick(openCodex);
UI.onCodexClose(closeCodex);

/* Typing clears the "name required" warning. */
UI.onNameInput(() => {
  if ((UI.dom.nameInput.value || '').trim()) {
    UI.markNameInvalid(false);
    UI.setStartError('');
  }
});

UI.onTradeAction((a) => {
  if (!socket || !socket.connected) return;
  if (a.type === 'sellAll') socket.emit('sellAll');
  else if (a.type === 'sell') socket.emit('sellFish', { fishId: a.fishId, qty: a.qty });
  else if (a.type === 'buy') socket.emit('buyItem', { itemId: a.itemId });
  else if (a.type === 'equip') socket.emit('equipItem', { itemId: a.itemId });
});

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (tradeOpen) { closeTrade(); return; }
  /* Escape also reels the line back in. */
  if (local.fishing === 'waiting' || local.fishing === 'hooked') cancelFishing();
});

/* PC shortcuts. While the mouse is captured by pointer lock the on-screen
   prompt cannot be clicked, so every action needs a key. */
window.addEventListener('keydown', (e) => {
  if (!joined || tradeOpen || UI.isCodexOpen()) return;
  if (e.code === 'KeyF') {
    if (local.fishing === 'waiting' || local.fishing === 'hooked') cancelFishing();
    else if (!currentAction && local.fishing === 'idle') castLine();
    else if (currentAction && currentAction.label === 'Fish') currentAction.run();
  } else if (e.code === 'KeyE') {
    if (!currentAction) return;
    if (['Pick up', 'Use telescope', 'Sit', 'Sunbathe', 'Trade'].includes(currentAction.label)) {
      currentAction.run();
    }
  }
});

/* ------------------------------------------------------------------ */
/*  UI wiring                                                          */
/* ------------------------------------------------------------------ */

UI.onPlay(() => {
  if (connecting || joined) return;
  /* A name is mandatory — no anonymous anglers. */
  const name = (UI.dom.nameInput.value || '').trim();
  if (!name) {
    UI.setStartError('Please enter a name before you set sail.');
    UI.markNameInvalid(true);
    if (UI.dom.nameInput.focus) UI.dom.nameInput.focus();
    return;
  }
  UI.markNameInvalid(false);
  UI.setStartError('');
  connecting = true;
  /* This click is the user gesture that unlocks audio playback, so the
     background music starts here rather than on page load. */
  Music.start();
  UI.setMusicMuted(Music.isMuted());
  /* Start the fly-in immediately on confirm, so the swoop runs while the
     server is still shaking hands. */
  beginIntro();
  connect(name, UI.getChosenColor());
});

/* Mute / unmute the background music. */
UI.onMusicClick(() => {
  UI.setMusicMuted(Music.toggle());
});

/* ---------- The context action, shown beside the player ---------- */

function castLine() {
  if (local.fishing !== 'idle' || !joined || tradeOpen) return;
  if (!socket || !socket.connected) return;
  local.fishing = 'waiting';
  socket.emit('castLine');
  fishing.cast(local.group);
  updateHint();
}

function cancelFishing() {
  if (local.fishing === 'idle') return;
  if (socket && socket.connected) socket.emit('cancelFishing');
  local.fishing = 'idle';
  local.fish = null;
  local.struggle = null;
  fishing.reset();
  UI.showMinigame(false);
  UI.showHook(false);
  UI.showStruggle(false);
  updateHint();
}

function pickUp() {
  if (!joined || tradeOpen || local.fishing !== 'idle') return;
  const near = beachItems.nearest(local.x, local.z, COLLECT_RANGE);
  if (!near || !socket || !socket.connected) return;
  socket.emit('collect', { id: near.id });
}

function sitOrLie() {
  if (!joined || tradeOpen) return;
  if (lyingChair) getUp();
  else if (sittingSeat) standUp();
  else if (nearestChair()) lieDown();
  else sitDown();
}

/**
 * Decides which single action the player can take right now, and what its
 * prompt should say. Returns null when there is nothing to offer.
 */
function pickAction(ctx) {
  if (!joined || tradeOpen || UI.isCodexOpen()) return null;
  if (telescopeMode) return { label: 'Exit telescope', alt: true, run: exitTelescope };
  if (local.struggle) return null;
  if (local.fishing === 'waiting' || local.fishing === 'hooked') {
    return { label: 'Reel in', alt: true, run: cancelFishing };
  }
  if (local.fishing === 'minigame') return null;
  if (lyingChair) return { label: 'Get up', alt: true, run: getUp };
  if (sittingSeat) return { label: 'Stand', alt: true, run: standUp };
  if (!ctx.idle) return null;
  if (nearTelescope()) return { label: 'Use telescope', run: enterTelescope };
  if (ctx.find) return { label: 'Pick up', run: pickUp };
  if (ctx.lounger) return { label: 'Sunbathe', run: lieDown };
  if (ctx.seat) return { label: 'Sit', run: sitDown };
  if (ctx.atMerchant) return { label: 'Trade', run: openTrade };
  if (ctx.nearWater) return { label: 'Fish', run: castLine };
  return null;
}

let currentAction = null;
UI.onActionPromptClick(() => {
  if (currentAction) currentAction.run();
});

UI.onCancelClick(cancelFishing);

function startMinigame() {
  local.fishing = 'minigame';
  fishing.beginMinigame(local.fish);
  UI.showHook(false);
  UI.showMinigame(true, input.touch);
  UI.setHint('');
}

function updateHint() {
  if (!joined) return;
  if (telescopeMode) {
    UI.setHint(input.touch
      ? 'Telescope — swipe to look around, tap to step back'
      : 'Telescope — move the mouse to look around, Esc to step back');
  } else if (local.fishing === 'waiting') {
    UI.setHint('Line cast — waiting for a bite…');
  } else if (local.fishing === 'hooked') {
    UI.setHint('A bite! Work the line — Space or the reel button');
  } else if (local.fishing === 'minigame') {
    UI.setHint('');
  } else if (lyingChair) {
    UI.setHint('Sunbathing — press [Get up] or move to stand');
  } else if (sittingSeat) {
    UI.setHint('Resting on the bench — press [Stand] or move to get up');
  } else if (nearTelescope()) {
    UI.setHint('Press [Use] to look through the telescope');
  } else if (nearestChair()) {
    UI.setHint('Press [Sunbathe] to lie back on the lounger');
  } else if (nearestSeat()) {
    UI.setHint('Press [Sit] to rest on the bench');
  } else if (nearCollectible()) {
    UI.setHint('A beach find — press [Collect]');
  } else if (nearMerchant()) {
    UI.setHint('Trade your catch with David');
  } else {
    UI.setHint(atWater() ? 'Press [Fishing] to cast your line' : '');
  }
}

function nearMerchant() {
  return Math.hypot(local.x - MERCHANT.x, local.z - MERCHANT.z) < MERCHANT.radius;
}

function nearCollectible() {
  return !!beachItems.nearest(local.x, local.z, COLLECT_RANGE);
}

/* Casting is allowed anywhere the shore is reachable — the sand band or
   the pier — which follows the island's irregular coastline. */
/* Casting is only offered on the sand, with the player facing out to
   sea — turn back towards the grass and the prompt goes away. */
function atWater() {
  return canCast(local.x, local.z, local.rotation);
}

function nearestSeat() {
  let best = null;
  let bestD = SIT_RANGE * SIT_RANGE;
  for (const s of SEATS) {
    const dx = local.x - s.x;
    const dz = local.z - s.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function sitDown() {
  const s = nearestSeat();
  if (!s) return;
  sittingSeat = s;
  local.x = s.x;
  local.z = s.z;
  local.rotation = s.rotation;
}

function standUp() {
  sittingSeat = null;
}

/* ------------------------------------------------------------------ */
/*  Beach loungers                                                     */
/* ------------------------------------------------------------------ */

/** The nearest lounger within reach, or null. */
function nearestChair() {
  let best = null;
  let bestD = SIT_RANGE * SIT_RANGE;
  for (const c of BEACH_CHAIRS) {
    const dx = local.x - c.x;
    const dz = local.z - c.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/* Recline angles that line the body up with the lounger's back plane. */
const LIE_TILT = -1.171;
const LIE_LEG = -0.4;

function lieDown() {
  const c = nearestChair();
  if (!c) return;
  sittingSeat = null;
  lyingChair = c;
  local.rotation = c.rotation;
}

function getUp() {
  if (!lyingChair) return;
  /* Step off to the side of the lounger so we do not stand inside it. */
  const s = Math.sin(lyingChair.rotation);
  const cs = Math.cos(lyingChair.rotation);
  local.x = lyingChair.x + cs * 0.95;
  local.z = lyingChair.z - s * 0.95;
  lyingChair = null;
}

/** Places the reclined avatar on the lounger and plants the rod. */
function poseOnChair() {
  const c = lyingChair;
  const g = local.group;
  const s = Math.sin(c.rotation);
  const cs = Math.cos(c.rotation);
  /* Chair-local anchor, rotated into world space. */
  const ox = 0.438;
  g.position.set(c.x + s * ox, c.y + 0.057, c.z + cs * ox);
  g.rotation.set(LIE_TILT, c.rotation, 0);
  g.userData.parts.leftLeg.rotation.x = LIE_LEG;
  g.userData.parts.rightLeg.rotation.x = LIE_LEG;
}

/** Shows the planted rod on the lounger the local player is using. */
function updateChairRods() {
  if (!world.beachChairs) return;
  for (const chair of world.beachChairs.children) {
    if (!chair.userData.rod) continue;
    chair.userData.rod.visible = lyingChair === chair.userData.chair;
  }
}

/* ------------------------------------------------------------------ */
/*  Foliage occlusion                                                  */
/* ------------------------------------------------------------------ */

/**
 * An x-ray copy of the avatar: the same meshes, drawn on top of the world
 * with depth testing off, so the character stays visible when a tree or a
 * bush is between them and the camera. It is only shown when something
 * actually blocks the view, and only then is its pose synced.
 */
function makeSilhouette(source) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9fe4ff,
    transparent: true,
    opacity: 0.3,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const sources = [];
  source.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const m = new THREE.Mesh(o.geometry, mat);
    m.matrixAutoUpdate = false;
    m.frustumCulled = false;
    group.add(m);
    sources.push(o);
  });
  group.renderOrder = 999;
  group.visible = false;
  group.userData.sources = sources;
  return group;
}

/** Copies the live avatar's pose onto the silhouette. */
function syncSilhouette(sil, source) {
  const sources = sil.userData.sources;
  source.updateWorldMatrix(true, true);
  for (let i = 0; i < sources.length; i++) {
    sil.children[i].matrix.copy(sources[i].matrixWorld);
  }
}

const _occDir = new THREE.Vector3();
const _occOrigin = new THREE.Vector3();
const _occRay = new THREE.Raycaster();
let occFrame = 0;

/** True when scenery sits between the camera and the player. */
function foliageBlocksView() {
  if (!local.group || !world.foliage) return false;
  _occOrigin.copy(camera.position);
  _occDir.set(local.x, local.group.position.y + 1.1, local.z).sub(_occOrigin);
  const dist = _occDir.length();
  if (dist < 0.4) return false;
  _occDir.divideScalar(dist);
  _occRay.set(_occOrigin, _occDir);
  _occRay.near = 0;
  /* Ignore anything right on top of the player — only count real cover. */
  _occRay.far = dist - 0.5;
  return _occRay.intersectObject(world.foliage, true).length > 0;
}

/** Toggles the x-ray silhouette. Cheap enough to run at a low rate. */
function updateOcclusion(dt) {
  const sil = local.silhouette;
  if (!sil || !local.group) return;
  /* Only re-test a few times a second; the ray costs more than a frame. */
  occFrame = (occFrame + 1) % 5;
  if (occFrame === 0) {
    local.occluded = foliageBlocksView();
  }
  sil.visible = !!local.occluded && cameraMode === 'follow';
  if (sil.visible) syncSilhouette(sil, local.group);
}

/* ------------------------------------------------------------------ */
/*  Resize                                                             */
/* ------------------------------------------------------------------ */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  postfx.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/*  Main loop                                                          */
/* ------------------------------------------------------------------ */

let elapsed = 0;
let fishingWatch = 0;
let prevFishing = 'idle';

/* The merchant pipes up with a random line when a player walks over. */
const MERCHANT_GREETINGS = [
  'Ahoy! Got a catch to sell?',
  'The tide has been kind today.',
  'Fine weather for fishing, friend.',
  'Bring me shells and I pay fair.',
  "Forty years I've sailed these waters.",
  'Care for a new rod? Best on the isle.',
  'Reel them in slow — that is the trick.',
  'Smells like a good haul today!',
  'The big ones hide deep, lad.',
  'My old bones say rain is coming.',
  'Watch the gulls — they know where they bite.',
  'A steady hand beats a strong arm.',
];
let wasNearMerchant = false;
let greetCooldown = 0;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  const fishingActive = local.fishing !== 'idle';

  /* Any movement input gets the player up off the bench or lounger. */
  if ((sittingSeat || lyingChair) && input.moveInput.magnitude > 0.3) {
    if (lyingChair) getUp();
    else standUp();
  }

  const canMove = joined && !fishingActive && !tradeOpen && !sittingSeat && !lyingChair
    && !UI.isCodexOpen() && !telescopeMode;

  /* ---------- Movement ---------- */
  let moving = false;
  if (canMove) {
    const mi = input.moveInput;
    if (mi.magnitude > 0.08) {
      const yaw = input.yaw;
      _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      _right.set(Math.cos(yaw), 0, -Math.sin(yaw));

      _dir.set(0, 0, 0)
        .addScaledVector(_fwd, mi.forward)
        .addScaledVector(_right, mi.right);

      if (_dir.lengthSq() > 1e-6) {
        _dir.normalize();

        const nx = local.x + _dir.x * SPEED * dt;
        const nz = local.z + _dir.z * SPEED * dt;

        let moved = false;
        if (isWalkable(nx, local.z)) { local.x = nx; moved = true; }
        if (isWalkable(local.x, nz)) { local.z = nz; moved = true; }

        local.rotation = lerpAngle(local.rotation, Math.atan2(_dir.x, _dir.z), 1 - Math.pow(0.0005, dt));
        moving = moved;
      }
    }
  }
  local.moving = moving;

  /* Hide the lighthouse shell while the player is inside it, so the
     follow camera looks through the wall instead of at it. */
  if (world.lighthouse && world.lighthouse.userData.shell) {
    world.lighthouse.userData.shell.visible = !insideLighthouse(
      local.x, local.z, local.group ? local.group.position.y : -Infinity
    );
  }

  if (local.group) {
    if (lyingChair) {
      /* Reclined on the lounger, with the rod planted beside it. */
      poseOnChair();
    } else {
      local.group.rotation.x = 0;
      if (sittingSeat) {
        /* Drop the hips to seat height so he actually sits on the plank. */
        local.group.position.set(sittingSeat.x, sittingSeat.y - 0.31, sittingSeat.z);
      } else {
        local.group.position.set(local.x, standY(local.x, local.z), local.z);
      }
      local.group.rotation.y = local.rotation;
    }
    updateAvatar(local.group, dt, moving, local.fishing, !!sittingSeat, !!lyingChair);
  }
  updateChairRods();
  updateOcclusion(dt);

  stepFootprints(local, moving, local.rotation, local.x, local.z);

  /* ---------- Remote players ---------- */
  for (const rp of players.values()) {
    const k = 1 - Math.pow(0.00005, dt);
    rp.x += (rp.tx - rp.x) * k;
    rp.z += (rp.tz - rp.z) * k;
    rp.rotation = lerpAngle(rp.rotation, rp.trot, k);
    rp.group.position.set(rp.x, standY(rp.x, rp.z), rp.z);
    rp.group.rotation.y = rp.rotation;
    updateAvatar(rp.group, dt, rp.moving, rp.fishing);
    stepFootprints(rp, rp.moving, rp.rotation, rp.x, rp.z);
  }

  footprints.update(dt);
  beachItems.update(dt, elapsed);

  /* ---------- Fishing visuals ---------- */
  fishing.update(dt, local.group, local.fishing);

  /* Watchdog: never leave the player stuck if a server message is lost. */
  if (local.fishing !== prevFishing) {
    prevFishing = local.fishing;
    fishingWatch = 0;
  }
  if (local.fishing === 'waiting' || local.fishing === 'hooked') {
    fishingWatch += dt;
    if (fishingWatch > 18) {
      local.fishing = 'idle';
      local.fish = null;
      fishing.reset();
      UI.showMinigame(false);
      UI.showHook(false);
      updateHint();
    }
  }

  /* ---------- Minigame ---------- */
  if (local.fishing === 'minigame' && local.fish) {
    const res = fishing.updateMinigame(dt, input.hold);

    _head.set(local.x, local.group.position.y + 3.25, local.z);
    const screen = UI.projectToScreen(_head, camera);
    UI.positionMinigame(
      screen,
      fishing.indicator,
      fishing.targetStart,
      fishing.targetWidth,
      res.progress,
      res.inTarget
    );

    if (res.done) {
      socket.emit('catchSuccess');
      local.fishing = 'idle';
      local.fish = null;
      fishing.reset();
      UI.showMinigame(false);
      updateHint();
    }
  }

  /* ---------- Seagull tug-of-war ---------- */
  updateStruggle(dt);

  /* ---------- Overlays ---------- */
  const nearWater = atWater();
  const atMerchant = nearMerchant();
  const find = local.fishing === 'idle' && !sittingSeat && !lyingChair
    ? beachItems.nearest(local.x, local.z, COLLECT_RANGE)
    : null;
  const idle = joined && !tradeOpen && local.fishing === 'idle';
  const seat = idle && !sittingSeat && !lyingChair && !find ? nearestSeat() : null;
  const lounger = idle && !sittingSeat && !lyingChair && !find && !seat ? nearestChair() : null;

  /* ---------- The floating action prompt ----------
     One context action at a time, projected from a point beside the
     player's shoulder so it reads as part of the world. */
  const action = pickAction({ idle, seat, lounger, find, atMerchant, nearWater });
  if (action && local.group) {
    _promptAnchor.set(
      local.x + Math.cos(local.rotation) * 1.25,
      local.group.position.y + 1.5,
      local.z - Math.sin(local.rotation) * 1.25
    );
    const ps = UI.projectToScreen(_promptAnchor, camera);
    UI.showActionPrompt(ps.visible, action.label, action.alt);
    UI.placeActionPrompt(ps);
    currentAction = action;
  } else {
    UI.showActionPrompt(false);
    currentAction = null;
  }

  UI.showHook(false);

  /* ---------- Network ---------- */
  if (joined) {
    sendAcc += dt;
    if (sendAcc >= 1 / SEND_HZ) {
      sendAcc = 0;
      socket.emit('move', {
        x: local.x,
        z: local.z,
        rotation: local.rotation,
        moving,
      });
    }
  }

  /* ---------- Camera ---------- */
  /* Hard lock: once in the game the camera belongs to the player and can
     never drift back to the menu orbit. */
  if (joined && cameraMode === 'menu') cameraMode = 'follow';

  if (cameraMode === 'menu') {
    /* Slow clockwise orbit, high above the island, looking down. */
    menuAngle += dt * MENU_SPIN;
    camera.position.set(
      Math.cos(menuAngle) * MENU_RADIUS,
      MENU_HEIGHT,
      Math.sin(menuAngle) * MENU_RADIUS
    );
    camera.lookAt(_menuLook);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  } else if (cameraMode === 'intro') {
    /* Swoop down from the orbit onto the pier, easing into the follow
       rig's exact resting pose so the hand-off is invisible. */
    introT += dt;
    const k = Math.min(1, introT / INTRO_DUR);
    const e = easeInOut(k);
    camera.position.lerpVectors(_introFromPos, _spawnCamPos, e);
    _camTarget.lerpVectors(_introFromTarget, _spawnCamTarget, e);
    camera.lookAt(_camTarget);
    const fov = 54 + 6 * e;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    if (k >= 1) {
      cameraMode = 'follow';
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
  } else if (telescopeMode && world.lighthouse) {
    /* Looking down the barrel: sit at the eyepiece, aim out to sea, and
       pull the field of view right in. */
    const tel = world.lighthouse.userData.telescope;
    _telEye.copy(tel.userData.eyeLocal);
    tel.localToWorld(_telEye);
    const aim = telescopeAim(tel);
    camera.position.lerp(_telEye, 1 - Math.pow(0.0008, dt));
    camera.lookAt(
      camera.position.x + aim.x,
      camera.position.y + aim.y,
      camera.position.z + aim.z
    );
    camera.fov += (16 - camera.fov) * (1 - Math.pow(0.02, dt));
    camera.updateProjectionMatrix();
  } else if (local.group) {
    if (camera.fov !== 60) {
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
    _camTarget.set(
      local.x,
      lyingChair ? lyingChair.y + 1.05 : local.group.position.y + 1.7,
      local.z
    );
    const cp = Math.cos(input.pitch);
    _desired.set(
      Math.sin(input.yaw) * cp,
      Math.sin(input.pitch),
      Math.cos(input.yaw) * cp
    ).multiplyScalar(input.camDist).add(_camTarget);

    if (_desired.y < 1.3) _desired.y = 1.3;

    camera.position.lerp(_desired, 1 - Math.pow(0.0022, dt));
    camera.lookAt(_camTarget);
  }

  /* ---------- Merchant greeting ---------- */
  greetCooldown = Math.max(0, greetCooldown - dt);
  const atMerchantNow = joined && nearMerchant();
  if (atMerchantNow && !wasNearMerchant && greetCooldown <= 0) {
    const line = MERCHANT_GREETINGS[Math.floor(Math.random() * MERCHANT_GREETINGS.length)];
    world.merchantSay(line);
    UI.notify(line);
    greetCooldown = 14;
  }
  wasNearMerchant = atMerchantNow;

  /* ---------- World, wildlife & VFX ---------- */
  /* Feed the merchant the nearest player so he can turn to face them. */
  let focus = null;
  if (joined && local.group) {
    let best = Math.hypot(local.x - MERCHANT.x, local.z - MERCHANT.z);
    focus = { x: local.x, z: local.z };
    for (const rp of players.values()) {
      const d = Math.hypot(rp.x - MERCHANT.x, rp.z - MERCHANT.z);
      if (d < best) {
        best = d;
        focus = { x: rp.x, z: rp.z };
      }
    }
  }
  world.update(dt, elapsed, focus);
  seagulls.update(dt, elapsed);
  ships.update(dt, elapsed);
  aircraft.update(dt, elapsed);
  marineLife.update(dt, elapsed);
  reef.update(dt);
  rareVfx.update(dt);

  updateHintThrottle(dt);

  /* ---------- Toon shading + pencil-sketch edge pass ---------- */
  postfx.render(dt);
}

let hintAcc = 0;
function updateHintThrottle(dt) {
  hintAcc += dt;
  if (hintAcc > 0.25) {
    hintAcc = 0;
    updateHint();
  }
}

animate();
