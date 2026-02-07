Always use conventional commits (e.g. `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `style:`, `perf:`, `test:`).

## Project Overview

"Lisa's Fun Games" — a collection of browser-based games built with vanilla HTML/CSS/JS. Runs via `file://` protocol (no build step, no bundler, no ES modules).

## File Structure

```
index.html / index.css          — Home page with game card grid
hammer-head.html / .css / .js   — Whack-a-gnome game
dungeon-doom.html / .css / .js  — Side-scrolling dungeon runner
epic-bot-battles.html / .css / .js — Robot sword-fighting game
shared/
  common.css   — Base reset, title screen, difficulty buttons, HUD, game-over, controls, animations
  rng.js       — SharedRNG: mulberry32(), dateSeed(), getTodayStr()
  audio.js     — SharedAudio: getAudioCtx(), unlockAudio(), initMute()
  music.js     — createMusic(config) factory → { start, stop, isPlaying }
achal-anna.png — Nightmare difficulty avatar
pic.jpeg       — Profile picture
```

## Architecture Conventions

- Each game is a self-contained trio: `.html` (slim shell) + `.css` (game-specific styles) + `.js` (all game logic)
- Shared modules use IIFE pattern exposed via `window.*` (no ES modules, for file:// compatibility)
- Plain `<script src>` tags, loaded in order: rng.js → audio.js → music.js → game.js
- Games use daily seeded RNG for deterministic runs per difficulty
- Each game has 4 difficulty levels: Easy, Normal, Hard, Nightmare (Nightmare uses `achal-anna.png` avatar)
- Mute state shared across games via localStorage key `fun-games-muted`

## Epic Bot Battles — Key Systems

- **Sword types:** wooden (1.0 dmg), fire (0.5 + burn DOT), lightning (0.5 + shock 4x next hit), ice (0.5 + freeze on 2 hits)
- **Enemy swords:** Match their resistance type, apply status effects to the player
- **Player resistance:** Matches chosen sword element; resists that element's status effect
- **No-repeat enemies:** Fisher-Yates shuffle ensures unique enemy types per round
- **Parry:** PARRY_WINDOW=0.2s with PARRY_ACTIVE=0.12s active subset; successful parry grants riposte bonus (PARRY_RIPOSTE_BONUS=0.25 for 0.6s)
- **Nightmare final round:** 2 AI bots with different sword types, shared HP pool
- **Swing animation:** 0° → 90° forward arc; hit registers at 65% through swing
- **Testing:** `?round=N` query param skips to round N (e.g. `?round=4` for final round)
