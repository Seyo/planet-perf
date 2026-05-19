import type { Palette, LightPalette } from './palettes';

type State = {
  xDeg: number;
  vDeg: number;
  cameraY: number;
  vY: number;
  zoom: number;
  fps: number;
  viewportW: number;
  viewportH: number;
};

type Toggle = {
  label: string;
  target: { visible: boolean };
  dotEl: HTMLSpanElement;
};

function hexToCss(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8)  & 0xff;
  const b =  hex        & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export class DebugPanel {
  private el: HTMLDivElement;
  private valueEls: Record<string, HTMLSpanElement> = {};
  private lastText: Record<string, string> = {};
  private btnEls: HTMLButtonElement[] = [];
  private palettes: Palette[] = [];
  private activeIdx = 0;
  private lightBtnEls: HTMLButtonElement[] = [];
  private lightPalettes: LightPalette[] = [];
  private activeLightIdx = 0;
  private togglesWrap!: HTMLElement;
  private toggles: Map<string, Toggle> = new Map();

  onPaletteChange?: (idx: number) => void;
  onAutopanChange?: (degPerTick: number) => void;
  onLightPaletteChange?: (idx: number) => void;

  constructor(palettes: Palette[], lightPalettes: LightPalette[]) {
    this.palettes = palettes;
    this.lightPalettes = lightPalettes;
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed',
      bottom: '12px',
      left: '12px',
      right: '12px',
      background: 'rgba(0,0,0,0.72)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: '6px',
      padding: '8px 12px',
      color: '#e8e8e8',
      fontFamily: 'monospace',
      fontSize: '11px',
      lineHeight: '1.6',
      userSelect: 'none',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '0',
    });

    this.togglesWrap = this.makeTogglesWrap();
    this.el.appendChild(this.makeColumn('DEBUG',    this.makeStats()));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeColumn('OVERLAYS', this.togglesWrap));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeColumn('AUTOPAN',  this.makeAutopanSection(), '220px'));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeColumn('PALETTE',  this.makePaletteButtons(palettes), '', false));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeColumn('LIGHTS',   this.makeLightPaletteButtons(lightPalettes), '', true));

    document.body.appendChild(this.el);
  }

  private makeColumn(label: string, content: HTMLElement, minWidth = '', grow = false): HTMLElement {
    const col = document.createElement('div');
    Object.assign(col.style, {
      display: 'flex',
      flexDirection: 'column',
      minWidth: minWidth || 'auto',
      ...(grow ? { flex: '1 1 auto' } : {}),
    });
    col.appendChild(this.makeSection(label));
    col.appendChild(content);
    return col;
  }

  registerToggle(id: string, label: string, target: { visible: boolean }): void {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      cursor: 'pointer',
      padding: '1px 0',
    });

    const dot = document.createElement('span');
    dot.textContent = '●';
    Object.assign(dot.style, { fontSize: '8px', lineHeight: '1' });

    const lbl = document.createElement('span');
    lbl.textContent = label;
    Object.assign(lbl.style, { color: 'rgba(255,255,255,0.7)' });

    row.appendChild(dot);
    row.appendChild(lbl);
    this.togglesWrap.appendChild(row);

    const t: Toggle = { label, target, dotEl: dot };
    this.toggles.set(id, t);
    this.refreshToggle(t);

    row.addEventListener('click', () => {
      target.visible = !target.visible;
      this.refreshToggle(t);
    });
  }

  update(state: State): void {
    this.setText('xDeg',    state.xDeg.toFixed(1) + '°');
    this.setText('vDeg',    state.vDeg.toFixed(3) + ' °/t');
    this.setText('cameraY', state.cameraY.toFixed(1) + ' px');
    this.setText('vY',      state.vY.toFixed(3) + ' px/t');
    this.setText('zoom',    state.zoom.toFixed(3) + '×');
    this.setText('fps',     state.fps.toFixed(1));
    this.setText('size',    `${state.viewportW} × ${state.viewportH}`);
  }

  // Skip DOM writes when the formatted value hasn't changed — `set textContent`
  // was the 3rd-hottest function in the panning trace.
  private setText(key: string, value: string): void {
    if (this.lastText[key] === value) return;
    this.lastText[key] = value;
    this.valueEls[key].textContent = value;
  }

  setActivePalette(idx: number): void {
    this.activeIdx = idx;
    this.refreshButtonStyles();
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private makeSection(label: string): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      color: 'rgba(255,255,255,0.4)',
      fontSize: '9px',
      letterSpacing: '0.1em',
      marginBottom: '4px',
      marginTop: '2px',
    });
    el.textContent = label;
    return el;
  }

  private makeDivider(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      borderLeft: '1px solid rgba(255,255,255,0.1)',
      margin: '0 12px',
      alignSelf: 'stretch',
    });
    return el;
  }

  private makeTogglesWrap(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, { display: 'flex', flexDirection: 'column', gap: '2px' });
    return el;
  }

  private refreshToggle(t: Toggle): void {
    t.dotEl.style.color = t.target.visible ? '#fff' : 'rgba(255,255,255,0.2)';
  }

  private makeStats(): HTMLElement {
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      columnGap: '12px',
      rowGap: '1px',
    });

    const rows: Array<[string, string]> = [
      ['xDeg',    'xDeg'],
      ['vDeg',    'vDeg'],
      ['cameraY', 'cameraY'],
      ['vY',      'vY'],
      ['zoom',    'zoom'],
      ['fps',     'fps'],
      ['size',    'size'],
    ];

    for (const [label, key] of rows) {
      const lbl = document.createElement('span');
      lbl.textContent = label;
      Object.assign(lbl.style, { color: 'rgba(255,255,255,0.45)' });

      const val = document.createElement('span');
      val.textContent = '—';
      Object.assign(val.style, { textAlign: 'right', color: '#fff' });

      this.valueEls[key] = val;
      grid.appendChild(lbl);
      grid.appendChild(val);
    }

    return grid;
  }

  private makeAutopanSection(): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px' });

    const labelRow = document.createElement('div');
    Object.assign(labelRow.style, { display: 'flex', justifyContent: 'space-between' });

    const lbl = document.createElement('span');
    lbl.textContent = 'speed';
    Object.assign(lbl.style, { color: 'rgba(255,255,255,0.45)' });

    const valEl = document.createElement('span');
    valEl.textContent = '0.00';
    Object.assign(valEl.style, { color: '#fff' });

    labelRow.appendChild(lbl);
    labelRow.appendChild(valEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = '0';
    Object.assign(slider.style, { width: '100%', margin: '0' });

    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valEl.textContent = v.toFixed(2);
      this.onAutopanChange?.(v);
    });

    wrap.appendChild(labelRow);
    wrap.appendChild(slider);
    return wrap;
  }

  private makePaletteButtons(palettes: Palette[]): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
    });

    palettes.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.textContent = p.name;

      Object.assign(btn.style, {
        cursor: 'pointer',
        fontFamily: 'monospace',
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '3px',
        color: '#fff',
        transition: 'none',
      });

      btn.addEventListener('click', () => {
        this.setActivePalette(i);
        this.onPaletteChange?.(i);
      });

      this.btnEls.push(btn);
      wrap.appendChild(btn);
    });

    this.refreshButtonStyles();
    return wrap;
  }

  private refreshButtonStyles(): void {
    this.btnEls.forEach((btn, i) => {
      const p = this.palettes[i];
      if (i === this.activeIdx) {
        Object.assign(btn.style, {
          background: hexToCss(p.hazeColor, 0.75),
          border: `1px solid ${hexToCss(p.hazeColor, 1.0)}`,
        });
      } else {
        Object.assign(btn.style, {
          background: hexToCss(p.hazeColor, 0.28),
          border: `1px solid ${hexToCss(p.hazeColor, 0.55)}`,
        });
      }
    });
  }

  setActiveLightPalette(idx: number): void {
    this.activeLightIdx = idx;
    this.refreshLightButtonStyles();
  }

  private makeLightPaletteButtons(palettes: LightPalette[]): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px',
    });

    palettes.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.textContent = p.name;

      Object.assign(btn.style, {
        cursor: 'pointer',
        fontFamily: 'monospace',
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '3px',
        color: '#fff',
        transition: 'none',
      });

      btn.addEventListener('click', () => {
        this.setActiveLightPalette(i);
        this.onLightPaletteChange?.(i);
      });

      this.lightBtnEls.push(btn);
      wrap.appendChild(btn);
    });

    this.refreshLightButtonStyles();
    return wrap;
  }

  private refreshLightButtonStyles(): void {
    this.lightBtnEls.forEach((btn, i) => {
      const p = this.lightPalettes[i];
      if (i === this.activeLightIdx) {
        Object.assign(btn.style, {
          background: hexToCss(p.warmColor, 0.55),
          border: `1px solid ${hexToCss(p.warmColor, 1.0)}`,
        });
      } else {
        Object.assign(btn.style, {
          background: hexToCss(p.warmColor, 0.18),
          border: `1px solid ${hexToCss(p.warmColor, 0.45)}`,
        });
      }
    });
  }
}
