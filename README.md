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
- **Merchant "David"** — sell your catch, buy 7 rods and 6 bobbers, all of which
  change how your character looks.
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

## Project layout

```
server.js              Express + Socket.io server (also mirrors the terrain maths)
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
- Fish icons live in `public/img/fish/` and are named after the species, so the game
  finds them automatically.
