# Plan: Underground Rework — Foreground Soil with Chasms

**Complexity:** Very High  
**Dependencies:** Background haze/fade (plan 02) — underground haze should share the same colour system  
**Estimated effort:** ~7–10 hours

## Problem

The current underground is a simple backdrop of mirrored surface buildings dimmed by `dim`. It has no geological depth, no sense of layered rock, and no visual drama. The chasms / openings the idea describes require a fundamentally different rendering approach.

## Goal

- A full-width **foreground soil mask** rendered on top of surface content, with ragged uneven bottom edges suggesting rock.
- **Chasms** — irregular vertical openings in the foreground mask that reveal the underground layers behind. The opening narrows with depth, creating a sense of a real shaft going down.
- **Multiple underground layers** behind the chasms, each increasingly hazed (atmospheric depth).
- The foreground mask uses Pixi's `Graphics` stencil / mask or inverted `AlphaMask` so that only the chasm openings are transparent.

## Architecture

### Rendering Layers (front to back)

```
[ Foreground soil mask + chasm cutouts ]   ← new, top-most underground element
[ Underground layer 1 — shallow rock ]     ← existing makeShallowCaveLayer, enhanced
[ Underground layer 2 — deep core ]        ← existing makeDeepCoreLayer, enhanced
[ Underground layer 3 — abyss haze ]       ← new, pure haze, very dark
```

### Foreground Soil Mask

A `Graphics` object drawn as a filled polygon:
- Top edge: flat at `groundY` (surface)
- Bottom edge: procedurally jagged — use slice seed + `sin/cos` harmonics to produce a rocky silhouette that varies per slice but is stable per seed
- Per-slice: a `chasm` may be carved out — remove a vertical trapezoid from the silhouette (wide at top, narrow at bottom) to simulate depth

Because Pixi's `Graphics.beginHole()` API can carve holes in filled shapes, chasms can be literal holes in the foreground polygon without needing a mask texture.

### Chasm Generation

Per slice, the seed determines:
- `hasChasm: boolean` (probability ~15%)
- `chasmCenterX`: horizontal position within slice
- `chasmWidthTop`: 15–35px
- `chasmWidthBottom`: 5–15px (narrower = deeper feeling)
- `chasmDepth`: how far down the chasm reaches into the slice height

Each chasm is a trapezoid cut with `beginHole()` → `lineTo()` sequence inside the foreground fill.

### Edge Raggedness

Rocky top edge of the soil mask (the "ceiling" of the cave at ground level) uses a low-frequency noise:
```ts
// at each x step within the slice:
const roughness = sin(x * 0.3 + seed) * 4 + sin(x * 0.7 + seed * 2) * 2;
```
Bottom edge of the soil is also ragged (the base of the visible soil layer).

### Haze Integration

Each underground layer gets its own `makeHazeOverlay()` call with increasing alpha:
- Shallow cave: `alpha = 0.35`
- Deep core: `alpha = 0.55`
- Abyss: `alpha = 0.75` (nearly opaque, just colour)

Underground haze colour stays `UNDERGROUND_HAZE_COLOR = 0x1a0d00` (warm dark brown).

## New Files

```
src/planet/render/underground/
  index.ts
  foreground-soil.ts       — drawForegroundSoil(gfx, opts): void
  chasm.ts                 — generateChasmOpts(rng): ChasmOpts, drawChasm(gfx, opts)
```

The foreground soil factory function signature:
```ts
interface SoilOpts {
  sliceWidthPx: number;
  soilHeightPx: number;  // how thick the soil layer is (screen px)
  chasmOpts?: ChasmOpts;
  rng: () => number;
}
function drawForegroundSoil(gfx: Graphics, opts: SoilOpts): void
```

## Integration with `planet.ts` / `main.ts`

1. Replace or augment the existing `makeGroundSectionFactory()` to call into `drawForegroundSoil`.
2. A new `makeForegroundSoilLayer()` function in `planet.ts` creates a top-z slice ring for the foreground mask. It uses `motionScale = 1.0` (moves with the surface exactly) and `sizeScale` matching the front ring.

## Acceptance Criteria

- [ ] Foreground soil layer fully covers underground area except at chasms
- [ ] ~15% of slices have a visible chasm opening, narrowing with depth
- [ ] Looking into a chasm reveals at least 2 distinct underground layers, each hazier
- [ ] Rocky ragged edges on both the soil ceiling and the chasm walls
- [ ] Haze increases smoothly with depth (no abrupt step)
- [ ] Performance: no additional draw calls beyond the new foreground layer
- [ ] CodeScene 10.0 on all new/modified files
