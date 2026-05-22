# Plan: Industrial District with Building Generator & Smoke

**Complexity:** High  
**Dependencies:** None (standalone district; cars/shuttles in plans 03–04 will target it once it exists)  
**Estimated effort:** ~5–7 hours

## Problem

The world has no industrial character. A third district type should visually distinct from the existing residential/commercial districts: heavy, soot-stained structures, large flat-roofed warehouse forms, and persistent smoke plumes rising from stacks.

## Goal

1. A new `industrialBuildingFactory` that generates warehouse/factory silhouettes instead of the existing mixed residential/commercial profiles.
2. A reusable `SmokeEmitter` component (a `Pixi.Container` with a particle pool) that can be attached to any building stack position.
3. A third district configured in `main.ts` using the new factory, placed ~120° from existing districts.

## Building Generator — Shape Language

Industrial buildings should feel:
- Wide and squat (aspect ratio 2:1 to 4:1 width:height vs residential 1:1 to 1:3)
- Flat or slightly sawtooth roofline (no pitched roofs)
- Chimneys / stacks: 1–3 narrow vertical protrusions at random roof positions
- Occasional large cylindrical tank silhouette (rendered as wide rounded rect)
- Palette: dark greys `0x1a1a1a` – `0x2e2e2e`, with rust accent `0x5c2a1a` for tanks

### New Files

```
src/planet/render/buildings/industrial/
  index.ts          — re-exports
  industrial-building.ts  — drawIndustrialBuilding(gfx, opts)
  smoke-emitter.ts        — SmokeEmitter class (Pixi.Container)
```

### `industrial-building.ts`

```ts
interface IndustrialBuildingOpts {
  width: number;
  height: number;
  stackCount: number; // 1–3
  rng: () => number;
}
function drawIndustrialBuilding(gfx: Graphics, opts: IndustrialBuildingOpts): StackPosition[]
// returns array of {x, y} for each chimney top so smoke emitters can be attached
```

### `smoke-emitter.ts`

A simple particle pool: 15–25 `Graphics` circles per emitter, pooled and recycled.  
Each particle: spawns at stack tip, drifts upward with slight random horizontal drift, fades from `alpha=0.6` to `alpha=0`, then resets.

```ts
class SmokeEmitter extends Container {
  constructor(opts: { particleCount: number; riseSpeed: number; spread: number })
  tick(dt: number): void  // call each frame
}
```

Smoke colour: near-black `0x111111` → mid-grey `0x555555` as alpha fades (interpolate via `tint`).

## District Configuration

In `main.ts`, add a third district:
```ts
const DISTRICT_3_START = 54;  // ~150° from slice 0 (adjust to avoid overlap)
const DISTRICT_3_SIZE  = 11;

districts.push({
  startSlice: DISTRICT_3_START,
  sliceCount: DISTRICT_3_SIZE,
  factory: makeIndustrialBuildingFactory({ /* taper opts */ }),
});
```

## Taper Profile

Industrial districts should be flatter (fewer tall spires at edges):
- `centerDensity: 0.75`, `edgeDensity: 0.30`
- `centerMaxH: 140`, `edgeMaxH: 80` (shorter absolute heights than residential)
- `shape: 'linear'` for an abrupt rather than organic edge

## Affected Files

- `src/planet/render/buildings/industrial/industrial-building.ts` (new)
- `src/planet/render/buildings/industrial/smoke-emitter.ts` (new)
- `src/planet/render/buildings/industrial/index.ts` (new)
- `src/main.ts`
- Possibly `src/planet/render/layer-factories.ts` if a new factory helper is needed

## Acceptance Criteria

- [ ] Industrial district visible at ~150° offset with visually distinct buildings
- [ ] At least 1 smoke emitter visible per chimney stack, animating upward
- [ ] Smoke particles recycle without memory growth (pool pattern)
- [ ] No impact on existing district rendering
- [ ] CodeScene 10.0 on all new/modified files
