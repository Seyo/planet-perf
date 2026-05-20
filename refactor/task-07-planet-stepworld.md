# Task 07 — Clean `Planet.stepWorld` bumpy road

**File:** `src/planet/planet.ts`  
**Score before:** 9.53 (Green)  
**CodeScene issue:** `Planet.stepWorld` bumps=3 (lines 150–197); `makeHazeOverlay` 5 arguments  
**Status:** `todo`

---

## Why

`planet.ts` is the healthiest file at 9.53. This task is low-urgency but closes the last smell so the file reaches Optimal (10.0), and it sets a clean foundation before any new actor registration or camera features land here.

No folder restructure is needed — `planet.ts` is a single orchestrator class that belongs exactly where it is.

---

## What to do

### Step 1 — Read `Planet.stepWorld` (lines 150–197)

Identify the three bump regions:
1. Pointer drag — reads `PointerX` state, updates `vDeg`, applies momentum.
2. Wheel zoom — reads `WheelZoom` state, clamps `zoom`.
3. Actor loop — calls `update()` on each registered actor layer.

### Step 2 — Extract three private methods

```ts
private applyPointerDrag(): void { /* bump 1 */ }
private applyWheelZoom():   void { /* bump 2 */ }
private stepActors(tick: number): void { /* bump 3 */ }
```

### Step 3 — Rewrite `stepWorld` as a clean sequence

```ts
stepWorld(tick: number): void {
  this.applyPointerDrag();
  this.applyWheelZoom();

  this.xDeg = ((this.xDeg + this.vDeg) % 360 + 360) % 360;
  this.vDeg *= INERTIA_FRICTION;

  this.stepActors(tick);
  this.layout();
}
```

### Step 4 — Fix `makeHazeOverlay` (lines 440–471)

It has 5 arguments. Introduce a local `HazeOpts` type (private to this file — no need to export):

```ts
type HazeOpts = {
  x:      number;
  y:      number;
  w:      number;
  h:      number;
  color?: number;
  alpha?: number;
};
```

Signature becomes `makeHazeOverlay(opts: HazeOpts): Graphics`. Update the two or three call sites inside `planet.ts`.

### Step 5 — Verify

- `npm run build` — no errors.
- `npm run dev` — drag, zoom, inertia, and haze overlays must feel and look identical.
- Run CodeScene on `planet.ts` — score should reach ≥ 9.8, ideally 10.0.

---

## Expansion benefit

`stepActors` is the natural registration point for new actor layer types. When a `DroneLayer` or `TrafficLayer` is added, it slots into `stepActors` with zero changes to input handling or layout logic. The method boundary enforces that separation permanently.
