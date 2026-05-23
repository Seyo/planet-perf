# Performance Fix Plan

Analysis based on heap timeline from growth lifecycle simulation.

## Root Causes

### 1. Front layer rebuilt every tick unconditionally

`applyDistricts` (main.ts:240) always calls `makeTaperedFrontLayer` → `planet.replaceLayer`
regardless of whether the visual output actually changed.

During the **growing phase**, only `growth` accumulates each tick — `taperConfig` is unchanged —
so every tick tears down and recreates 72 slice containers + all their Graphics for no reason.

Cost per tick: ~432 new WeakRef objects pushed onto `_warmGfxRefs`/`_coolGfxRefs`,
72 new Containers, and roughly 1,500–2,000 Graphics allocations (then immediately destroyed).

**Fix:** compute a stable key from the taperConfig values that actually affect building output
(same pattern as `districtBoundaryKey` already does for back layers) and skip the front rebuild
when the key is unchanged.

```ts
// in applyDistricts, before makeTaperedFrontLayer:
const frontKey = computeFrontKey(districts);
if (frontKey !== lastFrontKey) {
  lastFrontKey = frontKey;
  planet.animators.length = 0;
  const nextFront = makeTaperedFrontLayer(districts, planet.animators, registry);
  planet.replaceLayer(activeFrontLayer, nextFront);
  activeFrontLayer = nextFront;
}
```

`computeFrontKey` should encode `startSlice`, `sliceCount`, and the taperConfig fields that
feed into `sliceTaperParams` — `centerDensity`, `edgeDensity`, `centerMaxH`, `edgeMaxH`, `shape`.

---

### 2. `_warmGfxRefs` / `_coolGfxRefs` never compacted

`core.ts:9-10` — module-level arrays that only ever grow. `applyTint` skips dead refs but never
removes them. After the growth simulation runs for a while (especially during densification, which
triggers structural back-layer rebuilds × 25 layers), these arrays accumulate millions of dead
WeakRef wrapper objects and `applyTint` degrades linearly.

**Fix:** compact in-place on each `applyTint` call:

```ts
function applyTint(refs: WeakRef<Graphics>[], color: number): void {
  let w = 0;
  for (let r = 0; r < refs.length; r++) {
    const g = refs[r].deref();
    if (g && !g.destroyed) { g.tint = color; refs[w++] = refs[r]; }
  }
  refs.length = w;
}
```

This is O(n) either way — no extra cost — and keeps the arrays bounded to live refs only.

---

### 3. All 25 back layers rebuilt simultaneously on topology change

`applyStructuralLayers` (main.ts:229) calls `rebuildBackEntry` on all 25 layers when
`districtBoundaryKey` changes. Each rebuild = 72 slices × factory call = ~18,000 Graphics
allocations in a single frame, plus 25× the WeakRef push volume.

Topology changes during growth are infrequent (only when `sliceCount` increments), so this
isn't a per-tick problem — but when it fires, it's a large spike.

**Fix (deferred):** stagger back-layer rebuilds across frames using a queue, or rebuild only
the layers whose content actually differs from the previous district layout. Lower priority
since topology changes are rare compared to tick-rate.

---

## Expected outcome

After fixes 1 and 2:
- Memory usage during growth simulation becomes flat between topology changes
- `applyTint` cost stays O(live refs) instead of O(total ever allocated)
- Topology-change spikes remain but are isolated events, not a continuous leak

The baseline footprint (26 rings × 72 slices × baked GPU textures) stays large but static —
that is a design-level trade-off, not a bug.
