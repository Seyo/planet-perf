# Task 05 — Extract physics constants to `shuttle/physics.ts`

**File:** `src/planet/render/actors/shuttle/shuttle-layer.ts`  
**Score before:** 8.51 (Yellow, improved after task 04)  
**CodeScene issue:** Primitive Obsession — 96% of functions have primitive-typed arguments  
**Status:** `todo`  
**Depends on:** Task 04 (actors/shuttle/ folder must exist)

---

## Why

`shuttle-layer.ts` opens with 18 bare `const` number declarations. The `Shuttle` constructor takes four individual primitive values. There is no domain language for "flight physics" or "explosion settings". Grouping the constants into typed config objects:
- Fixes the Primitive Obsession smell.
- Creates a natural home for per-actor physics overrides (a slow heavy drone vs a fast scout).
- Lives in its own file so the constants are easy to find and tune without reading the class.

---

## What to do

### Step 1 — Create `src/planet/render/actors/shuttle/physics.ts`

```ts
export type FlightConfig = {
  cruiseYMin:        number;
  cruiseYMax:        number;
  cruiseDegMin:      number;
  cruiseDegMax:      number;
  levelThreshold:    number;
  landThreshold:     number;
  waitTicksMin:      number;
  waitTicksMax:      number;
  maxTrailPoints:    number;
  trailSpeedFactor:  number;
  maxClimbRate:      number;
  maxDescentRate:    number;
  maxVertAccel:      number;
  maxHorizSpeed:     number;
  maxTurnAccel:      number;
};

export type ExplosionConfig = {
  maxFrames:          number;
  airRingRadius:      number;
  groundRingRadius:   number;
  lightRadius:        number;
  debrisGravity:      number;
  debrisTrailPoints:  number;
  debrisLingerFrames: number;
};

export const DEFAULT_FLIGHT_CONFIG: FlightConfig = {
  cruiseYMin:        -320,
  cruiseYMax:        -180,
  cruiseDegMin:       50,
  cruiseDegMax:      140,
  levelThreshold:     15,
  landThreshold:       4,
  waitTicksMin:      120,
  waitTicksMax:      360,
  maxTrailPoints:    100,
  trailSpeedFactor:   20,
  maxClimbRate:      0.9,
  maxDescentRate:    1.2,
  maxVertAccel:      0.035,
  maxHorizSpeed:     0.22,
  maxTurnAccel:      0.004,
};

export const DEFAULT_EXPLOSION_CONFIG: ExplosionConfig = {
  maxFrames:          90,
  airRingRadius:      90,
  groundRingRadius:   50,
  lightRadius:        250,
  debrisGravity:      0.04,
  debrisTrailPoints:  120,
  debrisLingerFrames: 80,
};
```

### Step 2 — Keep the four exported constants as pass-throughs in `shuttle-layer.ts`

`debug-panel.ts` and `planet.ts` import `MAX_CLIMB_RATE` etc. directly. Keep them as re-exports so external callers don't break:

```ts
import { DEFAULT_FLIGHT_CONFIG } from './physics';

export const MAX_CLIMB_RATE   = DEFAULT_FLIGHT_CONFIG.maxClimbRate;
export const MAX_DESCENT_RATE = DEFAULT_FLIGHT_CONFIG.maxDescentRate;
export const MAX_VERT_ACCEL   = DEFAULT_FLIGHT_CONFIG.maxVertAccel;
export const MAX_HORIZ_SPEED  = DEFAULT_FLIGHT_CONFIG.maxHorizSpeed;
export const MAX_TURN_ACCEL   = DEFAULT_FLIGHT_CONFIG.maxTurnAccel;
```

Remove the original bare `const` declarations for those values.

### Step 3 — Pass `FlightConfig` into `Shuttle`

Add an optional parameter to the `Shuttle` constructor:

```ts
constructor(
  motionScale:  number,
  yMotionScale: number,
  index:        number,
  count:        number,
  config:       FlightConfig = DEFAULT_FLIGHT_CONFIG,
) { ... }
```

Replace every reference to the old module-level constants inside `Shuttle` with `this.config.fieldName`. `ShuttleLayer` passes no config argument so the default is used — no call-site changes.

### Step 4 — Update `shuttle/index.ts` barrel

```ts
export type { FlightConfig, ExplosionConfig } from './physics';
export { DEFAULT_FLIGHT_CONFIG, DEFAULT_EXPLOSION_CONFIG } from './physics';
```

### Step 5 — Verify

- `npm run build` — no errors.
- `npm run dev` — shuttle behavior must be completely unchanged (same cruise altitudes, speeds, wait times).
- Exported `MAX_*` constants still satisfy debug-panel imports.
- Run CodeScene on `shuttle-layer.ts` — Primitive Obsession indicator should improve.

---

## Expansion benefit

A `DroneActor` with different physics passes `{ maxHorizSpeed: 0.05, maxClimbRate: 0.3, ...DEFAULT_FLIGHT_CONFIG }` to its constructor. No magic numbers to hunt. The config objects also make future debug-panel sliders trivial to wire up.
