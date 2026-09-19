/*
 * Supabase-backed player progression.
 *
 * The server talks to Supabase over its REST API with the service-role
 * key, read from the environment and never committed. The players table
 * has row-level security on and no policies, so that key is the only way
 * in — the publishable key that ships to browsers can read nothing.
 *
 * If the key is missing the whole module goes quiet and the game carries
 * on with in-memory progress only, so a missing config can never stop
 * anyone playing.
 */

const path = require('path');
const fs = require('fs');

/**
 * Reads a .env file into process.env, if one is sitting next to this module.
 *
 * Node has no built-in support for this before 20.6, and `--env-file` aborts
 * startup when the file is absent — which would break hosts that inject real
 * environment variables instead of shipping a file. So the parse is done here:
 * variables already present in the environment always win, a missing file is
 * a no-op, and a malformed line is skipped rather than fatal.
 */
function loadDotEnv(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return; // no .env — entirely normal, especially in production
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    /* Strip one layer of matching quotes, as dotenv does. */
    if (value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
         (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(__dirname, '.env'));

const URL_BASE = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const KEY = String(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '').trim();
const TABLE = 'players';

const enabled = !!(URL_BASE && KEY);

/* Say plainly at boot whether progress will stick. A silent "off" is the
   difference between a working game and one that quietly forgets everyone. */
if (enabled) {
  console.log(`  → Persistence: on (${URL_BASE})`);
} else {
  const missing = [];
  if (!URL_BASE) missing.push('SUPABASE_URL');
  if (!KEY) missing.push('SUPABASE_SERVICE_KEY');
  console.log(`  → Persistence: off (${missing.join(' + ')} not set) — progress lasts this session only`);
}

function headers(extra) {
  return Object.assign({
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

/** Names are matched case- and space-insensitively. */
function nameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32);
}

/**
 * Looks up one player.
 *
 * Returns `{ ok, row, error }`. The distinction between "no row" and "could
 * not ask" is load-bearing: an empty result means a brand new angler and is
 * safe to overwrite, whereas a failed lookup means we do not know what is
 * there — and writing the fresh-start state would destroy a real player's
 * history. Callers must not save when `ok` is false.
 */
async function loadPlayer(name) {
  if (!enabled) return { ok: true, row: null };
  const key = nameKey(name);
  if (!key) return { ok: true, row: null };
  try {
    const url = `${URL_BASE}/rest/v1/${TABLE}?name_key=eq.${encodeURIComponent(key)}&select=*&limit=1`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      console.warn(`[db] load failed: ${res.status} ${res.statusText}`);
      return { ok: false, row: null, error: `${res.status} ${res.statusText}` };
    }
    const rows = await res.json();
    return { ok: true, row: Array.isArray(rows) && rows.length ? rows[0] : null };
  } catch (e) {
    console.warn(`[db] load error: ${e.message}`);
    return { ok: false, row: null, error: e.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Sanitisers                                                         */
/*                                                                     */
/*  These run on both the way out and the way back in. Outbound they    */
/*  stop a NaN from ever reaching the database; inbound they stop a     */
/*  hand-edited or half-written row from poisoning a live session (a    */
/*  bad count used to be able to turn a player's coins into NaN).       */
/* ------------------------------------------------------------------ */

/** A whole number, never negative, never NaN. */
function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** { id: count } with every non-positive / non-numeric entry dropped. */
function toCountMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const n = toCount(v);
    if (n > 0) out[String(k)] = n;
  }
  return out;
}

/** { id: true } — the encyclopedia. Only truthy entries survive. */
function toFlagMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v) out[String(k)] = true;
  }
  return out;
}

/** A list of non-empty string ids, or null when the input was not a list. */
function toStringList(value) {
  if (!Array.isArray(value)) return null;
  return value.filter((v) => typeof v === 'string' && v);
}

/** { slot: itemId } — the equipped cosmetics, or null when not a map. */
function toChoiceMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string' && v) out[String(k)] = v;
  }
  return out;
}

/** Upserts the row, keyed on the name. Returns true on success. */
async function savePlayer(p) {
  if (!enabled || !p) return false;
  const key = nameKey(p.name);
  if (!key) return false;

  const row = {
    name_key: key,
    name: String(p.name).slice(0, 32),
    color: typeof p.color === 'string' && p.color ? p.color : null,
    coins: toCount(p.coins),
    inventory: toCountMap(p.inventory),
    discovered: toFlagMap(p.discovered),
    owned: toStringList(p.owned) || [],
    equipped: toChoiceMap(p.equipped) || {},
    casts: toCount(p.casts),
    rare_catches: toCount(p.rareCatches),
  };

  try {
    const res = await fetch(`${URL_BASE}/rest/v1/${TABLE}?on_conflict=name_key`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      console.warn(`[db] save failed: ${res.status} ${res.statusText}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[db] save error: ${e.message}`);
    return false;
  }
}

/** Copies a stored row onto a live player object. Returns false if unusable. */
function applyRow(p, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (!p) return false;

  p.coins = toCount(row.coins);
  p.inventory = toCountMap(row.inventory);
  p.discovered = toFlagMap(row.discovered);
  p.casts = toCount(row.casts);
  p.rareCatches = toCount(row.rare_catches);

  /* A player must never be left with no rod, so an empty or missing owned
     list falls back to whatever the fresh spawn already had. */
  const owned = toStringList(row.owned);
  if (owned && owned.length) p.owned = owned;

  const equipped = toChoiceMap(row.equipped);
  if (equipped && Object.keys(equipped).length) p.equipped = equipped;

  if (typeof row.color === 'string' && row.color) p.color = row.color;
  return true;
}

module.exports = {
  enabled, nameKey, loadPlayer, savePlayer, applyRow,
  /* exported for the test suite */
  toCount, toCountMap, toFlagMap, toStringList, toChoiceMap,
};
