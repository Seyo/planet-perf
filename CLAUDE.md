# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (localhost:5173, HMR enabled)
npm run build      # Production bundle to dist/
npm run preview    # Preview production build locally
```

No test framework is configured.

## Architecture

**planet-perf** is a TypeScript + Pixi.js interactive 2D circular world visualization. A 360° panoramic environment rendered as discrete angular slices with parallax layers and inertial drag.

### Entry Point

`src/main.ts` initializes the Pixi application, creates a `Planet` instance, and registers three `SliceLayer`s using factories from `src/planet/render/layer-factories.ts`.

### Core Data Flow

```
PointerX / WheelZoom  →  Planet.stepWorld()  →  Planet.layout()  →  SliceLayer[]  →  SliceRing  →  Pixi.js
```

- **`Planet`** (`src/planet/planet.ts`) — Orchestrates everything: owns the world state (`xDeg`, `vDeg`), applies inertia (`INERTIA_FRICTION = 0.95`), and calls `layout()` on each layer each frame.
- **`SliceLayer`** (`src/planet/render/slice-layer.ts`) — Wraps a `SliceRing` with a `motionScale` (parallax, e.g. `0.7` for far background) and a `sizeScale`.
- **`SliceRing`** (`src/planet/render/slice-ring.ts`) — Manages N evenly-spaced slices covering 360°. On `layout()`, positions each visible slice in pixel space and culls those >150px outside the viewport.
- **`PointerX`** / **`WheelZoom`** (`src/planet/input/`) — Stateful input trackers. `WheelZoom` recalculates min/max zoom bounds on window resize to ensure a minimum number of slices is always visible.

### Slice System (critical invariant)

Slices cover the full 360° in fixed angular steps (5° for front/back rings → 72 slices; 10° for far-back → 36 slices). Each slice's content is generated deterministically using `mulberry32(hashSeed(sliceIndex, salt))` — **no persistent state per slice**. Content is re-generated every frame from the seed, so slice objects must remain stateless with respect to content.

Parallax is achieved by multiplying the camera angle by `motionScale` before computing slice positions. A layer with `motionScale=0.7` moves at 70% of the drag speed, creating depth.

### Performance

Performance is a first-class concern. The rendering loop runs at 60 fps and must stay well under the 16.67 ms frame budget. After a sustained optimisation effort the baseline is:

| Metric | Target |
|--------|--------|
| mean JS/frame (autopan) | ≤ 4 ms |
| p95 JS/frame | ≤ 8 ms |
| frames > 16 ms | 0 % |

**Per-frame cost model** — the dominant costs in order are:
1. Pixi render pipeline (~2 ms/frame) — scales with the number of dirty, visible scene nodes. This is the hard floor for the current scene complexity.
2. Visible actor layout + transforms (~0.5 ms/frame) — `set x`/`set y` on car sprites, slice ring positions.
3. Engine trail `draw()` — per-segment `gfx.poly().fill()` calls; scales with trail length × bloom layers.

**Established patterns** — already in the codebase, follow them for new features:
- **Static-world guard** (`Planet.layout()`): slice and overlay layout is skipped entirely when `xDeg`, `cameraY`, and zoom are unchanged. Don't call `layer.layout()` outside this guard.
- **Off-screen culling before transform writes**: compute visibility first; write `container.x/y` only when `visible = true`. Writing transforms on invisible containers still dirties Pixi's render groups.
- **Off-screen simulation skip**: don't call `update()` on actors outside the viewport + cull-pad zone. Use the previous frame's `gfx.visible` flag as the gate.
- **Degree-space cull**: for per-actor layout loops, reject off-screen actors with a degree-space threshold check before entering the pixel-multiply chain.
- **Bloom budget**: keep `bloomLayers ≤ 2` for gameplay actors. Higher values multiply per-segment `fillSegment` calls and the cost grows faster than the visual benefit.

**Flag for profiling** when a new feature introduces any of the following:
- A new per-frame loop over an unbounded collection (actors, particles, projectiles).
- A new `Graphics` object whose `.clear()` + redraw is called every frame (trails, beams, auras).
- A new actor type with a nested container hierarchy deeper than: `gfx → body + trail`.
- A new slice factory that draws more than ~15 Graphics primitives per slice (baking threshold).
- A new overlay or effect layer that is always added to the scene graph even when invisible.

In those cases, take a Chrome DevTools Performance trace at `autopan = 1 °/tick` and check that mean JS/frame has not regressed before merging.

### Code Health

All new code must score **10.0** on CodeScene code health. Before marking any task done, run `mcp__codescene__code_health_score` on every file you created or modified and fix any findings until the score is 10.0.

The existing Yellow files (`building-v2.ts` 7.33, `layer-factories.ts` 7.52, `shuttle-layer.ts` 8.51) are being improved incrementally via the `refactor/` plan — do not introduce new smells into them while working on other things.

Before marking any task done, also run:

- `npm run lint` — must pass with zero errors
- `npm run knip` — must pass with zero findings (unused exports, dead files)

### Module Organisation

Prefer folders with a barrel `index.ts` that re-exports the folder's public surface. New feature areas (e.g. a new actor type, a new building category) should live in their own subfolder with an `index.ts`, keeping internal helpers private to the folder.

### Legacy File

`src/planet-logic.ts` is a superseded monolithic implementation. It is not imported anywhere. Do not extend it; the canonical implementation is `src/planet/`.
