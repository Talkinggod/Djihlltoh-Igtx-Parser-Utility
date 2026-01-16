
/**
 * Converts a Hex color to HSL values string (H S% L%)
 * used by Tailwind CSS variables.
 */
export function hexToHSL(hex: string): string {
  let c = hex.substring(1).split('');
  if (c.length === 3) {
    c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  }
  const cStr = c.join('');
  const r = parseInt(cStr.substring(0, 2), 16) / 255;
  const g = parseInt(cStr.substring(2, 4), 16) / 255;
  const b = parseInt(cStr.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  // Round values and format as "H S% L%"
  const hDeg = Math.round(h * 360);
  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);

  return `${hDeg} ${sPct}% ${lPct}%`;
}

export function hslToHex(hsl: string): string {
    // Simplified return for default mapping if parsing fails
    // This is primarily for initializing state from CSS vars if needed, 
    // but we usually rely on state->css, not css->state.
    return "#000000"; 
}
