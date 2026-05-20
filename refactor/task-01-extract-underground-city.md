# Task 01 — Create `render/buildings/` barrel and extract `drawUndergroundCity`

**Files:** `src/planet/render/building-v2.ts` → `src/planet/render/buildings/`, `src/planet/render/layer-factories.ts`  
**Score before:** layer-factories.ts 7.52 (Yellow)  
**CodeScene issue:** `makeBackCityFactory` — cc=18, 174 lines, nesting depth=5, bumps=6  
**Status:** `done`

---

## Why

Two things happen together here because they are the same move:
1. `building-v2.ts` is the largest file (812 lines) and will keep growing as new building types are added. Giving it a folder now makes each future addition a new file rather than more lines.
2. `makeBackCityFactory` inlines ~90 lines of underground-city logic that is a completely separate concern. Extracting it drops bumps from 6 → ~2 and nesting depth from 5 → ~3.

Doing both in one task means only one import-path change in `layer-factories.ts`.

---

## What to do

### Step 1 — Create `src/planet/render/buildings/` and move the core file

```
src/planet/render/buildings/
  core.ts        ← rename/move of building-v2.ts (no content changes yet)
  index.ts       ← barrel
```

`index.ts` re-exports the full public surface of `core.ts`:

```ts
export type {
  BuildingCanvas, BuildingTheme, BuildingRect, BuildingOpts,
  WindowOpts, Archetype, BodyTint, Animator,
} from './core';
export {
  FRONT_THEME, BACK_THEME,
  makeCanvas, commitCanvas, registerFlickerAnimators,
  setLightColors,
  drawBuilding, drawStreetLamps, drawBridge,
  drawDetailedGreebles, drawSimpleGreebles,
} from './core';
```

Update `layer-factories.ts` — change the single import line:
```ts
// before
import { ..., } from "./building-v2";
// after
import { ..., } from "./buildings";
```

`layer-factories.ts` itself stays in `render/` for now (it will gain its own folder in a later task if needed).

### Step 2 — Create `src/planet/render/buildings/underground.ts`

Extract lines ~219–308 from `layer-factories.ts` into this new file:

```ts
import { Container } from "pixi.js";
import { type RNG, chance, randInt } from "../rng";
import { makeCanvas, commitCanvas, drawBuilding, type BuildingCanvas, type BuildingTheme, type BuildingRect } from "./core";

export function drawUndergroundCity(
  root: Container,
  rng: RNG,
  built: BuildingRect[],
  yBase: number,
  dim: number,           // undergroundDim 0–1
): void {
  // ugTheme, ugCanvas, building loop, bridge loop, commitCanvas, flip
}
```

Add it to `index.ts`:
```ts
export { drawUndergroundCity } from './underground';
```

### Step 3 — Shrink `makeBackCityFactory` in `layer-factories.ts`

Replace the `if (underground)` block with:
```ts
if (underground) {
  const ugRng = mulberry32(hashSeed(i, salt + 99999));
  drawUndergroundCity(root, ugRng, built, yBase, undergroundDim);
}
```

Import `drawUndergroundCity` from `"./buildings"`.

### Step 4 — Verify

- `npm run build` — no errors, all imports resolve.
- `npm run dev` — underground buildings look identical (mirrored, dimmed, rare lit windows).
- Run CodeScene on `layer-factories.ts` — score should improve above 7.52.
- Run CodeScene on `buildings/core.ts` — score should match the old `building-v2.ts` score of 7.33 (unchanged content).

---

## Expansion benefit

Every new building category (cave ruins, floating platforms, industrial zone) gets its own file inside `render/buildings/` and a one-line re-export in `index.ts`. `layer-factories.ts` stays focused on wiring up factories, not on drawing primitives.
