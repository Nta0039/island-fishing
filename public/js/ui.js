import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export const dom = {
  hud: $('hud'),
  startScreen: $('start-screen'),
  loading: $('loading'),
  brand: $('brand'),
  onlineCount: $('online-count'),
  onlineMax: $('online-max'),
  catchlogList: $('catchlog-list'),
  hint: $('hint'),
  fishingBtn: null,
  collectBtn: null,
  sitBtn: null,
  useBtn: null,
  cancelBtn: null,
  actionPrompt: $('action-prompt'),
  struggle: $('struggle'),
  sgFill: $('sg-fill'),
  sgLabel: $('sg-label'),
  sgTime: $('sg-time'),
  infoPanel: $('info-panel'),
  qrCard: $('qr-card'),
  qrCanvas: $('qr-canvas'),
  qrUrl: $('qr-url'),
  hookIcon: $('hook-icon'),
  minigame: $('minigame'),
  mgFill: $('mg-fill'),
  mgTarget: $('mg-target'),
  mgIndicator: $('mg-indicator'),
  mgLabel: $('mg-label'),
  mgCancel: $('mg-cancel'),
  joystickZone: $('joystick-zone'),
  joystickBase: $('joystick-base'),
  joystickKnob: $('joystick-knob'),
  reelZone: $('reel-zone'),
  toasts: $('toasts'),
  nameInput: $('name-input'),
  nameHistory: $('name-history'),
  nameRecent: $('name-recent'),
  playBtn: $('play-btn'),
  startError: $('start-error'),
  colorPicker: $('color-picker'),
  tradePanel: $('trade-panel'),
  tradeCoins: $('trade-coins'),
  tradeClose: $('trade-close'),
  tradeBody: $('trade-body'),
  tradeMsg: $('trade-msg'),
  tradeTabs: Array.from(document.querySelectorAll('.trade-tab')),
  catchCard: $('catch-card'),
  codexBtn: $('codex-btn'),
  musicBtn: $('music-btn'),
  codexPanel: $('codex-panel'),
  codexGrid: $('codex-grid'),
  codexCount: $('codex-count'),
  codexTotal: $('codex-total'),
  codexClose: $('codex-close'),
  inventoryBtn: $('inventory-btn'),
  inventoryPanel: $('inventory-panel'),
  inventoryClose: $('inventory-close'),
  invCoins: $('inv-coins'),
  invCount: $('inv-count'),
  invCap: $('inv-cap'),
  invBarFill: $('inv-bar-fill'),
  invGrid: $('inv-grid'),
  invGear: $('inv-gear'),
  pausePanel: $('pause-panel'),
  pauseStatus: $('pause-status'),
  pauseSave: $('pause-save'),
  pauseSaveExit: $('pause-save-exit'),
  pauseClose: $('pause-close'),
};

/* ------------------------------------------------------------------ */
/*  Fish icons                                                         */
/* ------------------------------------------------------------------ */

/**
 * The catch art lives in /img/fish, one file per species, and every file
 * is named after the species itself — so the two can never drift apart.
 * Anything not in this list (beach collectibles, say) falls back to its
 * emoji rather than firing a request for art that does not exist.
 */
const FISH_ART = new Set([
  'Anchovy', 'Sardine', 'Mackerel', 'Herring', 'Sprat', 'Smelt', 'Perch', 'Bleak',
  'Sea Bass', 'Red Snapper', 'Bluefin Tuna', 'Rainbow Trout', 'Mahi-Mahi', 'Barracuda',
  'Swordfish', 'Blue Marlin', 'Sturgeon', 'Anglerfish',
  'Golden Leviathan', 'Crystal Koi',
]);

export function fishIconUrl(fish) {
  if (!fish || !FISH_ART.has(fish.name)) return null;
  return `/img/fish/${encodeURIComponent(fish.name)}.png`;
}

function iconHtml(fish, cls = 'fish-icon') {
  const url = fishIconUrl(fish);
  const emoji = (fish && fish.emoji) || '🐟';
  if (!url) return `<span class="${cls} emoji">${emoji}</span>`;
  return `<img class="${cls}" src="${url}" alt="" draggable="false" data-emoji="${emoji}">`;
}

/* Swap any fish icon that fails to load for its emoji. */
document.addEventListener('error', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'IMG' || !el.dataset || !el.dataset.emoji) return;
  const span = document.createElement('span');
  span.className = `${el.className} emoji`;
  span.textContent = el.dataset.emoji;
  el.replaceWith(span);
}, true);

const _v = new THREE.Vector3();

export function projectToScreen(v3, camera) {
  _v.copy(v3).project(camera);
  return {
    x: (_v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
    visible: _v.z < 1,
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ------------------------------ Start screen ------------------------------ */

export function onPlay(handler) {
  dom.playBtn.addEventListener('click', handler);
  dom.nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handler();
  });
}

/* ------------------------------ Colour picker ------------------------------ */

let chosenColor = null;

/** Builds the swatch grid on the start screen and remembers the pick. */
export function initColorPicker(colors, initial = 0) {
  if (!dom.colorPicker) return;
  chosenColor = colors[initial] || colors[0];
  dom.colorPicker.innerHTML = '';
  colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `swatch${i === initial ? ' sel' : ''}`;
    b.style.background = c;
    b.dataset.color = c;
    b.title = c;
    b.setAttribute('aria-label', `Outfit colour ${i + 1}`);
    b.addEventListener('click', () => {
      chosenColor = c;
      for (const el of dom.colorPicker.querySelectorAll('.swatch')) {
        el.classList.toggle('sel', el.dataset.color === c);
      }
    });
    dom.colorPicker.appendChild(b);
  });
}

export function getChosenColor() {
  return chosenColor;
}

/* ------------------------ Remembered names ------------------------ */

const NAME_STORE = 'island-fishing.names';
const NAME_LIMIT = 6;

/** The names this device has played under, most recent first. */
export function getNameHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(NAME_STORE) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.name === 'string' && e.name)
      .slice(0, NAME_LIMIT);
  } catch (_) {
    return [];
  }
}

function writeHistory(list) {
  try { localStorage.setItem(NAME_STORE, JSON.stringify(list.slice(0, NAME_LIMIT))); } catch (_) { /* ignore */ }
}

/**
 * Records a name as used, and notes whether the server had history for
 * it so the chip can say so next time.
 */
export function rememberName(name, restored) {
  const clean = String(name || '').trim();
  if (!clean) return;
  const list = getNameHistory().filter((e) => e.name.toLowerCase() !== clean.toLowerCase());
  const prev = getNameHistory().find((e) => e.name.toLowerCase() === clean.toLowerCase());
  list.unshift({
    name: clean,
    at: Date.now(),
    plays: ((prev && prev.plays) || 0) + 1,
    saved: !!(restored || (prev && prev.saved)),
  });
  writeHistory(list);
  renderNameHistory();
}

/** Draws the chips and the autocomplete list. */
export function renderNameHistory() {
  const list = getNameHistory();
  const chipRow = dom.nameRecent;
  const dataList = dom.nameHistory;

  if (dataList) {
    dataList.innerHTML = list.map((e) => `<option value="${escapeHtml(e.name)}"></option>`).join('');
  }
  if (!chipRow) return;

  chipRow.classList.toggle('hidden', list.length === 0);
  chipRow.innerHTML = '';
  for (const entry of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'name-chip';
    b.dataset.name = entry.name;
    const sub = entry.saved ? '<span class="nc-sub">saved</span>' : '';
    b.innerHTML = `${escapeHtml(entry.name)}${sub}`;
    b.addEventListener('click', () => {
      if (dom.nameInput) {
        dom.nameInput.value = entry.name;
        if (dom.nameInput.focus) dom.nameInput.focus();
      }
      for (const el of chipRow.querySelectorAll('.name-chip')) {
        el.classList.toggle('sel', el.dataset.name === entry.name);
      }
      if (namePickHandler) namePickHandler(entry.name);
    });
    chipRow.appendChild(b);
  }
}

let namePickHandler = null;

/** Called when a returning player taps one of their old names. */
export function onNamePicked(handler) {
  namePickHandler = handler;
}

/** Flags the name field so a blank submission is obvious. */
export function markNameInvalid(on) {
  if (dom.nameInput) dom.nameInput.classList.toggle('invalid', !!on);
}

/* ------------------------------ Music toggle ------------------------------ */

export function onMusicClick(handler) {
  if (dom.musicBtn) dom.musicBtn.addEventListener('click', handler);
}

export function setMusicMuted(on) {
  if (!dom.musicBtn) return;
  dom.musicBtn.classList.toggle('muted', !!on);
  dom.musicBtn.title = on ? 'Background music: off' : 'Background music: on';
  const icon = dom.musicBtn.querySelector('.music-icon');
  if (icon) icon.textContent = on ? '🔇' : '🔊';
}

/** Clears the name error as soon as the player starts typing. */
export function onNameInput(handler) {
  if (dom.nameInput) dom.nameInput.addEventListener('input', handler);
}

export function setStartError(msg) {
  dom.startError.textContent = msg || '';
}

export function setLoading(on) {
  dom.loading.classList.toggle('hidden', !on);
}

export function showGame(on) {
  dom.startScreen.classList.toggle('hidden', on);
  dom.hud.classList.toggle('hidden', !on);
  setLoading(false);
}

/** Fades the menu out (and back in on a failed join). */
export function fadeStartScreen(on) {
  if (!dom.startScreen) return;
  dom.startScreen.classList.toggle('fading', on);
  if (!on) dom.startScreen.classList.remove('hidden');
}

/* ------------------------------ HUD helpers ------------------------------ */

export function setOnline(count, max) {
  dom.onlineCount.textContent = count;
  if (max) dom.onlineMax.textContent = max;
}

export function setHint(text) {
  dom.hint.textContent = text || '';
  dom.hint.classList.toggle('show', !!text);
}

/* ------------------------- Floating action prompt ------------------------- */

/**
 * One context action, drawn in the world beside the player rather than in
 * a strip along the bottom of the screen. `placeActionPrompt` is called
 * every frame with the projected anchor so it tracks the character.
 */
export function showActionPrompt(on, label, alt) {
  const el = dom.actionPrompt;
  if (!el) return;
  el.classList.toggle('hidden', !on);
  el.classList.toggle('alt', !!alt);
  if (on && label !== undefined) el.textContent = label;
}

export function placeActionPrompt(screen) {
  const el = dom.actionPrompt;
  if (!el || !screen) return;
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y}px`;
  el.style.visibility = screen.visible ? 'visible' : 'hidden';
}

export function onActionPromptClick(handler) {
  if (dom.actionPrompt) dom.actionPrompt.addEventListener('click', handler);
}

export function showHook(on) {
  if (dom.hookIcon) dom.hookIcon.classList.toggle('hidden', !on);
}

/** Small floating "+item" pickup popup anchored to a screen position. */
export function pickupPopup(screen, text) {
  const div = document.createElement('div');
  div.className = 'pickup';
  div.textContent = text;
  div.style.left = `${screen.x}px`;
  div.style.top = `${screen.y}px`;
  dom.hud.appendChild(div);
  setTimeout(() => div.remove(), 1200);
}

export function placeHook(screen) {
  if (!screen || !dom.hookIcon) return;
  dom.hookIcon.style.left = `${screen.x}px`;
  dom.hookIcon.style.top = `${screen.y}px`;
}

export function onCancelClick(handler) {
  dom.mgCancel.addEventListener('click', handler);
}

/* --------------------------- Seagull struggle --------------------------- */

export function showStruggle(on, s) {
  if (!dom.struggle) return;
  dom.struggle.classList.toggle('hidden', !on);
  if (on && dom.sgLabel) {
    const touch = document.body.classList.contains('touch');
    dom.sgLabel.textContent = touch ? 'Mash the button to keep it!' : 'Mash Space to keep it!';
  }
  if (on && dom.sgTime && s) dom.sgTime.textContent = `${s.window}s`;
}

/** `progress` is how much of the struggle is won, `secondsLeft` the time. */
export function setStruggleProgress(progress, secondsLeft) {
  if (dom.sgFill) dom.sgFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  if (dom.sgTime && secondsLeft !== undefined) {
    dom.sgTime.textContent = `${Math.max(0, secondsLeft).toFixed(1)}s`;
  }
}

/* ---------------------------- Collapsible cards ---------------------------- */

/**
 * Wires the little triangle headers. Each card folds away on its own, and
 * the choice is remembered so it survives a reload.
 */
export function initInfoCards(storageKey = 'island-fishing.cards') {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) { saved = {}; }

  for (const card of document.querySelectorAll('.info-card')) {
    const key = card.dataset.card || 'card';
    const head = card.querySelector('.info-head');
    if (!head) continue;

    if (saved[key] === 'collapsed') {
      card.classList.add('collapsed');
      head.setAttribute('aria-expanded', 'false');
    }

    head.addEventListener('click', () => {
      const collapsed = card.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', String(!collapsed));
      saved[key] = collapsed ? 'collapsed' : 'open';
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (_) { /* ignore */ }
    });
  }
}

export function isCardCollapsed(key) {
  const card = document.querySelector(`.info-card[data-card="${key}"]`);
  return !!card && card.classList.contains('collapsed');
}

/** Hides the QR card entirely when there is nothing useful to show. */
export function setQrAvailable(on) {
  if (dom.qrCard) dom.qrCard.classList.toggle('unavailable', !on);
}

export function setQrUrl(text) {
  if (dom.qrUrl) dom.qrUrl.textContent = text || '';
}

export function setQrHint(text) {
  const hint = dom.qrCard && dom.qrCard.querySelector('.qr-hint');
  if (hint) hint.textContent = text;
}

export function qrCanvas() {
  return dom.qrCanvas;
}

/* ------------------------------ Minigame ------------------------------ */

export function showMinigame(on, isTouch) {
  dom.minigame.classList.toggle('hidden', !on);
  dom.reelZone.classList.toggle('hidden', !on);
  if (on) {
    dom.mgLabel.textContent = isTouch ? 'Hold bottom-right!' : 'Hold SPACE!';
  } else {
    dom.reelZone.classList.remove('active');
  }
}

export function positionMinigame(screen, indicator, targetStart, targetWidth, progress, inTarget) {
  if (screen) {
    dom.minigame.style.left = `${screen.x}px`;
    dom.minigame.style.top = `${screen.y}px`;
  }
  dom.mgIndicator.style.left = `${indicator * 100}%`;
  dom.mgTarget.style.left = `${targetStart * 100}%`;
  dom.mgTarget.style.width = `${targetWidth * 100}%`;
  dom.mgFill.style.width = `${Math.min(1, progress) * 100}%`;
  dom.mgFill.classList.toggle('in', !!inTarget);
}

/* ------------------------------ Merchant ------------------------------ */

let tradeState = null;
let tradeActionHandler = null;
let tradeMsgTimer = null;

export function onTradeClose(handler) {
  dom.tradeClose.addEventListener('click', handler);
}

export function onTradeAction(handler) {
  tradeActionHandler = handler;
}

export function showTradePanel(on) {
  dom.tradePanel.classList.toggle('hidden', !on);
  if (!on) setTradeMessage('');
}

export function setTradeMessage(msg, isError) {
  dom.tradeMsg.textContent = msg || '';
  dom.tradeMsg.classList.toggle('err', !!isError);
  if (tradeMsgTimer) clearTimeout(tradeMsgTimer);
  if (msg) {
    tradeMsgTimer = setTimeout(() => {
      dom.tradeMsg.textContent = '';
    }, 3200);
  }
}

const RARITY_LABEL = { common: 'Common', medium: 'Medium', high: 'High', rare: 'Rare' };

function swatchStyle(item) {
  const base = item.color;
  const cap = item.cap || base;
  return `background:linear-gradient(135deg, ${base} 0%, ${base} 55%, ${cap} 55%, ${cap} 100%);`;
}

function itemButton(item, state) {
  if (state.equipped[item.slot] === item.id) {
    return '<button class="trade-btn-s" disabled>Equipped</button>';
  }
  if (state.owned.includes(item.id)) {
    return `<button class="trade-btn-s ghost" data-action="equip" data-item="${item.id}">Equip</button>`;
  }
  const afford = state.coins >= item.price;
  return `<button class="trade-btn-s gold" data-action="buy" data-item="${item.id}" ${afford ? '' : 'disabled'}>🪙 ${item.price}</button>`;
}

function renderSell(state) {
  const entries = Object.entries(state.inventory || {})
    .map(([id, count]) => ({ fish: state.fishById.get(id), count }))
    .filter((e) => e.fish && e.count > 0);

  if (entries.length === 0) {
    return '<div class="trade-empty">Your cooler is empty.<br>Catch some fish and come back!</div>';
  }

  const total = entries.reduce((sum, e) => sum + state.rarityValue[e.fish.rarity] * e.count, 0);
  const order = { rare: 0, high: 1, medium: 2, common: 3 };
  entries.sort((a, b) => order[a.fish.rarity] - order[b.fish.rarity] || a.fish.name.localeCompare(b.fish.name));

  let html = `<button class="trade-sellall" data-action="sellall">Sell Everything · 🪙 ${total}</button>`;

  for (const e of entries) {
    const unit = state.rarityValue[e.fish.rarity];
    html += `
      <div class="trade-row">
        ${iconHtml(e.fish)}
        <span class="info">
          <span class="nm">${escapeHtml(e.fish.name)}</span>
          <span class="sub">${RARITY_LABEL[e.fish.rarity]} · 🪙 ${unit} each</span>
        </span>
        <span class="cnt">×${e.count}</span>
        <button class="trade-btn-s ghost" data-action="sell" data-fish="${e.fish.id}" data-qty="1">Sell 1</button>
        <button class="trade-btn-s" data-action="sell" data-fish="${e.fish.id}" data-qty="${e.count}">All</button>
      </div>`;
  }
  return html;
}

function renderShop(state) {
  const section = (title, items) => {
    let html = `<div class="trade-section">${title}</div>`;
    for (const item of items) {
      const owned = state.owned.includes(item.id);
      const equipped = state.equipped[item.slot] === item.id;
      const cls = equipped ? 'trade-row equipped' : owned ? 'trade-row owned' : 'trade-row';
      html += `
        <div class="${cls}">
          <span class="sw" style="${swatchStyle(item)}"></span>
          <span class="info">
            <span class="nm">${escapeHtml(item.name)}</span>
            <span class="sub">${escapeHtml(item.desc || '')}</span>
          </span>
          ${itemButton(item, state)}
        </div>`;
    }
    return html;
  };

  return section('Fishing Rods', state.rods) + section('Bobbers', state.bobbers);
}

export function renderTrade(state) {
  tradeState = state;
  dom.tradeCoins.textContent = state.coins;
  for (const tab of dom.tradeTabs) {
    tab.classList.toggle('active', tab.dataset.tab === state.tab);
  }
  dom.tradeBody.innerHTML = state.tab === 'shop' ? renderShop(state) : renderSell(state);
}

dom.tradeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (!tradeState) return;
    tradeState.tab = tab.dataset.tab;
    renderTrade(tradeState);
  });
});

dom.tradeBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  if (action === 'sellall') {
    if (tradeActionHandler) tradeActionHandler({ type: 'sellAll' });
  } else if (action === 'sell') {
    if (tradeActionHandler) {
      tradeActionHandler({
        type: 'sell',
        fishId: btn.dataset.fish,
        qty: Number(btn.dataset.qty) || 1,
      });
    }
  } else if (action === 'buy') {
    if (tradeActionHandler) tradeActionHandler({ type: 'buy', itemId: btn.dataset.item });
  } else if (action === 'equip') {
    if (tradeActionHandler) tradeActionHandler({ type: 'equip', itemId: btn.dataset.item });
  }
});

/* ------------------------- Fish Encyclopedia ------------------------- */

export function onCodexClick(handler) {
  if (dom.codexBtn) dom.codexBtn.addEventListener('click', handler);
}

export function onCodexClose(handler) {
  if (dom.codexClose) dom.codexClose.addEventListener('click', handler);
  if (dom.codexPanel) {
    dom.codexPanel.addEventListener('click', (e) => {
      if (e.target === dom.codexPanel) handler();
    });
  }
}

export function showCodex(on) {
  if (dom.codexPanel) dom.codexPanel.classList.toggle('hidden', !on);
}

export function isCodexOpen() {
  return !!dom.codexPanel && !dom.codexPanel.classList.contains('hidden');
}

/**
 * The gallery: every species in the game, silhouetted until it has been
 * landed at least once. Caught species light up and reveal their blurb.
 */
export function renderCodex(state) {
  const found = state.discovered || {};
  const list = state.fish || [];
  let unlocked = 0;

  const entries = list.map((f) => {
    const got = !!found[f.id];
    if (got) unlocked++;
    const art = iconHtml(f);
    return (
      `<div class="codex-entry rarity-${f.rarity} ${got ? 'found' : 'locked'}">` +
        art +
        `<div class="ce-name">${escapeHtml(f.name)}</div>` +
        `<div class="ce-rarity">${f.rarity}</div>` +
        (got
          ? `<div class="ce-desc">${escapeHtml(f.desc || '')}</div>`
          : `<div class="ce-locked">Not yet caught</div>`) +
      `</div>`
    );
  });

  if (dom.codexGrid) dom.codexGrid.innerHTML = entries.join('');
  if (dom.codexCount) dom.codexCount.textContent = String(unlocked);
  if (dom.codexTotal) dom.codexTotal.textContent = String(list.length);
  return unlocked;
}

/* ------------------------------ Notifications ------------------------------ */

export function toast(playerName, fish) {
  const div = document.createElement('div');
  div.className = `toast rarity-${fish.rarity}`;
  div.innerHTML =
    iconHtml(fish) +
    `<span class="t-body"><b>${escapeHtml(playerName)}</b> caught a ` +
    `<span class="t-name">${escapeHtml(fish.name)}</span>` +
    `<span class="t-rarity">${fish.rarity}</span></span>`;
  dom.toasts.appendChild(div);
  while (dom.toasts.children.length > 4) dom.toasts.removeChild(dom.toasts.firstChild);
  setTimeout(() => {
    div.classList.add('out');
    setTimeout(() => div.remove(), 500);
  }, 4200);
}

let catchCardTimer = null;

/**
 * The big "you caught it" card: the species art, its name, rarity and
 * sell value, popping in over the middle of the screen for a moment.
 */
export function showCatchCard(fish, opts = {}) {
  if (!fish || !dom.catchCard) return;
  const card = dom.catchCard;

  card.classList.remove('hidden', 'show', 'out', 'rarity-common', 'rarity-medium', 'rarity-high', 'rarity-rare');
  card.classList.add(`rarity-${fish.rarity}`);
  card.innerHTML =
    `<div class="cc-kicker">${opts.isNew ? 'New species!' : 'You caught'}</div>` +
    iconHtml(fish) +
    `<div class="cc-name">${escapeHtml(fish.name)}</div>` +
    `<div class="cc-meta">` +
      `<span class="cc-rarity">${fish.rarity}</span>` +
      (opts.value ? `<span class="cc-value">🪙 ${opts.value}</span>` : '') +
    `</div>`;

  /* Force a reflow so the pop animation replays on a repeat catch. */
  void card.offsetWidth;
  card.classList.add('show');

  clearTimeout(catchCardTimer);
  catchCardTimer = setTimeout(() => {
    card.classList.remove('show');
    card.classList.add('out');
    setTimeout(() => card.classList.add('hidden'), 320);
  }, opts.duration || 2600);
}

/** Plain notification toast (used for the merchant's chatter). */
export function notify(text) {
  const div = document.createElement('div');
  div.className = 'toast rarity-common notify';
  div.innerHTML = `<span class="t-emoji">🧔</span><span class="t-body">${escapeHtml(text)}</span>`;
  dom.toasts.appendChild(div);
  while (dom.toasts.children.length > 4) dom.toasts.removeChild(dom.toasts.firstChild);
  setTimeout(() => {
    div.classList.add('out');
    setTimeout(() => div.remove(), 500);
  }, 4200);
}

export function addCatchLog(playerName, fish) {
  const li = document.createElement('li');
  li.innerHTML = `${iconHtml(fish)} <b>${escapeHtml(playerName)}</b> · ${escapeHtml(fish.name)}`;
  li.style.color = `var(--rarity-${fish.rarity})`;
  dom.catchlogList.prepend(li);
  while (dom.catchlogList.children.length > 9) {
    dom.catchlogList.removeChild(dom.catchlogList.lastChild);
  }
}

/* ------------------------------------------------------------------ */
/*  Inventory                                                          */
/* ------------------------------------------------------------------ */

let invOpen = false;

export function isInventoryOpen() { return invOpen; }

export function onInventoryClick(handler) {
  if (dom.inventoryBtn) dom.inventoryBtn.addEventListener('click', handler);
}

export function onInventoryClose(handler) {
  if (dom.inventoryClose) dom.inventoryClose.addEventListener('click', handler);
  /* Clicking the dimmed backdrop, but not the card itself, closes it. */
  if (dom.inventoryPanel) {
    dom.inventoryPanel.addEventListener('click', (e) => {
      if (e.target === dom.inventoryPanel) handler();
    });
  }
}

export function showInventory(on) {
  invOpen = !!on;
  if (dom.inventoryPanel) dom.inventoryPanel.classList.toggle('hidden', !on);
}

/**
 * Draws the cooler and the shop purchases.
 *
 * `state` is { inventory, coins, capacity, carrying, fishById, owned,
 * equipped, cosmetics }.
 */
export function renderInventory(state) {
  const {
    inventory = {}, coins = 0, capacity = 50, carrying = 0,
    fishById = new Map(), owned = [], equipped = {}, cosmetics = [],
  } = state || {};

  if (dom.invCoins) dom.invCoins.textContent = String(coins);
  if (dom.invCap) dom.invCap.textContent = String(capacity);

  const used = carrying || Object.values(inventory).reduce((n, c) => n + (Number(c) || 0), 0);
  if (dom.invCount) dom.invCount.textContent = String(used);

  if (dom.invBarFill) {
    const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
    dom.invBarFill.style.width = `${pct}%`;
    dom.invBarFill.classList.toggle('warn', pct >= 75 && pct < 100);
    dom.invBarFill.classList.toggle('full', pct >= 100);
  }

  /* ---- fish and beach finds ---- */
  if (dom.invGrid) {
    const entries = Object.entries(inventory)
      .map(([id, count]) => ({ item: fishById.get(id), count: Number(count) || 0 }))
      .filter((e) => e.item && e.count > 0)
      .sort((a, b) => b.count - a.count || a.item.name.localeCompare(b.item.name));

    if (!entries.length) {
      dom.invGrid.innerHTML = '<div class="inv-empty">Your cooler is empty — go catch something!</div>';
    } else {
      dom.invGrid.innerHTML = entries.map(({ item, count }) => (
        `<div class="inv-cell" title="${escapeHtml(item.name)}">` +
          `${iconHtml(item)}` +
          `<span class="inv-qty">${count}</span>` +
          `<span class="inv-name">${escapeHtml(item.name)}</span>` +
        `</div>`
      )).join('');
    }
  }

  /* ---- shop purchases ---- */
  if (dom.invGear) {
    const byId = new Map(cosmetics.map((c) => [c.id, c]));
    const list = owned.map((id) => byId.get(id)).filter(Boolean);
    if (!list.length) {
      dom.invGear.innerHTML = '<div class="inv-empty">No shop purchases yet.</div>';
    } else {
      dom.invGear.innerHTML = list.map((c) => {
        const isOn = equipped[c.slot] === c.id;
        const swatch = c.color
          ? `<span class="gear-swatch" style="background:${c.color}"></span>`
          : '';
        return `<span class="gear-chip${isOn ? ' on' : ''}">${swatch}${escapeHtml(c.name)}` +
          `${isOn ? ' · equipped' : ''}</span>`;
      }).join('');
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Pause menu                                                         */
/* ------------------------------------------------------------------ */

let pauseOpen = false;

export function isPauseOpen() { return pauseOpen; }

/** The painted logo doubles as the pause button on touch devices. */
export function onPauseClick(handler) {
  if (dom.brand) dom.brand.addEventListener('click', handler);
}

export function onPauseClose(handler) {
  if (dom.pauseClose) dom.pauseClose.addEventListener('click', handler);
  if (dom.pausePanel) {
    dom.pausePanel.addEventListener('click', (e) => {
      if (e.target === dom.pausePanel) handler();
    });
  }
}

export function onPauseSave(handler) {
  if (dom.pauseSave) dom.pauseSave.addEventListener('click', () => handler(false));
}

export function onPauseSaveExit(handler) {
  if (dom.pauseSaveExit) dom.pauseSaveExit.addEventListener('click', () => handler(true));
}

export function showPause(on) {
  pauseOpen = !!on;
  if (dom.pausePanel) dom.pausePanel.classList.toggle('hidden', !on);
}

/** `kind` is '', 'ok' or 'err'. */
export function setPauseStatus(text, kind = '') {
  if (!dom.pauseStatus) return;
  dom.pauseStatus.textContent = text || '';
  dom.pauseStatus.classList.remove('ok', 'err');
  if (kind === 'ok') dom.pauseStatus.classList.add('ok');
  else if (kind === 'err') dom.pauseStatus.classList.add('err');
}

/** Locks the save buttons while a write is in flight. */
export function setPauseBusy(on) {
  for (const btn of [dom.pauseSave, dom.pauseSaveExit]) {
    if (!btn) continue;
    btn.disabled = !!on;
  }
}
