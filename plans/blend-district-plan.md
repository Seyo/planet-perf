# Plan: Blend District Layout (A | bridge | B)

**Complexity:** Low–Medium
**Dependencies:** None (uses existing slice factories — no new building/rendering code)
**Estimated effort:** ~1–2 hours
**Scope:** A new LayoutPanel tab. No engine changes.

## Problem

The `LayoutPanel` (`src/debug/layout-panel.ts`) currently offers three layouts: `Single district`, `Ascending 1-10`, `Growth sim`. None of them place two visually distinct districts next to each other with a visual transition between them — adjacency today is a hard kind-boundary on a single slice line.

## Goal

A fourth layout tab — `Blend (A | bridge | B)` — that emits a `District[]` containing:

1. **District A** — kind, size, taper fully configurable.
2. **Blend zone** — a short run of single-slice districts whose `kind` alternates `A, B, A, B, …`. Width is derived from the two district sizes and capped at `MAX_BLEND_SLICES = 5`. Each blend slice carries a constant taper equal to its source district's *edge* values, so a kind-A blend slice renders the same low/sparse silhouette as the slice immediately inside A's edge.
3. **District B** — kind, size, taper fully configurable.

Because slices are stateless and re-seeded per index (see `Planet` / `SliceRing`), and because every kind in `ALL_STYLES` is already wired through `getDistrictStyle` in the front and back slice planners, this works without touching any slice factory.

## Design

### Blend width

```ts
// Cap the blend at MAX_BLEND_SLICES so two large districts don't get an
// arbitrarily wide transition zone. 5 slices = 25° at the 5°/slice front
// ring, which is the widest blend that still reads as a transition rather
// than a third district.
const MAX_BLEND_SLICES = 5;

function blendWidth(sizeA: number, sizeB: number): number {
  return Math.min(MAX_BLEND_SLICES, Math.floor(Math.min(sizeA, sizeB) / 4));
}
```

Examples (sizeA, sizeB → blendWidth):
- (4,  4)  → 1
- (8,  20) → 2
- (12, 30) → 3
- (16, 60) → 4
- (20, 60) → 5
- (60, 60) → 5  (capped)

Tied to the smaller neighbour so a tiny district can never be visually overpowered by an oversized transition zone.

### Blend slice representation

Each blend slice is emitted as its own **one-slice `District`** with a constant taper. No changes to the `District` type or to `district-taper.ts`.

For a source district `S` with taperConfig `S.taper`, the blend slice that carries `S.kind` uses:

```ts
function edgeTaper(src: TaperConfig): TaperConfig {
  return {
    centerDensity: src.edgeDensity,
    edgeDensity:   src.edgeDensity,
    centerMaxH:    src.edgeMaxH,
    edgeMaxH:      src.edgeMaxH,
    shape:         'linear', // shape is irrelevant when center==edge
  };
}
```

When `sliceTaperParams(0, 1, edgeTaper(...))` runs in `frontSlicePlans` (or `proportionalTaperParams` in `backSlicePlans`), `normalizedDist(0, 1)` returns `0` because `center === 0` — so the lerp evaluates to the (identical) center/edge value. The blend slice therefore receives exactly the source district's edge taper params, every time, regardless of slice index within the blend.

### Alternation pattern

Blend slice `k` (0-indexed within the blend) carries:
- `kind = (k % 2 === 0) ? A.kind : B.kind`
- `taperConfig = edgeTaper(k % 2 === 0 ? A.taper : B.taper)`

So a 5-slice blend reads: `A | aA bB aA bB aA | B`, where `aX` is a 1-slice district with kind=X and X's edge taper. Starting on A is a free choice — keeps it deterministic and matches the natural reading order.

### Positioning on the ring

State held by the layout:

```ts
type BlendState = {
  startSlice: number;   // start of district A
  districtA:  { sliceCount: number; kind: DistrictKind; taperConfig: TaperConfig };
  districtB:  { sliceCount: number; kind: DistrictKind; taperConfig: TaperConfig };
};
```

Layout emits (all slice indices `% TOTAL_SLICES`):

```
A:           startSlice                                  size = A.sliceCount
blend[k]:    startSlice + A.sliceCount + k               size = 1            (k = 0..blendWidth-1)
B:           startSlice + A.sliceCount + blendWidth      size = B.sliceCount
```

Total occupied slices = `A.sliceCount + blendWidth + B.sliceCount`. The remainder of the ring (up to 72) is empty. If `A + blend + B > 72`, clamp `B.sliceCount` down so the whole assembly fits without wrapping past `startSlice`. Wrapping is acceptable for `startSlice` itself via `% 72` — that already happens elsewhere in `frontSlicePlans` / `backSlicePlans`.

### District[] output

For a 5-slice blend between A (size 10, metropolis) and B (size 30, industrial-heavy):

```
{ startSlice:  0, sliceCount: 10, taperConfig: A.taper,           kind: 'metropolis'       }  // A
{ startSlice: 10, sliceCount:  1, taperConfig: edgeTaper(A.taper), kind: 'metropolis'       }  // blend[0]
{ startSlice: 11, sliceCount:  1, taperConfig: edgeTaper(B.taper), kind: 'industrial-heavy' }  // blend[1]
{ startSlice: 12, sliceCount:  1, taperConfig: edgeTaper(A.taper), kind: 'metropolis'       }  // blend[2]
{ startSlice: 13, sliceCount:  1, taperConfig: edgeTaper(B.taper), kind: 'industrial-heavy' }  // blend[3]
{ startSlice: 14, sliceCount:  1, taperConfig: edgeTaper(A.taper), kind: 'metropolis'       }  // blend[4]
{ startSlice: 15, sliceCount: 30, taperConfig: B.taper,           kind: 'industrial-heavy' }  // B
```

The downstream pipeline (`frontSlicePlans`, `backSlicePlans`, `applyStructuralLayers`) iterates districts and writes per-slice plans keyed by `i % 72` — it doesn't care whether districts are big or 1-slice, so this slots in unchanged.

## Implementation Steps

All in **`src/debug/layout-panel.ts`** unless noted.

### Step 1 — Constants and edgeTaper helper (top of file, near `TOTAL_SLICES`)

```ts
// Blend zone width is capped at this many slices so two large districts
// don't get an arbitrarily wide transition zone. 5 slices = 25° at the
// 5°/slice front ring, the widest blend that still reads as a transition
// rather than a third district.
const MAX_BLEND_SLICES = 5;

function blendWidth(sizeA: number, sizeB: number): number {
  return Math.min(MAX_BLEND_SLICES, Math.floor(Math.min(sizeA, sizeB) / 4));
}

function edgeTaper(src: TaperConfig): TaperConfig {
  return {
    centerDensity: src.edgeDensity,
    edgeDensity:   src.edgeDensity,
    centerMaxH:    src.edgeMaxH,
    edgeMaxH:      src.edgeMaxH,
    shape:         'linear',
  };
}
```

### Step 2 — Blend layout state and builder

Add alongside `singleState` in the `LayoutPanel` constructor:

```ts
type DistrictSide = { sliceCount: number; kind: DistrictKind; taperConfig: TaperConfig };
type BlendState   = { startSlice: number; districtA: DistrictSide; districtB: DistrictSide };

const blendState: BlendState = {
  startSlice: 0,
  districtA: {
    sliceCount: 12,
    kind: 'metropolis',
    taperConfig: { centerDensity: 0.85, edgeDensity: 0.30, centerMaxH: 400, edgeMaxH: 80, shape: 'smooth' },
  },
  districtB: {
    sliceCount: 12,
    kind: 'industrial-heavy',
    taperConfig: { centerDensity: 0.70, edgeDensity: 0.25, centerMaxH: 200, edgeMaxH: 60, shape: 'smooth' },
  },
};
```

Builder function (returns `District[]`):

```ts
function buildBlendDistricts(s: BlendState): District[] {
  const bw    = blendWidth(s.districtA.sliceCount, s.districtB.sliceCount);
  const out: District[] = [];

  out.push({
    startSlice:  s.startSlice % TOTAL_SLICES,
    sliceCount:  s.districtA.sliceCount,
    taperConfig: { ...s.districtA.taperConfig },
    kind:        s.districtA.kind,
  });

  for (let k = 0; k < bw; k++) {
    const fromA = k % 2 === 0;
    const src   = fromA ? s.districtA : s.districtB;
    out.push({
      startSlice:  (s.startSlice + s.districtA.sliceCount + k) % TOTAL_SLICES,
      sliceCount:  1,
      taperConfig: edgeTaper(src.taperConfig),
      kind:        src.kind,
    });
  }

  out.push({
    startSlice:  (s.startSlice + s.districtA.sliceCount + bw) % TOTAL_SLICES,
    sliceCount:  s.districtB.sliceCount,
    taperConfig: { ...s.districtB.taperConfig },
    kind:        s.districtB.kind,
  });

  return out;
}
```

### Step 3 — Controls renderer

Reuse the existing single-district controls (`renderSingleControls`) by extracting the "one district" controls into a helper that takes a `SingleState`-shaped object (already what it does), then render the helper twice with a section heading between the two districts.

```ts
function renderBlendControls(el: HTMLElement, state: BlendState, emit: () => void): void {
  el.appendChild(makeSectionLabel('POSITION'));
  el.appendChild(makeSliderRow(
    { label: 'startSlice', value: state.startSlice, min: 0, max: 71, step: 1 },
    v => { state.startSlice = Math.round(v); }, emit,
  ));

  el.appendChild(makeSectionLabel('DISTRICT A'));
  renderSideControls(el, state.districtA, emit);

  el.appendChild(makeSectionLabel('DISTRICT B'));
  renderSideControls(el, state.districtB, emit);
}

// Trimmed version of renderSingleControls — no startSlice (shared above).
function renderSideControls(el: HTMLElement, side: DistrictSide, emit: () => void): void {
  el.appendChild(makeChoiceButtons(
    'kind', KIND_CHOICES, () => side.kind, v => { side.kind = v; }, emit,
  ));
  el.appendChild(makeSliderRow(
    { label: 'sliceCount', value: side.sliceCount, min: 1, max: 35, step: 1 },
    v => { side.sliceCount = Math.round(v); }, emit,
  ));
  appendTaperSliders(el, { taperConfig: side.taperConfig } as SingleState, emit);
}
```

The `appendTaperSliders` helper already takes `state.taperConfig`, so a shape adapter (`{ taperConfig: side.taperConfig } as SingleState`) keeps its signature untouched. Acceptable here because `appendTaperSliders` never reads any other field of `SingleState`. If type purity matters, narrow `appendTaperSliders`'s signature to `{ taperConfig: TaperConfig }` — that's a Step-3.1 refactor that costs nothing.

`sliceCount` max is `35` per side so `A + bw + B <= 35 + 5 + 35 = 75`; that wraps cleanly past 72. If we want strict no-overflow, lower the max to `33` (so `33 + 5 + 33 = 71 < 72`); preferred.

### Step 4 — Register the layout tab

In the `layouts` array in `LayoutPanel`'s constructor, after the `'ascending'` entry:

```ts
{
  id: 'blend', label: 'Blend (A | bridge | B)',
  build: () => buildBlendDistricts(blendState),
  renderControls: (el, emit) => { renderBlendControls(el, blendState, emit); },
},
```

That's the entire integration. `applyDistricts` → `applyStructuralLayers` → `frontSlicePlans` / `backSlicePlans` already handle arbitrary `District[]` content.

## Affected Files

- `src/debug/layout-panel.ts` — new constants, state, builder, renderer, registered layout

No changes to:
- `src/planet/render/district-taper.ts` (no new types)
- `src/planet/render/districts/**` (no new styles)
- `src/planet/render/layer-factories.ts` (no new factories — that file is yellow, keep it untouched)
- `src/planet/planet.ts` (no engine changes)
- `src/main.ts` (no wiring changes — the `onLayoutChange` callback already routes everything)

## Edge Cases and Notes

- **Width 0 blend.** If both `sliceCount` values are `< 4`, `blendWidth` returns 0 and the layout falls back to A and B touching directly. That's the correct degenerate behaviour.
- **Same kind on both sides.** No special-case needed; the blend just emits same-kind 1-slice districts and visually disappears. Document this for future-you — don't add a "skip blend when kinds match" branch unless someone notices it as ugly in practice.
- **Equal-edge-taper invariant for ramp.** `edgeTaper` sets `center === edge`, so `sliceTaperParams` and `proportionalTaperParams` are guaranteed to return that single value. If the future taper code ever introduces non-monotonic shapes that ignore the `center===edge` short-circuit, the blend would silently break. Low risk, but worth a one-line comment on `edgeTaper`.
- **Wrap-around.** `startSlice + offset` is always taken `% TOTAL_SLICES`. This already works in `frontSlicePlans` (`(d.startSlice + j) % 72`), so a blend straddling slice 71 → 0 will render correctly.
- **District label clutter.** `DistrictLabelLayer.setDistricts` (`src/planet/render/district-label-layer.ts`) draws one callout ring per `District`. A 7-entry blend layout (1 A + 5 blend + 1 B) will draw 7 rings instead of 2. Out of scope for v1 — note as follow-up: filter `sliceCount === 1 && kind === neighbour.kind` slices out of the label set, or pass a separate "labelable districts" list to the label layer.
- **Shuttle activation.** `shuttlesActive` in `main.ts` checks `districts.length > 1`. Blend always returns ≥ 2, so shuttles activate. That's the desired behaviour — A and B are real cities.
- **Back-layer rebuild signature.** `districtBoundaryKey` in `main.ts` hashes `${startSlice}:${sliceCount}:${densityTier}:${kind}`. A 7-district blend produces a longer key; slider drags rebuild only when this string changes, so we keep change detection. No tuning needed.

## Acceptance Criteria

- [ ] New `Blend (A | bridge | B)` tab appears in the layout panel.
- [ ] Selecting it renders two distinct districts (default metropolis + industrial-heavy) with a visible transition zone between them.
- [ ] The blend zone is at most `MAX_BLEND_SLICES = 5` slices and scales with the smaller neighbour as documented.
- [ ] Each slice in the blend zone visually matches the *edge* of its source district (low buildings, sparse density) — not the centre.
- [ ] Adjusting district A's `kind` / `sliceCount` / taper sliders updates the layout live, including the blend zone width when sizes shrink past a `/4` boundary.
- [ ] Same for district B.
- [ ] Switching back to `Single district` or `Ascending` restores those layouts correctly (no leaked state).
- [ ] CodeScene 10.0 on `src/debug/layout-panel.ts` after the change.
- [ ] `npm run lint` and `npm run knip` clean.
