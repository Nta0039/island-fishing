# 🏝️ Island Fishing

A 3D cross-platform **multiplayer** island fishing game that runs in the browser.
Built with **Three.js** and **Socket.io** — up to **10 players** on one island at
the same time.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Nta0039/island-fishing)

---

## What's in the game

- **20 fish species** across four rarity tiers, each with hand-painted pixel-art icons
  and its own encyclopedia entry. Beginner luck guarantees a top-tier catch by your
  fifth cast.
- **Full fishing loop** — cast, wait for the bite, then hold to reel a minigame
  indicator inside the target zone. Harder fish need the line held longer.
- **Merchant "David"** — sell your catch, buy 8 rods and 6 bobbers, all of which
  change how your character looks. The shop shows a live 3D preview of your angler,
  and clicking an item tries it on before you buy.
- **Fish Encyclopedia** — a gallery that silhouettes every species until you land one.
- **Walkable island** — sandy beaches all the way round, a winding trail, a loop path
  around the central green, and a pier with a sunshade platform and moored speedboats.
- **Climbable lighthouse** — enter the ground floor, spiral up the internal ramp, and
  step out onto the observation deck. A working telescope lets you pan and tilt across
  the horizon.
- **Living island** — seagulls that flock, land and fold their wings, crabs scuttling on
  the sand, ships, aircraft, whales and dolphins offshore, and coral reefs below the waves.
- **Beach loungers** with umbrellas — lie back and sunbathe, with your rod planted in the sand.
- **Works on PC and mobile** — WASD or arrow keys on desktop, virtual joystick on touch.
- **English & 简体中文** — an EN / 中文 switch on the naming screen (and in the
  in-game top bar) re-translates the whole UI instantly, with no reload. The
  game starts in English; prompts name the keyboard key on PC and the on-screen
  button on touch.

---

## Running it locally

You only need **Node.js 18 or newer**.

```bash
npm install
npm start
```

Then open <http://localhost:3000> in your browser.

To let someone else on your network play, share your machine's local IP address —
they can open `http://YOUR-IP:3000`.

---

## Deploying it online (free)

The game needs a real Node.js server for the multiplayer, so **GitHub Pages will not
work** — Pages only serves static files. Use a free Node host instead.

### Render (free tier)

1. Push this repo to GitHub.
2. Go to <https://render.com> and sign up with your GitHub account.
3. Click **New → Web Service**, then pick this repository.
4. Render reads `render.yaml` automatically. If asked, use:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plan:** Free
5. Click **Create Web Service** and wait for the first deploy.
6. Share the URL Render gives you (something like
   `https://island-fishing.onrender.com`) with your classmates.

> **Note on the free tier:** the server sleeps after about 15 minutes with nobody on it.
> The next visit takes roughly 30–60 seconds to wake up, then it is instant again.
> Opening the link a minute before class avoids the wait.

### Any other Node host

Railway, Fly.io, Glitch and Heroku all work the same way — the only requirements are
the `npm install` build step and `npm start` to run it. The port comes from the `PORT`
environment variable, which every host sets for you.

---

## Remembering players (Supabase, optional)

Out of the box the game keeps progress in memory, so it lasts for the session but not
overnight. To make catch, coins and encyclopedia entries stick to a **name**, point the
server at a Supabase project.

**1. Create the table.** In the Supabase dashboard open **SQL Editor** and run:

```sql
create table if not exists public.players (
  name_key     text primary key,
  name         text not null,
  color        text,
  coins        integer not null default 0,
  inventory    jsonb   not null default '{}'::jsonb,
  discovered   jsonb   not null default '{}'::jsonb,
  owned        jsonb   not null default '[]'::jsonb,
  equipped     jsonb   not null default '{}'::jsonb,
  casts        integer not null default 0,
  rare_catches integer not null default 0,
  gull_seen    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.players enable row level security;
-- Deliberately no policies: only the service_role key can touch this table.
```

**2. Get the two values.** Dashboard → **Settings → API**:
- **Project URL** → `SUPABASE_URL`
- **service_role** secret → `SUPABASE_SERVICE_KEY` (click *Reveal*)

**3. Put them in the environment.**

Locally, copy `.env.example` to `.env` and fill it in:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
```

The server reads `.env` itself on startup — no extra package needed. Real environment
variables always take priority, so the same code works locally and on a host.

On Render: **your service → Environment → Add Environment Variable**, add both, save.

> **Keep the service_role key server-side.** It bypasses row level security, so it must
> never appear in `public/` or anywhere the browser can download. `.env` is gitignored.

**4. That is it.** Names are matched case- and space-insensitively, so `Big Mike` and
`big mike` are the same angler. The browser also remembers the names used on that device
and offers them as one-tap chips on the start screen, so a returning player just taps
their name and their island is waiting.

The server prints which mode it started in, so a misconfiguration is never silent:

```
  → Persistence: on (https://your-project.supabase.co)
  → Persistence: off (SUPABASE_SERVICE_KEY not set) — progress lasts this session only
```

### What is saved, and when

Everything that counts as progress is written back under the player's name:

| Saved | Notes |
| --- | --- |
| `inventory` | every fish and beach find in the cooler |
| `discovered` | the encyclopedia — a species stays unlocked forever |
| `coins` | current balance |
| `owned` / `equipped` | rods, bobbers and which ones are in use |
| `casts` / `rare_catches` | lifetime totals |
| `gull_seen` | whether the beginner seagull tug-of-war has already fired |

Writes are batched rather than fired on every action, so a busy island does not hammer
the API:

- **On a change** — a landed fish, a sale, a purchase, an equip, a beach find — the
  player is marked dirty and written within ~2.5 s.
- **On leaving** — a disconnect flushes immediately, but only if something actually
  changed.
- **Every 20 s** — a sweep writes anyone still dirty. This is the safety net for hosts
  that suspend or restart the process without a clean disconnect (Render does this on
  every deploy, and whenever a free instance idles out).
- **On shutdown** — `SIGTERM`/`SIGINT` flush anything outstanding.

Two things are deliberately protected:

- If the **login lookup fails** (Supabase briefly unreachable), the server cannot tell a
  new name from an existing one, so it refuses to write for that session rather than
  overwrite a real history with a blank one. The player is told in-game, and their data
  is still there next time.
- Rows are **sanitised in both directions**, so a corrupt or hand-edited value can never
  turn a live player's coins into `NaN`.

If the two variables are missing the game simply runs without persistence — it is never
blocked by a missing key.

---

## Project layout

```
server.js              Express + Socket.io server (also mirrors the terrain maths)
db.js                  Optional Supabase persistence (no-op without env vars)
public/
  index.html           HUD, menus and overlays
  css/style.css        All UI styling
  js/
    main.js            Game loop, networking, camera, interactions
    world.js           Terrain, island, lighthouse, pier, paths, props
    avatar.js          Player model and animation
    reef.js            Coral gardens and fish
    seagulls.js        Flock AI and idle animations
    collectibles.js    Beach finds (crabs, shells, coconuts…)
    marinelife.js      Whales and dolphins
    ships.js           Distant shipping
    aircraft.js        Planes overhead
    fishing.js         Cast and reeling minigame
    shopPreview.js     Live 3D try-on model shown beside the shop
    i18n.js            English / Simplified Chinese dictionary + helpers
    input.js           Keyboard, mouse and touch
    ui.js              DOM wiring
    toon.js            Toon shading helpers
    postfx.js          Pencil-sketch edge pass
    vfx.js             Rare-catch effects
  img/
    title.png          Painted title art
    fish/*.png         One icon per species, named after the species
```

---

## Notes

- Multiplayer is capped at **10 players** (see `MAX_PLAYERS` in `server.js`).
- Players who drop out and reconnect **resume exactly where they were**, keeping their
  catch, coins and encyclopedia progress.
- With Supabase configured, progress also **survives a full restart** and is tied to the
  name the player types. Without it, progress still lasts the whole session.
- The browser remembers names used on that device, so returning players get one-tap
  chips instead of retyping.
- Fish icons live in `public/img/fish/` and are named after the species, so the game
  finds them automatically.
