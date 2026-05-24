// Circular buffer of (deg, y) trail points, stored as parallel Float64Arrays
// instead of an array of {deg, y} objects. Cuts per-point object allocation
// and gives better cache locality during the per-frame draw walk.
//
// Conventions: newest point is at index `head`; older points wrap forward.
// (Matches the existing EngineTrail walk: `(head + i) % maxPoints`.)
export type TrailBuffer = {
  readonly deg:       Float64Array;
  readonly y:         Float64Array;
  readonly maxPoints: number;
  head:               number;
  count:              number;
};

export function createTrailBuffer(maxPoints: number): TrailBuffer {
  return {
    deg: new Float64Array(maxPoints),
    y:   new Float64Array(maxPoints),
    maxPoints,
    head:  0,
    count: 0,
  };
}

export function recordTrailPoint(buf: TrailBuffer, deg: number, y: number): void {
  buf.head = (buf.head - 1 + buf.maxPoints) % buf.maxPoints;
  buf.deg[buf.head] = deg;
  buf.y[buf.head]   = y;
  if (buf.count < buf.maxPoints) buf.count++;
}

export function resetTrailBuffer(buf: TrailBuffer): void {
  buf.head  = 0;
  buf.count = 0;
}
