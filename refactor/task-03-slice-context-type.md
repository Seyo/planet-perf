# Task 03 — Add `SliceContext` type to `buildings/` barrel

**Files:** `src/planet/render/buildings/core.ts`, `src/planet/render/buildings/index.ts`, `src/planet/render/layer-factories.ts`  
**Score before:** buildings/core.ts 7.33  
**CodeScene issue:** `placeWindow`, `drawDetailedGreebles`, `drawSimpleGreebles` — 5 arguments each (threshold = 4); Primitive Obsession 32%  
**Status:** `todo`  
**Depends on:** Task 01 (buildings/ folder), Task 02 (Tier exported)

---

## Why

Several slice-drawing helpers always receive the same four values together: `canvas`, `rng`, `sliceW`, `yBase`. Bundling them into `SliceContext` reduces argument count to ≤ 4, names a domain concept, and keeps future helpers clean without growing call sites.

Placing the type in the `buildings/` barrel makes it available to both `core.ts` internals and to `layer-factories.ts` without a cross-folder import.

---

## What to do

### Step 1 — Add `SliceContext` to `buildings/core.ts`

Near the top of the file, after the existing type declarations:

```ts
export type SliceContext = {
  canvas: BuildingCanvas;
  rng:    RNG;
  sliceW: number;
  yBase:  number;
};
```

### Step 2 — Update the three offending functions in `core.ts`

| Function | Old signature | New signature |
|---|---|---|
| `placeWindow` | `(canvas, rng, ...)` | `(ctx: SliceContext, ...)` |
| `drawDetailedGreebles` | `(canvas, rng, count, sliceW, yBase)` | `(ctx: SliceContext, count: number)` |
| `drawSimpleGreebles` | `(canvas, rng, count, sliceW, yBase)` | `(ctx: SliceContext, count: number)` |

Also convert `drawStreetLamps` if beneficial (it is borderline at 4 args with an opts object).

### Step 3 — Update `buildings/index.ts`

```ts
export type { SliceContext } from './core';
```

### Step 4 — Update call sites in `layer-factories.ts`

Build a `SliceContext` from the existing local variables before calling the helpers:

```ts
import type { SliceContext } from "./buildings";

// inside each factory closure, replace individual arg calls with:
const ctx: SliceContext = { canvas: sliceCanvas, rng, sliceW: sliceWidthPxAtZoom1, yBase };
drawDetailedGreebles(ctx, randInt(rng, 10, 20));
drawSimpleGreebles(ctx, randInt(rng, 8, 14));
drawStreetLamps(ctx);
```

### Step 5 — Verify

- `npm run build` — no errors, no implicit `any`.
- `npm run dev` — greebles, lamps, and bridges look identical.
- Run CodeScene on `buildings/core.ts` — Excess Function Arguments and Primitive Obsession indicators should improve, score above the task-02 result.

---

## Expansion benefit

Every new slice-level helper (`drawGraffiti`, `drawPuddles`, `drawFireEscape`) takes a `SliceContext` and stays under 4 args regardless of how many features are added. The pattern is consistent and immediately recognisable to anyone adding a new building category.
