# Plan: Improved Car Behaviour

**Complexity:** Medium  
**Dependencies:** Districts exist (plan 03 is independent; this one reads the same district data)  
**Estimated effort:** ~3–4 hours

## Problem

- Cars roam the full 360° world instead of staying within their district's slice range.
- There are far too many cars (100±50) — since they're now only inside districts, the count should scale to the district width.
- Cars reverse direction in open space, which looks odd. They should turn around *behind or inside a building* so the reversal is hidden.

## Goal

1. Each car is assigned to a district at spawn; it never leaves that district's angular range.
2. Car count is proportional to district width (e.g. ~3–5 cars per slice).
3. Cars pick a destination building as their waypoint and stop/reverse only when they reach a position that overlaps a building footprint (or the district edge).

## Implementation

### `src/planet/render/actor-layer.ts`

**Spawn count:**
Replace the fixed `50 + Math.random() * 50` spawn with a per-district count:
```ts
const carsPerSlice = 3 + Math.floor(Math.random() * 3); // 3–5
const count = district.sliceCount * carsPerSlice;
```

**District clamping:**  
Store `districtMinDeg` and `districtMaxDeg` on each `Car`.  
In the movement update, when a car reaches its destination or hits a boundary, clamp the next destination inside `[districtMinDeg, districtMaxDeg]`.

**Building-based reversal:**  
The car needs a list of building X positions (in degrees) for its slice. The building positions are currently regenerated deterministically from the seed each frame — the car layer needs access to the same seed logic to query building footprints.

Options:
- **Option A (simpler):** Give each car a list of `turnDeg` waypoints sampled at spawn from the building distribution (using the same mulberry32 seed). Cars always reverse at the nearest waypoint past their destination.
- **Option B (accurate):** Export a `buildingFootprints(sliceIndex)` helper from the building module so cars query real positions at runtime.

Option A is lower risk since slice content must remain stateless.

### `src/main.ts`

- Pass district config into the actor layer factory, similar to shuttle targeting (plan 03).

## Affected Files

- `src/planet/render/actor-layer.ts`
- `src/main.ts`

## Acceptance Criteria

- [ ] Cars never leave their assigned district's angular bounds
- [ ] No more than ~5 cars per slice visible at once
- [ ] Cars visually appear to reverse *behind* a building (not in the open)
- [ ] District edges act as hard walls; no car escapes
- [ ] CodeScene 10.0 on modified files
