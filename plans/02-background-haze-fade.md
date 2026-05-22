# Plan: Background Layer Count & Haze/Ground Alpha

**Complexity:** Simple  
**Dependencies:** None  
**Estimated effort:** ~1 hour

## Problem

- `BACK_LAYER_COUNT = 35` is more layers than needed for the parallax effect and costs GPU fill-rate.
- Far background haze is too subtle.
- Ground alpha doesn't fade — the dirt layer cuts off hard on the last few parallax layers instead of dissolving into nothing.

## Goal

1. Reduce `BACK_LAYER_COUNT` from 35 → 25.
2. Increase haze opacity on the far/back layers.
3. Fade ground alpha to 0 on the rearmost ~5 layers (smoothstep or linear ramp).

## Implementation

### `src/main.ts`

**Layer count:**
```ts
const BACK_LAYER_COUNT = 25; // was 35
```

**Haze boost:** Increase `FAR_HAZE_BOOST` or raise the base alpha passed to `makeHazeOverlay()` for layers beyond the midpoint. E.g. ramp from `0.30` at mid to `0.50` at furthest.

**Ground fade:** When constructing the back-layer loop, compute an `alpha` for the ground section per layer:
```ts
const groundAlpha = i < BACK_LAYER_COUNT - 5
  ? 1.0
  : 1.0 - (i - (BACK_LAYER_COUNT - 5)) / 5; // linear fade over last 5 layers
```
Pass `groundAlpha` into the factory so the ground section respects it.

### `src/planet/render/layer-factories.ts`

- `makeGroundSectionFactory()` (and/or its caller) needs to accept an optional `alpha` parameter that is applied to the ground graphics object: `groundGfx.alpha = alpha ?? 1`.

## Affected Files

- `src/main.ts`
- `src/planet/render/layer-factories.ts`

## Acceptance Criteria

- [ ] Exactly 25 back layers rendered (check via FPS / DevTools)
- [ ] Far layers visibly hazier than the front layers
- [ ] Rearmost ground sections fade smoothly to invisible
- [ ] No hard seam or pop at the fade boundary
- [ ] CodeScene 10.0 on both modified files
