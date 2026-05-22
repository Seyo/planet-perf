# Plan: Shuttle District-to-District Targeting

**Complexity:** Medium  
**Dependencies:** None (districts already exist in `main.ts`)  
**Estimated effort:** ~2–3 hours

## Problem

Shuttles currently fly to a random angular limit (`cruiseDegLimit` 50–140°) with no awareness of where districts are. The idea is that shuttles should depart from a slice that belongs to a district and land in a different, non-empty district — making them feel like inter-district transport.

## Goal

- Each shuttle launch picks a **departure district** (the district whose slice range the current ground position falls within, or randomly if no match).
- The **destination** is a randomly selected slice inside a *different* district, chosen only from districts that have at least one slice (i.e. non-empty).
- The horizontal cruise distance is derived from the angular gap between departure and destination, not a random spread.

## Data Flow

Districts are currently defined inline in `main.ts` as an array of `{ startSlice, sliceCount }` objects. The shuttle layer needs read access to this list.

### Option A — Pass districts into ShuttleLayer constructor
`ShuttleLayer` already accepts a config object. Extend it:
```ts
interface ShuttleLayerConfig {
  // existing fields...
  districts?: ReadonlyArray<{ startSlice: number; sliceCount: number; degsPerSlice: number }>;
}
```

### Option B — Export a singleton districts array from `main.ts`
Less clean; prefer Option A.

## Implementation Steps

### 1. `src/planet/render/actors/shuttle/shuttle-layer.ts`

- Accept `districts` in config (optional; if absent, fall back to current random behaviour).
- In `launchShuttle()` (or equivalent):
  1. Convert shuttle's current ground X (degrees) to a slice index.
  2. Find which district it belongs to → `departureDistrict`.
  3. Filter `districts` to those ≠ `departureDistrict` → `candidates`.
  4. Pick a random candidate → `targetDistrict`.
  5. Pick a random slice within `targetDistrict` → `targetSlice`.
  6. Compute `targetDeg = targetSlice * degsPerSlice`.
  7. Set `cruiseDegLimit` to `|currentDeg − targetDeg|` (capped to max cruise range).

### 2. `src/main.ts`

- Pass the districts array into the shuttle layer factory call.

## Edge Cases

- If only one district exists: fall back to random targeting.
- Wrap-around: angular distance should be the shorter arc (mod 360).

## Affected Files

- `src/planet/render/actors/shuttle/shuttle-layer.ts`
- `src/main.ts`

## Acceptance Criteria

- [ ] Shuttles visibly travel from one district to another rather than random distances
- [ ] With two districts ~180° apart, shuttles fly approximately half the planet each trip
- [ ] Fall-back to random behaviour when no district config is provided
- [ ] CodeScene 10.0 on modified files
