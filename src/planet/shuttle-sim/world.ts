// A live target the brain can chase. `vDeg` lets the brain lead the target
// using `eta * vDeg` prediction; pass 0 for a stationary target.
export type ShuttleTarget = { deg: number; y: number; vDeg: number };

// Per-tick world snapshot passed into the brain. Today only carries targets;
// can grow to include other actors, hazards, etc. as the sim expands.
export type ShuttleWorld = { readonly targets: ReadonlyMap<string, ShuttleTarget> };

// Reusable empty snapshot — the wrapper passes this when no targets are
// registered, so the brain never deals with null/undefined worlds.
export const EMPTY_WORLD: ShuttleWorld = { targets: new Map() };
