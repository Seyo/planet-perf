export type BuildingBounds = {
  xLeft: number;
  xRight: number;
  yTop: number;
  yBottom: number;
  chamfer?: { corner: "tl" | "tr" | "both"; size: number };
};

type BoundsWithChamfer = BuildingBounds & { chamfer: NonNullable<BuildingBounds['chamfer']> };

function inRect(b: BuildingBounds, x: number, y: number): boolean {
  return x >= b.xLeft && x <= b.xRight && y >= b.yTop && y <= b.yBottom;
}

function chamferHit(b: BoundsWithChamfer, x: number, y: number): boolean {
  const rowFromTop = Math.floor(y - b.yTop);
  if (rowFromTop >= b.chamfer.size) return true;
  const taper    = b.chamfer.size - 1 - rowFromTop;
  const corner   = b.chamfer.corner;
  const effLeft  = b.xLeft  + (corner !== "tr" ? taper : 0);
  const effRight = b.xRight - (corner !== "tl" ? taper : 0);
  return x >= effLeft && x <= effRight;
}

function hitTest(b: BuildingBounds, x: number, y: number): boolean {
  if (!inRect(b, x, y)) return false;
  return !b.chamfer || chamferHit(b as BoundsWithChamfer, x, y);
}

type SliceEntry = {
  bounds: readonly BuildingBounds[];
  collide: (xLocal: number, y: number) => BuildingBounds | null;
};

export class BuildingRegistry {
  private readonly map = new Map<string, SliceEntry>();

  register(sliceIndex: number, layerKey: string, bounds: BuildingBounds[]): void {
    const frozen = bounds as readonly BuildingBounds[];
    this.map.set(`${sliceIndex}:${layerKey}`, {
      bounds: frozen,
      collide: (x, y) => frozen.find(b => hitTest(b, x, y)) ?? null,
    });
  }

  getBuildings(sliceIndex: number, layerKey: string): readonly BuildingBounds[] {
    return this.map.get(`${sliceIndex}:${layerKey}`)?.bounds ?? [];
  }

  collide(sliceIndex: number, layerKey: string, xLocal: number, y: number): BuildingBounds | null {
    return this.map.get(`${sliceIndex}:${layerKey}`)?.collide(xLocal, y) ?? null;
  }

  allEntries(): ReadonlyMap<string, { bounds: readonly BuildingBounds[] }> {
    return this.map;
  }
}
