import type { FlightConfig, ShuttleTarget } from '../planet/shuttle-sim';
import { DEFAULT_FLIGHT_CONFIG } from '../planet/shuttle-sim';

type SliderSpec = {
  key:   keyof FlightConfig;
  label: string;
  min:   number;
  max:   number;
  step:  number;
};

// Sliders the tester actually exposes. Dropped from the previous panel:
//   waitTicksMin/Max — constructor forces both to 0, sliders were dead UI.
//   maxTrailPoints/trailSpeedFactor — appearance-only; not flight knobs.
// levelThreshold and landThreshold folded into the PHYSICS section.
const SECTIONS: [string, SliderSpec[]][] = [
  ['FLIGHT', [
    { key: 'maxHorizSpeed',    label: 'max speed', min: 0.02, max: 1.5,  step: 0.01  },
  ]],
  ['ALTITUDE', [
    { key: 'cruiseYMin', label: 'cruise y min', min: -800, max: -20, step: 10 },
    { key: 'cruiseYMax', label: 'cruise y max', min: -600, max: -10, step: 10 },
  ]],
  ['RANGE', [
    { key: 'cruiseDegMin', label: 'travel deg min', min: 5,  max: 300, step: 5 },
    { key: 'cruiseDegMax', label: 'travel deg max', min: 10, max: 400, step: 5 },
  ]],
  ['PHYSICS', [
    { key: 'maxClimbRate',   label: 'climb rate',      min: 0.1,    max: 5.0,  step: 0.05   },
    { key: 'maxDescentRate', label: 'descent rate',    min: 0.1,    max: 5.0,  step: 0.05   },
    { key: 'maxVertAccel',   label: 'vert accel',      min: 0.001,  max: 0.2,  step: 0.001  },
    { key: 'maxTurnAccel',   label: 'turn accel',      min: 0.0001, max: 0.02, step: 0.0001 },
    { key: 'levelThreshold', label: 'level threshold', min: 1,      max: 80,   step: 1      },
    { key: 'landThreshold',  label: 'land threshold',  min: 1,      max: 30,   step: 1      },
  ]],
  ['APPEARANCE', [
    { key: 'bodyHalfLenMin',  label: 'body len min',     min: 1, max: 12, step: 0.5 },
    { key: 'bodyHalfLenMax',  label: 'body len max',     min: 1, max: 12, step: 0.5 },
    { key: 'engineIntensity', label: 'engine intensity', min: 0, max: 4,  step: 0.1 },
  ]],
  ['BEHAVIOUR', [
    { key: 'explodeChance',      label: 'explode chance', min: 0, max: 1,    step: 0.05 },
    { key: 'explodeAfterFrames', label: 'explode after',  min: 0, max: 1200, step: 10   },
  ]],
];

function decimalsForStep(step: number): number {
  if (step >= 1)      return 0;
  if (step >= 0.1)    return 1;
  if (step >= 0.01)   return 2;
  if (step >= 0.001)  return 3;
  return 4;
}

export class ShuttleTesterPanel {
  private readonly el:         HTMLDivElement;
  private readonly config:     FlightConfig;
  private readonly valueEls   = new Map<keyof FlightConfig, HTMLSpanElement>();
  private readonly sliderEls  = new Map<keyof FlightConfig, HTMLInputElement>();
  private followCursorOn      = false;
  private lastCursorDeg: number | null = null;
  private lastCursorY:   number | null = null;
  private smoothedVDeg        = 0;

  onSpawn?:     (deg: number, cfg: Readonly<FlightConfig>, opts: { targetId?: string }) => void;
  onClear?:     () => void;
  onSetTarget?: (id: string, target: ShuttleTarget | null) => void;

  constructor() {
    this.config = { ...DEFAULT_FLIGHT_CONFIG, waitTicksMin: 0, waitTicksMax: 0 };
    this.el = this.build();
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  get isVisible(): boolean { return this.el.style.display !== 'none'; }

  toggle(): void {
    this.el.style.display = this.isVisible ? 'none' : 'block';
  }

  // Called by main on Ctrl+click. When follow-cursor is on, spawned
  // shuttles chase the 'cursor' target; otherwise they fly today's
  // open-loop FlightPlan to whatever district pick comes back.
  spawnAt(deg: number, _y: number): void {
    const opts = this.followCursorOn ? { targetId: 'cursor' } : {};
    this.onSpawn?.(deg, { ...this.config }, opts);
  }

  // Called by main on every pointermove while the tester is visible. We
  // smooth the per-frame deg delta with a one-pole filter so the lead
  // prediction doesn't jitter on fast mouse jerks.
  onPointerMove(deg: number, y: number): void {
    if (!this.followCursorOn) return;
    const prevDeg = this.lastCursorDeg;
    if (prevDeg !== null) {
      const rawV = deg - prevDeg;
      this.smoothedVDeg = 0.4 * rawV + 0.6 * this.smoothedVDeg;
    }
    this.lastCursorDeg = deg;
    this.lastCursorY   = y;
    this.onSetTarget?.('cursor', { deg, y, vDeg: this.smoothedVDeg });
  }

  private toggleFollowCursor(btn: HTMLButtonElement): void {
    this.followCursorOn = !this.followCursorOn;
    btn.textContent = `follow cursor: ${this.followCursorOn ? 'on' : 'off'}`;
    btn.style.color = this.followCursorOn ? '#88ff88' : 'rgba(255,255,255,0.7)';
    if (!this.followCursorOn) {
      this.onSetTarget?.('cursor', null);
      this.lastCursorDeg = null;
      this.lastCursorY   = null;
      this.smoothedVDeg  = 0;
    }
  }

  private build(): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:     'fixed',
      top:          '12px',
      left:         '12px',
      width:        '290px',
      maxHeight:    'calc(100vh - 120px)',
      overflowY:    'auto',
      background:   'rgba(0,0,0,0.85)',
      border:       '1px solid rgba(255,255,255,0.14)',
      borderRadius: '6px',
      padding:      '8px 12px 12px',
      color:        '#e8e8e8',
      fontFamily:   'monospace',
      fontSize:     '11px',
      lineHeight:   '1.6',
      userSelect:   'none',
      zIndex:       '9998',
      boxSizing:    'border-box',
    });

    el.appendChild(this.makeLabel('SHUTTLE TESTER — ctrl+click to spawn', true));
    el.appendChild(this.makeFollowCursorButton());
    for (const [name, specs] of SECTIONS) {
      el.appendChild(this.makeLabel(name));
      for (const spec of specs) el.appendChild(this.makeSliderRow(spec));
    }
    el.appendChild(this.makeResetButton());
    el.appendChild(this.makeClearButton());
    return el;
  }

  private makeLabel(text: string, isHeader = false): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      color:         isHeader ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.35)',
      fontSize:      '9px',
      letterSpacing: '0.1em',
      marginTop:     isHeader ? '2px'  : '8px',
      marginBottom:  isHeader ? '6px'  : '2px',
    });
    el.textContent = text;
    return el;
  }

  private makeSliderRow(spec: SliderSpec): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display:             'grid',
      gridTemplateColumns: '110px 1fr 44px',
      alignItems:          'center',
      gap:                 '6px',
      marginBottom:        '1px',
    });

    const d    = decimalsForStep(spec.step);
    const init = (this.config[spec.key]).toFixed(d);

    const lbl = document.createElement('span');
    lbl.textContent = spec.label;
    Object.assign(lbl.style, { color: 'rgba(255,255,255,0.5)', fontSize: '10px' });

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = String(spec.min);
    slider.max   = String(spec.max);
    slider.step  = String(spec.step);
    slider.value = String(this.config[spec.key]);
    Object.assign(slider.style, { width: '100%', margin: '0' });
    this.sliderEls.set(spec.key, slider);

    const valEl = document.createElement('span');
    valEl.textContent = init;
    Object.assign(valEl.style, { color: '#fff', textAlign: 'right', fontSize: '10px' });
    this.valueEls.set(spec.key, valEl);

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      (this.config as Record<string, number>)[spec.key] = v;
      valEl.textContent = v.toFixed(d);
    });

    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(valEl);
    return row;
  }

  private makeActionButton(
    text: string, marginTop: string,
    accent: { color: string; background: string; border: string },
    onClick: (btn: HTMLButtonElement) => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      display: 'block', marginTop, ...accent,
    });
    btn.addEventListener('click', () => { onClick(btn); });
    return btn;
  }

  private makeFollowCursorButton(): HTMLElement {
    return this.makeActionButton(
      'follow cursor: off', '0',
      { color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' },
      (btn) => { this.toggleFollowCursor(btn); },
    );
  }

  private makeResetButton(): HTMLElement {
    return this.makeActionButton(
      'reset to defaults', '10px',
      { color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' },
      () => { this.resetToDefaults(); },
    );
  }

  private makeClearButton(): HTMLElement {
    return this.makeActionButton(
      'Clear all shuttles', '4px',
      { color: '#ff5555', background: 'rgba(255,60,60,0.12)', border: '1px solid rgba(255,60,60,0.4)' },
      () => this.onClear?.(),
    );
  }

  private resetToDefaults(): void {
    const defaults = DEFAULT_FLIGHT_CONFIG;
    for (const [, specs] of SECTIONS) {
      for (const spec of specs) {
        const v = defaults[spec.key];
        const d = decimalsForStep(spec.step);
        (this.config as Record<string, number>)[spec.key] = v;
        (this.valueEls.get(spec.key) as HTMLSpanElement).textContent  = v.toFixed(d);
        (this.sliderEls.get(spec.key) as HTMLInputElement).value = String(v);
      }
    }
  }
}
