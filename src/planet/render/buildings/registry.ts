export type BuildingBounds = {
  xLeft: number;    // px from slice left edge (0..sliceWidth)
  xRight: number;
  yTop: number;     // top of building (yBase - h, negative for above-ground)
  yBottom: number;  // yBase (typically 0)
};

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
      collide: (x, y) =>
        frozen.find(b => x >= b.xLeft && x <= b.xRight && y >= b.yTop && y <= b.yBottom) ?? null,
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
