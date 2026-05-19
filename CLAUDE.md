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

### Legacy File

`src/planet-logic.ts` is a superseded monolithic implementation. It is not imported anywhere. Do not extend it; the canonical implementation is `src/planet/`.
