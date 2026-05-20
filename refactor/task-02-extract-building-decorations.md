# Task 02 — Extract `drawBuildingDecorations` into `buildings/decorations.ts`

**File:** `src/planet/render/buildings/core.ts` (was `building-v2.ts`, moved in task 01)  
**Score before:** 7.33 (Yellow)  
**CodeScene issue:** `drawBuilding` cc=25, bumps=3  
**Status:** `todo`  
**Depends on:** Task 01 (buildings/ folder must exist)

---

## Why

`drawBuilding` (lines 607–686 in the original, same content in `core.ts`) has cyclomatic complexity of 25 because every decoration decision (neon trim, chamfer neon, diagonal accents, landing pad, antennae, shop front) is stacked into one function. Each is an independent concern gated by its own probability — they only share `canvas`, `rng`, `tiers`, and `opts`.

Extracting them into a dedicated file drops `drawBuilding` to cc ≈ 6–8, and places the decoration logic somewhere future building archetypes can call selectively or skip entirely.

---

## What to do

### Step 1 — Create `src/planet/render/buildings/decorations.ts`

Move lines **647–685** of `core.ts` (everything after `drawNeonTrim`, through the shop front block) into this file:

```ts
import { type RNG, chance } from "../rng";
import { type BuildingCanvas, type BuildingOpts, type BuildingRect } from "./core";

// Tier is internal to core.ts — either export it from core or re-declare a minimal shape here.
// Prefer exporting Tier from core.ts to avoid duplication.

export function drawBuildingDecorations(
  canvas: BuildingCanvas,
  rng: RNG,
  tiers: Tier[],
  topTier: Tier,
  building: BuildingRect,
  yBase: number,
  opts: BuildingOpts,
  accent: "warm" | "cool",
): void {
  // chamfer neon loop
  // diagonal accent loop
  // landing pad
  // antennae
  // shop front
}
```

**Note on `Tier`:** It is currently a private type in `core.ts`. Export it from `core.ts` before this step so `decorations.ts` can import it without duplicating the definition.

### Step 2 — Update `core.ts`

1. Export `Tier` from `core.ts`.
2. Import `drawBuildingDecorations` from `./decorations`.
3. In `drawBuilding`, replace the extracted lines with:

```ts
drawNeonTrim(canvas, rng, tiers, accent, opts);

const topTier = tiers.reduce((a, b) => (a.top < b.top ? a : b));
drawBuildingDecorations(canvas, rng, tiers, topTier, building, yBase, opts, accent);
```

### Step 3 — Update `index.ts` barrel

```ts
export type { Tier } from './core';   // add this line
export { drawBuildingDecorations } from './decorations';
```

`drawBuildingDecorations` does not need to be public yet, but exporting it costs nothing and lets future factory code call it directly.

### Step 4 — Verify

- `npm run build` — no errors.
- `npm run dev` — buildings must look identical. Spot-check: antennae on tall buildings, shop fronts at street level, landing pads on qualifying buildings, neon trim, chamfer neon.
- Run CodeScene on `buildings/core.ts` — score must improve above 7.33.
- Run CodeScene on `buildings/decorations.ts` — expect a clean score (new file, low complexity).

---

## Expansion benefit

New archetypes (cave spires, ruins) call `drawBuildingDecorations` with a custom opts subset or omit it entirely for a bare silhouette. The separation makes the opt-in explicit rather than buried in conditionals.
