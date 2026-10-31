# WIZENED WIZARDS — The Infinite Magical Hierarchy

An offline, single-player pixel-art wizard game. You start as a penniless apprentice, **invent magical components**, **forge spells** nobody has cast before, write a **Tactical Grimoire**, and watch automated duels decided by a deterministic simulation. Climb through nine named tiers and then the endless numbered Ascension.

> **SCOUT → FORGE → EQUIP → DUEL → ANALYZE → EARN → UPGRADE → ASCEND**

Everything runs locally in your browser. No accounts, no internet during play, no real money. All "Dollars" and wagers are fictional.

---

## Playing on Windows (beginner friendly)

**One time only:**

1. Install **Node.js LTS** (version 20 or newer) from <https://nodejs.org/>. Use the default options.
2. Download or clone this folder anywhere. Paths with spaces are fine (for example `C:\Users\You\My Games\Wizened Wizards`).
3. Double-click **`SETUP_WIZENED_WIZARDS.cmd`**. It installs dependencies (this needs internet once) and builds the game.

**Every time you want to play:**

- Double-click **`PLAY_WIZENED_WIZARDS.cmd`**. A small window opens, starts a local server on `127.0.0.1`, and opens the game in your default browser. Keep that window open while you play and close it when you're done.

If the game hasn't been built yet, `PLAY_WIZENED_WIZARDS.cmd` runs the setup for you automatically. Both scripts use `npm.cmd`, so PowerShell execution policies don't matter, and they print a clear message if Node.js is missing or a step fails.

**Saves** are stored automatically in your browser (IndexedDB) after every action. A rotating backup is kept, and you can **export/import** save files from *WIZARD → Saves & Settings*. Use the same browser each time, or export and import your save to switch browsers.

> **Windows note:** the launcher scripts were written for Windows (`cd /d "%~dp0"`, quoted paths, `npm.cmd`, CRLF line endings), but they were developed and tested on Linux. The Node server and the game itself were tested; **the `.cmd` files have not been run on a real Windows machine.** If anything goes wrong, the manual commands below do the same thing.

### Manual commands (any OS)

```bash
npm install
```

```bash
npm run build
```

```bash
npm start
```

Then open the printed address (default `http://127.0.0.1:4173/`). Use `node server/serve.mjs --open` to open the browser automatically.

Development mode with hot reload: `npm run dev`.

---

## How to play

The **Apprentice's Path** scroll (bottom right) walks you through the first half-hour.

| Screen | What you do there |
| --- | --- |
| **DUEL** | Pick an opponent, **scout** their spellbook, tactics, equipment and adaptation history, check simulated odds, optionally wager on yourself, and fight. Watch at 1×/2×/4×, pause (Space), replay, or skip. After each duel you get a **battle analysis** explaining what went wrong (shields absorbing your damage, dodged projectiles, interrupts, mana starvation, enemy healing, and so on). Contracts, sparring, tutoring and replays live here too. |
| **FORGE** | **Component Invention**: fuse, extract, refine, stabilize, amplify, mutate, split. **Spell Laboratory**: combine an essence, modifiers and a catalyst with a form, delivery, behavior, conditional and trigger, see the compiled mechanics live, and **counter-test** the spell against a specific opponent before forging it. **Research & Laboratory** upgrades. **Archive** with search, sort, favorites, ancestry trees, rebuilding and spell **evolution**. |
| **MARKET** | Buy and sell materials, equipment and components with dynamic prices and 30-day charts. The **Betting Hall** covers exhibition bouts, tournament matches and outright winners. **Ledger** lists every transaction. |
| **ASCEND** | Promotion requirements and the **Rank Guardian** dossier, tournaments with live brackets, rankings, the full hierarchy, respect privileges and titles, rivals, and the news chronicle. |
| **WIZARD** | Profile and derived combat stats, spellbook, **Tactical Grimoire** editor and presets, equipment and enchanting, attribute training and skill tree, achievements, career history, saves and settings. |

**Tips:** the first guardian, Warden Bramwell Ashgrove, turtles behind earthen wards. Read his weakness, research *Piercing* or *Lance*, invent a component, forge a counter, and add an "Enemy is shielded → piercing" rule.

---

## Architecture

```
src/
  sim/            Authoritative, engine-independent simulation (pure TypeScript, deterministic)
    rng.ts          Seeded RNG and stable hashing
    types.ts        Typed data model (materials, components, spell grammar, tactics, wizards)
    data/           Materials (40), equipment (45), skills (18)
    genetics.ts     ARCANE GENETICS: fuse/extract/refine/stabilize/amplify/mutate/split, traits, ancestry
    compiler.ts     Spell compiler: recipe → mechanics, mana budget, caps, visuals, ids, evolution
    combat.ts       Fixed-timestep duel engine, statuses, tactics AI, reports, insights, odds
    tactics.ts      Grimoire levels, presets, validation
    npc.ts          NPC generation, builds, legal adaptation (counter-rules, gear, inventions, loadout search)
    guardians.ts    9 hand-designed guardians plus procedural ascension guardians
    hierarchy.ts    Tiers, divisions, Elo, promotion requirements, respect privileges
    world.ts        World creation (~800 NPCs), event-driven background sim, tournaments, exhibitions
    tournament.ts   Seeding, brackets, deterministic settlement, prizes
    market.ts       Supply and demand pricing, NPC activity, events, component valuation
    economy.ts      Idempotent ledger, betting, rewards, contracts
    game.ts         All player actions (the only API the UI uses to change state)
    save.ts         Serialization, checksum, validation, schema migrations
  persist/db.ts   IndexedDB autosave and rotating backup
  state/store.ts  Zustand store (routes UI intents to sim actions, autosaves)
  phaser/         BattleScene: replays the simulation timeline with procedural pixel effects
  art/            Procedural pixel art (wizards, particles, icons, arenas) and WebAudio sound effects
  ui/             React screens and components
server/serve.mjs  Zero-dependency local production server (127.0.0.1 only)
tests/            Vitest unit, integration and balance tests
e2e/              Playwright end-to-end test (runs with all non-local network blocked)
```

**Determinism.** A duel is a pure function of `(build A, build B, seed)`. Phaser only *replays* the recorded timeline (frames and events), so animation never decides an outcome. Replays store compact build specs plus the seed and re-simulate identically. Bets and tournaments lock builds and commit seeds before they resolve, so outcomes can't be rerolled by reloading.

**Spell visuals** are derived from the mechanics: the element sets palette and particle type; the form sets geometry (bolt, lance streak, orb, nova ring, storm cloud, ward bubble, mend leaves, hex sigil); the delivery sets travel (projectile, beam, instant flash, ground rune, delayed sky-strike); the behavior sets motion (homing arc, chaining arcs, splitting into three, piercing pass-through, lingering field, orbiting launch); dominant traits add secondary effects; instability makes projectiles wobble.

### Tests

```bash
npm test
```

```bash
npx playwright test
```

`npm test` runs 52 Vitest tests covering synthesis, ancestry, bounded recursion, compilation and invalid recipes, combat determinism, combos (frost+shatter, storm conductivity, poison, reflection, interrupts, echo), tactics, NPC adaptation, promotion, tournaments, economy and arbitrage, betting settlement, save/load, tampering, migrations, offline source checks, endless-hierarchy population, and **balance round-robins** at tiers 0/2/4/6/8 plus a bot playthrough that must earn the first promotion. `npx playwright test` needs a build first (`npm run build`); it plays the opening loop in Chromium with every non-local request blocked.

---

## Implementation status (honest)

**Working and verified by tests or in-browser runs:**

- **Genetics.** Multi-stage component invention with seven operations, inherited and emergent traits, ancestry trees, strain and generation limits, and an incompatibility rule.
- **Compiler.** Billions of theoretical recipes, a mana-value budget, anti-exploit caps, mechanical-equivalence ids, and branching evolution with trade-offs.
- **Combat.** Deterministic duels with shields (capped, decaying), reflection, dodging, interrupts, chill → freeze (with immunity windows), stagger, poison and burn, lingering fields, echo, backlash, and arena collapse to guarantee an ending.
- **Tactical Grimoire.** 16 conditions and 14 actions, unlocked across four levels, with presets and in-arena decision banners.
- **NPCs.** About 800 persistent wizards with personalities who invent, buy gear, get promoted or demoted, win tournaments, and adapt to you legally (no stat bonuses).
- **Ranks and promotion.** Nine named tiers, each with three divisions, plus numbered ascension. Promotion requires rating, qualifying wins, a tournament final, inventions, custom spells, invention depth and a guardian.
- **Tournaments and betting.** Tournaments of 4, 8, 16 and 32 wizards plus seasonal finals. Betting on matches, exhibitions, outright winners and yourself, settled once.
- **Economy and upgrades.** Dynamic market with charts and events; contracts and recovery options. Upgrades cover laboratory, spellbook, grimoire, research, attributes, skills and enchanting.
- **Persistence.** IndexedDB saves with backup, export/import, checksum and migrations.
- **Offline.** All fonts and art are bundled or generated, and there are no network calls.

**Known limitations / not yet done:**

- **Balance.**
  - Duel lengths now sit in a 49–88s median band across tiers.
  - Procedurally generated NPCs still vary in quality, so the strongest of a 12-wizard sample can go undefeated in the balance round-robin.
  - Later tiers (beyond the first two promotions) have been checked by simulation and unit tests, not by long hand-played sessions.
- **Visuals.** The art is procedural pixel art made in code; there are no hand-drawn sprite sheets. Wizards have idle, cast and hurt poses, but no walk-cycle animation.
- **Sound.** Synthesized sound effects only; there is no music.
- **Mobile.** The UI is designed for desktop screens.
- **Windows.** The `.cmd` launchers are untested on real Windows hardware (see the note above).
