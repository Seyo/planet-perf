# Plan: Throttle FPS Display Updates

**Complexity:** Trivial  
**Dependencies:** None  
**Estimated effort:** ~15 min

## Problem

`debug-panel.ts` calls `setText('fps', state.fps.toFixed(1))` every frame tick. Although there is already a value-change guard, `toFixed(1)` still runs every frame and the FPS value fluctuates fast enough that the DOM write fires very frequently, causing unnecessary layout work.

## Goal

Update the FPS display at most once per N frames (e.g. every 20 frames / ~3×/sec at 60 fps) so the number is still readable but the DOM write rate is bounded.

## Implementation

### `src/debug/debug-panel.ts`

1. Add a frame-skip counter at module or class level:
   ```ts
   let fpsTick = 0;
   const FPS_THROTTLE = 20; // update every 20 frames
   ```
2. In `update()`, wrap the fps `setText` call:
   ```ts
   if (++fpsTick >= FPS_THROTTLE) {
     fpsTick = 0;
     setText('fps', state.fps.toFixed(1));
   }
   ```

The existing "skip if same value" guard can stay or be removed — with throttling it is redundant.

## Acceptance Criteria

- [ ] FPS readout updates visibly but not faster than ~3 Hz
- [ ] No other stat display is affected
- [ ] CodeScene score on `debug-panel.ts` remains 10.0
