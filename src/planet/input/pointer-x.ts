import type { Application } from "pixi.js";

export class PointerX {
  x = 0;
  y = 0;
  isDown = false;

  constructor(private app: Application) {}

  attach() {
    const canvas = this.app.canvas;

    const updateXY = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const scaleX = this.app.renderer.width / rect.width;
      const scaleY = this.app.renderer.height / rect.height;
      this.x = cssX * scaleX;
      this.y = cssY * scaleY;
    };

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.isDown = true;
      updateXY(e);
    });

    canvas.addEventListener("pointermove", (e) => updateXY(e));

    const up = (e: PointerEvent) => {
      updateXY(e);
      this.isDown = false;
    };

    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("blur", () => (this.isDown = false));
  }
}
