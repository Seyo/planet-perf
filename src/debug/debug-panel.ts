import type { Palette, LightPalette, Theme } from './palettes';

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

const FPS_UPDATE_INTERVAL   = 20;
// State fields (xDeg, vDeg, …) throttled separately — xDeg changes every frame
// during autopan, making set-textContent a profiler hotspot despite the setText
// guard.  30 frames ≈ 2 Hz at 60 fps; still readable, halves the DOM writes vs
// the previous interval of 6.
const STATE_UPDATE_INTERVAL = 30;

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
  private palettes: Palette[] = [];
  private activeIdx = 0;
  private paletteButtons = new Map<number, HTMLButtonElement>();
  private lightPalettes: LightPalette[] = [];
  private activeLightIdx = 0;
  private lightButtons = new Map<number, HTMLButtonElement>();
  private themes: Theme[] = [];
  private activeThemeIdx = -1;
  private themeButtons = new Map<number, HTMLButtonElement>();
  private togglesWrap!: HTMLElement;
  private toggles: Map<string, Toggle> = new Map();
  private fpsTick    = 0;
  private stateTick  = 0;
  private autopanSpeed = 0;

  onPaletteChange?: (idx: number) => void;
  onAutopanChange?: (degPerTick: number) => void;
  onLightPaletteChange?: (idx: number) => void;
  onThemeChange?: (paletteIdx: number, lightPaletteIdx: number) => void;
  onAnnihilate?: () => void;
  onExplosionTesterToggle?: () => void;
  onShuttleTesterToggle?:  () => void;
  onEngineTesterToggle?:   () => void;
  onLayoutToggle?:         () => void;
  constructor(palettes: Palette[], lightPalettes: LightPalette[], themes: Theme[] = []) {
    this.palettes = palettes;
    this.lightPalettes = lightPalettes;
    this.themes = themes;
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
    this.el.appendChild(this.makeColumn('LIGHTS',   this.makeLightPaletteButtons(lightPalettes)));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeColumn('ACTIONS',  this.makeActionsSection()));
    this.el.appendChild(this.makeDivider());
    this.el.appendChild(this.makeColumn('THEME',    this.makeThemeSection(themes), '', true));
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
    // Position / velocity stats — throttled because xDeg changes every frame
    // during autopan, making `set textContent` the #1 profiler hotspot otherwise.
    if (++this.stateTick >= STATE_UPDATE_INTERVAL) {
      this.stateTick = 0;
      this.setText('xDeg',    state.xDeg.toFixed(1) + '°');
      this.setText('vDeg',    state.vDeg.toFixed(3) + ' °/t');
      this.setText('cameraY', state.cameraY.toFixed(1) + ' px');
      this.setText('vY',      state.vY.toFixed(3) + ' px/t');
      this.setText('zoom',    state.zoom.toFixed(3) + '×');
      this.setText('size',    `${state.viewportW} × ${state.viewportH}`);
    }
    if (++this.fpsTick >= FPS_UPDATE_INTERVAL) {
      this.fpsTick = 0;
      this.setText('fps', state.fps.toFixed(1));
    }
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
      this.autopanSpeed = v;
      this.onAutopanChange?.(v);
    });

    wrap.appendChild(labelRow);
    wrap.appendChild(slider);
    return wrap;
  }

  private makeButtonGroup<T>(
    items: { key: T; label: string }[],
    onSelect: (key: T) => void,
    columns = 4,
  ): { row: HTMLElement; buttons: Map<T, HTMLButtonElement> } {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: `repeat(${columns}, max-content)`, gap: '4px' });
    const buttons = new Map<T, HTMLButtonElement>();
    for (const item of items) {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      Object.assign(btn.style, {
        cursor: 'pointer',
        fontFamily: 'monospace',
        fontSize: '10px',
        padding: '2px 6px',
        borderRadius: '3px',
        color: '#fff',
        transition: 'none',
      });
      btn.addEventListener('click', () => { onSelect(item.key); });
      buttons.set(item.key, btn);
      row.appendChild(btn);
    }
    return { row, buttons };
  }

  private refreshButtonGroup<T>(
    buttons: Map<T, HTMLButtonElement>,
    activeKey: T,
    getStyle: (key: T, isActive: boolean) => { background: string; border: string },
  ): void {
    for (const [key, btn] of buttons) {
      Object.assign(btn.style, getStyle(key, key === activeKey));
    }
  }

  private makePaletteButtons(palettes: Palette[]): HTMLElement {
    const { row, buttons } = this.makeButtonGroup(
      palettes.map((p, i) => ({ key: i, label: p.name })),
      (i) => { this.setActivePalette(i); this.onPaletteChange?.(i); },
    );
    this.paletteButtons = buttons;
    this.refreshButtonStyles();
    return row;
  }

  private refreshButtonStyles(): void {
    this.refreshButtonGroup(this.paletteButtons, this.activeIdx, (i, active) => {
      const c = this.palettes[i].hazeColor;
      return active
        ? { background: hexToCss(c, 0.75), border: `1px solid ${hexToCss(c, 1.0)}` }
        : { background: hexToCss(c, 0.28), border: `1px solid ${hexToCss(c, 0.55)}` };
    });
  }

  setActiveLightPalette(idx: number): void {
    this.activeLightIdx = idx;
    this.refreshLightButtonStyles();
  }

  private makeLightPaletteButtons(palettes: LightPalette[]): HTMLElement {
    const { row, buttons } = this.makeButtonGroup(
      palettes.map((p, i) => ({ key: i, label: p.name })),
      (i) => { this.setActiveLightPalette(i); this.onLightPaletteChange?.(i); },
    );
    this.lightButtons = buttons;
    this.refreshLightButtonStyles();
    return row;
  }

  private refreshLightButtonStyles(): void {
    this.refreshButtonGroup(this.lightButtons, this.activeLightIdx, (i, active) => {
      const c = this.lightPalettes[i].warmColor;
      return active
        ? { background: hexToCss(c, 0.55), border: `1px solid ${hexToCss(c, 1.0)}` }
        : { background: hexToCss(c, 0.18), border: `1px solid ${hexToCss(c, 0.45)}` };
    });
  }

  private makeThemeSection(themes: Theme[]): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

    const { row: btnRow, buttons } = this.makeButtonGroup(
      themes.map((t, i) => ({ key: i, label: t.name })),
      (i) => {
        const t = this.themes[i];
        this.activeThemeIdx = i;
        this.setActivePalette(t.paletteIdx);
        this.setActiveLightPalette(t.lightPaletteIdx);
        this.refreshThemeButtonStyles();
        this.onPaletteChange?.(t.paletteIdx);
        this.onLightPaletteChange?.(t.lightPaletteIdx);
        this.onThemeChange?.(t.paletteIdx, t.lightPaletteIdx);
      },
    );
    this.themeButtons = buttons;
    this.refreshThemeButtonStyles();

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'copy theme prompt';
    Object.assign(copyBtn.style, {
      cursor: 'pointer',
      fontFamily: 'monospace',
      fontSize: '10px',
      padding: '2px 8px',
      borderRadius: '3px',
      color: 'rgba(255,255,255,0.7)',
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.2)',
      transition: 'none',
      alignSelf: 'flex-start',
    });

    copyBtn.addEventListener('click', () => {
      const text = this.buildThemePrompt();
      void navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = 'copied!';
        setTimeout(() => { copyBtn.textContent = 'copy theme prompt'; }, 1500);
      });
    });

    wrap.appendChild(btnRow);
    wrap.appendChild(copyBtn);
    return wrap;
  }

  private refreshThemeButtonStyles(): void {
    this.refreshButtonGroup(this.themeButtons, this.activeThemeIdx, (i, active) => {
      const t = this.themes[i];
      const c = this.palettes[t.paletteIdx].hazeColor;
      const lc = this.lightPalettes[t.lightPaletteIdx].warmColor;
      return active
        ? { background: hexToCss(c, 0.55), border: `1px solid ${hexToCss(lc, 1.0)}` }
        : { background: hexToCss(c, 0.22), border: `1px solid ${hexToCss(lc, 0.45)}` };
    });
  }

  private buildLiveUrl(): string {
    const base = window.location.origin + window.location.pathname;
    const p = new URLSearchParams();
    p.set('palette', this.palettes[this.activeIdx].name);
    p.set('lights', this.lightPalettes[this.activeLightIdx].name);
    if (this.autopanSpeed !== 0) p.set('autopan', this.autopanSpeed.toString());
    return `${base}?${p.toString()}`;
  }

  private makeActionsSection(): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '4px' });

    const annBtn = document.createElement('button');
    annBtn.textContent = 'Annihilate';
    Object.assign(annBtn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      color: '#ff5555', background: 'rgba(255,60,60,0.12)', border: '1px solid rgba(255,60,60,0.4)',
    });
    annBtn.addEventListener('click', () => this.onAnnihilate?.());

    const testerBtn = document.createElement('button');
    testerBtn.textContent = 'Explosion tester';
    Object.assign(testerBtn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
    });
    testerBtn.addEventListener('click', () => this.onExplosionTesterToggle?.());

    const shuttleBtn = document.createElement('button');
    shuttleBtn.textContent = 'Shuttle tester';
    Object.assign(shuttleBtn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
    });
    shuttleBtn.addEventListener('click', () => this.onShuttleTesterToggle?.());

    const engineBtn = document.createElement('button');
    engineBtn.textContent = 'Engine tester';
    Object.assign(engineBtn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
    });
    engineBtn.addEventListener('click', () => this.onEngineTesterToggle?.());

    const layoutBtn = document.createElement('button');
    layoutBtn.textContent = 'Layout';
    Object.assign(layoutBtn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
    });
    layoutBtn.addEventListener('click', () => this.onLayoutToggle?.());

    const copyUrlBtn = document.createElement('button');
    copyUrlBtn.textContent = 'copy live url';
    Object.assign(copyUrlBtn.style, {
      cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px',
      padding: '2px 8px', borderRadius: '3px', transition: 'none',
      color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
    });
    copyUrlBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(this.buildLiveUrl()).then(() => {
        copyUrlBtn.textContent = 'copied!';
        setTimeout(() => { copyUrlBtn.textContent = 'copy live url'; }, 1500);
      });
    });

    wrap.appendChild(annBtn);
    wrap.appendChild(testerBtn);
    wrap.appendChild(shuttleBtn);
    wrap.appendChild(engineBtn);
    wrap.appendChild(layoutBtn);
    wrap.appendChild(copyUrlBtn);
    return wrap;
  }

  private buildThemePrompt(): string {
    const p = this.palettes[this.activeIdx];
    const lp = this.lightPalettes[this.activeLightIdx];
    const toHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
    const stops = p.skyGradient.map(s => `    { offset: ${s.offset}, color: ${toHex(s.color)} }`).join('\n');
    return [
      `I'm working on planet-perf, a Pixi.js 2D circular world visualization.`,
      ``,
      `Current theme:`,
      `  Palette: "${p.name}"`,
      `    backgroundColor: ${toHex(p.backgroundColor)}`,
      `    hazeColor: ${toHex(p.hazeColor)}`,
      `    caveHazeColor: ${toHex(p.caveHazeColor)}`,
      `    skyGradient:`,
      stops,
      ``,
      `  Lights: "${lp.name}"`,
      `    warmColor: ${toHex(lp.warmColor)}`,
      `    coolColor: ${toHex(lp.coolColor)}`,
      ``,
      `Please create a new theme with the following feel: [describe what you want]`,
      `Return a Palette object and a LightPalette object in the same format as above.`,
    ].join('\n');
  }
}
