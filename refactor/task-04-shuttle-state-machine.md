# Task 04 — Create `render/actors/shuttle/` barrel and split `Shuttle.update`

**Files:** `src/planet/render/shuttle-layer.ts` → `src/planet/render/actors/shuttle/`  
**Score before:** shuttle-layer.ts 8.51 (Yellow)  
**CodeScene issues:** `Shuttle.update` cc=18, bumps=3; `ShuttleLayer.update` cc=11, bumps=4  
**Status:** `todo`

---

## Why

Two things happen together here for the same reason as task 01: the file move and the refactor are one migration.

`shuttle-layer.ts` is the only actor today but establishes the pattern for every actor to come (drones, cars, satellites). Giving it a folder now means each future actor gets its own folder with identical structure. The state machine split is the most impactful single refactor in the file — splitting `Shuttle.update` into per-phase handlers removes all three bumps and drops cc from 18 to ~3 per handler.

---

## What to do

### Step 1 — Create `src/planet/render/actors/shuttle/` folder

```
src/planet/render/actors/
  index.ts              ← actors barrel (re-exports ShuttleLayer for now)
  shuttle/
    index.ts            ← shuttle barrel (re-exports ShuttleLayer)
    shuttle-layer.ts    ← move of original shuttle-layer.ts (no content changes yet)
```

`shuttle/index.ts`:
```ts
export { ShuttleLayer } from './shuttle-layer';
export type { } from './shuttle-layer';   // add any public types here as they emerge
```

`actors/index.ts`:
```ts
export { ShuttleLayer } from './shuttle';
```

Update imports in `src/main.ts` and anywhere else that imports from `shuttle-layer.ts`:
```ts
// before
import { ShuttleLayer } from './planet/render/shuttle-layer';
// after
import { ShuttleLayer } from './planet/render/actors';
```

### Step 2 — Split `Shuttle.update` into per-phase private methods

Inside `shuttle/shuttle-layer.ts`, add three private methods to the `Shuttle` class:

#### `private updateGrounded(dt: number): void`
Lines 328–332 — decrement `waitTicks`, call `launch()` when ready.

#### `private updateDying(dt: number): void`
Lines 334–341 — shrink `dyingTrailLen`, teleport and call `startWait()` when trail expires.

#### `private updateFlying(dt: number): void`
Lines 343–392 — PD control, speed targeting, phase transitions, trail recording, body rotation.  
At ~50 lines this stays under the 70-line threshold with cc ≈ 12.

#### Rewrite `update` as a pure dispatcher:

```ts
update(dt: number): void {
  if (this.phase === 'grounded') { this.updateGrounded(dt); return; }
  if (this.phase === 'dying')    { this.updateDying(dt);    return; }
  this.updateFlying(dt);
}
```

### Step 3 — Extract `tickExplosions` from `ShuttleLayer.update`

`ShuttleLayer.update` (lines 486–519, cc=11, bumps=4) mixes shuttle ticking with explosion/debris ticking. Extract:

```ts
private tickExplosions(tick: number): void {
  // iterate this.explosions and this.allDebris — everything from ~line 499 onwards
}
```

Call it from `update` after the shuttle loop.

### Step 4 — Verify

- `npm run build` — no errors.
- `npm run dev` — shuttles must: take off, cruise, descend, wait on ground, and occasionally explode with debris trails — all identical to before.
- Run CodeScene on `actors/shuttle/shuttle-layer.ts` — score should improve above 8.51.

---

## Expansion benefit

Adding a `DroneLayer` means creating `render/actors/drone/` with the same folder shape, re-exporting from `render/actors/index.ts`. The three-phase update pattern (`grounded` / `flying` / `dying`) is immediately recognisable as the actor lifecycle convention.
