# Refactor Plan — planet-perf

CodeScene analysis run: 2026-05-20  
Goal: improve code health in the three Yellow files (`building-v2.ts` 7.33, `layer-factories.ts` 7.52, `shuttle-layer.ts` 8.51) and lightly clean the Green files, while keeping the architecture easy to extend with new building types and actor types.

Each task is small enough to complete, visually verify, and commit in a single session.

---

## Progress

| # | Task | File(s) | Score before | Status |
|---|------|---------|-------------|--------|
| 01 | [Extract `drawUndergroundCity`](task-01-extract-underground-city.md) | `layer-factories.ts` | 7.52 | `done` |
| 02 | [Extract `drawBuildingDecorations`](task-02-extract-building-decorations.md) | `building-v2.ts` | 7.33 | `done` |
| 03 | [Introduce `SliceContext` to kill 5-arg functions](task-03-slice-context-type.md) | `building-v2.ts`, `layer-factories.ts` | 7.33 | `done` |
| 04 | [Split `Shuttle.update` into phase handlers](task-04-shuttle-state-machine.md) | `shuttle-layer.ts` | 8.51 | `done` |
| 05 | [Group physics constants into typed configs](task-05-shuttle-physics-config.md) | `shuttle-layer.ts` | 8.51 | `todo` |
| 06 | [Deduplicate `DebugPanel` button methods](task-06-debug-panel-dedup.md) | `debug-panel.ts` | 9.09 | `todo` |
| 07 | [Clean `Planet.stepWorld` bumpy road](task-07-planet-stepworld.md) | `planet.ts` | 9.53 | `todo` |

---

## Target folder structure (after all tasks complete)

```
src/planet/render/
  buildings/
    index.ts          ← barrel: all public types + draw functions
    core.ts           ← was building-v2.ts (volumes, windows, canvas machinery)
    decorations.ts    ← drawBuildingDecorations (task 02)
    underground.ts    ← drawUndergroundCity (task 01)
  actors/
    index.ts          ← barrel: re-exports all actor layers
    shuttle/
      index.ts        ← barrel: exports ShuttleLayer + config types
      shuttle-layer.ts← was shuttle-layer.ts (moved task 04)
      physics.ts      ← FlightConfig, ExplosionConfig, defaults (task 05)
  layer-factories.ts  ← stays here; imports from ./buildings and ./actors
  slice-layer.ts
  slice-ring.ts
  rng.ts
  actor-layer.ts
```

New building categories → new file in `render/buildings/`, one re-export in `index.ts`.  
New actor types → new folder in `render/actors/`, one re-export in `render/actors/index.ts`.

---

## Expansion notes kept in mind

- **New building types** — Tasks 01–03 establish the primitives for quickly adding new factory functions (e.g. `makeCaveRuinsFactory`, `makeFloatingIslandFactory`) that each call the same `BuildingCanvas`/`drawBuilding` machinery.
- **New actor types** — Tasks 04–05 establish the state-machine + typed-config pattern that any new actor (drones, cars, satellites) should follow.
- **Layer registration** — `layer-factories.ts` remains the single file where new `SliceFactory` functions are exported; no other glue needed today.

---

## What "done" means per task

1. TypeScript compiles with no new errors (`npm run build`).
2. Dev server starts and the scene looks identical to before (`npm run dev`).
3. CodeScene score for the changed file is the same or higher than before.
4. Commit the task on its own so it is easy to revert.
