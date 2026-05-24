# Performance Plan 2 — Three remaining hotspots

Profile baseline (AFTER debug-panel throttle + staggered unculling):
- 631 frames, avg JS/frame **9.06ms**, at autopan 1°/tick, 2229px viewport

---

## Target 1 — `update [actor-layer.ts]` · 526 samples · 0.83/frame

### What it is
The full per-frame actor update loop. `ActorLayer.update(dt)` iterates every live
actor (shuttles, debris particles, explosions) and calls their individual `update()`
methods. At 526 samples it is the single biggest user-code hotspot remaining.

### Likely breakdown
- Shuttle state machine ticks (flight path, fuel, landing logic)
- Debris particle physics (position, velocity, bounce)
- Explosion expansion / fade
- Engine trail `record()` — appends a new point into the ring buffer every frame

### Investigation needed
Profile with and without active shuttles to separate static actor overhead from
per-actor cost. Instrument `update()` bodies individually.

### Candidate fixes
1. **Skip sleeping actors**: actors in a stable landed/idle state don't need a full
   update every frame — gate the update behind a `dirty` flag or coarse timer.
2. **Coarser physics tick for debris**: debris particles only need a physics step
   every 2–3 frames; interpolate visually. Halves particle update cost.
3. **Cap active actor count**: if many shuttles/debris are alive simultaneously,
   enforce a pool limit to bound worst-case cost.

---

## Target 2 — `updateLocalTransform` (Pixi internal) · 423 samples · 0.67/frame

### What it is
Pixi's scene-graph transform propagation. Called whenever a container's position,
rotation, or scale is written and Pixi needs to recompute the world matrix for its
subtree. Located in `Filter-Br7JJWj5.js:2019`.

### Why it's high
Each actor container is repositioned every frame in `ActorLayer.layout()` (191
samples at `layout [actor-layer.ts:201]`). Every `container.x = …` write marks the
subtree dirty, which then costs `updateLocalTransform` during the next render pass.
Actor containers typically have several nested children (body gfx, trail gfx, label,
etc.) amplifying the propagation cost.

### Candidate fixes
1. **Skip layout for off-screen actors**: if an actor's screen X is beyond
   viewport + margin, skip writing `container.x / container.y` entirely — same
   pattern as slice culling. Off-screen actors already have `visible = false` in
   most cases, but the transform is still written.
2. **Flatten actor container hierarchy**: reduce nesting depth so transform
   propagation visits fewer nodes per actor.
3. **Snap to previous position if delta < 0.5px**: avoid dirtying the transform
   when sub-pixel motion wouldn't change the rendered output.

---

## Target 3 — `set x` (Pixi transform setter) · 372 samples · 0.59/frame

### What it is
Raw calls to Pixi's `Container.x` setter (`Filter-Br7JJWj5.js:162`). Distinct from
`updateLocalTransform` — this is the write side; 2 is the propagation side. Together
they account for ~1.26/frame of the transform pipeline.

### Why it's high
Every visible slice gets `slice.x = x` each frame it remains on screen (currently
~18 front-ring slices + 18 back-ring slices + 18 sky-ring slices ≈ 54 writes/frame
just for slices, plus all actor sub-container writes). The pre-warm zone adds a few
more visible-but-off-screen slices.

### Candidate fixes
1. **Skip slice transform write when xDeg hasn't changed**: if `vDeg === 0` (world
   is stopped), `xDeg` is identical to last frame; no slice's `x` needs updating.
   Already partially handled by `INERTIA_SNAP_EPS` for free-motion — extend the
   same guard to skip the entire `layout()` call when world is static.
2. **Write only slices whose x actually changed**: track `lastX` per slice and skip
   the write when `|x - lastX| < 0.25`. Removes submajority of writes during slow
   pans. Costs one float comparison vs one property write — profile to confirm win.
3. **Combine with Target 2 fix**: skipping the layout call when static also
   eliminates `updateLocalTransform` for that frame entirely.

---

## Quick-win summary

| Fix | Estimated savings | Complexity |
|-----|-----------------|-----------|
| Skip layout() when vDeg==0 (already snap to 0) | ~1.3/frame (x + transform) | Low — 2-line guard in planet.ts |
| Skip off-screen actor transform writes | ~0.3/frame | Low |
| Coarser debris physics tick | ~0.2/frame | Medium |
| Flatten actor container hierarchy | ~0.2/frame | High |

The vDeg==0 guard is the highest-leverage item and the obvious next commit.
