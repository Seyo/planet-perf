# Task 06 — Deduplicate `DebugPanel` button group methods

**File:** `src/debug/debug-panel.ts`  
**Score before:** 9.09 (Green)  
**CodeScene issue:** Code Duplication across 5 functions — `makePaletteButtons`, `makeLightPaletteButtons`, `makeThemeButtons`, `refreshButtonStyles`, `refreshLightButtonStyles`, `refreshThemeButtonStyles`  
**Status:** `todo`

---

## Why

The debug panel has three button groups (color palette, light palette, theme presets) built with nearly identical code. Each pair of `makeXButtons` / `refreshXButtonStyles` methods is structurally identical — only the data and callback differ. Any visual tweak to buttons must be made three times.

No folder restructure is needed here — `debug/` already contains only three files and is coherent as-is. The fix is entirely within `debug-panel.ts`.

---

## What to do

### Step 1 — Read the three `make*Buttons` methods (lines 268–375)

They share this shape:
1. Create a row container.
2. For each item in a list, create a button element with label + click handler.
3. Store button references.
4. Call the matching `refresh*ButtonStyles()`.

### Step 2 — Extract a generic `makeButtonGroup` private method

```ts
private makeButtonGroup<T>(
  items:      { key: T; label: string }[],
  getCurrent: () => T,
  onSelect:   (key: T) => void,
): { row: HTMLElement; buttons: Map<T, HTMLButtonElement> }
```

Each of the three `make*Buttons` methods becomes a thin wrapper:

```ts
private makePaletteButtons(): void {
  const { row, buttons } = this.makeButtonGroup(
    PALETTES.map(p => ({ key: p.name, label: p.name })),
    () => this.currentPalette,
    (key) => this.applyPalette(key),
  );
  this.paletteRow     = row;
  this.paletteButtons = buttons;
}
```

### Step 3 — Extract a generic `refreshButtonGroup` private method

```ts
private refreshButtonGroup<T>(
  buttons:   Map<T, HTMLButtonElement>,
  activeKey: T,
): void {
  for (const [key, btn] of buttons) {
    btn.classList.toggle('active', key === activeKey);
  }
}
```

Each `refresh*ButtonStyles` becomes a one-liner:

```ts
private refreshButtonStyles(): void {
  this.refreshButtonGroup(this.paletteButtons, this.currentPalette);
}
```

### Step 4 — Verify

- `npm run build` — no errors.
- `npm run dev` — open the debug panel. Cycle through all three button groups (color palette, light palette, theme presets). The active button must highlight correctly in each group after every selection.
- Run CodeScene on `debug-panel.ts` — Code Duplication indicator should clear, score above 9.09.

---

## Expansion benefit

Adding a new button group (weather presets, time-of-day, population density) is now a three-line call to `makeButtonGroup`. No copy-pasting. This is the most likely extension point as the debug panel grows alongside new actor and building types.
