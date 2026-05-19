import { clamp } from "../math";

export class WheelZoom {
  zoom = 1;
  zoomMin = 0.01;
  zoomMax = 100;

  constructor(private wheelSensitivity = 0.0015) {}

  recomputeBounds(
    viewWidthPx: number,
    sliceWidthPxAtZoom1: number,
    visibleSlicesMaxOut: number,
    visibleSlicesMinIn: number,
  ) {
    // visibleSlices ≈ viewWidth / (sliceWidthPxAtZoom1 * zoom)
    // => zoom ≈ viewWidth / (visibleSlices * sliceWidthPxAtZoom1)
    this.zoomMin = viewWidthPx / (visibleSlicesMaxOut * sliceWidthPxAtZoom1);
    this.zoomMax = viewWidthPx / (visibleSlicesMinIn * sliceWidthPxAtZoom1);

    this.zoomMin = Math.max(this.zoomMin, 0.01);
    this.zoomMax = Math.max(this.zoomMax, this.zoomMin);
    this.zoom = clamp(this.zoom, this.zoomMin, this.zoomMax);
  }

  applyWheel(deltaY: number) {
    const factor = Math.exp(-deltaY * this.wheelSensitivity);
    this.zoom = clamp(this.zoom * factor, this.zoomMin, this.zoomMax);
  }
}
